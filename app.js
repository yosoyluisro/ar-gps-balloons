import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

const ORB = 'rgba(41,255,240,1)';
const PLACE_DIST = 2.2;

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearAlpha(0);
renderer.xr.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);

const startEl = document.getElementById('overlay-start');
const countEl = document.getElementById('count');
let balloons = 0;

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
const balls = [];

function aimPoint(dist) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  return camera.position.clone().add(dir.multiplyScalar(dist));
}

function placeBalloon(e) {
  const ball = new THREE.Sprite(new THREE.SpriteMaterial({ map: ballTex, transparent: true, depthTest: true, depthWrite: false }));
  ball.position.copy(aimPoint(PLACE_DIST));
  ball.scale.set(0.35, 0.35, 1);
  scene.add(ball);
  const item = { sprite: ball, anchor: null };
  balls.push(item);
  balloons++;

  const frame = renderer.xr.getFrame() || e.frame;
  if (frame && frame.createAnchor && renderer.xr.getReferenceSpace()) {
    frame.createAnchor(
      new XRRigidTransform({ x: ball.position.x, y: ball.position.y, z: ball.position.z }, { x: 0, y: 0, z: 0, w: 1 }),
      renderer.xr.getReferenceSpace()
    ).then((anchor) => {
      item.anchor = anchor;
    }).catch(() => {});
  }
}

const reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture(), transparent: true, depthTest: false, depthWrite: false }));
reticle.scale.set(0.28, 0.28, 1);

function onSessionStart() {
  scene.clear();
  scene.add(reticle);
  balls.length = 0;
  balloons = 0;
  countEl.textContent = '';
  startEl.classList.add('hidden');
  renderer.xr.getSession().addEventListener('select', placeBalloon);
}

function onSessionEnd() {
  startEl.classList.remove('hidden');
  countEl.textContent = balloons ? 'Dejaste ' + balloons + ' globo(s) en el aire' : 'Toca la pantalla en RA para dejar globos';
}

renderer.xr.addEventListener('sessionstart', onSessionStart);
renderer.xr.addEventListener('sessionend', onSessionEnd);

renderer.setAnimationLoop((time, frame) => {
  if (!renderer.xr.isPresenting) return;
  reticle.position.copy(aimPoint(PLACE_DIST));
  if (frame && renderer.xr.getReferenceSpace()) {
    const ref = renderer.xr.getReferenceSpace();
    for (const item of balls) {
      if (!item.anchor || !frame.trackedAnchors || !frame.trackedAnchors.has(item.anchor)) continue;
      const pose = frame.getPose(item.anchor.anchorSpace, ref);
      if (pose) {
        const t = pose.transform.position;
        item.sprite.position.set(t.x, t.y, t.z);
      }
    }
  }
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const enterBtn = ARButton.createButton(renderer, { optionalFeatures: ['anchors'] });
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