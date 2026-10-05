import * as THREE from "three";

// Scene A: Berlin autumn. Instanced 3D leaves drift, flutter and react to the cursor as wind.
// The sweep front (from the transition) physically pushes leaves ahead of the brush.

const BG = "#141416";
const COLORS = ["#ff6a1f", "#f2661b", "#ff8a2a", "#e0521a", "#ffb02e", "#c9461a", "#8f3a17"];
const GRAVITY = -0.35;
const AIR = 0.985;
const WIND_RADIUS = 2.2;
const WIND_FORCE = 9;
const BRUSH_PUSH = 14;

const leafVertex = /* glsl */ `
  attribute vec3 aColor;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vShade;
  void main() {
    vUv = uv;
    vColor = aColor;
    // flat leaves flip as they spin: shade by how much they face the camera
    vec3 n = normalize(mat3(modelViewMatrix * instanceMatrix) * vec3(0.0, 0.0, 1.0));
    vShade = 0.45 + 0.55 * abs(n.z);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }`;

const leafFragment = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vShade;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    // leaf silhouette: pointed ellipse with a small stem
    float body = 1.0 - smoothstep(0.92, 1.0, length(vec2(p.x * 1.55, p.y)) + abs(p.y) * 0.18 * (1.0 - abs(p.x)));
    float stem = step(abs(p.x), 0.035) * step(p.y, -0.85) * step(-1.0, p.y);
    float a = max(body, stem);
    if (a < 0.5) discard;
    float vein = 1.0 - smoothstep(0.0, 0.05, abs(p.x)) * 1.0;
    float side = 1.0 - smoothstep(0.0, 0.04, abs(p.y + abs(p.x) * 0.9 - 0.25));
    vec3 col = vColor * vShade * (1.0 - 0.18 * max(vein, side * 0.6));
    gl_FragColor = vec4(col, 1.0);
  }`;

export function createLeaves({ count }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.z = 10;

  const geo = new THREE.PlaneGeometry(0.34, 0.5);
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    c.set(COLORS[i % COLORS.length]);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("aColor", new THREE.InstancedBufferAttribute(colors, 3));
  const mat = new THREE.ShaderMaterial({ vertexShader: leafVertex, fragmentShader: leafFragment, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  scene.add(mesh);

  let W = 1, H = 1;
  const leaves = [];
  const dummy = new THREE.Object3D();

  function spawn(l, anywhere) {
    l.x = (Math.random() - 0.5) * W;
    l.y = anywhere ? (Math.random() - 0.5) * H : H / 2 + Math.random() * H * 0.4;
    l.z = (Math.random() - 0.5) * 3;
    l.vx = (Math.random() - 0.5) * 0.4;
    l.vy = -Math.random() * 0.3;
    l.rx = Math.random() * 6; l.ry = Math.random() * 6; l.rz = Math.random() * 6;
    l.wx = (Math.random() - 0.5) * 3; l.wy = (Math.random() - 0.5) * 3; l.wz = (Math.random() - 0.5) * 2;
    l.s = 0.7 + Math.random() * 0.7;
    l.swept = false;
  }
  for (let i = 0; i < count; i++) leaves.push({});
  let seeded = false;

  const pointer = { x: 0, y: 0, vx: 0, vy: 0, active: false };

  return {
    scene,
    camera,
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      H = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
      W = H * camera.aspect;
      // scatter the leaves only once the real screen size is known
      if (!seeded) { leaves.forEach((l) => spawn(l, true)); seeded = true; }
    },
    // pointer in normalised device coords, velocity in NDC / s
    setPointer(nx, ny, vx, vy) {
      pointer.x = (nx * W) / 2; pointer.y = (ny * H) / 2;
      pointer.vx = (vx * W) / 2; pointer.vy = (vy * H) / 2;
      pointer.active = true;
    },
    // front: x position (world) of the sweep line at a given y; null when no sweep
    update(dt, t, front, reducedMotion) {
      const floor = -H / 2 + 0.15;
      for (let i = 0; i < count; i++) {
        const l = leaves[i];
        if (!reducedMotion) {
          // drifting autumn wind
          l.vx += Math.sin(t * 0.6 + l.y * 0.7 + i) * 0.25 * dt;
          l.vy += GRAVITY * dt * l.s * 0.6;
          // cursor = gust of wind along its motion, with a little swirl
          if (pointer.active) {
            const dx = l.x - pointer.x, dy = l.y - pointer.y;
            const d = Math.hypot(dx, dy);
            if (d < WIND_RADIUS) {
              const k = (1 - d / WIND_RADIUS) * WIND_FORCE * dt;
              l.vx += pointer.vx * k * 0.12 + (-dy / (d + 0.1)) * k * 0.3;
              l.vy += pointer.vy * k * 0.12 + (dx / (d + 0.1)) * k * 0.3;
              l.wx += k * 4; l.wz += k * 3;
            }
          }
        }
        // the brush: anything behind the sweep line gets shoved forward and up
        if (front) {
          const fx = front(l.y);
          if (l.x < fx + 0.25) {
            l.vx = Math.max(l.vx, BRUSH_PUSH * 0.12 + Math.random() * 0.5);
            l.vy += (Math.random() - 0.3) * BRUSH_PUSH * dt;
            l.x = Math.max(l.x, fx + 0.1);
            l.wx += 10 * dt; l.wz += 8 * dt;
            l.swept = true;
          }
        }
        l.vx *= AIR; l.vy *= AIR;
        l.x += l.vx * dt; l.y += l.vy * dt;
        l.rx += l.wx * dt; l.ry += l.wy * dt; l.rz += l.wz * dt;
        l.wx *= 0.99; l.wz *= 0.99;
        if (l.y < floor) { l.y = floor; l.vy = 0; l.vx *= 0.9; l.wx *= 0.8; l.wz *= 0.8; }
        // leaves that blow off-screen come back from the top (unless the street was just swept)
        const out = l.x > W / 2 + 1 || l.x < -W / 2 - 1 || l.y > H / 2 + 2;
        if (out && !front) spawn(l, false);
        dummy.position.set(l.x, l.y, l.z);
        dummy.rotation.set(l.rx, l.ry, l.rz);
        dummy.scale.setScalar(l.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      pointer.vx *= 0.85; pointer.vy *= 0.85;
    },
    get width() { return W; },
    get height() { return H; },
  };
}
