// Shows the forecast dialogs (day picker + the colored list of areas).
// Used by the Forecast button on the map and by the "Today's forecast" menu item.

import { loadForecast, dayName, DAYS } from "./forecast.js";
import { openSheet, closeSheet, toast, escapeHtml } from "./ui.js";

export function chooseForecastDay() { // the 7 day cards (Stitch design)
  const list = document.getElementById("dayPickList");
  list.innerHTML = "";
  const today = new Date();
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().substring(0, 10);
    const row = document.createElement("div");
    row.className = "day-pick-row" + (i === 0 ? " today" : "");
    row.innerHTML = `
      <div class="day-num">${String(d.getDate()).padStart(2, "0")}</div>
      <div class="day-month">${d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</div>
      <div class="day-text">
        <div style="font-weight:700;">${i < 2 ? dayName(i, iso) : d.toLocaleDateString("en-US", { weekday: "long" })}</div>
        <div style="font-size:12px;color:var(--muted);">${d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "2-digit" })}</div>
      </div>`;
    row.onclick = () => { closeSheet("dayPickBackdrop"); showForecast(i); };
    list.appendChild(row);
  }
  openSheet("dayPickBackdrop");
}

export async function showForecast(day) { // downloads and shows the forecast of one day
  toast("Loading the forecast...");
  try {
    const result = await loadForecast(day);
    document.getElementById("forecastDayTitle").textContent = "Sea forecast · " + result.title;
    document.getElementById("forecastHead").innerHTML =
      `${result.title} &middot; sunrise ${result.sunrise} &middot; sunset ${result.sunset}<br>` +
      `<b style="color:${result.headlineColor}">${escapeHtml(result.headline)}</b>`;
    const list = document.getElementById("forecastList");
    list.innerHTML = "";
    for (const area of result.areas) {
      const row = document.createElement("div");
      row.className = "forecast-area";
      row.innerHTML = `
        <div class="fa-name">
          <span style="width:9px;height:9px;border-radius:5px;background:${area.color};display:inline-block;"></span>
          ${escapeHtml(area.name)}
        </div>
        <div class="fa-verdict" style="color:${area.color}">${escapeHtml(area.label)}</div>
        <div class="fa-chips">
          <span class="chip">💨 ${escapeHtml(area.wind)}</span>
          <span class="chip">🌊 ${escapeHtml(area.waves)}</span>
          <span class="chip">🌡 ${escapeHtml(area.sea)}</span>
        </div>
        <div class="fa-more">${escapeHtml(area.more)}</div>`;
      list.appendChild(row);
    }
    openSheet("forecastBackdrop");
  } catch (e) {
    console.error(e);
    toast("Could not load the forecast. Check the internet.");
  }
}
