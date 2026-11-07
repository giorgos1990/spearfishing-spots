// Today's weather and sea from Open-Meteo (web service, free, no key).
// A JavaScript copy of the Android app's Forecast.java, the same areas and the same rule.

import { distanceMeters } from "./geo.js";

// every coastal village / area of the free part of Cyprus, from Kato Pyrgos (north-west) to Paralimni (east)
const NAMES = [
  "Kato Pyrgos", "Pachyammos", "Pomos", "Nea Dimmata", "Gialia", "Argaka", "Polis / Latchi",
  "Blue Lagoon (Akamas)", "Lara", "Agios Georgios Pegeias", "Coral Bay", "Kissonerga / Chlorakas", "Paphos", "Geroskipou",
  "Petra tou Romiou", "Pissouri", "Avdimou", "Episkopi / Kourion", "Akrotiri", "Limassol",
  "Agios Tychonas", "Pyrgos", "Pentakomo", "Governor's Beach", "Zygi", "Mazotos", "Kiti / Perivolia", "Larnaca",
  "Oroklini", "Ormidia", "Xylofagou", "Potamos Liopetriou", "Ayia Thekla", "Ayia Napa", "Cape Greco", "Konnos", "Protaras", "Paralimni / Pernera",
];
const LATS = [
  35.2, 35.2, 35.19, 35.15, 35.13, 35.09, 35.06,
  35.09, 34.955, 34.9, 34.855, 34.81, 34.745, 34.72,
  34.655, 34.63, 34.645, 34.655, 34.56, 34.66,
  34.7, 34.7, 34.7, 34.7, 34.72, 34.755, 34.8, 34.9,
  34.95, 34.975, 34.94, 34.95, 34.965, 34.975, 34.95, 34.98, 35.01, 35.03,
];
const LONS = [
  32.68, 32.63, 32.55, 32.52, 32.48, 32.49, 32.39,
  32.31, 32.29, 32.3, 32.345, 32.37, 32.395, 32.46,
  32.62, 32.7, 32.76, 32.86, 32.97, 33.05,
  33.14, 33.19, 33.26, 33.29, 33.34, 33.49, 33.6, 33.66,
  33.72, 33.78, 33.85, 33.9, 33.93, 34.0, 34.09, 34.085, 34.075, 34.065,
];

// towns away from the sea, so a position in Nicosia says "Nicosia" and not the closest beach
const INLAND = ["Nicosia", "Strovolos", "Lakatamia", "Latsia", "Dali", "Kokkinotrimithia", "Lefkara", "Platres", "Kakopetria", "Pedoulas", "Athienou", "Kofinou"];
const INLAND_LATS = [35.1856, 35.144, 35.117, 35.096, 35.023, 35.158, 34.867, 34.889, 34.989, 34.967, 35.061, 34.839];
const INLAND_LONS = [33.3823, 33.346, 33.317, 33.37, 33.423, 33.205, 33.313, 32.864, 32.901, 32.831, 33.543, 33.397];

export const DAYS = 7; // how many days the forecast button can show (today + 6)

// the colors of the verdicts (same as res/values/colors.xml)
const GREEN = "#22C55E";
const YELLOW = "#FBBF24";
const RED = "#EF4444";

export function nearestArea(lat, lon) { // the name of the closest village, e.g. "Pissouri"
  let best = "";
  let bestMeters = Infinity;
  for (let i = 0; i < NAMES.length; i++) {
    const meters = distanceMeters(lat, lon, LATS[i], LONS[i]);
    if (meters < bestMeters) { bestMeters = meters; best = NAMES[i]; }
  }
  for (let i = 0; i < INLAND.length; i++) {
    const meters = distanceMeters(lat, lon, INLAND_LATS[i], INLAND_LONS[i]);
    if (meters < bestMeters) { bestMeters = meters; best = INLAND[i]; }
  }
  return best;
}

// our rule for spearfishing: wind in knots, waves in metres
function verdict(wind, gust, wave, swell) {
  const w = Math.max(wind, gust * 0.7); // strong gusts count too
  const h = Math.max(wave, swell * 1.2); // a long swell moves the water more than its height says
  if (w <= 10 && h <= 0.3) return "GOOD"; // calm sea, good visibility
  if (w <= 16 && h <= 0.6) return "OK"; // possible, but not great
  return "BAD"; // do not go
}

function reason(wind, gust, wave, swell) { // why the sea is not calm
  const windy = Math.max(wind, gust * 0.7) > 10;
  const wavy = Math.max(wave, swell * 1.2) > 0.3;
  if (windy && wavy) return "WIND and WAVES";
  if (windy) return "WIND";
  return "WAVES";
}

function label(v, why) {
  if (v === "GOOD") return "GOOD for fishing";
  if (v === "OK") return why + " – be careful";
  return "BAD – do not go (" + why + ")";
}

function color(v) {
  if (v === "GOOD") return GREEN;
  if (v === "OK") return YELLOW;
  return RED;
}

export function dayName(day, isoDate) { // 0 = "Today", 1 = "Tomorrow", else e.g. "Friday 06/11"
  if (day === 0) return "Today";
  if (day === 1) return "Tomorrow";
  try {
    const d = new Date(isoDate.substring(0, 10) + "T00:00:00");
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${weekday} ${dd}/${mm}`;
  } catch (e) {
    return "Day " + (day + 1);
  }
}

function join(numbers) { // [34.745, 35.06] -> "34.745,35.060" for the web address
  return numbers.map((n) => n.toFixed(3)).join(",");
}

async function download(url) { // one web request, as JSON
  const response = await fetch(url);
  if (!response.ok) throw new Error("bad response " + response.status);
  return response.json();
}

// downloads the forecast of one day: -1 = choose the day by itself (today, or tomorrow after sunset)
export async function loadForecast(chosenDay) {
  const lat = join(LATS);
  const lon = join(LONS);
  const weather = await download(
    "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon
      + "&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m"
      + "&daily=sunrise,sunset&wind_speed_unit=kn&forecast_days=" + DAYS + "&timezone=auto"
  );
  const marine = await download(
    "https://marine-api.open-meteo.com/v1/marine?latitude=" + lat + "&longitude=" + lon
      + "&hourly=wave_height,swell_wave_height,sea_surface_temperature,ocean_current_velocity,ocean_current_direction"
      + "&forecast_days=" + DAYS + "&timezone=auto"
  );

  // which day: before sunset = today (the hours still to come), after sunset = tomorrow
  const now = nowInCyprus(); // "2026-11-06T18:30" style text, so it can be compared like a number
  const days = weather[0].daily; // sunrise and sunset (the same for all of Cyprus)
  let day = chosenDay;
  if (day < 0) day = now < days.sunset[0] ? 0 : 1; // not chosen: 0 = today, 1 = tomorrow
  const sunrise = days.sunrise[day];
  const sunset = days.sunset[day];
  const from = (day === 0 && now > sunrise) ? now : sunrise; // today: only the hours that did not pass yet

  const green = [], yellow = [], red = [];
  let bestName = null, bestWindow = "", bestScore = -9999;

  for (let i = 0; i < NAMES.length; i++) {
    const wHour = weather[i].hourly; // the weather of this area, every hour
    const mHour = marine[i].hourly; // the sea of this area, every hour
    const times = wHour.time; // "2026-11-03T00:00", ...

    // 1) the level of every daylight hour: 2 = GOOD, 1 = OK, 0 = BAD
    const hours = [], levels = [];
    for (let h = 0; h < times.length; h++) {
      const t = times[h];
      if (t.substring(0, 13) < from.substring(0, 13) || t >= sunset) continue; // dark or already passed
      const v = verdict(wHour.wind_speed_10m[h] ?? 0, wHour.wind_gusts_10m[h] ?? 0, mHour.wave_height[h] ?? 0, mHour.swell_wave_height[h] ?? 0);
      hours.push(h);
      levels.push(v === "GOOD" ? 2 : v === "OK" ? 1 : 0);
    }
    if (hours.length === 0) continue; // no daylight hours (should not happen)

    // 2) the best level of the day, and the longest time in a row with that level (or better)
    let best = 0;
    for (const level of levels) best = Math.max(best, level);
    let runStart = 0, runLength = 0, start = 0;
    for (let k = 0; k <= levels.length; k++) {
      const ok = k < levels.length && levels[k] >= best;
      if (!ok) {
        if (k - start > runLength) { runStart = start; runLength = k - start; }
        start = k + 1;
      }
    }

    // 3) the numbers of those hours (the worst value in them, so the verdict and the numbers agree)
    let wind = 0, gust = 0, wave = 0, swell = 0, air = 0, windDir = 0, sea = 0, current = 0, currentDir = 0;
    for (let k = runStart; k < runStart + runLength; k++) {
      const h = hours[k];
      const w = wHour.wind_speed_10m[h] ?? 0;
      if (w >= wind) { wind = w; windDir = wHour.wind_direction_10m[h] ?? 0; }
      gust = Math.max(gust, wHour.wind_gusts_10m[h] ?? 0);
      wave = Math.max(wave, mHour.wave_height[h] ?? 0);
      swell = Math.max(swell, mHour.swell_wave_height[h] ?? 0);
      air = Math.max(air, wHour.temperature_2m[h] ?? 0);
      sea = Math.max(sea, mHour.sea_surface_temperature[h] ?? 0);
      const c = mHour.ocean_current_velocity[h] ?? 0;
      if (c >= current) { current = c; currentDir = mHour.ocean_current_direction[h] ?? 0; }
    }
    let startTime = times[hours[runStart]].substring(11, 16);
    const last = hours[runStart + runLength - 1] + 1;
    let endTime = last < times.length ? times[last].substring(11, 16) : "24:00";
    if (endTime > sunset.substring(11, 16)) endTime = sunset.substring(11, 16);
    if (startTime < from.substring(11, 16)) startTime = from.substring(11, 16);

    const v = verdict(wind, gust, wave, swell);
    const why = reason(wind, gust, wave, swell);

    const area = {
      name: NAMES[i],
      label: label(v, why) + "  ·  " + startTime + "–" + endTime,
      color: color(v),
      wind: (wind * 1.852).toFixed(0) + " km/h " + compassName(windDir), // 1 knot = 1.852 km/h
      waves: swell * 1.2 > wave ? "swell " + swell.toFixed(2) + " m" : wave.toFixed(2) + " m",
      sea: sea.toFixed(0) + "°C",
      more: `wind gusts ${(gust * 1.852).toFixed(0)} km/h · current ${current.toFixed(1)} km/h to ${compassName(currentDir)} · air ${air.toFixed(0)}°C`,
    };
    if (v === "GOOD") green.push(area);
    else if (v === "OK") yellow.push(area);
    else red.push(area);

    const score = best * 100 + runLength - (Math.max(wind, gust * 0.7) + Math.max(wave, swell * 1.2) * 10) / 100;
    if (score > bestScore && v !== "BAD") {
      bestScore = score;
      bestName = NAMES[i];
      bestWindow = label(v, why) + ", " + startTime + "–" + endTime;
    }
  }

  const areas = [...green, ...yellow, ...red]; // green first, then yellow, then red
  const good = bestName != null;
  const title = dayName(day, sunrise);
  let headline, headlineColor;
  if (areas.length === 0) { headline = "The sun has set. Choose Tomorrow."; headlineColor = YELLOW; }
  else if (good) { headline = "Best area: " + bestName + " (" + bestWindow + ")"; headlineColor = green.length === 0 ? YELLOW : GREEN; }
  else { headline = "Do not go fishing: strong wind or big waves in all areas."; headlineColor = RED; }

  return {
    title, sunrise: sunrise.substring(11, 16), sunset: sunset.substring(11, 16),
    headline, headlineColor, areas, good,
  };
}

function compassName(degrees) { // local copy, same rule as geo.js (kept here so forecast.js has no surprises)
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return names[Math.round(degrees / 45) % 8];
}

function nowInCyprus() { // "yyyy-MM-ddTHH:mm" in Cyprus time, like Open-Meteo writes its times
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Nicosia", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
