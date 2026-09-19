import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

const ORB = 'rgba(41,255,240,1)';
const PLACE_DIST = 2.2;
const FLOAT_ABOVE = 0.2;

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
let balloons = 0;

let hitTestSource = null;
let lastHit = null;

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

function placeBalloon() {
  const ball = new THREE.Sprite(new THREE.SpriteMaterial({ map: ballTex, transparent: true, depthTest: true, depthWrite: false }));
  const p = lastHit ? lastHit.clone().add(new THREE.Vector3(0, FLOAT_ABOVE, 0)) : aimPoint(PLACE_DIST);
  ball.position.copy(p);
  ball.scale.set(0.35, 0.35, 1);
  scene.add(ball);
  balloons++;
}

const reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture(), transparent: true, depthTest: false, depthWrite: false }));
reticle.scale.set(0.28, 0.28, 1);
reticle.visible = false;

async function setupHitTest() {
  try {
    const session = renderer.xr.getSession();
    const viewer = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: viewer });
  } catch {
    hitTestSource = null;
  }
}

function onSessionStart() {
  scene.clear();
  scene.add(reticle);
  balloons = 0;
  lastHit = null;
  hitTestSource = null;
  countEl.textContent = '';
  startEl.classList.add('hidden');
  setupHitTest();
  renderer.xr.getSession().addEventListener('select', placeBalloon);
}

function onSessionEnd() {
  startEl.classList.remove('hidden');
  countEl.textContent = balloons ? 'Dejaste ' + balloons + ' globo(s) en el aire' : 'Toca la pantalla en RA para dejar globos';
}

renderer.xr.addEventListener('sessionstart', onSessionStart);
renderer.xr.addEventListener('sessionend', onSessionEnd);

renderer.setAnimationLoop(() => {
  if (!renderer.xr.isPresenting) return;
  if (hitTestSource) {
    const results = renderer.xr.getFrame().getHitTestResults(hitTestSource);
    if (results.length) {
      const pose = results[0].getPose(renderer.xr.getReferenceSpace());
      lastHit = new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
      reticle.position.copy(lastHit);
      reticle.visible = true;
    } else {
      reticle.visible = false;
    }
  } else {
    lastHit = null;
    reticle.position.copy(aimPoint(PLACE_DIST));
    reticle.visible = true;
  }
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const enterBtn = ARButton.createButton(renderer, { optionalFeatures: ['hit-test'] });
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
    neutralButton(ok, ok ? '▶  Comenzar Realidad Aumentada' : 'RA no disponible en este dispositivo');
  }).catch(() => {});
} else {
  neutralButton(false, 'Este navegador no soporta RA');
}