import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

const LS = 'airmap.v2';
const PLACE_DIST = 2.0;
const ICONS = ['📍','🏛️','📚','🍽️','🥤','🏕️','⚽','🚻','🚗','🚲','🅿️','🔧','💡','🛗','🚑','❤️','🌟','⚠️'];
const PALETTE = ['#ff5757','#ff914d','#ffd166','#b0e57c','#29fff0','#4dc3ff','#7d7dff','#ff2ef0','#ffffff'];
const IGNORED = ['button','input','select','textarea','.panel','.modal','.point-card','.toast'];

const $ = (id) => document.getElementById(id);

const state = (() => {
  try {
    const d = JSON.parse(localStorage.getItem(LS) || 'null');
    if (d && Array.isArray(d.points)) {
      const pts = d.points.filter(p => p && p.rel && Number.isFinite(p.rel.x));
      if (pts.length < d.points.length) queueMicrotask(() => toast('Se omitieron ' + (d.points.length - pts.length) + ' punto(s) guardados sin posición (formato antiguo)'));
      return { points: pts, prefs: d.prefs || {} };
    }
  } catch (e) {}
  return { points: [], prefs: {} };
})();

const sceneCanvas = $('scene');
const overlayStart = $('overlay-start');
const panelAr = $('panel-ar');
const markChip = $('mark-chip');
const markTxt = $('mark-txt');
const nudgeChip = $('nudge-chip');
const statusBar = $('status-line');
const pointCard = $('point-card');

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

let arOn = false;
let enterARButton = null;

let marking = false;
let markMode = 'place';
let anchorId = null;

let nudge = null;
let nudgeDrag = false;
let nudgeRefs = null;
let nudgeGroundY = 0;

let selectedId = null;
let editingPointId = null;
let pmIsNew = false;

const pointRefs = new Map();

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

function newId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function save() {
  state.prefs.lastColor = state.prefs.lastColor || PALETTE[1];
  state.prefs.lastIcon = state.prefs.lastIcon || ICONS[0];
  try { localStorage.setItem(LS, JSON.stringify({ points: state.points, prefs: state.prefs })); } catch (e) {}
}

function roundedPath(x, y, w, h, r) {
  const p = new THREE.Shape();
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
  return p;
}

function buildBubbleTexture(p) {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(8,10,24,0.92)';
  g.strokeStyle = p.color || '#29fff0';
  g.lineWidth = 7;
  g.beginPath();
  g.roundRect(16, 8, 288, 168, 24);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(86, 168);
  g.lineTo(64, 216);
  g.lineTo(136, 168);
  g.closePath();
  g.fillStyle = 'rgba(8,10,24,0.92)';
  g.fill();
  g.stroke();
  g.font = 'bold 92px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.fillText((p.icon || '📍'), 160, 96);
  g.font = '600 30px system-ui, sans-serif';
  g.fillText((p.name || '').slice(0, 18), 160, 216);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function buildGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(41,255,240,0.85)');
  grad.addColorStop(1, 'rgba(41,255,240,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addBubble(p) {
  const rel = p.rel;
  const iconTex = buildBubbleTexture(p);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex, transparent: true, depthTest: true, depthWrite: false }));
  spr.position.set(rel.x, rel.y, rel.z);
  spr.scale.set(0.6, 0.48, 1);
  spr.userData.pointId = p.id;
  pivot.add(spr);
  bubbleSprites.push(spr);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: buildGlowTexture(), transparent: true, depthWrite: false }));
  glow.position.set(rel.x, rel.y, rel.z);
  glow.scale.set(0.42, 0.42, 1);
  pivot.add(glow);

  pointRefs.set(p.id, { spr, glow });
}

function rebuildWorld() {
  for (let i = pivot.children.length - 1; i >= 0; i--) pivot.remove(pivot.children[i]);
  bubbleSprites.length = 0;
  pointRefs.clear();
  for (const p of state.points) addBubble(p);
  updateStatus();
}

function updateStatus() {
  statusBar.textContent = 'Puntos: ' + state.points.length + ' · toca un globo para ver opciones';
}

function showAim() {
  $('aim-dot').classList.remove('hidden');
}

function hideAim() {
  $('aim-dot').classList.add('hidden');
}

function onSessionStart() {
  arOn = true;
  overlayStart.classList.add('hidden');
  marking = false;
  markChip.classList.add('hidden');
  hideAim();
  nudge = null;
  nudgeDrag = false;
  nudgeChip.classList.add('hidden');
  rebuildWorld();
  toast('Listo · toca 📍 Punto aquí (o la pantalla) para dejar un globo');
}

function onSessionEnd() {
  arOn = false;
  overlayStart.classList.remove('hidden');
  marking = false;
  nudge = null;
  nudgeDrag = false;
  hideAim();
  markChip.classList.add('hidden');
  nudgeChip.classList.add('hidden');
  closePointCard(true);
}

function aimPoint() {
  const pos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  camera.getWorldPosition(pos);
  camera.getWorldDirection(dir);
  return {
    x: pos.x + dir.x * PLACE_DIST,
    y: pos.y + dir.y * PLACE_DIST,
    z: pos.z + dir.z * PLACE_DIST
  };
}

function addMark(mode) {
  if (!arOn) return toast('Entra a Realidad Aumentada');
  marking = true;
  markMode = mode || 'place';
  showAim();
  markChip.classList.remove('hidden');
  markTxt.textContent = markMode === 'anchor'
    ? 'Apuntando… toca la pantalla (o ✔) para anclar el punto real aquí'
    : 'Apuntando… toca la pantalla (o ✔) para dejar el globo aquí';
}

function cancelMark() {
  marking = false;
  hideAim();
  markChip.classList.add('hidden');
}

function rayFloorAt(ndc, y) {
  raycaster.setFromCamera(ndc, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
  const out = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, out)) return null;
  pivot.matrixAutoUpdate = false;
  pivot.updateMatrixWorld();
  const local = pivot.worldToLocal(out.clone());
  pivot.matrixAutoUpdate = true;
  return local;
}

function applyAnchorAt(scenePos) {
  const an = state.points.find(p => p.id === anchorId);
  if (!an) return cancelMark();
  const dx = scenePos.x - an.rel.x;
  const dy = scenePos.y - an.rel.y;
  const dz = scenePos.z - an.rel.z;
  for (const p of state.points) {
    p.rel.x += dx;
    p.rel.y += dy;
    p.rel.z += dz;
  }
  save();
  cancelMark();
  rebuildWorld();
  closePointCard(true);
  toast('◉ Mundo anclado a "' + (an.name || 'punto') + '"');
}

function rotateScene(deg) {
  const c = anchorId ? state.points.find(p => p.id === anchorId) : null;
  const cx = c ? c.rel.x : 0;
  const cz = c ? c.rel.z : 0;
  const a = THREE.MathUtils.degToRad(deg);
  const sa = Math.sin(a);
  const ca = Math.cos(a);
  for (const p of state.points) {
    const px = p.rel.x - cx;
    const pz = p.rel.z - cz;
    p.rel.x = cx + px * ca - pz * sa;
    p.rel.z = cz + px * sa + pz * ca;
  }
  save();
  rebuildWorld();
}

function lockMark() {
  if (!arOn) return toast('Entra a Realidad Aumentada');
  const scenePos = aimPoint();
  if (markMode === 'anchor') {
    applyAnchorAt(scenePos);
    return;
  }
  const p = {
    id: newId(),
    name: '',
    note: '',
    icon: state.prefs.lastIcon || ICONS[0],
    color: state.prefs.lastColor || PALETTE[1],
    alt: scenePos.y,
    rel: { x: scenePos.x, y: scenePos.y, z: scenePos.z }
  };
  state.points.push(p);
  editingPointId = p.id;
  pmIsNew = true;
  save();
  cancelMark();
  rebuildWorld();
  openPointModal(p, true);
}

function enterNudge(p) {
  if (!p || !pointRefs.has(p.id)) return toast('No encontrado');
  nudge = p;
  nudgeRefs = pointRefs.get(p.id);
  nudgeGroundY = p.rel.y;
  closePointCard(true);
  nudgeChip.classList.remove('hidden');
  toast('✋ Arrastra para ajustar · 🔒 Fijar');
}

function nudgeMove(e) {
  if (!nudge || !nudgeDrag || !nudgeRefs) return;
  const ndc = { x: (e.clientX / window.innerWidth) * 2 - 1, y: -((e.clientY / window.innerHeight) * 2 - 1) };
  const hit = rayFloorAt(ndc, nudgeGroundY);
  if (!hit) return;
  nudge.rel = { x: hit.x, y: nudgeGroundY, z: hit.z };
  nudgeRefs.spr.position.set(hit.x, nudgeGroundY, hit.z);
  nudgeRefs.glow.position.set(hit.x, nudgeGroundY, hit.z);
}

function nudgeAlt(d) {
  if (!nudge || !nudgeRefs) return;
  nudge.rel.y += d;
  nudgeGroundY += d;
  nudgeRefs.spr.position.y += d;
  nudgeRefs.glow.position.y += d;
  toast('Altura: ' + nudge.rel.y.toFixed(1) + ' m');
}

function lockNudge() {
  if (!nudge) return;
  nudge = null;
  nudgeDrag = false;
  nudgeRefs = null;
  nudgeChip.classList.add('hidden');
  save();
  rebuildWorld();
  toast('🔒 Ajustado');
}

function openPointCard(p) {
  selectedId = p.id;
  $('pc-icon').textContent = p.icon || '📍';
  $('pc-name').textContent = p.name || 'Sin nombre';
  $('pc-meta').textContent = 'x ' + p.rel.x.toFixed(1) + ' · y ' + p.rel.y.toFixed(1) + ' · z ' + p.rel.z.toFixed(1) + ' m (relativas)' + (p.note ? ' · ' + p.note : '');
  pointCard.classList.remove('hidden');
}

function closePointCard() {
  selectedId = null;
  pointCard.classList.add('hidden');
}

function tapAR(e) {
  if (marking || nudge) return;
  const ndc = { x: (e.clientX / window.innerWidth) * 2 - 1, y: -((e.clientY / window.innerHeight) * 2 - 1) };
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(bubbleSprites, false);
  if (!hits.length) return closePointCard();
  const id = hits[0].object.userData.pointId;
  const p = state.points.find(x => x.id === id);
  if (p) openPointCard(p);
}

function isPointerOverUI(e) {
  let el = e.target;
  while (el && el !== document.body) {
    if (el.matches && el.matches(IGNORED.join(','))) return true;
    el = el.parentElement;
  }
  return false;
}

let _lastTap = 0;
function evCoords(ev) {
  const src = (ev.touches && ev.touches.length) ? ev.touches[0] : ev;
  return { clientX: src.clientX, clientY: src.clientY };
}

function handlePointerDown(e) {
  if (!arOn || isPointerOverUI(e)) return;
  if (nudge) {
    nudgeDrag = true;
    nudgeMove(evCoords(e));
    return;
  }
  if (marking) {
    lockMark();
    return;
  }
  tapAR(evCoords(e));
}

function handlePointerMove(e) {
  if (!arOn || !nudge || !nudgeDrag) return;
  nudgeMove(evCoords(e));
}

function handlePointerUp(e) {
  if (!arOn || !nudge || !nudgeDrag) return;
  nudgeDrag = false;
  if (nudge) { save(); toast('Suelta 🔒 para finalizar'); }
}

function openPointModal(p, isNew) {
  editingPointId = p.id;
  pmIsNew = !!isNew;
  $('pm-title').textContent = isNew ? 'Nuevo punto' : 'Editar punto';
  $('p-name').value = p.name || '';
  $('p-note').value = p.note || '';
  $('p-icon').value = p.icon || state.prefs.lastIcon || ICONS[0];
  $('p-alt').value = (p.rel.y != null ? p.rel.y : 0).toFixed(1);
  const palette = $('p-colors');
  const cur = p.color || state.prefs.lastColor || PALETTE[1];
  palette.innerHTML = '';
  for (const c of PALETTE) {
    const w = document.createElement('button');
    w.type = 'button';
    w.style.background = c;
    w.className = 'swatch' + (c === cur ? ' on' : '');
    w.addEventListener('click', () => {
      palette.querySelectorAll('.swatch').forEach(s => s.classList.remove('on'));
      w.classList.add('on');
      state.prefs.lastColor = c;
      save();
    });
    palette.appendChild(w);
  }
  $('point-modal').classList.remove('hidden');
  $('p-name').focus?.();
}

function closePointModal() {
  $('point-modal').classList.add('hidden');
  if (pmIsNew && editingPointId) {
    state.points = state.points.filter(p => p.id !== editingPointId);
    save();
    rebuildWorld();
  }
  editingPointId = null;
  pmIsNew = false;
}

function commitPointModal() {
  const p = state.points.find(x => x.id === editingPointId);
  if (!p) return closePointModal();
  p.name = $('p-name').value.trim();
  p.note = $('p-note').value.trim();
  p.icon = $('p-icon').value;
  p.color = state.prefs.lastColor || p.color;
  const alt = parseFloat($('p-alt').value);
  if (Number.isFinite(alt)) {
    p.rel.y = alt;
    p.alt = alt;
  }
  save();
  closePointModal();
  rebuildWorld();
  toast('✔ Guardado');
}

function initAR() {
  enterARButton = ARButton.createButton(renderer, {
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: $('hud') }
  });
  $('enter-ar').appendChild(enterARButton);

  renderer.xr.addEventListener('sessionstart', onSessionStart);
  renderer.xr.addEventListener('sessionend', onSessionEnd);

  const status = $('xr-status');
  if ('xr' in navigator && navigator.xr) {
    navigator.xr.isSessionSupported('immersive-ar').then(ok => {
      if (!ok) status.textContent = 'Este dispositivo no soporta RA (WebXR AR)';
    }).catch(() => {
      status.textContent = 'Error al comprobar WebXR';
    });
  } else {
    status.textContent = 'Este navegador no soporta RA (WebXR AR). Necesitas Android/Chrome o iPhone/Safari recientes.';
  }
}

function exportScene() {
  const payload = { version: 2, exportedAt: new Date().toISOString(), points: state.points };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'puntos_flotantes_ar.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('⤓ Exportado (' + state.points.length + ' puntos)');
}

function importScene(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d || !Array.isArray(d.points)) throw new Error('bad file');
      const pts = d.points.filter(p => p && p.rel && Number.isFinite(p.rel.x));
      state.points = pts;
      save();
      rebuildWorld();
      toast('⤒ Importados ' + pts.length + ' puntos');
    } catch (e) {
      toast('Archivo inválido');
    }
    $('import-file').value = '';
  };
  reader.readAsText(file);
}

// ---- events ----
$('btn-add-point').addEventListener('click', () => {
  if (marking) cancelMark();
  else addMark('place');
});

$('mark-ok').addEventListener('click', lockMark);
$('mark-cancel').addEventListener('click', cancelMark);

$('nudge-up').addEventListener('click', () => nudgeAlt(0.25));
$('nudge-down').addEventListener('click', () => nudgeAlt(-0.25));
$('nudge-lock').addEventListener('click', lockNudge);

$('pc-nudge').addEventListener('click', () => {
  const p = state.points.find(x => x.id === selectedId);
  if (p) enterNudge(p);
});
$('pc-anchor').addEventListener('click', () => {
  if (!arOn) return toast('Entra a Realidad Aumentada');
  anchorId = selectedId;
  closePointCard();
  $('anchor-modal').classList.remove('hidden');
  addMark('anchor');
});
$('pc-edit').addEventListener('click', () => {
  const p = state.points.find(x => x.id === selectedId);
  if (p) { closePointCard(); openPointModal(p, false); }
});
$('pc-del').addEventListener('click', () => {
  if (!selectedId) return;
  state.points = state.points.filter(p => p.id !== selectedId);
  save();
  closePointCard();
  rebuildWorld();
  toast('🗑️ Eliminado');
});
$('pc-close').addEventListener('click', closePointCard);

$('an-rotl').addEventListener('click', () => rotateScene(-1));
$('an-rotr').addEventListener('click', () => rotateScene(1));
$('an-close').addEventListener('click', () => {
  $('anchor-modal').classList.add('hidden');
  cancelMark();
});

$('pm-ok').addEventListener('click', commitPointModal);
$('pm-cancel').addEventListener('click', closePointModal);

$('btn-export').addEventListener('click', exportScene);
$('btn-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (f) importScene(f);
});

$('btn-clear').addEventListener('click', () => {
  if (!state.points.length) return toast('No hay puntos');
  if (!confirm('¿Borrar todos los puntos?')) return;
  state.points = [];
  save();
  rebuildWorld();
  toast('🗑️ Todos los puntos borrados');
});

window.addEventListener('pointerdown', handlePointerDown);
window.addEventListener('pointermove', handlePointerMove);
window.addEventListener('pointerup', handlePointerUp);
window.addEventListener('pointercancel', handlePointerUp);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  if (!renderer.xr.isPresenting) return;
  renderer.render(scene, camera);
});

initAR();
rebuildWorld();