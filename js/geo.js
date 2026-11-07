// Small maths for positions on the earth (same formulas as the Android app's GeoUtils.java).

const EARTH_RADIUS = 6371000; // radius of the earth in metres

export function distanceMeters(lat1, lon1, lat2, lon2) { // distance between two points
  const dLat = toRad(lat2 - lat1); // difference of latitude in radians
  const dLon = toRad(lon2 - lon1); // difference of longitude in radians
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) // haversine formula, part 1
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) // part 2
    * Math.sin(dLon / 2) * Math.sin(dLon / 2); // part 3
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); // the distance in metres
}

export function bearing(lat1, lon1, lat2, lon2) { // direction from point 1 to point 2
  const f1 = toRad(lat1); // latitude 1 in radians
  const f2 = toRad(lat2); // latitude 2 in radians
  const dLon = toRad(lon2 - lon1); // difference of longitude in radians
  const y = Math.sin(dLon) * Math.cos(f2); // east-west part
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dLon); // north-south part
  return (toDeg(Math.atan2(y, x)) + 360) % 360; // 0 = north, 90 = east, 180 = south, 270 = west
}

// is the point inside the shape? polygon is an array of [lat, lon] points
export function isInside(lat, lon, polygon) {
  let inside = false; // start with "outside"
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) { // every side of the shape (from point j to point i)
    const a = polygon[i]; // one end of the side
    const b = polygon[j]; // the other end of the side
    const crosses = (a[0] > lat) !== (b[0] > lat); // the side goes over our latitude
    if (crosses && lon < (b[1] - a[1]) * (lat - a[0]) / (b[0] - a[0]) + a[1]) { // and it is east of us
      inside = !inside; // every crossing changes inside / outside
    }
  }
  return inside; // odd number of crossings = inside
}

export function compassName(degrees) { // 0-360 degrees as N, NE, E ...
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]; // the 8 directions
  return names[Math.round(degrees / 45) % 8]; // every direction is 45 degrees wide
}

function toRad(deg) { return (deg * Math.PI) / 180; }
function toDeg(rad) { return (rad * 180) / Math.PI; }

// one GPS position, wrapped in a Promise so we can use "await" instead of callbacks.
// resolves to null if there is no permission or no GPS (the caller shows its own message).
export function getCurrentPosition(options) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, ...options }
    );
  });
}
