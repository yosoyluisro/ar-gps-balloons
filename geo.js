// geo.js ÔÇö utilidades geogr├íficas puras (sin dependencias).
// Convenci├│n de salida: east/north en metros. North = eje apuntando a +latitud, east = +longitud.

const R = 6371000; // radio medio de la Tierra (m)
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export function degToRad(d) {
  return d * DEG2RAD;
}

export function radToDeg(r) {
  return r * RAD2DEG;
}

// Distancia real entre dos puntos (f├│rmula de haversine), en metros.
export function haversineMeters(lat0, lng0, lat1, lng1) {
  const f1 = degToRad(lat0);
  const f2 = degToRad(lat1);
  const dphi = degToRad(lat1 - lat0);
  const dl = degToRad(lng1 - lng0);
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Descomposici├│n en metros locales (proyecci├│n equirectangular, exacta en <10 km):
// { east, north } = desplazamiento desde (lat0,lng0) hasta (lat1,lng1).
export function deltaMeters(lat0, lng0, lat1, lng1) {
  const f0 = degToRad(lat0);
  const f1 = degToRad(lat1);
  const dl = degToRad(lng1 - lng0);
  const h = R * Math.cos((f0 + f1) / 2);
  return { east: h * dl, north: R * (f1 - f0) };
}

// Inversa de deltaMeters: desde (lat0,lng0) y un desplazamiento {east,north} en metros,
// devuelve { lat, lng } del punto destino. Exacta en <10 km.
export function metersToDelta(lat0, lng0, east, north) {
  const f0 = degToRad(lat0);
  const h = R * Math.cos(f0);
  const dLng = east / h;
  const dLat = north / R;
  return { lat: lat0 + radToDeg(dLat), lng: lng0 + radToDeg(dLng) };
}

// Rumbo inicial de un punto a otro, en grados (0 = norte, 90 = este, 0..360).
export function bearingDeg(lat0, lng0, lat1, lng1) {
  const f1 = degToRad(lat0);
  const f2 = degToRad(lat1);
  const dl = degToRad(lng1 - lng0);
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (radToDeg(Math.atan2(y, x)) + 360) % 360;
}
