import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PALETTE = ['#ff2ef0', '#29fff0', '#64ff5f', '#ffe32e', '#ff7a2e', '#b78cff', '#ffffff'];
const STROKE_MIN_DIST = 0.012;
const STROKE_CAP = 700;
const LS_DRAWINGS = 'airdraw.v1';
const LS_DRAFT = 'airdraw.draft';
const AR_DISTANCE = 1.8;
const RING_RADIUS = 1.6;
const RING_SPREAD = Math.PI / 3;

const $ = (id) => document.getElementById(id);

const hudEl = $('hud');
const overlayStart = $('overlay-start');
const enterARBox = $('enter-ar');
const xrStatusEl = $('xr-status');
const panelDraw = $('panel-draw');
const panelGallery = $('panel-gallery');
const galleryList = $('gallery-list');
const modeBadge = $('mode-badge');
const paletteEl = $('palette');
const btnUndo = $('btn-undo');
const btnClear = $('btn-clear');
const btnSave = $('btn-save');
const btnGallery = $('btn-gallery');
const btnBack = $('btn-back');
const btnExport = $('btn-export');
const btnImport = $('btn-import');
const btnViewAll = $('btn-view-all');
const btnPreview3d = $('btn-preview3d');
const btnDraw = $('btn-draw');
const modal = $('modal');
const inputName = $('input-name');
const btnModalOk = $('btn-modal-ok');
const btnModalCancel = $('btn-modal-cancel');
const importFile = $('import-file');
const toastEl = $('toast');
const depthBox = $('depth-ui');
const depthSlider = $('depth-slider');
const depthVal = $('depth-val');

const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearAlpha(0);
renderer.xr.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 50);

const strokeGroup = new THREE.Group();
const galleryGroup = new THREE.Group();
scene.add(strokeGroup, galleryGroup);

const grid = new THREE.GridHelper(6, 24, 0x6677aa, 0x1a2030);
grid.material.transparent = true;
grid.material.opacity = 0.4;
grid.position.y = -0.4;
grid.visible = false;
scene.add(grid);

let raycaster = new THREE.Raycaster();
let drawings = loadAll();
let mode = 'draw';
let drawingActive = false;
let drawEnabled = false;
let currentStroke = null;
let pointerNDC = null;
let lastPoint = null;
let selectedColor = PALETTE[0];
let drawDistance = AR_DISTANCE;
let controls = null;
let enterARButton = null;

let drawing = restoreDraft();

function newDrawing() {
  return { id: 'd' + Date.now() + '-' + Math.floor(Math.random() * 1e6), name: '', strokes: [], color: selectedColor, createdAt: Date.now() };
}

function restoreDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_DRAFT));
    if (d && Array.isArray(d.strokes) && d.strokes.length) {
      d.createdAt = d.createdAt || Date.now();
      return d;
    }
  } catch { /* */
  }
  return newDrawing();
}

function loadAll() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_DRAWINGS));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveAll() {
  try {
    localStorage.setItem(LS_DRAWINGS, JSON.stringify(drawings));
  } catch {
    toast('No se pudo guardar (almacenamiento lleno)');
  }
}

function saveDraft() {
  try {
    localStorage.setItem(LS_DRAFT, JSON.stringify({ ...drawing, strokes: drawing.strokes }));
  } catch { /* */
  }
}

function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rad.addColorStop(0, 'rgba(255,255,255,1)');
  rad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  rad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const DOT_TEXTURE = makeDotTexture();
const lineMats = new Map();
const dotMats = new Map();

function lineMat(color) {
  if (!lineMats.has(color)) {
    lineMats.set(color, new THREE.LineBasicMaterial({ color, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
  }
  return lineMats.get(color);
}

function dotMat(color) {
  if (!dotMats.has(color)) {
    dotMats.set(color, new THREE.PointsMaterial({ color, size: 0.008, sizeAttenuation: true, map: DOT_TEXTURE, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
  }
  return dotMats.get(color);
}

function createActiveStroke(color) {
  const positions = new Float32Array(STROKE_CAP * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setDrawRange(0, 0);
  const line = new THREE.Line(geo, lineMat(color));
  const dots = new THREE.Points(geo, dotMat(color));
  const grp = new THREE.Group();
  grp.add(line, dots);
  line.frustumCulled = false;
  dots.frustumCulled = false;
  return {
    grp, geo, positions, count: 0,
    grow(p) {
      if (this.count >= STROKE_CAP) return;
      const i = this.count * 3;
      this.positions[i] = p.x;
      this.positions[i + 1] = p.y;
      this.positions[i + 2] = p.z;
      this.count++;
      this.geo.setDrawRange(0, this.count);
      this.geo.attributes.position.needsUpdate = true;
    },
    toPoints() {
      const out = [];
      for (let k = 0; k < this.count; k++) out.push([this.positions[k * 3], this.positions[k * 3 + 1], this.positions[k * 3 + 2]]);
      return out;
    }
  };
}

function buildStaticStroke(points3, color) {
  const arr = new Float32Array(points3.length * 3);
  points3.forEach((p, i) => {
    arr[i * 3] = p[0];
    arr[i * 3 + 1] = p[1];
    arr[i * 3 + 2] = p[2];
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  geo.computeBoundingSphere();
  const line = new THREE.Line(geo, lineMat(color));
  const dots = new THREE.Points(geo, dotMat(color));
  const grp = new THREE.Group();
  grp.add(line, dots);
  line.frustumCulled = false;
  dots.frustumCulled = false;
  return grp;
}

function updateNDC(e) {
  const x = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
  const y = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
  pointerNDC = { x: (x / window.innerWidth) * 2 - 1, y: -((y / window.innerHeight) * 2 - 1) };
}

const IGNORED = 'button,input,select,textarea,.panel,.modal,.gcard,.toast,.hud-top,.depth-ui,.badge';

function onPointerDown(e) {
  if (!drawEnabled || mode !== 'draw') return;
  const t = e.target;
  if (t instanceof Element && t.closest(IGNORED)) return;
  if (e.cancelable) e.preventDefault();
  updateNDC(e);
  drawingActive = true;
  lastPoint = null;
  currentStroke = createActiveStroke(selectedColor);
  strokeGroup.add(currentStroke.grp);
  if (controls) controls.enabled = false;
}

function onPointerMove(e) {
  updateNDC(e);
}

function onPointerUp() {
  if (!drawingActive) return;
  drawingActive = false;
  if (currentStroke && currentStroke.count > 0) {
    drawing.strokes.push({ points: currentStroke.toPoints(), color: selectedColor });
    currentStroke = null;
    saveDraft();
  } else if (currentStroke) {
    strokeGroup.remove(currentStroke.grp);
    currentStroke.geo.dispose();
    currentStroke = null;
  }
  lastPoint = null;
  if (controls) controls.enabled = true;
}

if (window.PointerEvent) {
  window.addEventListener('pointerdown', onPointerDown, { passive: false, capture: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
} else {
  window.addEventListener('touchstart', onPointerDown, { passive: false });
  window.addEventListener('touchmove', onPointerMove, { passive: true });
  window.addEventListener('touchend', onPointerUp);
  window.addEventListener('touchcancel', onPointerUp);
}

function drawPointFromNDC() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const dist = renderer.xr.isPresenting ? AR_DISTANCE : drawDistance;
  raycaster.setFromCamera(pointerNDC, cam);
  return raycaster.ray.at(dist, new THREE.Vector3());
}

renderer.setAnimationLoop(() => {
  if (drawingActive && pointerNDC) {
    const p = drawPointFromNDC();
    if (!lastPoint || lastPoint.distanceTo(p) >= STROKE_MIN_DIST) {
      currentStroke.grow(p);
      lastPoint = p;
    }
  }
  if (controls) controls.update();
  renderer.render(scene, camera);
});

function rebuildStrokeGroup() {
  strokeGroup.clear();
  for (const s of drawing.strokes) strokeGroup.add(buildStaticStroke(s.points, s.color));
}

function showMode(m) {
  mode = m;
  modeBadge.textContent = m === 'gallery' ? 'GALERÍA' : 'DIBUJAR';
  panelDraw.classList.toggle('hidden', m !== 'draw');
  panelGallery.classList.toggle('hidden', m !== 'gallery');
  strokeGroup.visible = m === 'draw';
  if (m === 'gallery') {
    buildGallery(drawings);
    renderGalleryList();
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderGalleryList() {
  galleryList.innerHTML = '';
  if (!drawings.length) {
    galleryList.innerHTML = '<p class="empty">Aún no hay dibujos guardados. Vuelve a dibujar y presiona 💾 Guardar.</p>';
    return;
  }
  const sorted = [...drawings].sort((a, b) => b.createdAt - a.createdAt);
  for (const d of sorted) {
    const card = document.createElement('div');
    card.className = 'gcard';
    const dots = (d.strokes || []).map((s) => `<i style="background:${s.color}"></i>`).join('');
    card.innerHTML =
      `<div class="gname">${escapeHtml(d.name || 'Sin nombre')}</div>` +
      `<div class="gsub">${(d.strokes || []).length} trazos · ${new Date(d.createdAt).toLocaleDateString()}</div>` +
      `<div class="gdots">${dots}</div>` +
      `<div class="gbtns">` +
      `<button data-act="view" class="btn btn-accent">Ver en AR</button>` +
      `<button data-act="del" class="btn danger">Eliminar</button>` +
      `</div>`;
    card.querySelector('[data-act=view]').addEventListener('click', () => viewInAR([d]));
    card.querySelector('[data-act=del]').addEventListener('click', () => {
      drawings = drawings.filter((x) => x.id !== d.id);
      saveAll();
      renderGalleryList();
      toast('Dibujo eliminado');
    });
    galleryList.appendChild(card);
  }
}

function buildDrawingGroup(d) {
  if (!d.strokes || !d.strokes.length) return null;
  const inner = new THREE.Group();
  let min = new THREE.Vector3(Infinity, Infinity, Infinity);
  let max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const s of d.strokes) {
    for (const p of s.points) {
      if (!Array.isArray(p) || p.length < 3) continue;
      if (p[0] < min.x) min.x = p[0];
      if (p[1] < min.y) min.y = p[1];
      if (p[2] < min.z) min.z = p[2];
      if (p[0] > max.x) max.x = p[0];
      if (p[1] > max.y) max.y = p[1];
      if (p[2] > max.z) max.z = p[2];
    }
  }
  if (!isFinite(min.x)) return null;
  const center = new THREE.Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
  const span = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 1e-3);
  const scale = Math.min(1, 0.7 / span);
  inner.scale.setScalar(scale);
  inner.position.copy(center).multiplyScalar(-scale);
  for (const s of d.strokes) {
    if (Array.isArray(s.points) && s.points.length) inner.add(buildStaticStroke(s.points, s.color));
  }
  return inner;
}

function buildGallery(items) {
  galleryGroup.clear();
  if (!items || !items.length) return;
  const n = items.length;
  items.forEach((d, i) => {
    const g = buildDrawingGroup(d);
    if (!g) return;
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const angle = t * RING_SPREAD;
    g.position.set(Math.sin(angle) * RING_RADIUS, 1.2, Math.cos(angle) * RING_RADIUS);
    g.rotation.y = Math.PI - angle;
    galleryGroup.add(g);
  });
}

function viewInAR(items) {
  buildGallery(items);
  if (!renderer.xr.isPresenting) startARSession();
}

function startARSession() {
  if (renderer.xr.isPresenting) return;
  if (enterARButton) enterARButton.click();
  else toast('AR no disponible aquí');
}

function initAR() {
  if (!navigator.xr) {
    xrStatusEl.textContent = 'Tu navegador no soporta WebXR AR. Usa Chrome/Edge reciente en Android o Safari en iPhone, o el modo 3D.';
    return;
  }
  const sessionInit = {
    optionalFeatures: ['local-floor', 'hit-test', 'dom-overlay'],
    domOverlay: { root: hudEl }
  };
  enterARButton = ARButton.createButton(renderer, sessionInit);
  enterARButton.textContent = '▶  Comenzar Realidad Aumentada';
  enterARBox.appendChild(enterARButton);
  renderer.xr.addEventListener('sessionstart', onSessionStart);
  renderer.xr.addEventListener('sessionend', onSessionEnd);
}

function onSessionStart() {
  overlayStart.classList.add('hidden');
  hudEl.classList.remove('hidden');
  scene.background = null;
  grid.visible = false;
  if (controls) controls.enabled = false;
  drawEnabled = true;
  drawDistance = AR_DISTANCE;
  depthBox.classList.add('hidden');
  setDrawBtn();
  showMode(mode);
  toast('Toca y arrastra para dibujar en el aire ✨');
}

function onSessionEnd() {
  if (drawingActive) onPointerUp();
  mode = 'draw';
  hudEl.classList.add('hidden');
  overlayStart.classList.remove('hidden');
  scene.background = new THREE.Color(0x05060f);
  grid.visible = Boolean(controls);
  setDrawBtn();
}

function enterInline() {
  overlayStart.classList.add('hidden');
  hudEl.classList.remove('hidden');
  scene.background = new THREE.Color(0x05060f);
  grid.visible = true;
  camera.position.set(0, 1.6, 2.6);
  camera.lookAt(0, 1.1, 0);
  controls = new OrbitControls(camera, $('scene'));
  controls.target.set(0, 1.1, 0);
  controls.enableDamping = true;
  controls.update();
  depthBox.classList.remove('hidden');
  drawEnabled = false;
  setDrawBtn();
  showMode('draw');
}

function setDrawBtn() {
  btnDraw.textContent = drawEnabled ? '✏️ ON' : '✏️ OFF';
  btnDraw.classList.toggle('on', drawEnabled);
  if (controls) controls.enabled = !drawEnabled;
}

paletteEl.innerHTML = '';
PALETTE.forEach((c) => {
  const b = document.createElement('button');
  b.className = 'swatch' + (c === selectedColor ? ' on' : '');
  b.style.background = c;
  b.dataset.color = c;
  b.type = 'button';
  b.addEventListener('click', () => {
    selectedColor = c;
    paletteEl.querySelectorAll('.swatch').forEach((el) => el.classList.toggle('on', el.dataset.color === c));
  });
  paletteEl.appendChild(b);
});

btnDraw.addEventListener('click', () => {
  if (renderer.xr.isPresenting) {
    toast('En AR siempre se dibuja al tocar la pantalla');
    return;
  }
  if (drawingActive) onPointerUp();
  drawEnabled = !drawEnabled;
  setDrawBtn();
});

btnUndo.addEventListener('click', () => {
  if (!drawing.strokes.length) return toast('Nada que deshacer');
  drawing.strokes.pop();
  rebuildStrokeGroup();
  saveDraft();
});

btnClear.addEventListener('click', () => {
  if (!drawing.strokes.length) return;
  drawing.strokes = [];
  rebuildStrokeGroup();
  saveDraft();
  toast('Lienzo limpio');
});

btnSave.addEventListener('click', () => {
  if (!drawing.strokes.length) return toast('Dibuja algo antes de guardar ✏️');
  inputName.value = drawing.name || `Dibujo ${drawings.length + 1}`;
  modal.classList.remove('hidden');
  setTimeout(() => inputName.focus(), 120);
});

btnModalOk.addEventListener('click', commitSave);
btnModalCancel.addEventListener('click', () => modal.classList.add('hidden'));

function commitSave() {
  const name = (inputName.value || '').trim() || `Dibujo ${drawings.length + 1}`;
  drawing.name = name;
  const copy = { id: drawing.id, name, color: selectedColor, createdAt: drawing.createdAt, strokes: drawing.strokes };
  const idx = drawings.findIndex((x) => x.id === drawing.id);
  if (idx >= 0) drawings[idx] = copy;
  else drawings.push(copy);
  saveAll();
  localStorage.removeItem(LS_DRAFT);
  modal.classList.add('hidden');
  drawing = newDrawing();
  rebuildStrokeGroup();
  renderGalleryList();
  toast(`Guardado: "${name}" ✔`);
}

btnGallery.addEventListener('click', () => showMode('gallery'));
btnBack.addEventListener('click', () => showMode('draw'));
btnViewAll.addEventListener('click', () => viewInAR(drawings));
btnExport.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(drawings, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'dibujos_aire.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Respaldo exportado');
});

btnImport.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', () => {
  const file = importFile.files && importFile.files[0];
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const data = JSON.parse(fr.result);
      if (!Array.isArray(data)) throw new Error();
      const map = new Map(drawings.map((d) => [d.id, d]));
      for (const d of data) {
        if (d && d.id && Array.isArray(d.strokes)) map.set(d.id, d);
      }
      drawings = Array.from(map.values());
      saveAll();
      renderGalleryList();
      toast(`${drawings.length} dibujos importados`);
    } catch {
      toast('Archivo JSON inválido');
    }
  };
  fr.readAsText(file);
  importFile.value = '';
});

btnPreview3d.addEventListener('click', enterInline);

depthSlider.addEventListener('input', () => {
  drawDistance = parseFloat(depthSlider.value);
  depthVal.textContent = drawDistance.toFixed(1);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('beforeunload', saveDraft);

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2400);
}

setDrawBtn();
rebuildStrokeGroup();
renderGalleryList();
initAR();