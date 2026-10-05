import * as THREE from "three";

// Scene A: Berlin autumn. Instanced 3D leaves drift, flutter and react to the cursor as wind.
// The sweep front (from the transition) physically pushes leaves ahead of the brush.

const BG = "#141416";
const COLORS = ["#ff6a1f", "#f2661b", "#ff8a2a", "#e0521a", "#ffb02e", "#c9461a", "#8f3a17"];
const GRAVITY = -0.75;          // wet leaves: heavier, less floaty
const AIR = 0.985;
const WIND_RADIUS = 2.2;
const WIND_FORCE = 9;
const BRUSH_PUSH = 14;
// light Berlin drizzle: thin slanted streaks, pushed by the same cursor wind
const RAIN_SPEED = 5.5;          // a drizzle, not a downpour
const RAIN_SLANT = 0.6;
const RAIN_STREAK = 0.03;   // streak length in seconds of travel
// shared gusts: every few seconds the wind picks up and bends rain and leaves together
const GUST_PERIOD = 0.55;
const GUST_STRENGTH = 2.2;
const gustAt = (t) => Math.pow(Math.max(0, Math.sin(t * GUST_PERIOD)), 6) * GUST_STRENGTH;
const GUST_DECAY = 0.96;

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

// Berlin TV tower (Fernsehturm) silhouette, height normalised to 1 (real: 368 m).
const TOWER_DEPTH = 5;          // sits behind the leaves
const TOWER_HEIGHT = 0.97;      // share of the screen height at that depth


// dark against the warm haze at the foot, a touch lighter than the night sky at the top
const towerMaterial = (lift = 0) => new THREE.ShaderMaterial({
  vertexShader: `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `varying float vY;
    void main(){
      vec3 low = vec3(0.04, 0.04, 0.045);
      vec3 high = vec3(0.2, 0.2, 0.23) + ${lift.toFixed(2)};
      gl_FragColor = vec4(mix(low, high, smoothstep(0.3, 0.75, vY)), 1.0);
    }`,
});

function buildTower() {
  const g = new THREE.Group();
  const mat = towerMaterial();
  const poly = (pts, m = mat) => {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    return new THREE.Mesh(new THREE.ShapeGeometry(shape), m);
  };
  // tapering concrete shaft with a wider foot
  g.add(poly([[-0.04, 0], [0.04, 0], [0.03, 0.05], [0.015, 0.54], [-0.015, 0.54], [-0.03, 0.05]]));
  // the sphere, slightly lighter, with the dark window band
  const sphereGeo = new THREE.CircleGeometry(0.046, 64);
  sphereGeo.translate(0, 0.575, 0);   // keep y in tower space so the gradient lines up
  const sphere = new THREE.Mesh(sphereGeo, towerMaterial(0.05));
  const band = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.008), new THREE.MeshBasicMaterial({ color: "#121215" }));
  band.position.set(0, 0.57, 0.001);
  g.add(sphere, band);
  // upper shaft and the red-and-white antenna
  g.add(poly([[-0.01, 0.6], [0.01, 0.6], [0.008, 0.69], [-0.008, 0.69]]));
  g.add(poly([[-0.004, 0.69], [0.004, 0.69], [0.003, 0.99], [-0.003, 0.99]]));
  const bandMat = new THREE.MeshBasicMaterial({ color: "#3a2a2a" });
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.025), bandMat);
    b.position.set(0, 0.8 + i * 0.05, 0.001);
    g.add(b);
  }
  // aviation light on top, blinks
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.006, 16), new THREE.MeshBasicMaterial({ color: "#ff2a1a", transparent: true }));
  lamp.position.set(0, 0.995, 0.002);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.03, 32), new THREE.MeshBasicMaterial({ color: "#ff2a1a", transparent: true, opacity: 0.25, depthWrite: false }));
  glow.position.copy(lamp.position);
  g.add(glow, lamp);
  return { group: g, lamp, glow };
}

export function createLeaves({ count, drops = 0 }) {
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

  const tower = buildTower();
  // warm city glow along the horizon, so the tower stands out against it
  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv;
        void main(){
          float rise = smoothstep(0.75, 0.0, vUv.y);
          float spot = smoothstep(0.9, 0.0, distance(vUv, vec2(0.68, 0.0)));
          gl_FragColor = vec4(vec3(0.42, 0.2, 0.09), rise * (0.35 + 0.65 * spot) * 0.75);
        }`,
    }),
  );
  scene.add(haze, tower.group);

  const rainPos = new Float32Array(drops * 6);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: "#b4c3d4", transparent: true, opacity: 0.28, depthWrite: false }));
  rain.frustumCulled = false;
  scene.add(rain);
  const rainDrops = Array.from({ length: drops }, () => ({ x: 0, y: 0, z: 0, s: 1 }));
  let gust = 0;

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
  function spawnDrop(d, anywhere) {
    // spread wider than the screen so slanted streaks still cover the edges
    d.x = (Math.random() - 0.5) * W * 1.4;
    d.y = anywhere ? (Math.random() - 0.5) * H : H / 2 + Math.random() * 2;
    d.z = (Math.random() - 0.5) * 4;
    d.s = 0.7 + Math.random() * 0.6;
  }
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
      // tower: right of the copy on wide screens, a little right of centre on phones
      const depthH = H * (camera.position.z + TOWER_DEPTH) / camera.position.z;
      const depthW = depthH * camera.aspect;
      tower.group.position.set(camera.aspect > 1.1 ? depthW * 0.26 : depthW * 0.2, -depthH / 2, -TOWER_DEPTH);
      tower.group.scale.setScalar(depthH * TOWER_HEIGHT);
      haze.position.set(0, 0, -TOWER_DEPTH - 0.5);
      haze.scale.set(depthW * 1.1, depthH * 1.05, 1);
      // scatter the leaves only once the real screen size is known
      if (!seeded) {
        leaves.forEach((l) => spawn(l, true));
        rainDrops.forEach((d) => spawnDrop(d, true));
        seeded = true;
      }
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
      const blink = reducedMotion ? 1 : (Math.sin(t * 3) > 0.2 ? 1 : 0.15);
      tower.lamp.material.opacity = blink;
      tower.glow.material.opacity = 0.25 * blink;
      for (let i = 0; i < count; i++) {
        const l = leaves[i];
        if (!reducedMotion) {
          // drifting autumn wind plus the shared gusts
          l.vx += (Math.sin(t * 0.6 + l.y * 0.7 + i) * 0.2 + gustAt(t) * 0.9) * dt;
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

      // drizzle: the cursor's sideways speed becomes a gust that bends the rain
      if (!reducedMotion) {
        gust = Math.max(-4, Math.min(4, gust * GUST_DECAY + pointer.vx * 0.01));
        const wind = RAIN_SLANT + gustAt(t) * 1.4 + gust;
        for (let i = 0; i < drops; i++) {
          const d = rainDrops[i];
          const vy = RAIN_SPEED * d.s;
          d.y -= vy * dt;
          d.x += wind * dt;
          if (d.y < -H / 2 - 0.5) spawnDrop(d, false);
          if (d.x > W * 0.7) d.x -= W * 1.4;
          if (d.x < -W * 0.7) d.x += W * 1.4;
          rainPos.set([d.x, d.y, d.z, d.x - wind * RAIN_STREAK, d.y + vy * RAIN_STREAK, d.z], i * 6);
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
      pointer.vx *= 0.85; pointer.vy *= 0.85;
    },
    get width() { return W; },
    get height() { return H; },
  };
}
