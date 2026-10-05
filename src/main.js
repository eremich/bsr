import * as THREE from "three";
import { createLeaves } from "./leaves.js";
import { createGreen } from "./green.js";
import { createSweep } from "./sweep.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;

const canvas = document.querySelector(".stage");
const sweepZone = document.querySelector("[data-sweep]");
const heroCopy = document.querySelector("[data-scene='a']");
const greenCopy = document.querySelector("[data-scene='b']");

// colours are authored as plain sRGB hex values and composited by hand, so skip colour management
THREE.ColorManagement.enabled = false;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.25 : 1.75));
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const leaves = createLeaves({ count: small ? 220 : 520 });
const green = createGreen({ count: small ? 90 : 180 });
const sweep = createSweep();

const rtOptions = { samples: 4 };
const rtA = new THREE.WebGLRenderTarget(1, 1, rtOptions);
const rtB = new THREE.WebGLRenderTarget(1, 1, rtOptions);
sweep.uniforms.tA.value = rtA.texture;
sweep.uniforms.tB.value = rtB.texture;

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
  leaves.resize(w, h);
  green.resize(w, h);
}
resize();
window.addEventListener("resize", resize);

// ---------- scroll → sweep progress ----------
const smooth = (t) => t * t * (3 - 2 * t);
let target = 0;
let progress = 0;
function readScroll() {
  const r = sweepZone.getBoundingClientRect();
  const span = r.height - window.innerHeight;
  target = Math.min(Math.max(-r.top / span, 0), 1);
}
readScroll();
window.addEventListener("scroll", readScroll, { passive: true });

// ---------- cursor = wind ----------
let last = null;
window.addEventListener("pointermove", (e) => {
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = -((e.clientY / window.innerHeight) * 2 - 1);
  const now = performance.now();
  if (last) {
    const dt = Math.max((now - last.t) / 1000, 0.008);
    leaves.setPointer(nx, ny, (nx - last.x) / dt, (ny - last.y) / dt);
  }
  last = { x: nx, y: ny, t: now };
}, { passive: true });

// ---------- loop ----------
const timer = new THREE.Timer();
function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  const t = timer.getElapsed();
  // ease toward the scroll position so the brush glides instead of jumping
  progress += (target - progress) * (reducedMotion ? 1 : Math.min(1, dt * 6));
  const p = progress < 0.001 ? 0 : progress > 0.999 ? 1 : progress;

  const sweeping = p > 0 && p < 1;
  // the brush line in leaf-world coordinates
  const front = sweeping
    ? (y) => {
        const yUnit = y / leaves.height + 0.5;
        return (sweep.frontAt(yUnit, p, aspect) / aspect - 0.5) * leaves.width;
      }
    : null;

  if (p < 1) {
    leaves.update(dt, t, front, reducedMotion);
    renderer.setRenderTarget(rtA);
    renderer.render(leaves.scene, leaves.camera);
  }
  if (p > 0) {
    green.update(t, reducedMotion);
    renderer.setRenderTarget(rtB);
    renderer.render(green.scene, green.camera);
  }
  sweep.uniforms.uProgress.value = p;
  sweep.uniforms.uTime.value = t;
  renderer.setRenderTarget(null);
  renderer.render(sweep.scene, sweep.camera);

  // copy follows the brush: hero text leaves as it's swept, green text arrives behind it
  heroCopy.style.opacity = String(1 - smooth(Math.min(p * 2.2, 1)));
  heroCopy.style.transform = `translateX(${p * 18}vw)`;
  greenCopy.style.opacity = String(smooth(Math.max(0, (p - 0.55) / 0.45)));
  greenCopy.style.transform = `translateY(${(1 - Math.min(1, p / 0.9)) * 24}px)`;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
