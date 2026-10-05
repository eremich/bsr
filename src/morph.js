import * as THREE from "three";

// A particle field that flows from one shape into the next as `local` goes 0 → 1.
// Shapes are drawn on a 2D canvas and sampled into exactly `count` points.

const SAMPLE = 512;

function samplePoints(draw, count) {
  const c = document.createElement("canvas");
  c.width = c.height = SAMPLE;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  draw(ctx, SAMPLE);
  const data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
  const filled = [];
  for (let y = 0; y < SAMPLE; y += 2) for (let x = 0; x < SAMPLE; x += 2) if (data[(y * SAMPLE + x) * 4 + 3] > 128) filled.push(x, y);
  const out = new Float32Array(count * 2);
  const n = filled.length / 2;
  for (let i = 0; i < count; i++) {
    const k = Math.floor(Math.random() * n) * 2;
    out[i * 2] = (filled[k] + Math.random() * 2) / SAMPLE - 0.5;
    out[i * 2 + 1] = 0.5 - (filled[k + 1] + Math.random() * 2) / SAMPLE;
  }
  return out;
}

// ---------- shapes ----------
const font = (px) => `900 ${px}px Archivo, "Arial Narrow", Arial, sans-serif`;

export const SHAPES = {
  bottle(ctx, s) {
    ctx.beginPath();
    ctx.roundRect(s * 0.44, s * 0.08, s * 0.12, s * 0.07, 6);   // cap
    ctx.moveTo(s * 0.45, s * 0.15);
    ctx.lineTo(s * 0.55, s * 0.15);
    ctx.bezierCurveTo(s * 0.55, s * 0.26, s * 0.66, s * 0.28, s * 0.66, s * 0.4);
    ctx.lineTo(s * 0.66, s * 0.86);
    ctx.quadraticCurveTo(s * 0.66, s * 0.92, s * 0.6, s * 0.92);
    ctx.lineTo(s * 0.4, s * 0.92);
    ctx.quadraticCurveTo(s * 0.34, s * 0.92, s * 0.34, s * 0.86);
    ctx.lineTo(s * 0.34, s * 0.4);
    ctx.bezierCurveTo(s * 0.34, s * 0.28, s * 0.45, s * 0.26, s * 0.45, s * 0.15);
    ctx.fill();
  },
  hoodie(ctx, s) {
    // recycled PET → a fleece hoodie
    ctx.beginPath();
    ctx.moveTo(s * 0.38, s * 0.2);
    ctx.quadraticCurveTo(s * 0.5, s * 0.08, s * 0.62, s * 0.2);  // hood
    ctx.lineTo(s * 0.86, s * 0.32);
    ctx.lineTo(s * 0.92, s * 0.7);
    ctx.lineTo(s * 0.8, s * 0.72);
    ctx.lineTo(s * 0.76, s * 0.46);
    ctx.lineTo(s * 0.74, s * 0.9);
    ctx.lineTo(s * 0.26, s * 0.9);
    ctx.lineTo(s * 0.24, s * 0.46);
    ctx.lineTo(s * 0.2, s * 0.72);
    ctx.lineTo(s * 0.08, s * 0.7);
    ctx.lineTo(s * 0.14, s * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillRect(s * 0.38, s * 0.62, s * 0.24, s * 0.03);               // pocket seam
    ctx.globalCompositeOperation = "source-over";
  },
  zero(ctx, s) {
    ctx.font = font(s * 0.9);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("0", s / 2, s * 0.54);
  },
  count(ctx, s) {
    ctx.font = font(s * 0.36);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("6.400", s / 2, s * 0.52);
  },
  heart(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.86);
    ctx.bezierCurveTo(s * 0.1, s * 0.6, s * 0.08, s * 0.28, s * 0.3, s * 0.2);
    ctx.bezierCurveTo(s * 0.42, s * 0.16, s * 0.5, s * 0.26, s * 0.5, s * 0.32);
    ctx.bezierCurveTo(s * 0.5, s * 0.26, s * 0.58, s * 0.16, s * 0.7, s * 0.2);
    ctx.bezierCurveTo(s * 0.92, s * 0.28, s * 0.9, s * 0.6, s * 0.5, s * 0.86);
    ctx.fill();
  },
};

const vertex = /* glsl */ `
  attribute float aSize;
  uniform float uPixel;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixel * (10.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const fragment = /* glsl */ `
  uniform vec3 uColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(uColor * (1.0 - d * 0.6), 1.0);
  }`;

const smooth = (t) => t * t * (3 - 2 * t);

export function createMorph({ bg, color, shapes, count, scale = 0.62 }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.z = 10;

  const targets = shapes.map((fn) => samplePoints(fn, count));
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const jitter = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    size[i] = 2.6 + Math.random() * 3;
    jitter.set([(Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  const uniforms = { uColor: { value: new THREE.Color(color) }, uPixel: { value: 1 } };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment }));
  points.frustumCulled = false;
  scene.add(points);

  let W = 1, H = 1, cx = 0, cy = 0, unit = 1;
  const pointer = { x: 9999, y: 9999 };

  return {
    scene,
    camera,
    resize(w, h, pixelRatio) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      H = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
      W = H * camera.aspect;
      uniforms.uPixel.value = pixelRatio * (h / 900);
      // desktop: shape sits right of the copy; phones: in the top half
      const wide = w / h > 1.1;
      unit = Math.min(H, W) * scale * (wide ? 1 : 0.85);
      cx = wide ? W * 0.2 : 0;
      cy = wide ? 0 : H * 0.18;
    },
    setPointer(nx, ny) { pointer.x = (nx * W) / 2; pointer.y = (ny * H) / 2; },
    // local: 0..1 across all shapes
    update(t, local, reducedMotion) {
      const seg = Math.min(Math.max(local, 0), 0.9999) * (targets.length - 1);
      const i = Math.floor(seg);
      const f = smooth(Math.min(1, Math.max(0, (seg - i - 0.15) / 0.7)));
      const a = targets[i], b = targets[Math.min(i + 1, targets.length - 1)];
      const burst = Math.sin(f * Math.PI);   // particles scatter mid-morph, then settle
      for (let k = 0; k < count; k++) {
        let x = cx + (a[k * 2] + (b[k * 2] - a[k * 2]) * f) * unit;
        let y = cy + (a[k * 2 + 1] + (b[k * 2 + 1] - a[k * 2 + 1]) * f) * unit;
        let z = 0;
        x += jitter[k * 3] * burst * unit * 0.35;
        y += jitter[k * 3 + 1] * burst * unit * 0.35;
        z += jitter[k * 3 + 2] * burst * 2;
        if (!reducedMotion) {
          x += Math.sin(t * 1.3 + k) * 0.01;
          y += Math.cos(t * 1.1 + k * 0.7) * 0.01;
          // cursor pushes particles aside
          const dx = x - pointer.x, dy = y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 1.2) { const push = (1.2 - d2) * 0.35; x += dx * push; y += dy * push; }
        }
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// a plain colour field (used for the final, orange scene)
export function createPlain(bg) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  return { scene, camera, resize() {}, setPointer() {}, update() {} };
}
