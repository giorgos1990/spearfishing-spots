// Settings screen, the ⋮ menu (forecast / weather / settings / about) and the
// live wind map screen. A web copy of SettingsActivity.java and WeatherActivity.java.

import { openScreen, dialog } from "./ui.js";
import { chooseForecastDay } from "./forecast-ui.js";

// the same wind map address as the Android app's WebView (Windy, free, no key)
const WINDY_URL = "https://embed.windy.com/embed.html?type=map&location=coordinates&metricWind=bft&metricTemp=%C2%B0C&zoom=8&overlay=wind&product=ecmwf&level=surface&lat=34.9&lon=33.2&detailLat=34.65&detailLon=32.7&detail=true";

export function initSettingsAndMenu() {
  const sw = document.getElementById("switchVibration");
  sw.checked = localStorage.getItem("speargun-vibration") === "1"; // show the saved value
  sw.addEventListener("change", () => {
    localStorage.setItem("speargun-vibration", sw.checked ? "1" : "0");
  });

  const menuBtn = document.getElementById("btnMenu");
  const dropdown = document.getElementById("menuDropdown");
  menuBtn.addEventListener("click", (e) => { e.stopPropagation(); dropdown.classList.toggle("hidden"); });
  document.addEventListener("click", () => dropdown.classList.add("hidden")); // tap anywhere else closes it

  document.getElementById("menuForecast").addEventListener("click", () => { dropdown.classList.add("hidden"); chooseForecastDay(); });
  document.getElementById("menuWeather").addEventListener("click", () => { dropdown.classList.add("hidden"); openWeather(); });
  document.getElementById("menuSettings").addEventListener("click", () => { dropdown.classList.add("hidden"); openScreen("screenSettings"); });
  document.getElementById("menuAbout").addEventListener("click", () => { dropdown.classList.add("hidden"); showAbout(); });
}

function openWeather() {
  document.getElementById("weatherFrame").src = WINDY_URL; // load it only when the screen opens
  openScreen("screenWeather");
}
document.querySelector('#screenWeather [data-close]').addEventListener("click", () => {
  document.getElementById("weatherFrame").src = "about:blank"; // stop the embed when we leave, it uses data and battery
});

function showAbout() {
  dialog({
    title: "About",
    message: "Speargun Spots. Save your spearfishing spots around Cyprus.\n\n"
      + "Weather and sea: Open-Meteo. Map: OpenStreetMap contributors, Esri. "
      + "Coastline: back office data. Sea marks: OpenSeaMap. Depths: EMODnet.\n\nNot for navigation.",
    buttons: [{ label: "OK", value: true, cls: "primary" }],
  });
}
