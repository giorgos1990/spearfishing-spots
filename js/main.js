// The entry point: starts the database, the 3 tabs and the service worker.
// A web copy of what MainActivity.java does in onCreate().

import { seedIfNeeded } from "./db.js";
import { initMap } from "./map.js";
import { initSpotsTab } from "./spots.js";
import { initCatchForm } from "./catches.js";
import { initTripsTab } from "./trips.js";
import { initSettingsAndMenu } from "./settings.js";
import { wireGenericClosers } from "./ui.js";

function wireBottomNav() { // Map / Spots / Trip log, like the BottomNavigationView
  document.querySelectorAll("#bottomnav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#bottomnav button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-page").forEach((p) => p.classList.remove("active"));
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });
}

function isIosSafari() { // iPhone / iPad, not already installed
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return ios && !standalone;
}

function maybeShowInstallHint() { // "Add to Home Screen", shown only once
  if (!isIosSafari()) return;
  if (localStorage.getItem("speargun-install-hint-shown")) return;
  document.getElementById("installHint").classList.add("visible");
  localStorage.setItem("speargun-install-hint-shown", "1");
}
document.getElementById("installHintClose").addEventListener("click", () => {
  document.getElementById("installHint").classList.remove("visible");
});

async function boot() {
  wireGenericClosers(); // the "tap outside to close" and [data-close] buttons
  wireBottomNav();
  await seedIfNeeded(); // the demo spots, catches and trips, the very first time
  await initMap(); // the Map tab (it also loads the zones and the land shape)
  initSpotsTab();
  initCatchForm();
  initTripsTab();
  initSettingsAndMenu();
  maybeShowInstallHint();

  if ("serviceWorker" in navigator) { // lets the app open again without internet
    navigator.serviceWorker.register("./sw.js").catch((e) => console.error("Service worker failed", e));
  }
}

boot();
