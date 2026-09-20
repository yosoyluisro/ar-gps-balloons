import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

const LS = 'argps.v1';

const ORB = 'rgba(41,255,240,1)';
const WAY_C = 'rgba(255,46,240,1)';
const PLACE_DIST = 2.2;
const FLOAT_ABOVE = 0.2;
const LABEL_GAP = 0.32;
const LABEL_H = 0.11;
const BALL_SCALE = 0.35;
const WAY_SCALE = 0.16;
const LINE_COLOR = 0x29fff0;

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearAlpha(0);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);

const startEl = document.getElementById('overlay-start');
const countEl = document.getElementById('count');
const nameOverlay = document.getElementById('overlay-label');
const nameInput = document.getElementById('label-input');
const nameOk = document.getElementById('label-ok');
const overlayRoot = document.getElementById('overlay');
const qrEl = document.getElementById('qr');
const versionEl = document.getElementById('version');
const APP_VERSION = '0.9.0';

function pagesUrl() {
  const h = location.hostname;
  return h.endsWith('github.io') ? location.origin + location.pathname : 'https://yosoyluisro.github.io/ar-gps-balloons/';
}

function renderQr() {
  if (!qrEl || typeof qrcode !== 'function') return;
  const qr = qrcode(0, 'M');
  qr.addData(pagesUrl());
  qr.make();
  qrEl.innerHTML = qr.createImgTag(5, 2);
}
renderQr();
if (versionEl) versionEl.textContent = 'v' + APP_VERSION;

let balloons = 0;
let hitTestSource = null;
let transientSource = null;
let selectGuardUntil = 0;
let activeTipo = 'marcador';
let labelWaiting = null;
let pendingBalloonPos = null;
let pendingBalloonId = null;
const balloonGroups = new Map();

function newBalloonId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------------- persistencia (los globos vuelven al entrar) ---------------- */

let balloonsList = loadBalloons();

function loadBalloons() {
  try {
    const v = JSON.parse(localStorage.getItem(LS));
    if (v && Array.isArray(v)) return v.filter((b) => b && Number.isFinite(b.x) && Number.isFinite(b.z)).map((b) => ({ tipo: 'marcador', ...b }));
  } catch { /* */ }
  return [];
}

function saveBalloons() {
  try {
    localStorage.setItem(LS, JSON.stringify(balloonsList));
  } catch {
    toast('No se pudo guardar (almacenamiento lleno)');
  }
}

const listPanel = document.getElementById('balloon-list');
const listCount = document.getElementById('list-count');

function renderBalloonList() {
  listCount.textContent = String(balloonsList.length);
  listPanel.innerHTML = '';
  if (!balloonsList.length) {
    const empty = document.createElement('p');
    empty.className = 'list-empty';
    empty.textContent = 'Aun no hay globos. Toca Agregar marcador o way tracker.';
    listPanel.appendChild(empty);
    return;
  }
  balloonsList.forEach((b, i) => {
    const row = document.createElement('div');
    row.className = 'list-row';
    const dot = document.createElement('span');
    dot.className = 'list-dot ' + (b.tipo === 'way' ? 'way' : 'marker');
    const name = document.createElement('span');
    name.className = 'list-name';
    name.textContent = b.tipo === 'way' ? 'Punto ' + (i + 1) : (b.name || 'Marcador');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'list-del';
    del.textContent = 'Eliminar';
    del.addEventListener('click', () => deleteBalloon(b.id));
    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(del);
    listPanel.appendChild(row);
  });
}

function deleteBalloon(id) {
  const idx = balloonsList.findIndex((b) => b.id === id);
  if (idx === -1) return;
  balloonsList.splice(idx, 1);
  const group = balloonGroups.get(id);
  if (group) {
    scene.remove(group);
    group.children.forEach((c) => {
      if (c.material && c.material.map) c.material.map.dispose();
      if (c.material) c.material.dispose();
    });
    balloonGroups.delete(id);
  }
  if (pendingBalloonId === id) {
    pendingBalloonId = null;
    pendingBalloonPos = null;
  }
  balloons = Math.max(0, balloonsList.length);
  saveBalloons();
  renderBalloonList();
  rebuildPath();
  toast('Globo eliminado');
}

document.getElementById('btn-list').addEventListener('click', () => {
  listPanel.classList.toggle('hidden');
  renderBalloonList();
});

function restoreBalloons() {
  for (const b of balloonsList) {
    if (!b.id) b.id = newBalloonId();
    if (!b.tipo) b.tipo = 'marcador';
    const group = makeBallGroup(b.tipo);
    group.position.set(b.x, b.y ?? FLOAT_ABOVE, b.z);
    balloons++;
    if (b.tipo !== 'way') {
      const label = makeLabelSprite(b.name || 'Globo ' + balloons);
      label.position.y = FLOAT_ABOVE - LABEL_GAP;
      group.add(label);
    }
    balloonGroups.set(b.id, group);
  }
  rebuildPath();
}

function orbTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(48, 44, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, color || ORB);
  grad.addColorStop(1, 'rgba(41,255,240,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = ORB;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  return new THREE.CanvasTexture(c);
}

const ballTex = orbTexture(ORB);
const wayTex = orbTexture(WAY_C);

function aimPoint(dist) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  return camera.position.clone().add(dir.multiplyScalar(dist));
}

function textSpriteTexture(text) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const fs = 64;
  g.font = '700 ' + fs + 'px system-ui, sans-serif';
  const padX = 40;
  const padY = 22;
  const w = Math.ceil(g.measureText(text).width + padX * 2);
  const h = Math.ceil(fs + padY * 2);
  c.width = w;
  c.height = h;
  const g2 = c.getContext('2d');
  g2.font = '700 ' + fs + 'px system-ui, sans-serif';
  g2.fillStyle = 'rgba(5, 6, 15, 0.82)';
  const r = h / 2;
  g2.beginPath();
  g2.moveTo(r, 0);
  g2.arcTo(w, 0, w, h, r);
  g2.arcTo(w, h, 0, h, r);
  g2.arcTo(0, h, 0, 0, r);
  g2.arcTo(0, 0, w, 0, r);
  g2.closePath();
  g2.fill();
  g2.fillStyle = '#e8ecff';
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';
  g2.fillText(text, w / 2, h / 2 + 4);
  return new THREE.CanvasTexture(c);
}

function makeLabelSprite(text) {
  const tex = textSpriteTexture(text);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false }));
  spr.scale.y = LABEL_H;
  spr.scale.x = LABEL_H * (tex.image.width / tex.image.height);
  return spr;
}

/* ---------------- camino: linea 3D que une los globos en orden ---------------- */

const pathMat = new LineMaterial({ color: LINE_COLOR, transparent: true, opacity: 0.75, linewidth: 4, depthTest: true, depthWrite: false });
pathMat.resolution.set(window.innerWidth, window.innerHeight);
let pathLine = null;

function rebuildPath() {
  if (pathLine) {
    scene.remove(pathLine);
    pathLine.geometry.dispose();
    pathLine = null;
  }
  if (balloonsList.length < 2) return;
  const pts = [];
  for (const b of balloonsList) {
    pts.push(b.x, (b.y ?? FLOAT_ABOVE) + FLOAT_ABOVE, b.z);
  }
  const geo = new LineGeometry();
  geo.setPositions(pts);
  pathLine = new Line2(geo, pathMat);
  pathLine.frustumCulled = false;
  scene.add(pathLine);
}

function applyLabel(spr, text) {
  const tex = textSpriteTexture(text);
  spr.material.map = tex;
  spr.material.needsUpdate = true;
  spr.scale.x = LABEL_H * (tex.image.width / tex.image.height);
}

function makeBallGroup(tipo) {
  const group = new THREE.Group();
  const isWay = tipo === 'way';
  const ball = new THREE.Sprite(new THREE.SpriteMaterial({ map: isWay ? wayTex : ballTex, transparent: true, depthTest: true, depthWrite: false }));
  ball.scale.set(isWay ? WAY_SCALE : BALL_SCALE, isWay ? WAY_SCALE : BALL_SCALE, 1);
  ball.position.y = FLOAT_ABOVE;
  group.add(ball);
  scene.add(group);
  return group;
}

function commitBalloon(tipo, pos) {
  const group = makeBallGroup(tipo);
  group.position.copy(pos);
  balloons++;
  const id = newBalloonId();
  balloonGroups.set(id, group);
  if (tipo === 'way') {
    balloonsList.push({ id, tipo, x: pos.x, y: pos.y, z: pos.z });
    saveBalloons();
    renderBalloonList();
    rebuildPath();
    toast('Punto agregado a la ruta');
    return;
  }
  const label = makeLabelSprite('Globo ' + balloons);
  label.position.y = FLOAT_ABOVE - LABEL_GAP;
  group.add(label);
  labelWaiting = label;
  pendingBalloonId = id;
  pendingBalloonPos = group.position.clone();
  nameOverlay.classList.remove('hidden');
  nameInput.value = 'Globo ' + balloons;
  nameInput.focus();
  nameInput.select();
}

function hideNamePrompt() {
  nameOverlay.classList.add('hidden');
  nameInput.blur();
  nameInput.value = '';
  selectGuardUntil = Date.now() + 700;
}

nameOk.addEventListener('click', () => {
  if (labelWaiting) {
    const name = nameInput.value.trim() || 'Globo ' + balloons;
    applyLabel(labelWaiting, name);
    if (pendingBalloonPos) {
      balloonsList.push({
        id: pendingBalloonId || newBalloonId(),
        tipo: 'marcador',
        name,
        x: pendingBalloonPos.x,
        y: pendingBalloonPos.y,
        z: pendingBalloonPos.z
      });
      pendingBalloonPos = null;
      pendingBalloonId = null;
      saveBalloons();
      renderBalloonList();
      rebuildPath();
    }
    labelWaiting = null;
  }
  hideNamePrompt();
});

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    nameOk.click();
  }
});

let lastSurfacePos = null;
let lastUiTap = 0;

document.addEventListener('pointerdown', (e) => {
  if (e.target && e.target.closest && e.target.closest('#overlay')) {
    lastUiTap = Date.now();
  }
}, true);

function placeBalloon(fromHudBtn) {
  if (!renderer.xr.isPresenting) return;
  if (Date.now() < selectGuardUntil) return;
  if (!fromHudBtn && Date.now() - lastUiTap < 600) return;
  if (!nameOverlay.classList.contains('hidden')) return;
  const pos = lastSurfacePos ? lastSurfacePos : aimPoint(PLACE_DIST);
  commitBalloon(activeTipo, pos);
}

function onSelect() {
  placeBalloon(false);
}

function setActiveTipo(t) {
  activeTipo = t;
  document.getElementById('btn-add').classList.toggle('active', t === 'marcador');
  document.getElementById('btn-way').classList.toggle('active', t === 'way');
}

document.getElementById('btn-add').addEventListener('click', () => {
  setActiveTipo('marcador');
  placeBalloon(true);
});

document.getElementById('btn-way').addEventListener('click', () => {
  setActiveTipo('way');
  placeBalloon(true);
});
setActiveTipo('marcador');

async function setupHitTest() {
  try {
    const session = renderer.xr.getSession();
    const viewer = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: viewer });
    transientSource = await session.requestHitTestSourceForTransientInput({ profile: 'generic-touchscreen', space: viewer });
  } catch {
    hitTestSource = null;
    transientSource = null;
  }
}

const reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture(), transparent: true, depthTest: false, depthWrite: false }));
reticle.scale.set(0.28, 0.28, 1);
reticle.visible = false;

const debugPlanes = new Map();
let debugGrid = null;
let debugRay = null;
let debugCam = null;
let debugRayEnd = null;

function planeColor(plane) {
  if (plane.orientation === 'horizontal') return 0x29ff90;
  if (plane.orientation === 'vertical') return 0xff2ef0;
  return 0x8f9bbf;
}

function updateDebugRay(surfacePos) {
  const from = camera.position;
  const to = surfacePos || aimPoint(PLACE_DIST);
  const pos = debugRay.geometry.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  debugRay.material.color.setHex(surfacePos ? 0x29ff90 : 0xff3b3b);
  debugRayEnd.position.copy(to);
}

function updateDebugPlanes(frame, refSpace) {
  if (!frame.detectedPlanes) {
    debugPlanes.forEach((entry, uid) => {
      scene.remove(entry.line);
      debugPlanes.delete(uid);
    });
    return;
  }
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
    const pos = entry.line.geometry.attributes.position;
    if (!pos || pos.count !== pts.length + 1) {
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

function buildDebug() {
  debugGrid = new THREE.GridHelper(10, 10, 0x29ff90, 0x1b5c46);
  debugGrid.material.transparent = true;
  debugGrid.material.opacity = 0.5;
  scene.add(debugGrid);

  debugRay = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)),
    new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 })
  );
  debugRay.frustumCulled = false;
  scene.add(debugRay);

  debugRayEnd = new THREE.Sprite(new THREE.SpriteMaterial({ map: orbTexture(), transparent: true, depthTest: false, depthWrite: false }));
  debugRayEnd.scale.set(0.12, 0.12, 1);
  debugRayEnd.frustumCulled = false;
  scene.add(debugRayEnd);

  debugCam = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  scene.add(debugCam);
}

function onSessionStart() {
  scene.clear();
  scene.add(reticle);
  debugPlanes.forEach((entry) => {
    entry.line.geometry.dispose();
    entry.line.material.dispose();
  });
  debugPlanes.clear();
  buildDebug();
  balloons = 0;
  balloonGroups.clear();
  lastSurfacePos = null;
  hitTestSource = null;
  transientSource = null;
  labelWaiting = null;
  pendingBalloonPos = null;
  restoreBalloons();
  hideNamePrompt();
  countEl.textContent = '';
  startEl.classList.add('hidden');
  renderBalloonList();
  setupHitTest();
  renderer.xr.getSession().addEventListener('select', onSelect);
}

function onSessionEnd() {
  startEl.classList.remove('hidden');
  countEl.textContent = balloons ? 'Dejaste ' + balloons + ' etiqueta(s) en el aire' : 'Toca la pantalla en RA para dejar etiquetas';
  renderBalloonList();
}

renderer.xr.addEventListener('sessionstart', onSessionStart);
renderer.xr.addEventListener('sessionend', onSessionEnd);

renderer.setAnimationLoop(() => {
  if (!renderer.xr.isPresenting) return;
  const frame = renderer.xr.getFrame();
  const refSpace = renderer.xr.getReferenceSpace();

  let surfacePos = null;

  if (transientSource) {
    const tr = frame.getHitTestResultsForTransientInput(transientSource);
    if (tr.length && tr[0].results.length) {
      const pose = tr[0].results[0].getPose(refSpace);
      if (pose) {
        surfacePos = new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
      }
    }
  }

  if (!surfacePos && hitTestSource) {
    const results = frame.getHitTestResults(hitTestSource);
    if (results.length) {
      const pose = results[0].getPose(refSpace);
      if (pose) {
        surfacePos = new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
      }
    }
  }

  lastSurfacePos = surfacePos;

  if (surfacePos) {
    reticle.position.copy(surfacePos);
    reticle.visible = true;
  } else {
    reticle.visible = false;
  }

  updateDebugRay(surfacePos);
  updateDebugPlanes(frame, refSpace);
  debugCam.position.copy(camera.position);

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  pathMat.resolution.set(window.innerWidth, window.innerHeight);
});

const enterBtn = ARButton.createButton(renderer, { optionalFeatures: ['hit-test', 'plane-detection', 'dom-overlay'], domOverlay: { root: overlayRoot } });
document.getElementById('enter-ar').appendChild(enterBtn);

function neutralButton(ok, label) {
  enterBtn.removeAttribute('style');
  enterBtn.onmouseenter = null;
  enterBtn.onmouseleave = null;
  enterBtn.textContent = label;
  enterBtn.classList.toggle('ar-off', !ok);
}

if ('xr' in navigator && navigator.xr) {
  navigator.xr.isSessionSupported('immersive-ar').then((ok) => {
    neutralButton(ok, ok ? '  Comenzar Realidad Aumentada' : 'RA no disponible en este dispositivo');
  }).catch(() => {});
} else {
  neutralButton(false, 'Este navegador no soporta RA');
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}