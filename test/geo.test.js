import { haversineMeters, deltaMeters, metersToDelta, bearingDeg } from '../geo.js';

let fails = 0;
let ok = 0;

function near(actual, expected, tol, name) {
  const diff = Math.abs(actual - expected);
  if (diff <= tol) {
    ok++;
    console.log(`  PASS  ${name}  (${actual.toFixed(6)} ~ ${expected})`);
  } else {
    fails++;
    console.error(`  FAIL  ${name}  (${actual} vs ${expected}, diff ${diff} > ${tol})`);
  }
}

console.log('geo.test - haversine');
near(haversineMeters(0, 0, 0, 0), 0, 1, 'mismo punto = 0');
near(haversineMeters(0, 0, 0.01, 0), 1111.949, 3, '0.01 grados de latitud en ecuador ~ 1111.95 m');
near(haversineMeters(10, 10, 10.001, 10), 111.195, 0.5, '0.001 grados de latitud ~ 111.19 m');
near(haversineMeters(40, -3.7, 40.001, -3.7), 111.195, 0.5, 'latitud Espana ~ 111.19 m');

console.log('geo.test - deltaMeters');
let d = deltaMeters(10, 10, 10.001, 10);
near(d.north, 111.195, 0.5, 'delta norte 0.001 grados ~ 111.19 m');
near(d.east, 0, 0.5, 'delta este = 0');
d = deltaMeters(0, 0, 0, 0.001);
near(d.east, 111.195, 0.5, 'delta este en ecuador ~ 111.19 m');
near(d.north, 0, 0.5, 'delta norte = 0');
d = deltaMeters(40.42, -3.7, 40.42, -3.699);
near(d.east, 84.79, 1, 'delta este a lat 40.42 ~ 84.79 m');
d = deltaMeters(52.52, 13.405, 52.5201, 13.405);
near(d.north, 11.12, 0.2, 'delta norte 0.0001 grados ~ 11.12 m');

console.log('geo.test - metersToDelta (inversa)');
let p = metersToDelta(10, 10, 0, 111.195);
near(p.lat, 10.001, 0.00001, 'norte 111.195 m -> +0.001 grados lat');
near(p.lng, 10, 0.00001, 'lng sin cambio');
p = metersToDelta(0, 0, 111.195, 0);
near(p.lng, 0.001, 0.00001, 'este 111.195 m en ecuador -> +0.001 grados lng');
near(p.lat, 0, 0.00001, 'lat sin cambio');
p = metersToDelta(40.42, -3.7, 84.79, 0);
near(p.lng, -3.699, 0.00005, 'este 84.79 m a lat 40.42 -> lng +0.001 grados');
const round = metersToDelta(52.52, 13.405, 11.12, 11.12);
near(round.lat, 52.5201, 0.00005, 'round-trip lat (norte)');
near(round.lng, 13.4051, 0.0001, 'round-trip lng (este)');

console.log('geo.test - bearing');
near(bearingDeg(0, 0, 0.01, 0), 0, 0.5, 'rumbo al norte = 0');
near(bearingDeg(0, 0, 0, 0.01), 90, 0.5, 'rumbo al este = 90');
near(bearingDeg(0, 0, -0.01, 0), 180, 0.5, 'rumbo al sur = 180');
near(bearingDeg(0, 0, 0, -0.01), 270, 0.5, 'rumbo al oeste = 270');

// Londres -> Paris: referencia ~343.5 km
const londonParis = haversineMeters(51.5074, -0.1278, 48.8566, 2.3522);
near(londonParis, 343500, 4000, 'Londres-Paris ~ 343.5 km');

console.log(`\n${ok} pasaron, ${fails} fallaron.`);
process.exit(fails ? 1 : 0);