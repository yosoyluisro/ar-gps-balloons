import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

const LS = 'airmap.v1';
const ICONS = ['📍', '🏛', '📚', '🎓', '🍔', '☕', '🅿️', '🚻', '⚠️', '❓', '⭐', '💧', '🏟', '🚪', '🏥', '💊'];
const PALETTE = ['#ff2ef0', '#29fff0', '#64ff5f', '#ffe32e', '#ff7a2e', '#b78cff', '#ffffff'];
const DEFAULT_CENTER = { lat: 19.4326, lng: -99.1332 };
const FLOAT_H = 1.35;
const METER_DEG = 111320;

const $ = (id) => document.getElementById(id);

const state = load();

const sceneCanvas = $('scene');
const map2d = $('map2d');
const map2dCtx = map2d.getContext('2d');
const hudEl = $('hud');
const overlayStart = $('overlay-start');
const xrStatusEl = $('xr-status');
const enterARBox = $('enter-ar');
const panel2d = $('panel-2d');
const panelAr = $('panel-ar');
const pointCard = $('point-card');
const routeBar = $('route-bar');
const statusBar = $('status-bar');
const routeSel = $('route-sel');

const renderer = new THREE.WebGLRenderer({ canvas: sceneCanvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearAlpha(0);
renderer.xr.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 900);
const pivot = new THREE.Group();
scene.add(pivot);

const raycaster = new THREE.Raycaster();
const bubbleSprites = [];

const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.12, 0.2, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x29fff0, transparent: true, opacity: 0.95, depthTest: true })
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

let gps = null;
let watchId = null;
let compassDeg = null;
let rawHeading = null;
let arOn = false;
let enterARButton = null;
let view = '2d';
let arOnFlag = false;

let sessionOrigin = null;
let smoothU = { e: 0, n: 0, alt: 0 };
let targetU = { e: 0, n: 0, alt: 0 };
let worldYaw = state.prefs.worldYaw || 0;

let sessionId = '';
let refSpace = null;
let viewerSpace = null;
let hitSource = null;
let lastHitMatrix = null;
let drift = new THREE.Vector3();
let marking = false;
let nudge = null;
let nudgeDrag = false;
let nudgeRefs = null;
let nudgeGroundY = 0;
let prevCam = new THREE.Vector3();
let prevTs = 0;
let still = 0;
let lastCorrTxt = 0;
const UP = new THREE.Vector3(0, 1, 0);
const pointRefs = new Map();

let addMode = false;
let selectedId = null;
let routeWorking = null;
let editingPointId = null;
let pmIsNew = false;
let demoOn = false;

let mapRunning = false;
let lastTap = 0;

function norm360(a) { return ((a % 360) + 360) % 360; }

function toMeters(lat, lng, ref) {
  if (!ref) ref = { lat: 0, lng: 0 };
  return {
    e: (lng - ref.lng) * METER_DEG * Math.cos((ref.lat * Math.PI) / 180),
    n: (lat - ref.lat) * METER_DEG
  };
}

function locOf(e, n, ref) {
  if (!ref) ref = { lat: 0, lng: 0 };
  return {
    lat: ref.lat + n / METER_DEG,
    lng: ref.lng + e / (METER_DEG * Math.cos((ref.lat * Math.PI) / 180))
  };
}

function save() {
  try {
    localStorage.setItem(LS, JSON.stringify({ points: state.points, routes: state.routes, prefs: state.prefs }));
  } catch {
    toast('No se pudo guardar (almacenamiento lleno)');
  }
  updateStatus();
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(LS));
    if (d && d.points && d.routes) {
      return { points: d.points, routes: d.routes, prefs: d.prefs || {} };
    }
  } catch { /* */
  }
  return { points: [], routes: [], prefs: {} };
}

function newId() {
  return 'p' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2400);
}

function currentLatLngAlt() {
  return gps ? { lat: gps.lat, lng: gps.lng, alt: Number.isFinite(gps.alt) ? gps.alt : 0 } : null;
}

function ensureOrigin() {
  if (sessionOrigin) return sessionOrigin;
  const g = currentLatLngAlt();
  if (g) { sessionOrigin = g; return sessionOrigin; }
  const p0 = state.points[0];
  sessionOrigin = p0 ? { lat: p0.lat, lng: p0.lng, alt: Number.isFinite(p0.alt) ? p0.alt : 0 } : { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng, alt: 0 };
  return sessionOrigin;
}

function updateTargetU() {
  if (demoOn) {
    const t = performance.now() / 1000;
    targetU = { e: Math.sin(t * 0.12) * 28, n: Math.cos(t * 0.09) * 28, alt: 0 };
    return;
  }
  if (gps) {
    const ref = ensureOrigin();
    const m = toMeters(gps.lat, gps.lng, ref);
    targetU = { e: m.e, n: m.n, alt: Number.isFinite(gps.alt) ? gps.alt - ref.alt : 0 };
  }
}

function startGPS() {
  if (!navigator.geolocation || watchId !== null) return;
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      gps = {
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        alt: p.coords.altitude,
        accuracy: Math.round(p.coords.accuracy || 0),
        heading: p.coords.heading,
        speed: p.coords.speed
      };
      updateStatus();
    },
    (err) => toast('GPS: ' + (err.message || err.code)),
    { enableHighAccuracy: true, maximumAge: 1500, timeout: 20000 }
  );
}

function requestCompass() {
  const add = () => {
    if ('DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', onOrient, true);
      if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onOrient, true);
    }
  };
  if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) {
    DeviceOrientationEvent.requestPermission().then((s) => {
      if (s === 'granted') add();
    }).catch(() => { /* */
    });
  } else {
    add();
  }
}

function onOrient(e) {
  let raw = null;
  if (typeof e.webkitCompassHeading === 'number') raw = e.webkitCompassHeading;
  else if (typeof e.alpha === 'number') raw = 360 - e.alpha;
  if (raw === null) return;
  raw = norm360(raw);
  rawHeading = raw;
  if (compassDeg === null) compassDeg = raw;
  else {
    const diff = Math.abs(norm360(raw - compassDeg));
    compassDeg = diff > 120 ? raw : compassDeg * 0.92 + raw * 0.08;
  }
}

function headingNow() {
  return compassDeg === null ? 0 : compassDeg;
}

function buildBubbleTexture(p) {
  const W = 256, H = 170, R = 26;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');

  g.shadowColor = 'rgba(0,0,0,0.55)';
  g.shadowBlur = 14;
  g.fillStyle = p.color;
  g.globalAlpha = 0.88;
  roundedPath(g, 0, 0, W, H - 42, R);
  g.fill();
  g.globalAlpha = 1;
  g.beginPath();
  g.moveTo(W / 2 - 18, H - 42);
  g.lineTo(W / 2 + 18, H - 42);
  g.lineTo(W / 2, H);
  g.closePath();
  g.fill();

  g.lineWidth = 6;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  roundedPath(g, 3, 3, W - 6, H - 45, R - 4);
  g.stroke();

  g.font = '42px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.globalAlpha = 0.25;
  g.fillStyle = '#000';
  g.fillText(p.icon || '📍', 40, 34);
  g.globalAlpha = 1;
  g.fillText(p.icon || '📍', 39, 33);

  g.font = 'bold 30px system-ui, sans-serif';
  g.fillStyle = '#04050d';
  let title = (p.name || '?').slice(0, 16);
  if ((p.name || '').length > 16) title += '…';
  g.fillText(title, W / 2, H - 20);
  return new THREE.CanvasTexture(cv);
}

function roundedPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function glowTexture(color) {
  const key = 'glow:' + color;
  if (glowTexCache.has(key)) return glowTexCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const rad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rad.addColorStop(0, color);
  rad.addColorStop(0.4, color + '66');
  rad.addColorStop(1, color + '00');
  g.fillStyle = rad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  glowTexCache.set(key, tex);
  return tex;
}

const glowTexCache = new Map();
const matCache = new Map();

function flatMat(color, opacity) {
  const key = color + '|' + (opacity || 1);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: opacity || 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    }));
  }
  return matCache.get(key);
}

function addBubble(p, ref) {
  const loc = bubbleLocal(p, ref);
  const x = loc.x, y = loc.y, z = loc.z;

  const tex = buildBubbleTexture(p);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(1.15, 1.15 * (170 / 256), 1);
  spr.position.set(x, y + FLOAT_H, z);
  spr.userData.pointId = p.id;
  pivot.add(spr);
  bubbleSprites.push(spr);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(p.color), transparent: true, depthWrite: false, opacity: 0.75 }));
  glow.scale.set(0.42, 0.42, 1);
  glow.position.set(x, y + 0.06, z);
  pivot.add(glow);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    x, y, z, x, y + FLOAT_H * 0.75, z
  ]), 3));
  const staff = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: p.color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  pivot.add(staff);
  pointRefs.set(p.id, { spr, glow, staff });
}

function bubbleLocal(p, ref) {
  if (p && p.rel && p.relSes === sessionId && Number.isFinite(p.rel.x)) {
    return { x: p.rel.x, y: p.rel.y, z: p.rel.z };
  }
  const m = toMeters(p.lat, p.lng, ref);
  return { x: m.e, y: (Number.isFinite(p.alt) ? p.alt - ref.alt : 0), z: -m.n };
}

const tubeCache = new THREE.Group();

function rebuildRoutes(indicesOnly) {
  pivot.remove(tubeCache);
  for (const ch of tubeCache.children) {
    if (ch.geometry) ch.geometry.dispose();
  }
  tubeCache.clear();
  const ref = sessionOrigin;
  if (!ref) return;
  for (const r of state.routes) {
    const pts = [];
    for (const id of r.pointIds) {
      const p = state.points.find((x) => x.id === id);
      if (!p) continue;
      const loc = bubbleLocal(p, ref);
      pts.push(new THREE.Vector3(loc.x, loc.y, loc.z));
    }
    if (pts.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, Math.min(120, pts.length * 12), 0.055, 6, false);
    const mesh = new THREE.Mesh(g, flatMat(r.color || '#29fff0', 0.75));
    tubeCache.add(mesh);
    const start = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(r.color || '#29fff0'), transparent: true, depthWrite: false }));
    start.scale.set(0.6, 0.6, 1);
    start.position.copy(pts[0]);
    tubeCache.add(start);
  }
  pivot.add(tubeCache);
}

function rebuildWorld() {
  const ref = ensureOrigin();
  bubbleSprites.length = 0;
  pivot.remove(tubeCache);
  pivot.clear();
  pointRefs.clear();
  for (const p of state.points) addBubble(p, ref);
  rebuildRoutes();
  applyPivot();
}

function applyPivot() {
  pivot.rotation.y = THREE.MathUtils.degToRad(worldYaw);
  pivot.position.copy(drift);
}

function startAR() {
  if (!navigator.xr) {
    xrStatusEl.textContent = 'Tu navegador no soporta WebXR AR. Usa Chrome/ARCore en Android o Safari en iPhone.';
    toast('WebXR AR no disponible aquí');
    return;
  }
  if (enterARButton) enterARButton.click();
}

function onSessionStart() {
  arOn = true;
  overlayStart.classList.add('hidden');
  requestCompass();
  startGPS();
  sessionOrigin = null;
  ensureOrigin();
  if (!state.prefs.worldYaw) worldYaw = headingNow();
  sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  drift.set(0, 0, 0);
  hitSource = null;
  viewerSpace = null;
  refSpace = null;
  lastHitMatrix = null;
  prevTs = 0;
  still = 0;
  marking = false;
  nudge = null;
  nudgeDrag = false;
  reticle.visible = false;
  $('mark-chip').classList.add('hidden');
  $('nudge-chip').classList.add('hidden');
  rebuildWorld();
  showView('ar');
  toast('Globos clavados al mundo real · marca con el centro de la pantalla');
}

function onSessionEnd() {
  arOn = false;
  overlayStart.classList.remove('hidden');
  map2d.classList.add('hidden');
  sceneCanvas.style.display = 'block';
  marking = false;
  nudge = null;
  nudgeDrag = false;
  reticle.visible = false;
  $('mark-chip').classList.add('hidden');
  $('nudge-chip').classList.add('hidden');
  closePointCard();
  startMapLoop();
}

function tapAR(e) {
  if (!arOn || view !== 'ar') return;
  const ndc = { x: (e.clientX / window.innerWidth) * 2 - 1, y: -((e.clientY / window.innerHeight) * 2 - 1) };
  raycaster.setFromCamera(ndc, renderer.xr.getCamera());
  const hits = raycaster.intersectObjects(bubbleSprites, false);
  if (hits.length) {
    const p = state.points.find((x) => x.id === hits[0].object.userData.pointId);
    if (p) openPointCard(p);
  } else {
    closePointCard();
  }
}

function openPointCard(p) {
  selectedId = p.id;
  $('pc-icon').textContent = p.icon || '📍';
  $('pc-name').textContent = p.name || 'Sin nombre';
  let altText = Number.isFinite(p.alt) ? p.alt.toFixed(1) + ' m' : '-';
  $('pc-meta').textContent = `Alt ${altText} · ${state.routes.filter((r) => r.pointIds.includes(p.id)).length} ruta(s)`;
  if (gps) {
    const ref = ensureOrigin();
    const a = toMeters(p.lat, p.lng, ref);
    const b = toMeters(gps.lat, gps.lng, ref);
    const d = Math.hypot(a.e - b.e, a.n - b.n);
    $('pc-dist').textContent = `A ${d.toFixed(0)} m`;
  } else {
    $('pc-dist').textContent = '';
  }
  pointCard.classList.remove('hidden');
}

function closePointCard() {
  pointCard.classList.add('hidden');
}

renderer.setAnimationLoop((timestamp, frame) => {
  if (!arOn) return;
  if (renderer.xr.isPresenting) {
    ensureHitSource(frame).catch(() => {});
    captureHit(frame);
    if (marking) updateReticle();
    if (!marking && !nudge) surveyDrift(timestamp);
  }
  applyPivot();
  renderer.render(scene, camera);
});

function showView(v) {
  view = v;
  $('btn-go-2d').classList.toggle('on', v === '2d');
  $('btn-go-ar').classList.toggle('on', v === 'ar');
  panel2d.classList.toggle('hidden', v !== '2d');
  panelAr.classList.toggle('hidden', v !== 'ar');
  map2d.classList.toggle('hidden', v !== '2d');
  sceneCanvas.style.display = v === 'ar' ? 'block' : 'none';
  if (v === '2d') {
    if (marking) { marking = false; reticle.visible = false; $('mark-chip').classList.add('hidden'); }
    if (nudge) { nudge = null; nudgeRefs = null; $('nudge-chip').classList.add('hidden'); }
    closePointCard();
    startMapLoop();
  } else {
    stopMapLoop();
  }
}

function updateStatus() {
  if (!gps) { statusBar.textContent = 'GPS: buscando señal…'; return; }
  statusBar.textContent =
    `📡 ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)} · ±${gps.accuracy} m · ${Math.round(gps.alt || 0)} m alt · ${state.points.length} globos · ${state.routes.length} rutas`;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  sizeMap();
});

startGPS();

$('btn-go-2d').addEventListener('click', () => showView('2d'));
$('btn-go-ar').addEventListener('click', startAR);
$('btn-map2d').addEventListener('click', () => {
  overlayStart.classList.add('hidden');
  requestCompass();
  startGPS();
  showView('2d');
});

function sizeMap() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  map2d.width = window.innerWidth * dpr;
  map2d.height = window.innerHeight * dpr;
  map2dCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (mapRunning) drawMap();
}

let center = state.prefs.center
  ? { lat: state.prefs.center.lat, lng: state.prefs.center.lng }
  : (state.points[0] ? { lat: state.points[0].lat, lng: state.points[0].lng } : DEFAULT_CENTER);
let pxm = state.prefs.pxm || 6;

function toScreen(e, n) {
  return { x: window.innerWidth / 2 + e * pxm, y: window.innerHeight / 2 - n * pxm };
}

function fromScreen(x, y, ref) {
  const e = (x - window.innerWidth / 2) / pxm;
  const n = (window.innerHeight / 2 - y) / pxm;
  return { ...locOf(e, n, ref) };
}

function pointMapPos(p) {
  const m = toMeters(p.lat, p.lng, center);
  return toScreen(m.e, m.n);
}

function drawGrid() {
  const s = toScreen(0, 0);
  const step = 10;
  const inv = 1 / pxm;
  const g = map2dCtx;
  g.strokeStyle = 'rgba(120,140,200,0.12)';
  g.lineWidth = 1;
  let k = Math.floor((0 - s.x) / (step * pxm));
  for (let x = s.x + k * step * pxm; x < window.innerWidth; x += step * pxm) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, window.innerHeight); g.stroke();
  }
  k = Math.floor((0 - s.y) / (step * pxm));
  for (let y = s.y + k * step * pxm; y < window.innerHeight; y += step * pxm) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(window.innerWidth, y); g.stroke();
  }
}

function drawNorth() {
  const g = map2dCtx;
  const p = toScreen(0, 0);
  const q = toScreen(0, 40);
  g.strokeStyle = '#29fff0';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
  g.fillStyle = '#29fff0';
  g.font = 'bold 14px system-ui';
  g.textAlign = 'center';
  g.fillText('N', q.x, q.y - 8);
}

function drawRoutes() {
  const g = map2dCtx;
  for (const r of state.routes) {
    const path = [];
    for (const id of r.pointIds) {
      const p = state.points.find((x) => x.id === id);
      if (p) path.push(pointMapPos(p));
    }
    if (path.length < 2) continue;
    g.strokeStyle = r.color || '#29fff0';
    g.globalAlpha = 0.85;
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) g.lineTo(path[i].x, path[i].y);
    g.stroke();
    g.globalAlpha = 1;
  }
}

function drawPoints() {
  const g = map2dCtx;
  for (const p of state.points) {
    const s = pointMapPos(p);
    const r = Math.max(7, Math.min(14, 18 / (pxm / 3)));
    g.beginPath();
    g.fillStyle = p.color;
    g.globalAlpha = 0.9;
    g.arc(s.x, s.y, r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.lineWidth = 2.5;
    g.strokeStyle = p.id === selectedId ? '#fff' : 'rgba(255,255,255,0.55)';
    g.stroke();
    g.font = '18px system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(p.icon || '📍', s.x, s.y);
    if (pxm > 2.4) {
      g.font = 'bold 12px system-ui';
      g.fillStyle = '#eef2ff';
      g.globalAlpha = 0.95;
      g.fillText((p.name || '').slice(0, 12), s.x, s.y - r - 8);
      g.globalAlpha = 1;
    }
  }
}

function drawUser() {
  if (!gps && !demoOn) return;
  let u;
  if (demoOn) {
    const t = performance.now() / 1000;
    u = { e: Math.sin(t * 0.12) * 28, n: Math.cos(t * 0.09) * 28 };
  } else {
    const m = toMeters(gps.lat, gps.lng, center);
    u = { e: m.e, n: m.n };
  }
  const s = toScreen(u.e, u.n);
  const g = map2dCtx;
  g.beginPath();
  g.fillStyle = '#2d7dff';
  g.arc(s.x, s.y, 9, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.stroke();
  if (gps) {
    g.font = '12px system-ui';
    g.fillStyle = '#2d7dff';
    g.textAlign = 'left';
    g.fillText('tú', s.x + 14, s.y - 10);
  }
}

function drawMap() {
  if (!mapRunning) return;
  const g = map2dCtx;
  g.clearRect(0, 0, map2d.width, map2d.height);
  g.fillStyle = '#0a0f24';
  g.fillRect(0, 0, window.innerWidth, window.innerHeight);
  drawGrid();
  drawRoutes();
  drawPoints();
  drawUser();
  drawNorth();
}

function startMapLoop() {
  if (mapRunning) return;
  mapRunning = true;
  sizeMap();
  const loop = () => {
    if (!mapRunning) return;
    drawMap();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function stopMapLoop() {
  mapRunning = false;
}

let panning = false, panStart = null, moveAcc = 0;

function mapDown(e) {
  panning = true;
  panStart = { x: e.clientX, y: e.clientY };
  moveAcc = 0;
}

function mapMove(e) {
  if (!panning || !panStart) return;
  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;
  moveAcc += Math.abs(dx) + Math.abs(dy);
  center = locOf(-dx / pxm, dy / pxm, center);
  panStart = { x: e.clientX, y: e.clientY };
}

function mapUp(e) {
  if (!panning) return;
  panning = false;
  if (moveAcc < 6) mapTap(e);
}

function mapTap(e) {
  const x = e.clientX, y = e.clientY;
  const ref = center;
  const nearby = nearestPoint(x, y);
  if (addMode) {
    const loc = fromScreen(x, y, ref);
    const alt = currentLatLngAlt() ? currentLatLngAlt().alt : 0;
    const p = { id: newId(), name: '', lat: loc.lat, lng: loc.lng, alt, icon: state.prefs.lastIcon || '📍', color: state.prefs.lastColor || PALETTE[1], note: '' };
    state.points.push(p);
    editingPointId = p.id;
    save();
    openPointModal(p, true);
    addMode = false;
    $('btn-add-p').classList.remove('on');
    return;
  }
  if (routeWorking) {
    if (nearby) {
      const r = state.routes.find((x) => x.id === routeWorking);
      if (r) {
        if (!r.pointIds.includes(nearby.id)) r.pointIds.push(nearby.id);
        save();
        toast(`Globo añadido · ${r.pointIds.length} en ruta`);
      }
    } else {
      toast('Toca encima de un globo');
    }
    return;
  }
  if (nearby) {
    selectedId = nearby.id;
    openPointModal(nearby);
  }
}

function nearestPoint(x, y) {
  let best = null, bd = 24;
  for (const p of state.points) {
    const s = pointMapPos(p);
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

map2d.addEventListener('pointerdown', mapDown);
map2d.addEventListener('pointermove', mapMove);
map2d.addEventListener('pointerup', mapUp);
map2d.addEventListener('pointercancel', () => { panning = false; });
map2d.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0016);
  pxm = Math.min(300, Math.max(0.5, pxm * factor));
  center = locOf(0, 0, center);
});

$('btn-add-p').addEventListener('click', () => {
  addMode = !addMode;
  $('btn-add-p').classList.toggle('on', addMode);
  toast(addMode ? 'Toca el mapa donde quieras el globo' : 'Modo globo desactivado');
});

$('btn-del').addEventListener('click', () => {
  if (!selectedId) return toast('Selecciona un globo primero');
  state.points = state.points.filter((p) => p.id !== selectedId);
  for (const r of state.routes) r.pointIds = r.pointIds.filter((id) => id !== selectedId);
  selectedId = null;
  save();
  if (arOn) rebuildWorld();
  toast('Globo borrado');
});

$('btn-origin').addEventListener('click', () => {
  const g = currentLatLngAlt();
  if (g) {
    sessionOrigin = g;
    toast('Origen fijado en tu posición actual');
  } else {
    sessionOrigin = { ...center, alt: 0 };
    toast('Origen fijado en el centro del mapa');
  }
  if (arOn) rebuildWorld();
});

$('btn-routes').addEventListener('click', () => {
  routeBar.classList.toggle('hidden');
  refreshRouteSelect();
});

function refreshRouteSelect() {
  routeSel.innerHTML = '';
  for (const r of state.routes) {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = r.name || ('Ruta ' + r.pointIds.length);
    routeSel.appendChild(o);
  }
  if (routeWorking) routeSel.value = routeWorking;
}

routeSel.addEventListener('change', () => {
  routeWorking = routeSel.value || null;
  if (routeWorking) {
    const r = state.routes.find((x) => x.id === routeWorking);
    toast('Tocando globos se agregan a: ' + (r ? r.name || 'ruta nueva' : ''));
  }
});

$('btn-new-r').addEventListener('click', () => {
  const r = { id: newId(), name: '', color: state.prefs.lastColor || '#29fff0', pointIds: [] };
  state.routes.push(r);
  routeWorking = r.id;
  refreshRouteSelect();
  toast('Nueva ruta: toca globos en orden');
});

$('btn-finish-r').addEventListener('click', () => {
  if (!routeWorking) return toast('Crea o selecciona una ruta');
  const r = state.routes.find((x) => x.id === routeWorking);
  if (!r) return;
  if (!r.pointIds.length) return toast('La ruta está vacía');
  openNameModal((name) => {
    if (name) r.name = name;
    save();
    routeWorking = null;
    refreshRouteSelect();
    if (arOn) rebuildWorld();
    toast('Ruta guardada');
  });
});

$('btn-del-r').addEventListener('click', () => {
  if (!routeWorking) return toast('Selecciona una ruta');
  state.routes = state.routes.filter((x) => x.id !== routeWorking);
  routeWorking = null;
  refreshRouteSelect();
  save();
  if (arOn) rebuildWorld();
  toast('Ruta borrada');
});

$('btn-demo').addEventListener('click', () => {
  demoOn = !demoOn;
  $('btn-demo').classList.toggle('on', demoOn);
  if (demoOn) startGPS();
  toast(demoOn ? 'Demo GPS activada (simulando movimiento)' : 'Demo GPS desactivada');
});

$('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ points: state.points, routes: state.routes }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mapa_campus_ar.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Respaldo exportado');
});

$('btn-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      if (!Array.isArray(d.points) || !Array.isArray(d.routes)) throw new Error();
      const byId = new Map(state.points.map((p) => [p.id, p]));
      for (const p of d.points) if (p && p.id && Number.isFinite(p.lat)) byId.set(p.id, p);
      state.points = Array.from(byId.values());
      const rid = new Map(state.routes.map((r) => [r.id, r]));
      for (const r of d.routes) if (r && r.id) rid.set(r.id, r);
      state.routes = Array.from(rid.values());
      save();
      if (arOn) rebuildWorld();
      toast(`${state.points.length} globos cargados`);
    } catch {
      toast('JSON inválido');
    }
  };
  fr.readAsText(f);
  e.target.value = '';
});

const pmTitle = $('pm-title');
const pName = $('p-name');
const pNote = $('p-note');
const pCols = $('p-colors');
const pIconSel = $('p-icon');
const pAlt = $('p-alt');
let pmColor = PALETTE[1];
let pmIcon = '📍';

PALETTE.forEach((c) => {
  const b = document.createElement('button');
  b.className = 'swatch' + (c === pmColor ? ' on' : '');
  b.style.background = c;
  b.type = 'button';
  b.addEventListener('click', () => {
    pmColor = c;
    pCols.querySelectorAll('.swatch').forEach((el) => el.classList.toggle('on', el.dataset.color === c));
  });
  pCols.appendChild(b);
});

ICONS.forEach((ic) => {
  const o = document.createElement('option');
  o.value = ic;
  o.textContent = ic;
  pIconSel.appendChild(o);
});
pIconSel.addEventListener('change', () => { pmIcon = pIconSel.value; });

function openPointModal(p, isNew) {
  editingPointId = p.id;
  pmIsNew = Boolean(isNew);
  pmTitle.textContent = state.points.some((x) => x.id === p.id) ? 'Editar globo' : 'Nuevo globo';
  pName.value = p.name || '';
  pNote.value = p.note || '';
  pAlt.value = Number.isFinite(p.alt) ? p.alt : 0;
  pmColor = p.color || PALETTE[1];
  pmIcon = p.icon || '📍';
  pCols.querySelectorAll('.swatch').forEach((el) => el.classList.toggle('on', el.dataset.color === pmColor));
  pIconSel.value = pmIcon;
  $('point-modal').classList.remove('hidden');
  setTimeout(() => pName.focus(), 100);
}

$('pm-ok').addEventListener('click', () => {
  const name = pName.value.trim() || 'Sin nombre';
  const note = pNote.value.trim();
  const alt = parseFloat(pAlt.value);
  const p = state.points.find((x) => x.id === editingPointId);
  if (p) {
    p.name = name;
    p.note = note;
    p.color = pmColor;
    p.icon = pmIcon;
    p.alt = Number.isFinite(alt) ? alt : 0;
  }
  state.prefs.lastColor = pmColor;
  state.prefs.lastIcon = pmIcon;
  save();
  $('point-modal').classList.add('hidden');
  if (arOn) rebuildWorld();
  toast('Globo guardado');
});

$('pm-cancel').addEventListener('click', () => {
  $('point-modal').classList.add('hidden');
  if (pmIsNew) {
    state.points = state.points.filter((x) => x.id !== editingPointId);
    save();
    toast('Globo descartado');
  }
  selectedId = null;
});

const nmCallback = [null];

function openNameModal(cb) {
  nmCallback[0] = cb;
  $('r-name').value = '';
  $('name-modal').classList.remove('hidden');
  setTimeout(() => $('r-name').focus(), 100);
}

$('nm-ok').addEventListener('click', () => {
  const cb = nmCallback[0];
  $('name-modal').classList.add('hidden');
  if (cb) cb($('r-name').value.trim());
});

$('nm-cancel').addEventListener('click', () => {
  $('name-modal').classList.add('hidden');
});

$('cal-auto').addEventListener('click', () => {
  worldYaw = headingNow();
  state.prefs.worldYaw = worldYaw;
  save();
  applyPivot();
  toast(`Alineado con brújula (${Math.round(worldYaw)}°)`);
});

$('cal-left').addEventListener('click', () => { worldYaw = norm360(worldYaw - 1); applyPivot(); });
$('cal-right').addEventListener('click', () => { worldYaw = norm360(worldYaw + 1); applyPivot(); });

$('cal-origin').addEventListener('click', () => {
  const g = currentLatLngAlt();
  if (g) {
    sessionOrigin = g;
    rebuildWorld();
    toast('Origen fijado aquí');
  } else {
    toast('Sin señal GPS');
  }
});

$('cal-close').addEventListener('click', () => $('cal-modal').classList.add('hidden'));
$('btn-cal').addEventListener('click', () => $('cal-modal').classList.remove('hidden'));

$('btn-add-point').addEventListener('click', () => {
  if (!arOn || view !== 'ar') return toast('Entra primero a Realidad Aumentada');
  if (marking) { cancelMark(); return; }
  marking = true;
  lastHitMatrix = null;
  reticle.visible = false;
  $('mark-chip').classList.remove('hidden');
  $('mark-txt').textContent = 'Apuntando: pon el centro de la pantalla en el lugar';
});

function cancelMark() {
  marking = false;
  reticle.visible = false;
  $('mark-chip').classList.add('hidden');
}

function rayFloorAt(ndc, y) {
  raycaster.setFromCamera(ndc, renderer.xr.getCamera());
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  const t = Math.abs(d.y) > 1e-6 ? (y - o.y) / d.y : -1;
  if (t <= 0) return null;
  return raycaster.ray.at(t, new THREE.Vector3());
}

function hitScenePos() {
  if (!lastHitMatrix) return null;
  return new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(lastHitMatrix));
}

function updateReticle() {
  if (lastHitMatrix) {
    reticle.matrix.fromArray(lastHitMatrix);
    reticle.visible = true;
    $('mark-txt').textContent = 'Planos: ✔ · GPS ±' + (gps && gps.accuracy ? gps.accuracy : '?') + ' m';
  } else {
    reticle.visible = false;
    $('mark-txt').textContent = 'Sin superficie… apunta al suelo, o pulsa «Poner en piso»';
  }
}

async function ensureHitSource(frame) {
  if (hitSource || !frame) return;
  const session = renderer.xr.getSession();
  if (!session) return;
  try {
    if (!viewerSpace) {
      refSpace = renderer.xr.getReferenceSpace();
      viewerSpace = await session.requestReferenceSpace('viewer');
    }
    hitSource = await session.requestHitTestSource({ space: viewerSpace });
  } catch (err) {
    hitSource = null;
  }
}

function captureHit(frame) {
  if (!hitSource || !frame) return;
  try {
    const results = frame.getHitTestResults(hitSource);
    if (results && results.length) {
      const pose = results[0].getPose(refSpace || renderer.xr.getReferenceSpace());
      if (pose) lastHitMatrix = pose.transform.matrix;
    }
  } catch (err) { }
}

function lockMark(mode) {
  if (!arOn) return;
  const scenePos = mode === 'floor' ? rayFloorAt({ x: 0, y: 0 }, 0) : hitScenePos();
  if (!scenePos) return toast(mode === 'floor' ? 'Apunta al suelo' : 'Sin superficie: pulsa «Poner en piso»');
  pivot.updateWorldMatrix(true, false);
  const local = pivot.worldToLocal(scenePos.clone());
  const geo = locOf(local.x, -local.z, sessionOrigin);
  const p = {
    id: newId(),
    name: '',
    lat: geo.lat,
    lng: geo.lng,
    alt: (sessionOrigin ? sessionOrigin.alt : 0) + local.y,
    icon: state.prefs.lastIcon || '📍',
    color: state.prefs.lastColor || PALETTE[1],
    note: '',
    rel: { x: local.x, y: local.y, z: local.z },
    relSes: sessionId,
    src: mode === 'floor' ? 'cal' : 'hit'
  };
  state.points.push(p);
  editingPointId = p.id;
  save();
  cancelMark();
  rebuildWorld();
  openPointModal(p, true);
}

$('mark-ok').addEventListener('click', () => lockMark('center'));
$('mark-floor').addEventListener('click', () => lockMark('floor'));
$('mark-cancel').addEventListener('click', () => cancelMark());

function surveyDrift(timestamp) {
  if (!gps || !sessionOrigin || !Number.isFinite(gps.accuracy)) return;
  const acc = gps.accuracy;
  if (acc > 8) { $('drift-line').textContent = 'Deriva: – · GPS ±' + acc + ' m'; return; }
  const cam = renderer.xr.getCamera().position;
  if (!prevTs) { prevCam.copy(cam); prevTs = timestamp; return; }
  const dt = Math.max(0.001, (timestamp - prevTs) / 1000);
  const speed = cam.distanceTo(prevCam) / dt;
  prevCam.copy(cam);
  prevTs = timestamp;
  if (speed < 0.6) still += dt; else still = 0;
  if (still < 2) {
    $('drift-line').textContent = 'Deriva: midiendo… (' + Math.max(0, 2 - still).toFixed(1) + 's) · GPS ±' + acc + ' m';
    return;
  }
  const m = toMeters(gps.lat, gps.lng, sessionOrigin);
  const expect = new THREE.Vector3(m.e, 0, -m.n).applyAxisAngle(UP, THREE.MathUtils.degToRad(worldYaw));
  const target = cam.clone().sub(expect);
  const delta = target.clone().sub(drift);
  const mag = delta.length();
  const now = performance.now();
  if (mag < 0.35) {
    if (now - lastCorrTxt > 2000) { lastCorrTxt = now; $('drift-line').textContent = 'Deriva: OK · GPS ±' + acc + ' m'; }
    return;
  }
  if (mag > 30) return;
  const step = delta.clone().normalize().multiplyScalar(Math.min(1.5, mag * 0.3));
  drift.x += step.x;
  drift.z += step.z;
  if (now - lastCorrTxt > 800) {
    lastCorrTxt = now;
    $('drift-line').textContent = 'Deriva: ' + mag.toFixed(1) + ' m → corrigiendo · GPS ±' + acc + ' m';
  }
}

function nudgeMove(e) {
  if (!nudge || !nudgeDrag || !nudgeRefs) return;
  const ndc = {
    x: (e.clientX / window.innerWidth) * 2 - 1,
    y: -((e.clientY / window.innerHeight) * 2 - 1)
  };
  const hit = rayFloorAt(ndc, nudgeGroundY);
  if (!hit) return;
  pivot.updateWorldMatrix(true, false);
  const local = pivot.worldToLocal(hit.clone());
  const p = nudge;
  p.rel = { x: local.x, y: local.y, z: local.z };
  p.relSes = sessionId;
  nudgeRefs.spr.position.set(local.x, local.y + FLOAT_H, local.z);
  nudgeRefs.glow.position.set(local.x, local.y + 0.06, local.z);
  const pos = nudgeRefs.staff.geometry.attributes.position.array;
  pos[0] = local.x; pos[1] = local.y; pos[2] = local.z;
  pos[3] = local.x; pos[4] = local.y + FLOAT_H * 0.75; pos[5] = local.z;
  nudgeRefs.staff.geometry.attributes.position.needsUpdate = true;
}

function nudgeAlt(d) {
  if (!nudge || !nudgeRefs) return;
  const p = nudge;
  const cur = p.rel && Number.isFinite(p.rel.y) ? p.rel.y : bubbleLocal(p, sessionOrigin).y;
  const y = cur + d;
  p.rel = { x: p.rel ? p.rel.x : 0, y: y, z: p.rel ? p.rel.z || 0 : 0 };
  p.relSes = sessionId;
  nudgeGroundY += d;
  nudgeRefs.spr.position.y += d;
  nudgeRefs.glow.position.y += d;
  const pos = nudgeRefs.staff.geometry.attributes.position.array;
  pos[1] += d; pos[4] += d;
  nudgeRefs.staff.geometry.attributes.position.needsUpdate = true;
  toast('Altura: ' + (((sessionOrigin ? sessionOrigin.alt : 0) + y).toFixed(1)) + ' m');
}

function lockNudge() {
  if (!nudge) return;
  const p = nudge;
  const loc = p.rel || bubbleLocal(p, sessionOrigin);
  const geo = locOf(loc.x, -loc.z, sessionOrigin);
  p.lat = geo.lat;
  p.lng = geo.lng;
  p.alt = (sessionOrigin ? sessionOrigin.alt : 0) + loc.y;
  p.src = 'cal';
  save();
  nudge = null;
  nudgeRefs = null;
  $('nudge-chip').classList.add('hidden');
  rebuildWorld();
  toast('Ajustado y guardado');
}

$('nudge-up').addEventListener('click', () => nudgeAlt(0.1));
$('nudge-down').addEventListener('click', () => nudgeAlt(-0.1));
$('nudge-lock').addEventListener('click', () => lockNudge());

$('pc-nudge').addEventListener('click', () => {
  if (!arOn || view !== 'ar') return toast('Solo en Realidad Aumentada');
  const p = state.points.find((x) => x.id === selectedId);
  if (!p) return;
  const lc = p.rel && p.relSes === sessionId ? p.rel : bubbleLocal(p, sessionOrigin);
  p.rel = { x: lc.x, y: lc.y, z: lc.z };
  p.relSes = sessionId;
  nudge = p;
  closePointCard();
  $('nudge-chip').classList.remove('hidden');
  nudgeRefs = pointRefs.get(p.id) || null;
  nudgeGroundY = nudgeRefs ? nudgeRefs.spr.position.y - FLOAT_H : lc.y;
  toast('✋ Arrastra sobre el piso para ajustar');
});

$('pc-edit').addEventListener('click', () => {
  const p = state.points.find((x) => x.id === selectedId);
  if (p) { closePointCard(); openPointModal(p); }
});
$('pc-del').addEventListener('click', () => {
  state.points = state.points.filter((x) => x.id !== selectedId);
  for (const r of state.routes) r.pointIds = r.pointIds.filter((id) => id !== selectedId);
  selectedId = null;
  save();
  rebuildWorld();
  closePointCard();
  toast('Globo borrado');
});
$('pc-close').addEventListener('click', () => closePointCard());

const IGNORED = 'button,input,select,textarea,.panel,.modal,.point-card,.toast,.view-switch';

window.addEventListener('pointerdown', (e) => {
  if (!arOn || view !== 'ar') return;
  if (e.target instanceof Element && e.target.closest(IGNORED)) return;
  if (nudge) {
    nudgeDrag = true;
    nudgeMove(e);
    return;
  }
  tapAR(e);
}, { capture: true });

window.addEventListener('pointermove', (e) => {
  if (!arOn || view !== 'ar' || !nudge || !nudgeDrag) return;
  nudgeMove(e);
});

window.addEventListener('pointerup', () => {
  if (nudgeDrag) nudgeDrag = false;
});

window.addEventListener('beforeunload', () => {
  state.prefs.center = { ...center };
  state.prefs.pxm = pxm;
  state.prefs.worldYaw = worldYaw;
  save();
});

sizeMap();
showView('2d');

function initAR() {
  if (!navigator.xr) return;
  const sessionInit = {
    optionalFeatures: ['local-floor', 'hit-test', 'dom-overlay'],
    domOverlay: { root: hudEl }
  };
  enterARButton = ARButton.createButton(renderer, sessionInit);
  enterARButton.textContent = '▶  Comenzar RA (cámara)';
  enterARBox.appendChild(enterARButton);
  renderer.xr.addEventListener('sessionstart', onSessionStart);
  renderer.xr.addEventListener('sessionend', onSessionEnd);
}

initAR();