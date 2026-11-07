// Service worker: lets the app open without internet, like the Android app
// works without the APK store. It only caches our own files (the map tiles
// and the forecast still need the internet).

const CACHE_NAME = "speargun-shell-v3"; // bump this number when the app shell changes

// the app shell: everything the app needs to draw its screens
const SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./js/geo.js",
  "./js/db.js",
  "./js/ui.js",
  "./js/photos.js",
  "./js/forecast.js",
  "./js/forecast-ui.js",
  "./js/map.js",
  "./js/spots.js",
  "./js/catches.js",
  "./js/navigate.js",
  "./js/trips.js",
  "./js/settings.js",
  "./js/main.js",
  "./data/demo-data.json",
  "./data/land.json",
  "./data/isobaths.json",
  "./data/zones.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

self.addEventListener("install", (event) => { // the first time the service worker is installed
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // fetch with {cache: "reload"} so a browser HTTP cache entry from an older
      // version of a file can never sneak into our new shell cache
      Promise.all(SHELL_FILES.map((url) => fetch(url, { cache: "reload" }).then((response) => cache.put(url, response))))
    )
  );
  self.skipWaiting(); // use the new service worker at once, do not wait for the old tabs to close
}); // end of install

self.addEventListener("activate", (event) => { // the new service worker takes over
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)) // throw away old versions
      )
    )
  );
  self.clients.claim(); // control the open tabs at once
}); // end of activate

self.addEventListener("fetch", (event) => { // every request the page makes
  if (event.request.method !== "GET") return; // only GET can be cached
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached; // we already have this file: use it (works offline)
      return fetch(event.request) // else ask the internet (map tiles, forecast, weather)
        .then((response) => {
          // keep our own files for next time (not the map tiles or other sites, too many and too big)
          if (response.ok && event.request.url.startsWith(self.location.origin) && event.request.url.includes("/data/")) {
            const copy = response.clone(); // a response can only be read once
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); // keep a copy
          }
          return response; // give the page the answer
        })
        .catch(() => cached); // no internet and not cached: nothing we can do for this file
    })
  );
}); // end of fetch
