// The Spots tab: search, sort, the list, the details screen and the add / edit form.
// A web copy of SpotsFragment.java, SpotDetailsActivity.java and AddSpotActivity.java.

import { getAllSpots, getSpot, addSpot, updateSpot, deleteSpot, getCatchesForSpot } from "./db.js";
import { distanceMeters, getCurrentPosition } from "./geo.js";
import { nearestArea } from "./forecast.js";
import { openScreen, closeScreen, toast, dialog, escapeHtml } from "./ui.js";
import { renderPhotos } from "./photos.js";
import { refreshSpots, seabedColor, starsText } from "./map.js";
import { openNavigate } from "./navigate.js";
import { openCatchForm } from "./catches.js";

const SEABEDS = ["Rock", "Sand", "Posidonia", "Mud"];
const FISH = ["Grouper", "Dentex", "Sea bream", "Amberjack", "Octopus", "Parrotfish", "White grouper", "Mottled grouper"];

let sort = "nearest"; // nearest | best | newest
let myPosition = null; // my last position, for the "Nearest" sort
let currentDetailsId = null; // the spot shown on the details screen now

export function initSpotsTab() {
  document.getElementById("spotSearch").addEventListener("input", loadSpots);
  document.querySelectorAll(".sort-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".sort-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      sort = pill.dataset.sort;
      loadSpots();
    });
  });
  document.getElementById("fabAddSpot").addEventListener("click", () => openSpotForm(null));
  document.getElementById("btnEditFromDetails").addEventListener("click", () => openSpotForm(currentDetailsId));
  document.getElementById("btnDeleteFromDetails").addEventListener("click", deleteFromDetails);
  buildFormChoices();
  getCurrentPosition().then((pos) => { if (pos) { myPosition = { lat: pos.coords.latitude, lon: pos.coords.longitude }; loadSpots(); } });
  loadSpots();
}

export async function loadSpots() { // reads the spots, keeps the ones that match the search, sorts them and shows them
  const all = await getAllSpots();
  const search = document.getElementById("spotSearch").value.trim().toLowerCase();
  let spots = all.filter((spot) => (spot.name + " " + spot.fish + " " + spot.notes).toLowerCase().includes(search));

  if (sort === "nearest" && myPosition) {
    spots.sort((a, b) => distanceMeters(myPosition.lat, myPosition.lon, a.lat, a.lon) - distanceMeters(myPosition.lat, myPosition.lon, b.lat, b.lon));
  } else if (sort === "best") {
    spots.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else {
    spots.sort((a, b) => b.id - a.id); // newest first (and "Nearest" before the GPS answers)
  }

  document.getElementById("spotsTitle").textContent = `⭐ My spots (${all.length})`;
  const list = document.getElementById("spotsList");
  list.innerHTML = "";
  if (all.length === 0) {
    list.innerHTML = `<div class="empty-note">No spots yet. Tap + to add your first spot.</div>`;
    return;
  }
  for (const spot of spots) {
    const row = document.createElement("div");
    row.className = "spot-row";
    row.innerHTML = `<span class="pin-icon">📍</span><span class="spot-name">${escapeHtml(spot.name)}</span><span class="chevron">›</span>`;
    row.onclick = () => openSpotDetails(spot.id);
    list.appendChild(row);
  }
}

// ---------- spot details ----------

async function openSpotDetails(id) {
  currentDetailsId = id;
  const spot = await getSpot(id);
  if (!spot) { toast("This spot does not exist any more"); return; }
  document.getElementById("detailsTitle").textContent = spot.name;
  const catches = await getCatchesForSpot(id);
  const body = document.getElementById("detailsBody");
  body.innerHTML = `
    <div style="font-size:40px;font-weight:800;">${spot.depth > 0 ? spot.depth.toFixed(0) + " m" : "– m"}</div>
    <div>
      <span class="chip"><span class="dot" style="background:${seabedColor(spot.seabed)}"></span>${spot.seabed || "Seabed ?"}</span>
    </div>
    <div style="color:var(--muted);font-size:13px;margin:8px 0;">${escapeHtml(nearestArea(spot.lat, spot.lon))}</div>
    <div class="stars">${starsText(spot.rating)}</div>
    <div class="section-title" style="margin-left:0;">Fish</div>
    <div>${spot.fish ? escapeHtml(spot.fish) : "-"}</div>
    <div class="section-title" style="margin-left:0;">Notes</div>
    <div>${spot.notes ? escapeHtml(spot.notes) : "No notes yet."}</div>
    <div class="section-title" style="margin-left:0;" id="detailsCatchesTitle">No photos yet</div>
    <div class="photo-grid" id="detailsPhotos"></div>
    <div class="btn-row"><button class="btn primary" id="detailsNavigate">Navigate</button></div>
    <div class="btn-row"><button class="btn outline" id="detailsAddCatch">+ Add catch</button></div>
  `;
  const count = renderPhotos(body.querySelector("#detailsPhotos"), catches, "photo-grid", () => openSpotDetails(id));
  body.querySelector("#detailsCatchesTitle").textContent = count === 0 ? "No photos yet" : `Catches here (${count})`;
  body.querySelector("#detailsNavigate").onclick = () => openNavigate(spot.name, spot.lat, spot.lon);
  body.querySelector("#detailsAddCatch").onclick = () => openCatchForm(spot.id, () => openSpotDetails(id));
  openScreen("screenSpotDetails");
}

async function deleteFromDetails() {
  const spot = await getSpot(currentDetailsId);
  if (!spot) return;
  const sure = await dialog({
    title: `Delete "${spot.name}"?`, message: "Its catches and photos will be deleted too.",
    buttons: [{ label: "Cancel", value: false, cls: "outline" }, { label: "Delete", value: true, cls: "danger" }],
  });
  if (!sure) return;
  await deleteSpot(spot.id);
  await refreshSpots();
  await loadSpots();
  closeScreen("screenSpotDetails");
  toast("Spot deleted");
}

// ---------- add / edit form ----------

function buildFormChoices() { // the seabed radio buttons and the fish check boxes, built once
  const radios = document.getElementById("seabedRadios");
  radios.innerHTML = SEABEDS.map((s, i) =>
    `<label><input type="radio" name="seabed" value="${s}" ${i === 0 ? "checked" : ""}><span>${s}</span></label>`
  ).join("");
  const checks = document.getElementById("fishChecks");
  checks.innerHTML = FISH.map((f) => `<label><input type="checkbox" value="${f}"><span>${f}</span></label>`).join("");
  const stars = document.getElementById("fRating");
  stars.innerHTML = [1, 2, 3, 4, 5].map((n) => `<span data-value="${n}">☆</span>`).join("");
  stars.dataset.value = "0";
  stars.querySelectorAll("span").forEach((span) => {
    span.onclick = () => setRatingInput(Number(span.dataset.value));
  });
  document.getElementById("spotForm").addEventListener("submit", onSubmitSpotForm);
  document.getElementById("btnUseMyLocation").addEventListener("click", async () => {
    toast("Getting your GPS position...");
    const pos = await getCurrentPosition();
    if (!pos) { toast("No GPS position. Try again outside."); return; }
    document.getElementById("fLat").value = pos.coords.latitude.toFixed(6);
    document.getElementById("fLon").value = pos.coords.longitude.toFixed(6);
  });
}

function setRatingInput(value) {
  const stars = document.getElementById("fRating");
  stars.dataset.value = String(value);
  stars.querySelectorAll("span").forEach((span) => {
    span.textContent = Number(span.dataset.value) <= value ? "★" : "☆";
    span.classList.toggle("on", Number(span.dataset.value) <= value);
  });
}

let editId = null; // null = new spot

// prefill: optional { lat, lon, name } from the map (a long press / a zone's "Save as spot")
export function openSpotForm(id, prefill) {
  editId = id || null;
  document.getElementById("spotFormTitle").textContent = editId ? "Edit spot" : "Add spot";
  const form = document.getElementById("spotForm");
  form.reset();
  setRatingInput(0);
  document.getElementById("seabedRadios").querySelector("input").checked = true;

  if (editId) {
    getSpot(editId).then((spot) => {
      document.getElementById("fName").value = spot.name;
      document.getElementById("fDepth").value = spot.depth > 0 ? spot.depth : "";
      document.getElementById("fLat").value = spot.lat.toFixed(6);
      document.getElementById("fLon").value = spot.lon.toFixed(6);
      document.getElementById("fNotes").value = spot.notes || "";
      setRatingInput(spot.rating || 0);
      document.querySelectorAll('#seabedRadios input').forEach((r) => { r.checked = r.value === spot.seabed; });
      document.querySelectorAll('#fishChecks input').forEach((c) => { c.checked = (spot.fish || "").includes(c.value); });
    });
  } else if (prefill) {
    document.getElementById("fLat").value = prefill.lat.toFixed(6);
    document.getElementById("fLon").value = prefill.lon.toFixed(6);
    document.getElementById("fName").value = prefill.name || "";
  }
  openScreen("screenSpotForm");
}

async function onSubmitSpotForm(e) {
  e.preventDefault();
  const name = document.getElementById("fName").value.trim();
  if (!name) { toast("Please give a name"); return; }
  const lat = parseFloat(document.getElementById("fLat").value.replace(",", "."));
  const lon = parseFloat(document.getElementById("fLon").value.replace(",", "."));
  if (isNaN(lat) || isNaN(lon)) { toast("Please give the position (or tap Use my location)"); return; }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) { toast("Latitude must be -90 to 90 and longitude -180 to 180"); return; }

  const depthText = document.getElementById("fDepth").value.trim().replace(",", ".");
  const depth = depthText === "" ? 0 : parseFloat(depthText) || 0;
  const seabed = document.querySelector('#seabedRadios input:checked').value;
  const fish = [...document.querySelectorAll('#fishChecks input:checked')].map((c) => c.value).join(", ");
  const rating = Number(document.getElementById("fRating").dataset.value || 0);
  const notes = document.getElementById("fNotes").value.trim();

  if (editId) {
    const spot = await getSpot(editId);
    Object.assign(spot, { name, lat, lon, depth, seabed, fish, rating, notes });
    await updateSpot(spot);
    toast("Spot updated");
  } else {
    await addSpot({ name, lat, lon, depth, seabed, fish, rating, notes });
    toast("Spot saved");
  }
  await refreshSpots();
  await loadSpots();
  closeScreen("screenSpotForm");
}
