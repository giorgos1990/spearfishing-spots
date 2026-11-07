// Takes you to any point: arrow, distance and a small map with a red line.
// A web copy of the Android app's NavigateActivity.java (GPS only, no compass sensor).

import { distanceMeters, bearing, compassName } from "./geo.js";
import { addNauticalBase } from "./map.js";
import { openScreen, closeScreen } from "./ui.js";

const CLOSE_M = 50; // the last 50 metres: zoom in and show the green "on it" circle

let map = null; // the small Leaflet map, made fresh every time the screen opens
let line, circle, myMarker, targetMarker; // its layers
let watchId = null; // navigator.geolocation.watchPosition id

let target = { name: "", lat: 0, lon: 0 }; // the point we go to
let me = null; // my last GeolocationPosition
let movedFrom = null; // where I was 15 m ago, to find my course when the GPS gives no heading
let course = -1; // where I am going (0 = north), -1 = not moving
let courseTime = 0; // when we last found the course
let lastDistance = -1; // the distance before, to see if we get closer
let arrived = false; // are we on the point now?
let zoomedClose = false; // did we already zoom in for the last 50 m?
let prevFix = null; // the position before, to find the speed when the GPS does not give it

export async function openNavigate(name, lat, lon) { // opens the screen for any point (a spot, a zone, any tap)
  target = { name, lat, lon };
  me = null; movedFrom = null; course = -1; courseTime = 0; lastDistance = -1; arrived = false; zoomedClose = false; prevFix = null;
  document.getElementById("navigateTitle").textContent = "🧭 " + name;
  document.getElementById("navDistance").textContent = "– m";
  document.getElementById("navDistance").className = "nav-distance";
  document.getElementById("navTrend").textContent = "";
  document.getElementById("navBearing").textContent = "DIRECTION –";
  document.getElementById("navSpeed").textContent = "";
  document.getElementById("navArrived").classList.remove("visible");
  document.getElementById("navHint").textContent = "Start moving: the arrow shows where to turn.";
  document.getElementById("navArrow").style.transform = "rotate(0deg)";
  openScreen("screenNavigate");

  if (map) { map.remove(); map = null; } // a fresh map every time, osmdroid-style "always detach the old one"
  map = L.map("navigateMap", { zoomControl: false, minZoom: 7.5, maxZoom: 19 });
  await addNauticalBase(map);
  map.setView([lat, lon], 14);

  targetMarker = L.marker([lat, lon], { icon: pinIcon() }).addTo(map);
  line = L.polyline([[lat, lon], [lat, lon]], { color: "#EF4444", weight: 6 }).addTo(map);
  circle = L.circle([lat, lon], { radius: 6, color: "#22C55E", weight: 2, fillColor: "#22C55E", fillOpacity: 0.2 });
  myMarker = L.marker([lat, lon], { icon: boatIcon(0), opacity: 0 }).addTo(map); // hidden until the GPS answers

  if (!navigator.geolocation) {
    document.getElementById("navDistance").textContent = "No GPS";
    document.getElementById("navHint").textContent = "This browser has no location support.";
    return;
  }
  watchId = navigator.geolocation.watchPosition(onFix, onFixError, { enableHighAccuracy: true, maximumAge: 1000 });
}

function stopNavigate() { // the back arrow: stop the GPS and free the map
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  if (map) { map.remove(); map = null; }
}
document.querySelector('#screenNavigate [data-close]').addEventListener("click", stopNavigate);

function onFixError() {
  document.getElementById("navHint").textContent = "No GPS signal. Go outside and allow location.";
}

function onFix(position) {
  const first = me == null;
  me = position;
  findCourse();
  if (first) { // the first position: show me and the point together
    const bounds = L.latLngBounds([me.coords.latitude, me.coords.longitude], [target.lat, target.lon]).pad(0.5);
    map.fitBounds(bounds);
  }
  update();
}

function findCourse() { // the course of the boat from the GPS only (like Stigmata, no compass)
  const c = me.coords;
  if (c.heading != null && c.speed != null && c.speed > 0.8) { // the browser knows where we go
    course = c.heading;
    courseTime = Date.now();
  } else if (movedFrom == null) {
    movedFrom = me;
  } else {
    const moved = distanceMeters(movedFrom.coords.latitude, movedFrom.coords.longitude, c.latitude, c.longitude);
    if (moved >= 15) { // we moved 15 m or more
      course = bearing(movedFrom.coords.latitude, movedFrom.coords.longitude, c.latitude, c.longitude);
      courseTime = Date.now();
      movedFrom = me;
    }
  }
  if (Date.now() - courseTime > 10000) course = -1; // no move for 10 seconds = stopped
}

function update() {
  if (!me) return;
  const lat = me.coords.latitude, lon = me.coords.longitude;
  const d = distanceMeters(lat, lon, target.lat, target.lon);
  const brg = bearing(lat, lon, target.lat, target.lon);

  const big = document.getElementById("navDistance");
  if (d < CLOSE_M) big.textContent = d.toFixed(0) + " m";
  else if (d < 1000) big.textContent = (Math.round(d / 10) * 10) + " m";
  else if (d < 10000) big.textContent = (d / 1000).toFixed(2) + " km";
  else big.textContent = (d / 1000).toFixed(1) + " km";
  big.className = "nav-distance" + (d < CLOSE_M ? " close" : "");

  document.getElementById("navBearing").textContent =
    `DIRECTION ${String(Math.round(brg)).padStart(3, "0")}° ${compassName(brg)}`;

  const arrow = document.getElementById("navArrow");
  const hint = document.getElementById("navHint");
  if (course >= 0) { // moving: the arrow points from where the boat goes (straight up = right at it)
    arrow.style.transform = `rotate(${brg - course}deg)`;
    hint.textContent = "⬆ Arrow straight up = you go right to the point";
  } else { // stopped: the arrow points like the map (north up)
    arrow.style.transform = `rotate(${brg}deg)`;
    hint.textContent = "Stopped: the arrow points like the map (north up)";
  }

  myMarker.setLatLng([lat, lon]);
  myMarker.setOpacity(1);
  if (course >= 0) myMarker.setIcon(boatIcon(course));
  line.setLatLngs([[lat, lon], [target.lat, target.lon]]);

  const trend = document.getElementById("navTrend");
  if (lastDistance >= 0 && d >= 10) {
    if (d < lastDistance - 2) { trend.textContent = "⬇ Getting closer"; trend.style.color = "var(--good)"; }
    else if (d > lastDistance + 2) { trend.textContent = "⬆ Moving away"; trend.style.color = "var(--bad)"; }
  }
  lastDistance = d;

  let speed = me.coords.speed || 0;
  if (speed <= 0 && prevFix) {
    const seconds = (me.timestamp - prevFix.timestamp) / 1000;
    if (seconds > 0) speed = distanceMeters(prevFix.coords.latitude, prevFix.coords.longitude, lat, lon) / seconds;
  }
  prevFix = me;
  let info;
  if (speed * 3.6 >= 1) {
    const minutes = Math.round(d / speed / 60);
    const eta = minutes < 60 ? minutes + " min" : Math.floor(minutes / 60) + " h " + String(minutes % 60).padStart(2, "0") + " min";
    const clock = new Date(Date.now() + minutes * 60000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    info = `🚤 ${(speed * 3.6).toFixed(0)} km/h   ⏱ ${eta} (≈${clock})`;
  } else {
    info = "🚤 0 km/h – start moving to see the time to arrive";
  }
  if (d < CLOSE_M && me.coords.accuracy) info += `  GPS ±${me.coords.accuracy.toFixed(0)} m`;
  document.getElementById("navSpeed").textContent = info;

  const arriveM = Math.max(3, Math.min(me.coords.accuracy || 8, 8));
  circle.setLatLng([target.lat, target.lon]);
  circle.setRadius(arriveM);
  if (d < CLOSE_M) { if (!map.hasLayer(circle)) circle.addTo(map); } else if (map.hasLayer(circle)) map.removeLayer(circle);
  if (d < CLOSE_M && !zoomedClose) {
    zoomedClose = true;
    map.fitBounds(L.latLngBounds([lat, lon], [target.lat, target.lon]).pad(0.5));
  } else if (d > CLOSE_M * 2) {
    zoomedClose = false;
  }

  const arrivedBox = document.getElementById("navArrived");
  if (d <= arriveM && !arrived) {
    arrived = true;
    arrivedBox.classList.add("visible");
    if (navigator.vibrate) navigator.vibrate([0, 300, 150, 300]); // two short buzzes
  } else if (d > arriveM * 2 + 5 && arrived) {
    arrived = false;
    arrivedBox.classList.remove("visible");
  }
}

function pinIcon() {
  return L.divIcon({
    className: "", iconSize: [0, 0],
    html: `<div style="transform:translate(-50%,-50%);width:16px;height:16px;border-radius:8px;background:#F59E0B;border:2px solid #fff;"></div>`,
  });
}

function boatIcon(headingDeg) {
  return L.divIcon({
    className: "", iconSize: [0, 0],
    html: `<div style="transform:translate(-50%,-50%) rotate(${headingDeg}deg);font-size:26px;color:#22D3EE;">▲</div>`,
  });
}
