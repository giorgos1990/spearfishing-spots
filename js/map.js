// The Map tab: the Leaflet map, its layers and the spot pins.
// A web copy of the Android app's SpotsMapFragment.java (same map sources, same data files).

import { getAllSpots, addSpot, updateSpot, deleteSpot, getCatchesForSpot } from "./db.js";
import { distanceMeters, isInside, getCurrentPosition } from "./geo.js";
import { nearestArea } from "./forecast.js";
import { toast, dialog, openSheet, closeSheet, escapeHtml } from "./ui.js";
import { renderPhotos } from "./photos.js";
import { openSpotForm } from "./spots.js";
import { openNavigate } from "./navigate.js";
import { chooseForecastDay } from "./forecast-ui.js";

// satellite photos and the plain street map, from Esri (same as the Android app, no key needed)
const SATELLITE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STREETS_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const SEAMARKS_URL = "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png";
const EMODNET_GEOLOGY = "https://drive.emodnet-geology.eu/geoserver/gtk/wms";
const EMODNET_HABITATS = "https://ows.emodnet-seabedhabitats.eu/geoserver/emodnet_view/wms";

const CYPRUS_BOUNDS = [[34.55, 32.15], [35.72, 34.65]]; // south-west, north-east (a little sea at the sides)

let landCache = null, zonesCache = null, isobathsCache = null; // the 3 data files, read only once

export async function loadLand() { // the shape of Cyprus (assets/land.json)
  if (landCache) return landCache;
  const raw = await (await fetch("data/land.json")).json();
  landCache = raw.map((ring) => ring.map(([lon, lat]) => [lat, lon])); // [lon,lat] -> Leaflet's [lat,lon]
  return landCache;
}

export async function loadZones() { // the protected zones (assets/zones.json)
  if (zonesCache) return zonesCache;
  const raw = await (await fetch("data/zones.json")).json();
  zonesCache = raw.map((z) => ({
    name: z.name,
    note: z.note,
    shapes: (z.polygons || []).map((poly) => poly[0].map(([lon, lat]) => [lat, lon])),
  }));
  return zonesCache;
}

async function loadIsobaths() { // the depth lines (assets/isobaths.json)
  if (isobathsCache) return isobathsCache;
  const raw = await (await fetch("data/isobaths.json")).json();
  isobathsCache = raw.map((level) => ({
    depth: level.d,
    lines: level.lines.map((line) => line.map(([lon, lat]) => [lat, lon])),
  }));
  return isobathsCache;
}

function minZoomForDepth(depth) { // the zoom where this depth starts to show (same rule as the app)
  if (depth <= 5) return 12;
  if (depth <= 20) return 11;
  if (depth <= 100) return 9.5;
  return 10.5;
}

// puts the sea (dark blue) and the land (sand color) on a map, like NauticalMap.java.
// returns the layers, so the caller can hide them when another map picture is chosen.
export async function addNauticalBase(map) {
  const land = await loadLand();
  const layers = [];
  const sea = L.polygon([[40, 27], [40, 40], [30, 40], [30, 27]], { color: "#16324F", weight: 0, fillColor: "#16324F", fillOpacity: 1, interactive: false });
  sea.addTo(map);
  layers.push(sea);
  for (const ring of land) {
    const piece = L.polygon(ring, { color: "#CFB98C", weight: 1, fillColor: "#CFB98C", fillOpacity: 1, interactive: false });
    piece.addTo(map);
    layers.push(piece);
  }
  return layers;
}

// ---------- the Map tab itself ----------

let map; // the Leaflet map
let landLayers = []; // the Nautical sea and Cyprus shape
let tileLayer = null; // the Esri picture layer (Satellite or Normal), null on Nautical
let seaMarksLayer = null, seabedLayer = null, seabedWideLayer = null, seagrassLayer = null; // overlay layers, null = off
let showDepths = false, depthLines = null; // depthLines = { line, depth } entries, made once, shown/hidden with the zoom
let showZones = true;
let zonePolygons = [];
let spotMarkers = [];
let spotsCache = []; // the spots currently shown, kept for the proximity vibration check
let zonesForProximity = []; // the zones, kept for the same check
let myLocationMarker = null;
let myPosition = null; // { lat, lon }, kept for the "Save here" and "My location" buttons
const spotsWarned = new Set(), zonesWarned = new Set(); // spots/zones we already vibrated for this session

export async function initMap() {
  map = L.map("map", { zoomControl: false, attributionControl: true, minZoom: 7.5, maxZoom: 19 });
  L.control.attribution({ prefix: "" }).addTo(map);
  landLayers = await addNauticalBase(map);
  map.fitBounds(CYPRUS_BOUNDS, { animate: false });
  map.setMinZoom(map.getZoom() - 0.5); // cannot zoom out much more than all Cyprus

  const zones = await loadZones();
  zonesForProximity = zones;
  drawZones(zones);
  await refreshSpots();

  document.getElementById("btnLayers").onclick = showLayersMenu;
  document.getElementById("btnMyLocation").onclick = goToMyLocation;
  document.getElementById("btnLocate").onclick = goToMyLocation; // the crosshair in the top bar does the same
  document.getElementById("btnSaveHere").onclick = saveMyLocation;
  document.getElementById("btnForecast").onclick = chooseForecastDay;
  document.querySelectorAll("#mapTypes button").forEach((btn) => {
    btn.onclick = () => setMapType(btn.dataset.type);
  });

  map.on("zoomend moveend", relabelDepths);
  startMyLocationWatch();
}

export async function refreshSpots() { // reads the spots again and draws the pins (after add / edit / delete)
  for (const m of spotMarkers) map.removeLayer(m);
  spotMarkers = [];
  const spots = await getAllSpots();
  spotsCache = spots;
  for (const spot of spots) {
    const marker = L.marker([spot.lat, spot.lon], { icon: pinIcon(spot) });
    marker.on("click", () => showSpotCard(spot));
    marker.addTo(map);
    spotMarkers.push(marker);
  }
}

function pinIcon(spot) { // the same look as the Android bitmap pin: "16m" on top, amber dot, name under it
  const depth = spot.depth > 0 ? Math.round(spot.depth) + "m" : "";
  return L.divIcon({
    className: "", iconSize: [0, 0],
    html: `<div class="spot-pin" style="transform:translate(-50%,-50%);">
      ${depth ? `<div class="depth-label">${depth}</div>` : ""}
      <div class="dot"></div>
      <div class="name-label">${escapeHtml(spot.name)}</div>
    </div>`,
  });
}

function drawZones(zones) { // the protected zones (red)
  for (const zone of zones) {
    for (const shape of zone.shapes) {
      const polygon = L.polygon(shape, { color: "#FF0000", weight: 2, fillColor: "#FF0000", fillOpacity: 0.2 });
      polygon.on("click", (e) => showPointMenu(zone.name, "Protected zone: " + zone.note, e.latlng.lat, e.latlng.lng));
      polygon.addTo(map);
      zonePolygons.push(polygon);
    }
  }
}

async function showPointMenu(name, info, lat, lon) { // the same small menu for a zone or any point (Navigate / Save as spot)
  const text = (info ? info + "\n\n" : "") + lat.toFixed(5) + ", " + lon.toFixed(5);
  const choice = await dialog({
    title: name,
    message: text,
    buttons: [
      { label: "Cancel", value: "cancel", cls: "outline" },
      { label: "Save as spot", value: "save", cls: "outline" },
      { label: "Navigate", value: "navigate", cls: "primary" },
    ],
  });
  if (choice === "navigate") openNavigate(name, lat, lon);
  else if (choice === "save") openSpotForm(null, { lat, lon, name });
}

function setMapType(type) { // Nautical / Satellite / Normal, like the 3 buttons in the Android card
  const nautical = type === "nautical";
  for (const layer of landLayers) layer.setStyle ? layer.setStyle({ opacity: nautical ? 1 : 0, fillOpacity: nautical ? 1 : 0 }) : null;
  if (tileLayer) { map.removeLayer(tileLayer); tileLayer = null; }
  if (type === "satellite") tileLayer = L.tileLayer(SATELLITE_URL, { maxZoom: 19 }).addTo(map);
  if (type === "normal") tileLayer = L.tileLayer(STREETS_URL, { maxZoom: 19 }).addTo(map);
  if (tileLayer) tileLayer.bringToBack();
  document.querySelectorAll("#mapTypes button").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
}

function showLayersMenu() { // the "Map layers" window: a switch for each layer, many can be on at once
  const rows = [
    { icon: "⚓", name: "Sea marks", note: "Buoys, lighthouses, harbour lights", on: () => !!seaMarksLayer, toggle: toggleSeaMarks },
    { icon: "〰", name: "Depth lines", note: "Lines of the same depth with the metres", on: () => showDepths, toggle: toggleDepths },
    { icon: "🪨", name: "Seabed type", note: "Rock, sand, mud or posidonia", on: () => !!seabedLayer, toggle: toggleSeabed },
    { icon: "🛡", name: "Protected zones", note: "No spearfishing areas (red)", on: () => showZones, toggle: toggleZones },
  ];
  const list = document.getElementById("layersList");
  list.innerHTML = "";
  for (const row of rows) {
    const div = document.createElement("div");
    div.className = "layer-row";
    div.innerHTML = `
      <div class="layer-icon">${row.icon}</div>
      <div class="layer-text"><div class="layer-name">${row.name}</div><div class="layer-note">${row.note}</div></div>
      <label class="switch"><input type="checkbox" ${row.on() ? "checked" : ""}><span class="track"></span></label>`;
    const checkbox = div.querySelector("input");
    const flip = () => { row.toggle(); checkbox.checked = row.on(); };
    checkbox.onclick = (e) => { e.stopPropagation(); row.toggle(); };
    div.onclick = () => flip();
    list.appendChild(div);
  }
  openSheet("layersBackdrop");
}

function toggleSeaMarks() {
  if (seaMarksLayer) { map.removeLayer(seaMarksLayer); seaMarksLayer = null; }
  else seaMarksLayer = L.tileLayer(SEAMARKS_URL, { maxZoom: 18 }).addTo(map);
}

function toggleSeabed() {
  if (seabedLayer) {
    map.removeLayer(seabedLayer); map.removeLayer(seabedWideLayer); map.removeLayer(seagrassLayer);
    seabedLayer = seabedWideLayer = seagrassLayer = null;
    document.getElementById("legendSeabed").classList.remove("visible");
  } else {
    seabedWideLayer = L.tileLayer.wms(EMODNET_GEOLOGY, { layers: "seabed_substrate_1m", format: "image/png", transparent: true, opacity: 0.85 }).addTo(map);
    seabedLayer = L.tileLayer.wms(EMODNET_GEOLOGY, { layers: "seabed_substrate_250k", format: "image/png", transparent: true, opacity: 0.85 }).addTo(map);
    seagrassLayer = L.tileLayer.wms(EMODNET_HABITATS, { layers: "seagrass_eov_poly_2025", format: "image/png", transparent: true, opacity: 0.85 }).addTo(map);
    document.getElementById("legendSeabed").classList.add("visible");
  }
}

async function toggleDepths() {
  showDepths = !showDepths;
  if (showDepths && !depthLines) { // the first time: read the file and make the lines (lazy, like the Android app)
    const levels = await loadIsobaths();
    depthLines = [];
    for (const level of levels) {
      for (const points of level.lines) {
        const line = L.polyline(points, {
          color: "#22D3EE", opacity: 0, weight: level.depth % 10 === 0 ? 1.6 : 1,
        }).addTo(map);
        depthLines.push({ line, depth: level.depth, points });
      }
    }
  }
  relabelDepths();
}

let depthLabels = [];
function relabelDepths() { // shows the lines for this zoom and puts a number on some of them
  for (const l of depthLabels) map.removeLayer(l);
  depthLabels = [];
  if (!depthLines) return;
  const zoom = map.getZoom();
  const bounds = map.getBounds();
  let shown = 0;
  for (const entry of depthLines) {
    const visible = showDepths && zoom >= minZoomForDepth(entry.depth);
    entry.line.setStyle({ opacity: visible ? 0.55 : 0 });
    if (visible && shown < 150 && bounds.contains(entry.points[Math.floor(entry.points.length / 2)])) {
      const mid = entry.points[Math.floor(entry.points.length / 2)];
      const label = L.marker(mid, {
        icon: L.divIcon({ className: "", iconSize: [0, 0], html: `<div class="depth-number" style="transform:translate(-50%,-50%);">${entry.depth}</div>` }),
        interactive: false,
      }).addTo(map);
      depthLabels.push(label);
      shown++;
    }
  }
}

function toggleZones() {
  showZones = !showZones;
  for (const p of zonePolygons) { if (showZones) p.addTo(map); else map.removeLayer(p); }
}

// ---------- my location, save here, spot card ----------

function startMyLocationWatch() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(
    (pos) => {
      myPosition = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      if (!myLocationMarker) {
        myLocationMarker = L.marker([myPosition.lat, myPosition.lon], {
          icon: L.divIcon({ className: "", iconSize: [0, 0], html: `<div style="transform:translate(-50%,-50%);font-size:22px;">⛵</div>` }),
        }).addTo(map);
      } else {
        myLocationMarker.setLatLng([myPosition.lat, myPosition.lon]);
      }
      checkProximity(myPosition.lat, myPosition.lon);
    },
    () => { /* no permission yet: the buttons ask again when tapped */ },
    { enableHighAccuracy: true, maximumAge: 4000 }
  );
}

function goToMyLocation() {
  if (myPosition) {
    map.flyTo([myPosition.lat, myPosition.lon], 14, { duration: 0.8 });
  } else {
    toast("Finding your position...");
    getCurrentPosition().then((pos) => {
      if (pos) map.flyTo([pos.coords.latitude, pos.coords.longitude], 14, { duration: 0.8 });
      else toast("No GPS position. Allow the location first.");
    });
  }
}

async function saveMyLocation() {
  toast("Getting your GPS position...");
  const pos = await getCurrentPosition();
  if (!pos) { toast("No GPS position. Try again outside."); return; }
  const lat = pos.coords.latitude, lon = pos.coords.longitude;
  const spots = await getAllSpots();
  let near = null, nearMeters = 25;
  for (const spot of spots) {
    const meters = distanceMeters(lat, lon, spot.lat, spot.lon);
    if (meters < nearMeters) { near = spot; nearMeters = meters; }
  }
  if (!near) { await saveNewSpot(lat, lon); return; }
  const choice = await dialog({
    title: "Is it the same spot?",
    message: `"${near.name}" is ${nearMeters.toFixed(0)} m away.`,
    buttons: [{ label: "New spot", value: "new", cls: "outline" }, { label: "Same spot", value: "same", cls: "primary" }],
  });
  if (choice === "same") {
    near.lat = (near.lat + lat) / 2;
    near.lon = (near.lon + lon) / 2;
    await updateSpot(near);
    await refreshSpots();
    toast(`Position of "${near.name}" improved`);
  } else if (choice === "new") {
    await saveNewSpot(lat, lon);
  }
}

async function saveNewSpot(lat, lon) {
  const now = new Date();
  const name = "Spot " + String(now.getDate()).padStart(2, "0") + "/" + String(now.getMonth() + 1).padStart(2, "0")
    + " " + String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  await addSpot({ name, lat, lon, depth: 0, seabed: "", fish: "", rating: 0, notes: "" });
  await refreshSpots();
  toast('Spot saved. Tap it to add the details.');
}

function checkProximity(lat, lon) { // the vibration near spots and protected zones (only if Settings turns it on)
  if (localStorage.getItem("speargun-vibration") !== "1" || !navigator.vibrate) return;
  for (const spot of spotsCache) {
    const d = distanceMeters(lat, lon, spot.lat, spot.lon);
    if (d < 100 && !spotsWarned.has(spot.id)) {
      spotsWarned.add(spot.id);
      navigator.vibrate(500);
      toast(`You are ${d.toFixed(0)} m from "${spot.name}"`);
    }
  }
  for (const zone of zonesForProximity) {
    for (const shape of zone.shapes) {
      if (isInside(lat, lon, shape) && !zonesWarned.has(zone.name)) {
        zonesWarned.add(zone.name);
        navigator.vibrate(500);
        toast("Protected zone: " + zone.name);
      }
    }
  }
}

async function showSpotCard(spot) { // the card of one of our spots (Stitch design "Spot Card")
  const catches = await getCatchesForSpot(spot.id);
  const sheet = document.getElementById("spotCardSheet");
  sheet.innerHTML = `
    <h3>${escapeHtml(spot.name)}</h3>
    <div>
      <span class="chip"><span class="dot" style="background:${seabedColor(spot.seabed)}"></span>${spot.seabed || "Seabed ?"}</span>
      ${spot.fish ? `<span class="chip">🐟 ${escapeHtml(spot.fish)}</span>` : ""}
    </div>
    <div style="font-size:34px;font-weight:800;margin:8px 0 0;">${spot.depth > 0 ? spot.depth.toFixed(0) + " m" : "– m"}</div>
    <div style="color:var(--muted);font-size:13px;margin-bottom:6px;">${escapeHtml(nearestArea(spot.lat, spot.lon))}</div>
    <div class="stars">${starsText(spot.rating)}</div>
    ${spot.notes ? `<div style="margin-top:10px;font-size:13px;">${escapeHtml(spot.notes)}</div>` : ""}
    <div class="photo-row" id="spotCardPhotos"></div>
    <div class="btn-row">
      <button class="btn primary" id="cardNavigate">Navigate</button>
    </div>
    <div class="btn-row">
      <button class="btn outline" id="cardEdit">Edit</button>
      <button class="btn danger" id="cardDelete">Delete</button>
    </div>
  `;
  renderPhotos(sheet.querySelector("#spotCardPhotos"), catches, "photo-row", () => showSpotCard(spot));
  sheet.querySelector("#cardNavigate").onclick = () => { closeSheet("spotCardBackdrop"); openNavigate(spot.name, spot.lat, spot.lon); };
  sheet.querySelector("#cardEdit").onclick = () => { closeSheet("spotCardBackdrop"); openSpotForm(spot.id); };
  sheet.querySelector("#cardDelete").onclick = async () => {
    const sure = await dialog({
      title: `Delete "${spot.name}"?`, message: "Its catches and photos will be deleted too.",
      buttons: [{ label: "Cancel", value: false, cls: "outline" }, { label: "Delete", value: true, cls: "danger" }],
    });
    if (!sure) return;
    await deleteSpot(spot.id);
    await refreshSpots();
    closeSheet("spotCardBackdrop");
    toast("Spot deleted");
  };
  openSheet("spotCardBackdrop");
}

export function seabedColor(seabed) { // the color of each seabed, the same as the Android app
  if (seabed === "Rock") return "#92400E";
  if (seabed === "Sand") return "#FACC15";
  if (seabed === "Posidonia") return "#16A34A";
  if (seabed === "Mud") return "#3B82F6";
  return "#9CA3AF";
}

export function starsText(rating) { // e.g. "★★★★☆ 4.0"
  const rounded = Math.round(rating || 0);
  let stars = "";
  for (let i = 1; i <= 5; i++) stars += i <= rounded ? "★" : "☆";
  return stars + " " + (rating || 0).toFixed(1);
}
