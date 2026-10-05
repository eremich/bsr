import * as THREE from "three";
import { createLeaves } from "./leaves.js";
import { createGreen } from "./green.js";
import { createMorph, createPlain, SHAPES } from "./morph.js";
import { createSweep } from "./sweep.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;

// The page is a strip of scroll segments: hold a scene, then sweep to the next one.
// Heights are in vh. Sweeps alternate direction.
const SEGMENTS = [
  { type: "hold", scene: 0, vh: 2 },      // near zero: the very first wheel notch already moves the brush
  { type: "sweep", from: 0, to: 1, vh: 160 },
  { type: "hold", scene: 1, vh: 80 },
  { type: "sweep", from: 1, to: 2, vh: 160 },
  { type: "hold", scene: 2, vh: 220 },   // bottle → hoodie → 0
  { type: "sweep", from: 2, to: 3, vh: 160 },
  { type: "hold", scene: 3, vh: 180 },   // 6.400 → heart
  { type: "sweep", from: 3, to: 4, vh: 160 },
  { type: "hold", scene: 4, vh: 100 },
];

const smooth = (t) => t * t * (3 - 2 * t);
// cream and orange backgrounds need dark UI; on orange the orange logo/button go dark too
const TONES = { 2: "light", 4: "orange" };
const clamp01 = (t) => Math.min(Math.max(t, 0), 1);

// ---------- DOM ----------
const canvas = document.querySelector(".stage");
const track = document.querySelector("[data-track]");
const copies = [...document.querySelectorAll("[data-scene]")];
const scrollCue = document.querySelector("[data-scroll-cue]");
// + one extra screen: the last scroll position is a full viewport above the page end
track.innerHTML = SEGMENTS.map((s) => `<div style="height:${s.vh}svh"></div>`).join("") + `<div style="height:100svh"></div>`;

// colours are authored as plain sRGB hex values and composited by hand, so skip colour management
THREE.ColorManagement.enabled = false;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.25 : 1.75));
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const rtA = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
const rtB = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
const sweep = createSweep();
sweep.uniforms.tA.value = rtA.texture;
sweep.uniforms.tB.value = rtB.texture;

// shapes are drawn with the web font, so wait for it before sampling
await document.fonts.ready;
const leaves = createLeaves({ count: small ? 100 : 220, drops: small ? 120 : 300 });
const scenes = [
  leaves,
  createGreen({ count: small ? 90 : 180 }),
  createMorph({ bg: "#efe9df", color: "#f2661b", shapes: [SHAPES.bottle, SHAPES.hoodie, SHAPES.zero], count: small ? 2600 : 5200 }),
  createMorph({ bg: "#141416", color: "#ff6a1f", shapes: [SHAPES.count, SHAPES.heart], count: small ? 3200 : 6400, scale: 0.8 }),
  createPlain("#f2661b"),
];

let aspect = 1;
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  const dpr = renderer.getPixelRatio();
  rtA.setSize(w * dpr, h * dpr);
  rtB.setSize(w * dpr, h * dpr);
  aspect = w / h;
  sweep.setAspect(aspect);
  scenes.forEach((s) => s.resize(w, h, dpr));
}
resize();
window.addEventListener("resize", resize);

// ---------- scroll → state ----------
const vhTotal = SEGMENTS.reduce((a, s) => a + s.vh, 0);
let targetVh = 0;
let currentVh = 0;
const readScroll = () => { targetVh = (window.scrollY / window.innerHeight) * 100; };
readScroll();
window.addEventListener("scroll", readScroll, { passive: true });

function stateAt(vh) {
  let acc = 0;
  let sweeps = 0;
  for (let i = 0; i < SEGMENTS.length; i++) {
    const s = SEGMENTS[i];
    if (vh < acc + s.vh || i === SEGMENTS.length - 1) return { ...s, local: clamp01((vh - acc) / s.vh), index: sweeps };
    if (s.type === "sweep") sweeps++;
    acc += s.vh;
  }
  return null;
}

// ---------- cursor ----------
let last = null;
window.addEventListener("pointermove", (e) => {
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = -((e.clientY / window.innerHeight) * 2 - 1);
  const now = performance.now();
  if (last) {
    const dt = Math.max((now - last.t) / 1000, 0.008);
    leaves.setPointer(nx, ny, (nx - last.x) / dt, (ny - last.y) / dt);
  }
  scenes.forEach((s, i) => { if (i > 0) s.setPointer(nx, ny); });
  last = { x: nx, y: ny, t: now };
}, { passive: true });

// ---------- copy layers follow the brush ----------
function copyVisibility(st) {
  return copies.map((_, i) => {
    if (st.type === "hold") return st.scene === i ? 1 : 0;
    if (st.from === i) return 1 - smooth(Math.min(st.local * 2.2, 1));
    if (st.to === i) return smooth(clamp01((st.local - 0.55) / 0.45));
    return 0;
  });
}

// ---------- loop ----------
const timer = new THREE.Timer();
function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  const t = timer.getElapsed();
  currentVh += (Math.min(targetVh, vhTotal) - currentVh) * (reducedMotion ? 1 : Math.min(1, dt * 6));
  const st = stateAt(currentVh);

  // morph progress inside a hold; fully formed on either side of it
  const localFor = (i) => {
    if (st.type === "hold" && st.scene === i) return st.local;
    if (st.type === "sweep" && st.from === i) return 1;
    return 0;
  };

  const render = (i, target) => {
    const s = scenes[i];
    if (s === leaves) {
      let front = null;
      if (st.type === "sweep" && st.from === 0 && st.local > 0.001 && st.local < 0.999) {
        front = (y) => (sweep.frontAt(y / leaves.height + 0.5, st.local, aspect) / aspect - 0.5) * leaves.width;
      }
      leaves.update(dt, t, front, reducedMotion);
    } else {
      s.update(t, localFor(i), reducedMotion);
    }
    renderer.setRenderTarget(target);
    renderer.render(s.scene, s.camera);
  };

  if (st.type === "hold") {
    render(st.scene, rtA);
    sweep.uniforms.uProgress.value = 0;
  } else {
    render(st.from, rtA);
    render(st.to, rtB);
    sweep.uniforms.uProgress.value = st.local;
    sweep.uniforms.uDir.value = st.index % 2 === 0 ? 1 : -1;
  }
  sweep.uniforms.uTime.value = t;
  renderer.setRenderTarget(null);
  renderer.render(sweep.scene, sweep.camera);

  scrollCue.classList.toggle("is-gone", targetVh > 3);
  const shown = st.type === "hold" ? st.scene : st.local > 0.5 ? st.to : st.from;
  document.body.dataset.tone = TONES[shown] || "dark";

  copyVisibility(st).forEach((v, i) => {
    const el = copies[i];
    el.style.opacity = v.toFixed(3);
    el.style.transform = `translateY(${((1 - v) * 24).toFixed(1)}px)`;
    el.classList.toggle("is-live", v > 0.6);
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
