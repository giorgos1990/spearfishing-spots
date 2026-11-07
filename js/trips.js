// The Trip log tab: records the boat's route while the page is open, and shows
// the trips as cards with a small map and the catches that are not in any trip.
// A web copy of TripsFragment.java, TripRecorder.java and TripMapActivity.java.

import { getAllTrips, getAllCatches, addTrip, deleteTrip } from "./db.js";
import { distanceMeters, isInside } from "./geo.js";
import { nearestArea } from "./forecast.js";
import { loadLand, addNauticalBase } from "./map.js";
import { openScreen, closeScreen, toast, dialog, escapeHtml } from "./ui.js";
import { openCatchForm } from "./catches.js";

let recording = false;
let currentTrip = null; // { start, points: [[lat,lon], ...] }
let watchId = null;
let lastFix = null; // the last kept GPS fix, to find jumps and the speed
let land = null; // loaded once, the first time we record

let tripMiniMaps = []; // the small maps of the cards, freed before they are rebuilt
let tripFullMap = null; // the map of the full screen trip view

export function initTripsTab() {
  document.getElementById("fabAddCatch").addEventListener("click", () => openCatchForm(null, refresh));
  document.getElementById("btnToggleTrip").addEventListener("click", toggleRecording);
  refresh();
}

async function toggleRecording() {
  if (!navigator.geolocation) { toast("This browser has no location support"); return; }
  if (!recording) {
    if (!land) land = await loadLand();
    currentTrip = { start: Date.now(), points: [] };
    lastFix = null;
    recording = true;
    document.getElementById("btnToggleTrip").textContent = "Stop trip";
    watchId = navigator.geolocation.watchPosition(onFix, onFixError, { enableHighAccuracy: true, maximumAge: 2000 });
    setBanner(true);
  } else {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    recording = false;
    document.getElementById("btnToggleTrip").textContent = "Start trip";
    setBanner(false);
    const finished = currentTrip;
    finished.finish = Date.now();
    currentTrip = null;
    if (finished.points.length >= 2) {
      await addTrip(finished);
      toast("Trip saved");
    } else {
      toast("Trip too short, not saved");
    }
    refresh();
  }
}

function onFixError() {
  toast("No GPS signal. Allow the location and try again.");
}

function onFix(position) { // the same GPS-jump filter idea as TripRecorder.java
  if (!currentTrip) return;
  const lat = position.coords.latitude, lon = position.coords.longitude;
  if (lastFix) {
    const seconds = Math.max(1, (position.timestamp - lastFix.timestamp) / 1000);
    const metersPerSecond = distanceMeters(lastFix.coords.latitude, lastFix.coords.longitude, lat, lon) / seconds;
    if (metersPerSecond > 30) return; // faster than ~110 km/h = a GPS jump, not the boat
  }
  if (isOnLand(lat, lon)) return; // on land (car, house, beach): not part of the route at sea
  lastFix = position;
  currentTrip.points.push([lat, lon]);
}

function isOnLand(lat, lon) {
  for (const ring of land) if (isInside(lat, lon, ring)) return true;
  return false;
}

function setBanner(isRecording) {
  const banner = document.getElementById("recordingBanner");
  banner.classList.toggle("off", !isRecording);
  document.getElementById("recordingText").textContent = isRecording
    ? "🔴 Recording your route. On iPhone, keep this page open (the browser stops GPS in the background)."
    : "Allow the location to record your route.";
}

// ---------- the list: trip cards + other catches ----------

async function refresh() {
  const trips = await getAllTrips();
  const catches = await getAllCatches();
  const other = catches.filter((item) => !trips.some((trip) => tripHas(trip, item)));

  const otherList = document.getElementById("otherCatches");
  otherList.innerHTML = "";
  for (const item of other) {
    const row = document.createElement("div");
    row.className = "catch-row";
    const date = new Date(item.date).toLocaleDateString("en-GB");
    row.innerHTML = `<div class="catch-text"><b>${escapeHtml(item.fish)}</b><br>${escapeHtml(item.spotName)} &middot; ${date}` +
      (item.kg > 0 ? ` &middot; ${item.kg.toFixed(1)} kg` : "") +
      (item.notes ? `<br>${escapeHtml(item.notes)}` : "") + `</div>`;
    otherList.appendChild(row);
  }
  document.getElementById("otherCatchesTitle").style.display = other.length ? "" : "none";
  document.getElementById("noCatchesNote").style.display = (catches.length === 0) ? "" : "none";

  showTripCards(trips, catches);
}

async function showTripCards(trips, catches) {
  for (const m of tripMiniMaps) m.remove(); // free the old small maps first (osmdroid-style "always detach")
  tripMiniMaps = [];
  const container = document.getElementById("tripCards");
  container.innerHTML = "";
  for (const trip of trips) {
    const tripCatches = catches.filter((item) => tripHas(trip, item));
    const card = document.createElement("div");
    card.className = "trip-card";
    const mapId = "tripmap-" + trip.id;
    card.innerHTML = `
      <div class="trip-map" id="${mapId}"></div>
      <div class="trip-info">
        <div class="trip-date"><span>${tripDayText(trip)} &middot; ${escapeHtml(tripArea(trip))}</span>
          <button class="trip-delete" data-trip="${trip.id}">🗑</button></div>
        <div class="trip-chips">
          <span class="chip">⏱ ${tripDuration(trip)}</span>
          <span class="chip">📏 ${tripKm(trip)} km</span>
          <span class="chip">🎣 ${tripCatches.length} ${tripCatches.length === 1 ? "catch" : "catches"}</span>
        </div>
      </div>`;
    container.appendChild(card);

    const miniMap = L.map(mapId, { zoomControl: false, attributionControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false });
    await addNauticalBase(miniMap);
    drawTripRoute(miniMap, trip);
    miniMap.fitBounds(L.latLngBounds(trip.points).pad(0.3));
    tripMiniMaps.push(miniMap);

    card.querySelector(".trip-map").addEventListener("click", () => openTripMap(trip.id));
    card.querySelector(".trip-info").addEventListener("click", (e) => { if (!e.target.closest(".trip-delete")) openTripMap(trip.id); });
    card.querySelector(".trip-delete").addEventListener("click", async (e) => {
      e.stopPropagation();
      const sure = await dialog({
        title: "Delete this trip?", message: tripSummary(trip),
        buttons: [{ label: "Cancel", value: false, cls: "outline" }, { label: "Delete", value: true, cls: "danger" }],
      });
      if (!sure) return;
      await deleteTrip(trip.id);
      refresh();
    });
  }
}

function drawTripRoute(map, trip) {
  L.polyline(trip.points, { color: "#C81E1E", weight: 6 }).addTo(map);
  L.circleMarker(trip.points[0], { radius: 6, color: "#fff", weight: 2, fillColor: "#C81E1E", fillOpacity: 1 }).addTo(map);
  L.circleMarker(trip.points[trip.points.length - 1], { radius: 6, color: "#fff", weight: 2, fillColor: "#111", fillOpacity: 1 }).addTo(map);
}

// ---------- the full screen trip map ----------

async function openTripMap(tripId) {
  const trips = await getAllTrips();
  const trip = trips.find((t) => t.id === tripId);
  if (!trip || trip.points.length < 2) return;
  const catches = await getAllCatches();
  const tripCatches = catches.filter((item) => tripHas(trip, item));

  document.getElementById("tripMapTitle").textContent = tripDayText(trip);
  document.getElementById("tripStatArea").textContent = tripArea(trip);
  document.getElementById("tripStatTime").textContent = tripDuration(trip);
  document.getElementById("tripStatKm").textContent = tripKm(trip);
  const hours = (trip.finish - trip.start) / 3600000;
  document.getElementById("tripStatSpeed").textContent = hours > 0 ? (tripDistanceKm(trip) / hours).toFixed(1) : "0.0";
  document.getElementById("tripStatCatches").textContent = String(tripCatches.length);
  openScreen("screenTripMap");

  if (tripFullMap) { tripFullMap.remove(); tripFullMap = null; }
  tripFullMap = L.map("tripFullMap", { zoomControl: false });
  tripFullMap.invalidateSize();
  await addNauticalBase(tripFullMap);
  drawTripRoute(tripFullMap, trip);
  tripFullMap.fitBounds(L.latLngBounds(trip.points).pad(0.2));
}
document.querySelector('#screenTripMap [data-close]').addEventListener("click", () => {
  if (tripFullMap) { tripFullMap.remove(); tripFullMap = null; }
});

// ---------- small trip helpers (same rules as Trip.java) ----------

function tripHas(trip, item) { return item.date >= trip.start && item.date <= trip.finish; }
function tripDistanceKm(trip) {
  let metres = 0;
  for (let i = 1; i < trip.points.length; i++) {
    metres += distanceMeters(trip.points[i - 1][0], trip.points[i - 1][1], trip.points[i][0], trip.points[i][1]);
  }
  return metres / 1000;
}
function tripDayText(trip) {
  return new Date(trip.start).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function tripDuration(trip) {
  const minutes = Math.round((trip.finish - trip.start) / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}
function tripKm(trip) { return tripDistanceKm(trip).toFixed(1); }
function tripArea(trip) { return trip.points.length ? nearestArea(trip.points[0][0], trip.points[0][1]) : ""; }
function tripSummary(trip) { return `${tripDayText(trip)} · ${tripDuration(trip)} · ${tripKm(trip)} km`; }
