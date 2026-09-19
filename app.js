import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { deltaMeters, metersToDelta, degToRad, radToDeg } from './geo.js';

const LS = 'argps.v1';
const ALT_OFFSET = 1.6;        // altura de los globos sobre el nivel de origen (m)
const DEFAULT_COLOR = '#29fff0';
const IGNORED = 'button,input,select,textarea,.modal,.toast,.panel,.hud-top,.status-bar,.dbg';

const APP_VERSION = '0.4.1';

const $ = (id) => document.getElementById(id);

function renderVersion() {
  const el = $('version');
  const hud = $('version-hud');
  const v = 'v' + APP_VERSION;
  if (el) el.textContent = v;
  if (hud) hud.textContent = v;
}
renderVersion();

const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearAlpha(0);
renderer.xr.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);
const pivot = new THREE.Group();
scene.add(pivot);

let store = loadStore();
let balloons = store.balloons;

let origin = null;            // { lat, lng, alt, accuracy }
let orientation = null;       // ultimo evento deviceorientation
let headingNudgeDeg = store.prefs.headingNudgeDeg || 0;
let pendingPos = null;        // posicion capturada al pulsar "Dejar globo aqui"
let arOn = false;
let enterARButton = null;
let arSession = null;         // sesion XR activa (para eventos select)
let lastSelectAt = 0;
let mode = 'reg';             // 'reg' = Registrar - 'view' = Solo visualizar

/* ---------------- almacenamiento ---------------- */

function loadStore() {
  try {
    const v = JSON.parse(localStorage.getItem(LS));
    if (v && Array.isArray(v.balloons)) {
      const ok = v.balloons.filter((b) => b && Number.isFinite(b.lat) && Number.isFinite(b.lng));
      if (ok.length < v.balloons.length) queueMicrotask(() => toast('Se omitieron ' + (v.balloons.length - ok.length) + ' globo(s) sin coordenadas'));
      return { balloons: ok, prefs: v.prefs || {} };
    }
  } catch { /* */ }
  return { balloons: [], prefs: {} };
}

function save() {
  try {
    localStorage.setItem(LS, JSON.stringify({ version: 1, balloons, prefs: { ...store.prefs, headingNudgeDeg } }));
  } catch {
    toast('No se pudo guardar (almacenamiento lleno)');
  }
}

/* ---------------- GPS y brujula ---------------- */

function requestPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('geolocalizacion no soportada'));
    const t = setTimeout(() => reject(new Error('timeout')), 15000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve(p); },
      (e) => { clearTimeout(t); reject(e); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// KISS: si el GPS falla, caemos al origen ya fijado (o al local 0,0,0) para que
// colocar globos y dibujarlos funcione siempre, sin depender de la senal.
function currentPosition() {
  return requestPosition().catch(() => {
    if (origin) return { coords: origin };
    return Promise.reject(new Error('no gps'));
  });
}

function setOrigin(p) {
  origin = {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    alt: p.coords.altitude || 0,
    accuracy: p.coords.accuracy || null
  };
}

// Azimut horizontal de la parte trasera del celular (donde apunta la camara), 0..360 (0 = norte).
// alpha/beta/gamma vienen de DeviceOrientation; se convierte el eje -Z del dispositivo a la
// terna de referencia de la especificacion (X=este, Y=norte, Z=arriba) y se proyecta en plano XY.
function deviceHeadingDeg() {
  if (!orientation) return 0;
  const o = orientation;
  const alpha = o.alpha || 0;
  const beta = o.beta || 0;
  const gamma = o.gamma || 0;
  const e = new THREE.Euler(degToRad(alpha), degToRad(beta), degToRad(gamma), 'ZXY');
  const q = new THREE.Quaternion().setFromEuler(e).invert();
  const back = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return (radToDeg(Math.atan2(back.x, back.y)) + 360) % 360;
}

function updatePivot() {
  // El globo "al norte" se coloca en -Z; rotar el mundo con el azimut inicial del celular
  // deja el norte geografico alineado con el norte del espacio de la sesion.
  pivot.rotation.y = degToRad(deviceHeadingDeg() + headingNudgeDeg);
}

/* ---------------- textura / sprites de globo ---------------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function drawBalloonIcon(g, cx, cy, color) {
  const r = 34;
  g.save();
  const grad = g.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, color);
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(cx, cy, r, r * 1.12, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(cx - 7, cy + r * 1.12);
  g.lineTo(cx + 7, cy + r * 1.12);
  g.lineTo(cx, cy + r * 1.12 + 12);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.65)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx, cy + r * 1.12 + 12);
  g.quadraticCurveTo(cx + 14, cy + r * 1.12 + 30, cx - 4, cy + r * 1.12 + 48);
  g.stroke();
  g.restore();
}

function balloonTexture(name, color) {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(8,10,24,0.92)';
  g.strokeStyle = color || DEFAULT_COLOR;
  g.lineWidth = 7;
  g.beginPath();
  g.roundRect(16, 8, 288, 168, 24);
  g.fill();
  g.stroke();
  drawBalloonIcon(g, 160, 90, color || DEFAULT_COLOR);
  g.font = '600 30px system-ui, sans-serif';
  g.fillStyle = '#ffffff';
  g.fillText((name || '').slice(0, 18), 160, 216);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(41,255,240,0.8)');
  grad.addColorStop(1, 'rgba(41,255,240,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const glowTex = glowTexture();

function addBalloonSprite(b) {
  const tex = balloonTexture(b.name, b.color);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }));
  const pos = worldPos(b);
  spr.position.set(pos.x, pos.y, pos.z);
  spr.scale.set(0.7, 0.56, 1);
  glow.position.copy(spr.position);
  glow.scale.set(0.5, 0.5, 1);
  spr.userData.id = b.id;
  glow.userData.id = b.id;
  pivot.add(spr, glow);
}

function worldPos(b) {
  const d = deltaMeters(origin.lat, origin.lng, b.lat, b.lng);
  return { x: d.east, y: b.altOffset ?? ALT_OFFSET, z: -d.north };
}

function renderWorld() {
  pivot.clear();
  if (!origin) return;
  for (const b of balloons) addBalloonSprite(b);
}

/* ---------------- UI / sesion ---------------- */

function showStatus() {
  const sb = $('status-line');
  if (!origin) {
    sb.textContent = 'Globos: ' + balloons.length + ' - sin GPS';
    $('dbg').classList.add('hidden');
    return;
  }
  $('dbg').classList.remove('hidden');
  sb.textContent = 'Globos: ' + balloons.length + ' - precision: ' + (origin.accuracy ? origin.accuracy.toFixed(0) + ' m' : 'n/d');
  if (origin.accuracy && origin.accuracy > 20) toast('<i class="fa-solid fa-triangle-exclamation"></i> Precision baja (' + origin.accuracy.toFixed(0) + ' m)');
}

function setMode(m) {
  mode = m;
  const isReg = m === 'reg';
  $('mode-reg').classList.toggle('active', isReg);
  $('mode-view').classList.toggle('active', !isReg);
  const btnMode = $('btn-mode');
  if (btnMode) btnMode.innerHTML = isReg ? '<i class="fa-solid fa-folder-open"></i> Registrar' : '<i class="fa-solid fa-eye"></i> Solo visualizar';
  if (arOn) toast(isReg ? 'Modo Registrar - toca para dejar globos' : 'Modo Solo visualizar - no se dejan globos');
}

function onSessionStart() {
  arOn = true;
  $('overlay-start').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('aim-dot').classList.remove('hidden');
  clearDebug();
  buildDebug();
  arSession = renderer.xr.getSession();
  if (arSession) arSession.addEventListener('select', onXRSelect);
  (async () => {
    const p = await currentPosition().catch(() => null);
    if (p) setOrigin(p);
    else origin = { lat: 0, lng: 0, alt: 0, accuracy: null };
    updatePivot();
    renderWorld();
    showStatus();
    toast(p ? '<i class="fa-solid fa-satellite-dish"></i> Origin GPS fijado - deja tu primer globo' : '<i class="fa-solid fa-triangle-exclamation"></i> Sin GPS: los globos se fijan cerca de ti');
  })();
}

function onSessionEnd() {
  arOn = false;
  if (arSession) {
    arSession.removeEventListener('select', onXRSelect);
    arSession = null;
  }
  clearDebug();
  $('overlay-start').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('aim-dot').classList.add('hidden');
}

function initAR() {
  enterARButton = ARButton.createButton(renderer, {
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['dom-overlay', 'plane-detection', 'hit-test'],
    domOverlay: { root: $('xr-overlay') }
  });

  // ARButton inyecta estilos inline (posicion absoluta, opacidad 0.5, fuente 13px, etc.)
  // y reescribe el texto ("AR NOT SUPPORTED" / "START AR"). Los neutralizamos: la
  // apariencia la controla style.css.
  enterARButton.removeAttribute('style');
  enterARButton.onmouseenter = null;
  enterARButton.onmouseleave = null;

  $('enter-ar').appendChild(enterARButton);
  enterARButton.textContent = '  Comenzar Realidad Aumentada';
  enterARButton.addEventListener('click', () => requestOrientationPermission());
  renderer.xr.addEventListener('sessionstart', onSessionStart);
  renderer.xr.addEventListener('sessionend', onSessionEnd);

  const status = $('xr-status');
  if ('xr' in navigator && navigator.xr) {
    navigator.xr.isSessionSupported('immersive-ar').then((ok) => {
      if (!ok) {
        enterARButton.textContent = 'RA no disponible en este dispositivo';
        enterARButton.classList.add('ar-off');
        status.textContent = 'Este dispositivo no soporta RA (WebXR AR)';
      }
    }).catch(() => {
      status.textContent = 'Error al comprobar WebXR';
    });
  } else {
    // Sin navigator.xr (escritorio/antiguo): ARButton devuelve un enlace, no un boton.
    enterARButton.textContent = 'Este navegador no soporta RA';
    enterARButton.classList.add('ar-off');
    status.textContent = 'Este navegador no soporta RA. Usa Chrome/Android o Safari/iPhone recientes.';
  }
}

// iOS requiere permiso explicito para DeviceOrientation.
function requestOrientationPermission() {
  return new Promise((resolve) => {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      D.requestPermission().then((r) => {
        if (r === 'granted') window.addEventListener('deviceorientation', onOrientation, true);
        resolve();
      }).catch(() => resolve());
    } else {
      window.addEventListener('deviceorientation', onOrientation, true);
      resolve();
    }
  });
}

function onOrientation(e) {
  orientation = e;
}

/* ---------------- colocar globo ---------------- */

const raycaster = new THREE.Raycaster();
const editBalloonSprites = new Map(); // id -> { spr, glow } (solo los visibles en el frame)

function collectSprites() {
  editBalloonSprites.clear();
  for (const child of pivot.children) {
    if (child.isSprite && child.userData && child.userData.id) {
      editBalloonSprites.set(child.userData.id, child);
    }
  }
}

function findHitBalloon() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const sprites = Array.from(editBalloonSprites.values());
  const hits = raycaster.intersectObjects(sprites, false);
  if (!hits.length) return null;
  const hit = hits[0];
  return hit.object.userData.id || null;
}

// Toque directo sobre la camara (gesto XR "select"): si toca un globo, abre su edicion;
// si no, en modo Registrar abre el colocador.
function onXRSelect() {
  if (!arOn || !origin) return;
  const now = Date.now();
  if (now - lastSelectAt < 500) return;
  lastSelectAt = now;
  if (pendingMoveId) {
    currentPosition().then((p) => {
      const b = balloons.find((x) => x.id === pendingMoveId);
      if (!b) return;
      b.lat = p.coords.latitude;
      b.lng = p.coords.longitude;
      pendingMoveId = null;
      save();
      renderWorld();
      showStatus();
      toast('<i class="fa-solid fa-crosshairs"></i> Globo movido a tu GPS actual');
    }).catch(() => toast('<i class="fa-solid fa-satellite-dish"></i> No se pudo leer la posicion'));
    return;
  }
  const bid = findHitBalloon();
  if (bid) {
    openEdit(bid);
  } else {
    openPlacer();
  }
}

let editingId = null;

function openEdit(id) {
  const b = balloons.find((x) => x.id === id);
  if (!b) return;
  editingId = id;
  $('edit-title').textContent = (b.name || 'Globo');
  $('edit-info').textContent = 'Lat ' + b.lat.toFixed(6) + ' - Lng ' + b.lng.toFixed(6) + (b.createdAt ? ' - ' + new Date(b.createdAt).toLocaleString() : '');
  $('edit-modal').classList.remove('hidden');
}

function closeEdit() {
  $('edit-modal').classList.add('hidden');
  editingId = null;
}

function currentEditBalloon() {
  return balloons.find((x) => x.id === editingId) || null;
}

function nudgeBalloon(eastM, northM) {
  const b = currentEditBalloon();
  if (!b) return;
  const p = metersToDelta(b.lat, b.lng, eastM, northM);
  b.lat = p.lat;
  b.lng = p.lng;
  save();
  renderWorld();
  showStatus();
  openEdit(b.id);
  toast('<i class="fa-solid fa-crosshairs"></i> Globo movido');
}

function deleteEditingBalloon() {
  const b = currentEditBalloon();
  if (!b) return;
  balloons = balloons.filter((x) => x.id !== b.id);
  save();
  renderWorld();
  showStatus();
  closeEdit();
  toast('<i class="fa-solid fa-trash"></i> Globo borrado');
}

function renameEditingBalloon() {
  const b = currentEditBalloon();
  if (!b) return;
  const name = prompt('Nuevo nombre para el globo:', b.name || '');
  if (name === null || name.trim() === '') return;
  b.name = name.trim().slice(0, 30);
  save();
  renderWorld();
  showStatus();
  openEdit(b.id);
  toast('<i class="fa-solid fa-pen"></i> Globo renombrado');
}

function moveEditingBalloon() {
  const b = currentEditBalloon();
  if (!b) return;
  closeEdit();
  toast('<i class="fa-solid fa-crosshairs"></i> Apunta al lugar y toca para mover');
  pendingMoveId = b.id;
}

let pendingMoveId = null;

function openPlacer() {
  if (!arOn) return toast('Entra a Realidad Aumentada');
  if (mode === 'view') return toast('<i class="fa-solid fa-eye"></i> Modo Solo visualizar - no puedes dejar globos');
  if (!origin) return toast('<i class="fa-solid fa-satellite-dish"></i> Sin GPS: no hay donde anclar el globo');
  currentPosition().then((p) => {
    pendingPos = p;
    $('input-name').value = '';
    $('modal').classList.remove('hidden');
    setTimeout(() => $('input-name').focus(), 120);
  }).catch(() => toast('<i class="fa-solid fa-satellite-dish"></i> No se pudo leer la posicion'));
}

function commitPlace() {
  if (mode === 'view') {
    $('modal').classList.add('hidden');
    pendingPos = null;
    return toast('<i class="fa-solid fa-eye"></i> Modo Solo visualizar - no puedes dejar globos');
  }
  if (!pendingPos || !origin) return;
  const name = $('input-name').value.trim();
  if (!name) return toast('Ponle un nombre al globo');
  const c = pendingPos.coords;
  balloons.push({
    id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name,
    color: DEFAULT_COLOR,
    lat: c.latitude,
    lng: c.longitude,
    alt: c.altitude || 0,
    altOffset: ALT_OFFSET,
    createdAt: Date.now()
  });
  save();
  renderWorld();
  showStatus();
  $('modal').classList.add('hidden');
  pendingPos = null;
  toast('<i class="fa-solid fa-location-dot"></i> Globo "' + esc(name) + '" fijado a tu GPS actual');
}

/* ---------------- export / import ---------------- */

function exportScene() {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), balloons }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'argps_balloons.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('<i class="fa-solid fa-download"></i> Exportados ' + balloons.length + ' globos');
}

function importScene(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      if (!d || !Array.isArray(d.balloons)) throw new Error('bad');
      const incoming = d.balloons.filter((b) => b && b.id && Number.isFinite(b.lat) && Number.isFinite(b.lng));
      const map = new Map(balloons.map((b) => [b.id, b]));
      for (const b of incoming) map.set(b.id, b);
      balloons = Array.from(map.values());
      save();
      renderWorld();
      showStatus();
      toast('<i class="fa-solid fa-file-import"></i> Importados ' + balloons.length + ' globos');
    } catch {
      toast('Archivo invalido');
    }
    $('import-file').value = '';
  };
  fr.readAsText(file);
}

/* ---------------- eventos ---------------- */

$('btn-place').addEventListener('click', openPlacer);
$('btn-mode').addEventListener('click', () => setMode(mode === 'reg' ? 'view' : 'reg'));
$('mode-reg').addEventListener('click', () => setMode('reg'));
$('mode-view').addEventListener('click', () => setMode('view'));
$('btn-modal-ok').addEventListener('click', commitPlace);
$('input-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    commitPlace();
  }
});
$('btn-modal-cancel').addEventListener('click', () => {
  $('modal').classList.add('hidden');
  pendingPos = null;
});
$('btn-export').addEventListener('click', exportScene);
$('btn-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) importScene(f);
});

// ---- edicion de globos ----
$('btn-edit-rename').addEventListener('click', renameEditingBalloon);
$('btn-edit-move').addEventListener('click', moveEditingBalloon);
$('btn-edit-delete').addEventListener('click', deleteEditingBalloon);
$('btn-edit-close').addEventListener('click', closeEdit);
$('btn-edit-nudge-n').addEventListener('click', () => nudgeBalloon(0, 0.01));
$('btn-edit-nudge-s').addEventListener('click', () => nudgeBalloon(0, -0.01));
$('btn-edit-nudge-e').addEventListener('click', () => nudgeBalloon(0.01, 0));
$('btn-edit-nudge-w').addEventListener('click', () => nudgeBalloon(-0.01, 0));

$('btn-nudgel').addEventListener('click', () => {
  headingNudgeDeg -= 1;
  updatePivot();
  save();
  refreshDbg();
  toast('<i class="fa-solid fa-rotate-left"></i> Mundo rotado -1 (total ' + headingNudgeDeg + ')');
});
$('btn-nudger').addEventListener('click', () => {
  headingNudgeDeg += 1;
  updatePivot();
  save();
  refreshDbg();
  toast('<i class="fa-solid fa-rotate-right"></i> Mundo rotado +1 (total ' + headingNudgeDeg + ')');
});

window.addEventListener('pointerdown', (e) => {
  if (!arOn || !origin) return;
  const t = e.target;
  if (t instanceof Element && t.closest(IGNORED)) return;
  openPlacer();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function refreshDbg() {
  const dbg = $('dbg');
  if (dbg.classList.contains('hidden')) return;
  dbg.textContent =
    'az ' + deviceHeadingDeg().toFixed(0) + ' - nudge ' + headingNudgeDeg +
    ' - planos ' + debugPlanes.size +
    (origin ? ' - origen: ' + origin.lat.toFixed(5) + ', ' + origin.lng.toFixed(5) : '');
}

/* ---------------- debug visual (siempre encendido) ---------------- */

const debugPlanes = new Map();      // uid -> Line
let debugGrid = null;
let debugRay = null;
let debugRayEnd = null;
let debugCam = null;
let debugAxis = null;

function planeColor(plane) {
  if (plane.orientation === 'horizontal') return 0x29ff90;   // suelo/techo
  if (plane.orientation === 'vertical') return 0xff2ef0;     // paredes
  return 0x8f9bbf;
}

function buildDebug() {
  // Rejilla en el origen (0,0,0) = donde se ancla el mundo GPS.
  debugGrid = new THREE.GridHelper(10, 10, 0x29ff90, 0x1b5c46);
  debugGrid.material.transparent = true;
  debugGrid.material.opacity = 0.5;
  scene.add(debugGrid);

  // Ejes X (este/rojo) y Z (norte/azul) desde el origen.
  const axMat = new THREE.LineBasicMaterial({ vertexColors: true });
  const axGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0.01, 0, 5, 0.01, 0, 0, 0.01, 0, 0, 0.01, -5]), 3));
  const axCol = new THREE.BufferAttribute(new Float32Array([1, 0, 0, 1, 0, 0, 0, 0.3, 1, 0, 0.3, 1]), 3);
  axGeo.setAttribute('color', axCol);
  debugAxis = new THREE.LineSegments(axGeo, axMat);
  scene.add(debugAxis);

  // Rayo camara -> punto apuntado (verde si hay superficie, rojo si no).
  debugRay = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)),
    new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 })
  );
  debugRay.frustumCulled = false;
  scene.add(debugRay);

  debugRayEnd = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthTest: false, depthWrite: false }));
  debugRayEnd.scale.set(0.12, 0.12, 1);
  debugRayEnd.frustumCulled = false;
  scene.add(debugRayEnd);

  // Marca de la camara (blanca).
  debugCam = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  scene.add(debugCam);
}

function updateDebugRay() {
  const from = camera.position;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const to = from.clone().add(dir.multiplyScalar(5));
  const pos = debugRay.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  debugRay.material.color.setHex(0xff3b3b); // sin superficie objetivo: rojo
  debugRayEnd.position.copy(to);
}

function updateDebugPlanes(frame, refSpace) {
  if (!frame.detectedPlanes) return;
  const seen = new Set();
  const tmpP = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  frame.detectedPlanes.forEach((plane) => {
    seen.add(plane.uid);
    const pose = frame.getPose(plane.planeSpace, refSpace);
    if (!pose) return;
    tmpQ.set(pose.transform.orientation.x, pose.transform.orientation.y, pose.transform.orientation.z, pose.transform.orientation.w);
    tmpP.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
    const pts = [];
    for (const p of plane.polygon) {
      pts.push(new THREE.Vector3(p.x, p.y, p.z).applyQuaternion(tmpQ).add(tmpP));
    }
    let entry = debugPlanes.get(plane.uid);
    if (!entry) {
      const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.85 }));
      scene.add(line);
      entry = { line };
      debugPlanes.set(plane.uid, entry);
    }
    const attrs = entry.line.geometry.attributes;
    if (!attrs.position || attrs.position.count !== pts.length + 1) {
      entry.line.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((pts.length + 1) * 3), 3));
    }
    for (let i = 0; i < pts.length; i++) {
      entry.line.geometry.attributes.position.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
    }
    entry.line.geometry.attributes.position.setXYZ(pts.length, pts[0].x, pts[0].y, pts[0].z);
    entry.line.geometry.attributes.position.needsUpdate = true;
    entry.line.geometry.computeBoundingSphere();
    entry.line.material.color.setHex(planeColor(plane));
  });
  debugPlanes.forEach((entry, uid) => {
    if (!seen.has(uid)) {
      scene.remove(entry.line);
      entry.line.geometry.dispose();
      entry.line.material.dispose();
      debugPlanes.delete(uid);
    }
  });
}

function clearDebug() {
  debugPlanes.forEach((entry) => {
    scene.remove(entry.line);
    entry.line.geometry.dispose();
    entry.line.material.dispose();
  });
  debugPlanes.clear();
  if (debugGrid) { scene.remove(debugGrid); debugGrid.geometry.dispose(); debugGrid.material.dispose(); debugGrid = null; }
  if (debugAxis) { scene.remove(debugAxis); debugAxis.geometry.dispose(); debugAxis.material.dispose(); debugAxis = null; }
  if (debugRay) { scene.remove(debugRay); debugRay.geometry.dispose(); debugRay.material.dispose(); debugRay = null; }
  if (debugRayEnd) { scene.remove(debugRayEnd); debugRayEnd.material.dispose(); debugRayEnd = null; }
  if (debugCam) { scene.remove(debugCam); debugCam.geometry.dispose(); debugCam.material.dispose(); debugCam = null; }
}

renderer.setAnimationLoop(() => {
  refreshDbg();
  collectSprites();
  if (renderer.xr.isPresenting) {
    const frame = renderer.xr.getFrame();
    const refSpace = renderer.xr.getReferenceSpace();
    updateDebugPlanes(frame, refSpace);
    if (debugRay) updateDebugRay();
    if (debugCam) debugCam.position.copy(camera.position);
  }
  renderer.render(scene, camera);
});

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.innerHTML = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

initAR();