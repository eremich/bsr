import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildTruck } from "./truck.js";

const BG = new THREE.Color("#0e0f11");
const DESKTOP_DPR = 1.75;
const MOBILE_DPR = 1.25;
const LIFT_ANGLE = -2.1;
const DRAG_SPEED = 0.006;
const DRAG_FRICTION = 0.92;
const PARALLAX_YAW = 0.12;
const PARALLAX_LIFT = 0.45;
const CALLOUT_RANGE = 0.32;
const H_FOV = 52;
const MOBILE_LIFT = 0.26; // phones: model sits in the top part, copy below
const MAX_V_FOV = 72;

// one camera stop per chapter: [position, look-at target]
const STOPS = [
  [[13.5, 3.8, 13.5], [-0.4, 1.6, 0]], // 0 hero
  [[11.5, 3.2, 7.5], [4.0, 1.8, 0]],   // 1 cab
  [[-13.5, 3.0, 6.5], [-5.4, 1.7, 0]], // 2 lifter
  [[-0.5, 9.5, 9.5], [-4.0, 2.4, 0]],  // 3 press
  [[1.5, 1.1, 8.0], [-2.6, 0.7, 0.6]],  // 4 drive
  [[13, 5, -12], [-0.4, 1.6, 0]],      // 5 end
];
const CHAPTER_ANCHOR = { 1: "cab", 2: "lifter", 3: "press", 4: "drive" };

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(Math.max(t, 0), 1);

export function createStage(canvas, { reducedMotion, onProgress }) {
  const isSmall = window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSmall ? MOBILE_DPR : DESKTOP_DPR));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 16, 36);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  // studio: soft key from above, cool rim from behind, warm kicker low
  const key = new THREE.SpotLight("#ffffff", 900, 60, 0.55, 0.9, 1.6);
  key.position.set(6, 16, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(isSmall ? 1024 : 2048, isSmall ? 1024 : 2048);
  key.shadow.bias = -0.0004;
  key.shadow.radius = 6;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight("#bcd4ff", 2.2);
  rim.position.set(-12, 7, -10);
  const kicker = new THREE.PointLight("#ff7a2a", 10, 8, 2);
  kicker.position.set(0, 0.5, 3.4);
  scene.add(rim, kicker, new THREE.HemisphereLight("#2a2c30", "#050506", 0.6));

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64),
    new THREE.MeshStandardMaterial({ color: "#0f1012", roughness: 0.78, metalness: 0.15 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const { truck, lifter, beacons, anchors } = buildTruck();
  scene.add(truck);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 120);
  const state = {
    progress: 0,
    pointer: new THREE.Vector2(),
    look: new THREE.Vector2(),
    spin: 0,
    spinVel: 0,
    dragging: false,
  };

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep a constant horizontal field of view so the truck fits any aspect ratio
    const vfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(H_FOV / 2)) / camera.aspect);
    camera.fov = Math.min(THREE.MathUtils.radToDeg(vfov), MAX_V_FOV);
    // desktop: push the truck right of the copy column; phones: push it up above the text
    if (w >= 900) camera.setViewOffset(w, h, -w * 0.16, 0, w, h);
    else camera.setViewOffset(w, h, 0, h * MOBILE_LIFT, w, h);
    camera.updateProjectionMatrix();
  }

  const posA = new THREE.Vector3(), posB = new THREE.Vector3();
  const tgtA = new THREE.Vector3(), tgtB = new THREE.Vector3();
  const target = new THREE.Vector3();
  const offset = new THREE.Vector3();

  function placeCamera(t) {
    const last = STOPS.length - 1;
    const p = Math.min(Math.max(state.progress, 0), last);
    const i = Math.min(Math.floor(p), last - 1);
    // hold at each stop, travel in between
    const f = reducedMotion ? Math.round(p - i) : smooth(clamp01((p - i - 0.2) / 0.6));
    posA.fromArray(STOPS[i][0]); posB.fromArray(STOPS[i + 1][0]);
    tgtA.fromArray(STOPS[i][1]); tgtB.fromArray(STOPS[i + 1][1]);
    camera.position.lerpVectors(posA, posB, f);
    target.lerpVectors(tgtA, tgtB, f);

    if (!reducedMotion) {
      // decorative parallax around the target, eased toward the pointer
      state.look.lerp(state.pointer, 0.05);
      offset.subVectors(camera.position, target).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -state.look.x * PARALLAX_YAW);
      camera.position.copy(target).add(offset);
      camera.position.y += state.look.y * PARALLAX_LIFT + Math.sin(t * 0.6) * 0.04;
    }
    camera.lookAt(target);
  }

  function animateParts(t) {
    // bin lifts during the lifter chapter, holds, then returns
    const p = state.progress;
    const up = smooth(clamp01((p - 1.55) / 0.55)) * (1 - smooth(clamp01((p - 2.55) / 0.45)));
    lifter.rotation.z = up * LIFT_ANGLE;
    beacons.forEach((b, i) => {
      b.material.emissiveIntensity = reducedMotion ? 1.2 : 0.6 + Math.max(0, Math.sin(t * 6 + i * Math.PI)) * 2.4;
    });
    // free spin from dragging, settling back as you scroll away from the hero
    if (!state.dragging) state.spinVel *= DRAG_FRICTION;
    state.spin += state.spinVel;
    if (state.progress > 0.3) state.spin *= 0.94;
    truck.rotation.y = state.spin;
  }

  const projected = new THREE.Vector3();
  function project(name) {
    projected.copy(anchors[name]).applyAxisAngle(THREE.Object3D.DEFAULT_UP, truck.rotation.y).project(camera);
    return [(projected.x * 0.5 + 0.5) * window.innerWidth, (-projected.y * 0.5 + 0.5) * window.innerHeight, projected.z < 1];
  }

  const timer = new THREE.Timer();
  function frame() {
    timer.update();
    const t = timer.getElapsed();
    animateParts(t);
    placeCamera(t);
    renderer.render(scene, camera);
    onProgress?.(state.progress, (chapter) => {
      const name = CHAPTER_ANCHOR[chapter];
      if (!name || Math.abs(state.progress - chapter) > CALLOUT_RANGE) return null;
      return project(name);
    });
  }

  // ---------- input ----------
  if (!reducedMotion) {
    window.addEventListener("pointermove", (e) => {
      state.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    }, { passive: true });
    let lastX = 0;
    canvas.addEventListener("pointerdown", (e) => {
      if (state.progress > 0.3) return;
      state.dragging = true;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add("is-dragging");
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!state.dragging) return;
      state.spinVel = (e.clientX - lastX) * DRAG_SPEED;
      lastX = e.clientX;
    });
    const stop = () => { state.dragging = false; canvas.classList.remove("is-dragging"); };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
  }

  resize();
  window.addEventListener("resize", resize);
  renderer.setAnimationLoop(frame);

  return {
    setProgress(p) { state.progress = p; },
    chapters: STOPS.length,
  };
}
