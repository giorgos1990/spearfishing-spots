// Local storage: the spots, catches and trips stay on this phone (or computer).
// The Android app used a SQLite file; the browser gives us IndexedDB instead.
// Every function here returns a Promise, so the rest of the app can "await" it.

const DB_NAME = "speargun-web"; // the name of the IndexedDB database
const DB_VERSION = 1;

let dbPromise = null; // the one open database, opened only once (like DatabaseHelper.get)

function openDb() {
  if (dbPromise) return dbPromise; // already opening or open
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => { // runs only the first time, when the database does not exist yet
      const db = request.result;
      if (!db.objectStoreNames.contains("spots")) { // table with the spots
        db.createObjectStore("spots", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("catches")) { // table with the catches
        db.createObjectStore("catches", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("trips")) { // table with the trips (the red line on the map)
        db.createObjectStore("trips", { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

// wraps one IndexedDB request in a Promise, so we can use await instead of callbacks
function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store(name, mode) { // the object store, ready to read or write
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

// ---------- first run: copy the demo data in, like DemoData.java ----------

export async function seedIfNeeded() {
  if (localStorage.getItem("speargun-seeded")) return; // already done before
  const existing = await getAllSpots();
  if (existing.length > 0) { // the user already has spots: never touch them
    localStorage.setItem("speargun-seeded", "1");
    return;
  }
  try {
    const response = await fetch("data/demo-data.json"); // our own exported copy of speargun.db
    const demo = await response.json();
    const spotsStore = await store("spots", "readwrite");
    for (const spot of demo.spots) spotsStore.add(spot); // keeps the original ids
    const catchesStore = await store("catches", "readwrite");
    for (const item of demo.catches) catchesStore.add(item); // spotId still matches
    const tripsStore = await store("trips", "readwrite");
    for (const trip of demo.trips) tripsStore.add(trip);
  } catch (e) {
    console.error("Could not load the demo data", e); // no internet the very first time: the app just starts empty
  }
  localStorage.setItem("speargun-seeded", "1");
}

// ---------- spots ----------

export async function getAllSpots() {
  const s = await store("spots", "readonly");
  const list = await wrap(s.getAll());
  list.sort((a, b) => a.name.localeCompare(b.name)); // like "ORDER BY name"
  return list;
}

export async function getSpot(id) {
  const s = await store("spots", "readonly");
  return wrap(s.get(id));
}

export async function addSpot(spot) {
  const s = await store("spots", "readwrite");
  return wrap(s.add(spot));
}

export async function updateSpot(spot) {
  const s = await store("spots", "readwrite");
  return wrap(s.put(spot));
}

export async function deleteSpot(id) {
  const catches = await getCatchesForSpot(id); // first its catches
  const c = await store("catches", "readwrite");
  for (const item of catches) c.delete(item.id);
  const s = await store("spots", "readwrite");
  return wrap(s.delete(id)); // then the spot
}

// ---------- catches ----------

export async function getAllCatches() {
  const s = await store("catches", "readonly");
  const list = await wrap(s.getAll());
  const spots = await getAllSpots();
  const byId = new Map(spots.map((sp) => [sp.id, sp.name])); // the name of each spot, for the text of the row
  for (const item of list) item.spotName = byId.get(item.spotId) || "?";
  list.sort((a, b) => b.date - a.date); // newest first
  return list;
}

export async function getCatchesForSpot(spotId) {
  const all = await getAllCatches();
  return all.filter((item) => item.spotId === spotId);
}

export async function addCatch(item) {
  const s = await store("catches", "readwrite");
  return wrap(s.add(item));
}

export async function deleteCatch(id) {
  const s = await store("catches", "readwrite");
  return wrap(s.delete(id));
}

// ---------- trips ----------

export async function getAllTrips() {
  const s = await store("trips", "readonly");
  const list = await wrap(s.getAll());
  list.sort((a, b) => b.start - a.start); // newest first
  return list;
}

export async function addTrip(trip) {
  const s = await store("trips", "readwrite");
  return wrap(s.add(trip));
}

export async function deleteTrip(id) {
  const s = await store("trips", "readwrite");
  return wrap(s.delete(id));
}
