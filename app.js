import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

const ORB = 'rgba(41,255,240,1)';
const PLACE_DIST = 2.2;
const FLOAT_ABOVE = 0.2;
const FLOAT_VEC = new THREE.Vector3(0, FLOAT_ABOVE, 0);

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
let transientSource = null;
let anchored = [];
let placePending = false;

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

function makeBalloon() {
  const ball = new THREE.Sprite(new THREE.SpriteMaterial({ map: ballTex, transparent: true, depthTest: true, depthWrite: false }));
  ball.scale.set(0.35, 0.35, 1);
  scene.add(ball);
  return ball;
}

function placeFree() {
  makeBalloon().position.copy(aimPoint(PLACE_DIST));
  balloons++;
}

function onSelect() {
  placePending = true;
}

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

function onSessionStart() {
  scene.clear();
  scene.add(reticle);
  balloons = 0;
  anchored = [];
  placePending = false;
  hitTestSource = null;
  transientSource = null;
  countEl.textContent = '';
  startEl.classList.add('hidden');
  setupHitTest();
  renderer.xr.getSession().addEventListener('select', onSelect);
}

function onSessionEnd() {
  startEl.classList.remove('hidden');
  countEl.textContent = balloons ? 'Dejaste ' + balloons + ' globo(s) en el aire' : 'Toca la pantalla en RA para dejar globos';
}

renderer.xr.addEventListener('sessionstart', onSessionStart);
renderer.xr.addEventListener('sessionend', onSessionEnd);

renderer.setAnimationLoop(() => {
  if (!renderer.xr.isPresenting) return;
  const frame = renderer.xr.getFrame();
  const refSpace = renderer.xr.getReferenceSpace();

  let surfaceHit = null;
  let surfacePos = null;

  if (transientSource) {
    const tr = frame.getHitTestResultsForTransientInput(transientSource);
    if (tr.length && tr[0].results.length) {
      const pose = tr[0].results[0].getPose(refSpace);
      if (pose) {
        surfaceHit = tr[0].results[0];
        surfacePos = new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
      }
    }
  }

  if (!surfaceHit && hitTestSource) {
    const results = frame.getHitTestResults(hitTestSource);
    if (results.length) {
      const pose = results[0].getPose(refSpace);
      if (pose) {
        surfaceHit = results[0];
        surfacePos = new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
      }
    }
  }

  if (surfacePos) {
    reticle.position.copy(surfacePos);
    reticle.visible = true;
  } else {
    reticle.visible = false;
  }

  if (placePending) {
    placePending = false;
    if (surfaceHit) {
      const ball = makeBalloon();
      ball.position.copy(surfacePos).add(FLOAT_VEC);
      balloons++;
      if (typeof surfaceHit.createAnchor === 'function') {
        surfaceHit.createAnchor().then((anchor) => {
          anchored.push({ anchor, ball });
        }).catch(() => {});
      }
    } else {
      placeFree();
    }
  }

  for (const { anchor, ball } of anchored) {
    const pose = frame.getPose(anchor.anchorSpace, refSpace);
    if (pose) {
      ball.position.set(pose.transform.position.x, pose.transform.position.y + FLOAT_ABOVE, pose.transform.position.z);
    }
  }

  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const enterBtn = ARButton.createButton(renderer, { optionalFeatures: ['hit-test', 'anchors'] });
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