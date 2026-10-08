/**
 * Orthographic globe projection (viewed from directly above a rotating
 * longitude, equatorial tilt fixed at 0) -- the standard "look at a sphere
 * from space" projection, implemented from the formula directly rather than
 * a mapping library, to stay consistent with this project's vanilla-JS,
 * no-heavy-dependency style.
 */

const DEG = Math.PI / 180;

/** Projects (lon, lat) in degrees to unit-circle (x, y in [-1, 1]) coordinates
 * for a globe centered on `rotationLambda` degrees of longitude. `visible` is
 * false for the far hemisphere (behind the globe from this viewpoint). */
export function project(lon, lat, rotationLambda) {
  const lambda = (lon - rotationLambda) * DEG;
  const phi = lat * DEG;
  const cosPhi = Math.cos(phi);
  const x = cosPhi * Math.sin(lambda);
  const y = -Math.sin(phi);
  const visible = Math.cos(lambda) * cosPhi > 0;
  return { x, y, visible };
}

/** Inverse of project(): given a click at unit-circle (x, y) (x²+y²≤1), returns
 * the (lon, lat) on the near hemisphere, or null if the click missed the globe. */
export function unproject(x, y, rotationLambda) {
  const r2 = x * x + y * y;
  if (r2 > 1) return null;
  const phi = Math.asin(-y);
  const cosPhi = Math.cos(phi);
  const sinLambda = cosPhi === 0 ? 0 : x / cosPhi;
  const lambda = Math.asin(Math.max(-1, Math.min(1, sinLambda)));
  const lon = lambda / DEG + rotationLambda;
  const lat = phi / DEG;
  return { lon: ((lon + 540) % 360) - 180, lat };
}

/** Great-circle angular distance in degrees between two (lon, lat) points. */
export function angularDistance(lon1, lat1, lon2, lat2) {
  const p1 = lat1 * DEG, p2 = lat2 * DEG;
  const dLambda = (lon2 - lon1) * DEG;
  const cosC = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dLambda);
  return Math.acos(Math.max(-1, Math.min(1, cosC))) / DEG;
}

/** Nearest region (by great-circle distance) to a clicked (lon, lat). `regions`
 * is [{ id, lat, lon, ... }]. Returns null if `regions` is empty. */
export function nearestRegion(lon, lat, regions) {
  let best = null;
  let bestDist = Infinity;
  for (const r of regions) {
    const d = angularDistance(lon, lat, r.lon, r.lat);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  return best;
}
