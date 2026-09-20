import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

const LS = 'argps.v1';

const ORB = 'rgba(41,255,240,1)';
const PLACE_DIST = 2.2;
const FLOAT_ABOVE = 0.2;
const LABEL_GAP = 0.32;
const LABEL_H = 0.11;

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
const APP_VERSION = '0.6.4';

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
let placePending = false;
let selectGuardUntil = 0;
let labelWaiting = null;
let pendingBalloonPos = null;
let armReticle = false;

/* ---------------- persistencia (los globos vuelven al entrar) ---------------- */

let balloonsList = loadBalloons();

function loadBalloons() {
  try {
    const v = JSON.parse(localStorage.getItem(LS));
    if (v && Array.isArray(v)) return v.filter((b) => b && typeof b.name === 'string' && Number.isFinite(b.x) && Number.isFinite(b.z));
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

function restoreBalloons() {
  for (const b of balloonsList) {
    const group = makeBallGroup();
    group.position.set(b.x, b.y ?? FLOAT_ABOVE, b.z);
    balloons++;
    const label = makeLabelSprite(b.name || 'Globo ' + balloons);
    label.position.y = FLOAT_ABOVE - LABEL_GAP;
    group.add(label);
  }
}

function orbTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(48, 44, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, ORB);
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

const ballTex = orbTexture();

function aimPoint(dist) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  return camera.position.clone().add(dir.multiplyScalar(dist));
}

function aimAtSquare(dist) {
  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const tanHalf = Math.tan(vFov / 2);
  const pitch = Math.atan(0.5 * tanHalf);
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const finalDir = dir.clone().applyAxisAngle(right, pitch).normalize();
  return camPos.clone().add(finalDir.multiplyScalar(dist));
}

function squarePx() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const sq = Math.min(0.88 * w, 0.44 * h);
  const left = (w - sq) / 2;
  const top = (h / 2 - sq) / 2;
  return { left, top, sq };
}

function applySquareScissor() {
  const { left, top, sq } = squarePx();
  const y = window.innerHeight - top - sq;
  renderer.setScissorTest(true);
  renderer.setViewport(left, y, sq, sq);
  renderer.setScissor(left, y, sq, sq);
}

function clearSquareScissor() {
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
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

function applyLabel(spr, text) {
  const tex = textSpriteTexture(text);
  spr.material.map = tex;
  spr.material.needsUpdate = true;
  spr.scale.x = LABEL_H * (tex.image.width / tex.image.height);
}

function makeBallGroup() {
  const group = new THREE.Group();
  const ball = new THREE.Sprite(new THREE.SpriteMaterial({ map: ballTex, transparent: true, depthTest: true, depthWrite: false }));
  ball.scale.set(0.35, 0.35, 1);
  ball.position.y = FLOAT_ABOVE;
  group.add(ball);
  scene.add(group);
  return group;
}

function placeLabel(surfacePos) {
  const group = makeBallGroup();
  group.position.copy(surfacePos);
  balloons++;
  const label = makeLabelSprite('Globo ' + balloons);
  label.position.y = FLOAT_ABOVE - LABEL_GAP;
  group.add(label);
  labelWaiting = label;
  pendingBalloonPos = group.position.clone();
  nameOverlay.classList.remove('hidden');
  nameInput.value = 'Globo ' + balloons;
  nameInput.focus();
  nameInput.select();
}

function placeFree() {
  const group = makeBallGroup();
  group.position.copy(aimAtSquare(PLACE_DIST));
  balloons++;
  const label = makeLabelSprite('Globo ' + balloons);
  label.position.y = FLOAT_ABOVE - LABEL_GAP;
  group.add(label);
  labelWaiting = label;
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
        name,
        x: pendingBalloonPos.x,
        y: pendingBalloonPos.y,
        z: pendingBalloonPos.z
      });
      pendingBalloonPos = null;
      saveBalloons();
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

function onSelect() {
  if (Date.now() < selectGuardUntil) return;
  if (!nameOverlay.classList.contains('hidden')) return;
  if (!armReticle) return;
  placePending = true;
}

document.getElementById('btn-add').addEventListener('click', () => {
  if (!renderer.xr.isPresenting) return;
  armReticle = true;
  toast('Apunta a una superficie y toca la pantalla para dejar el globo');
});

async function setupHitTest() {
  try {
    const session = renderer.xr.getSession();
    const viewer = await session.requestReferenceSpace('viewer');
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const dy = 0.5 * tanHalf;
    const len = Math.hypot(0, dy, 1);
    const offsetRay = new XRRay(
      new DOMPointReadOnly(0, 0, 0, 1),
      new DOMPointReadOnly(0, dy / len, -1 / len, 0)
    );
    hitTestSource = await session.requestHitTestSource({ space: viewer, offsetRay });
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
  const to = surfacePos || aimAtSquare(PLACE_DIST);
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
  placePending = false;
  armReticle = false;
  hitTestSource = null;
  transientSource = null;
  labelWaiting = null;
  pendingBalloonPos = null;
  restoreBalloons();
  hideNamePrompt();
  countEl.textContent = '';
  startEl.classList.add('hidden');
  setupHitTest();
  renderer.xr.getSession().addEventListener('select', onSelect);
}

function onSessionEnd() {
  clearSquareScissor();
  startEl.classList.remove('hidden');
  countEl.textContent = balloons ? 'Dejaste ' + balloons + ' etiqueta(s) en el aire' : 'Toca la pantalla en RA para dejar etiquetas';
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

  if (armReticle && surfacePos) {
    reticle.position.copy(surfacePos);
    reticle.visible = true;
  } else {
    reticle.visible = false;
  }

  updateDebugRay(surfacePos);
  updateDebugPlanes(frame, refSpace);
  debugCam.position.copy(camera.position);

  if (placePending) {
    placePending = false;
    armReticle = false;
    if (surfacePos) {
      placeLabel(surfacePos);
    } else {
      placeFree();
    }
  }

  applySquareScissor();
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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