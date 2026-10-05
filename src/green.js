import * as THREE from "three";

// Scene B, what the brush reveals: "Außen orange, innen grün".
// A biogas tank drawn as an orange ring; inside it green bubbles rise densely, outside only a few.
// Bubbles drift away from the cursor.

const BG = "#0d2a1e";
const ORANGE = "#ff6a1f";

const bubbleVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uHeight;
  uniform vec2 uCenter;
  uniform float uRadius;      // > 0: only show bubbles inside this circle
  uniform vec2 uPointer;
  uniform float uSizeScale;
  uniform float uSpreadX;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.x *= uSpreadX;
    float speed = 0.35 + fract(aSeed * 7.13) * 0.6;
    // start at a random height so the column is full from the first frame
    p.y = mod(fract(aSeed * 13.7) * uHeight + uTime * speed, uHeight) - uHeight * 0.5;
    p.x += sin(uTime * 0.9 + aSeed * 20.0) * 0.12;
    p.xy += uCenter;
    // the cursor parts the bubbles
    vec2 away = p.xy - uPointer;
    float d = length(away);
    p.xy += normalize(away + 1e-4) * max(0.0, 1.4 - d) * 0.7;
    float fade = smoothstep(-0.5, -0.38, (p.y - uCenter.y) / uHeight) * (1.0 - smoothstep(0.36, 0.5, (p.y - uCenter.y) / uHeight));
    float inside = uRadius > 0.0 ? 1.0 - smoothstep(uRadius * 0.9, uRadius * 0.97, length(p.xy - uCenter)) : 1.0;
    vAlpha = fade * inside;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (6.0 + fract(aSeed * 3.7) * 22.0) * uSizeScale * (10.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

const bubbleFragment = /* glsl */ `
  uniform float uGlow;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float ring = smoothstep(0.5, 0.42, d) - smoothstep(0.38, 0.3, d) * 0.6;
    float shine = smoothstep(0.14, 0.0, length(c - vec2(-0.15, -0.15)));
    float a = (ring + shine * 0.8) * vAlpha;
    if (a < 0.02) discard;
    gl_FragColor = vec4(mix(vec3(0.45, 0.85, 0.5), vec3(0.9, 1.0, 0.85), shine) * uGlow, a * 0.85);
  }`;

function bubbles(count, spread, uniforms) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 2], i * 3);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, vertexShader: bubbleVertex, fragmentShader: bubbleFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  pts.frustumCulled = false;
  return pts;
}

export function createGreen({ count }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.z = 10;

  const pointer = new THREE.Vector2(99, 99);
  const shared = { uTime: { value: 0 }, uPointer: { value: pointer } };
  const outside = {
    ...shared,
    uHeight: { value: 8 }, uCenter: { value: new THREE.Vector2() }, uRadius: { value: 0 }, uSizeScale: { value: 0.8 }, uGlow: { value: 0.7 }, uSpreadX: { value: 1 },
  };
  const inside = {
    ...shared,
    uHeight: { value: 4 }, uCenter: { value: new THREE.Vector2() }, uRadius: { value: 2 }, uSizeScale: { value: 1 }, uGlow: { value: 1.15 }, uSpreadX: { value: 1 },
  };
  const loose = bubbles(Math.round(count * 0.4), 16, outside);
  const dense = bubbles(count * 2, 1, inside);   // x spread is set to the tank width in resize()

  // the tank: orange ring outside, a soft green glow inside
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 128), new THREE.MeshBasicMaterial({ color: ORANGE }));
  const halo = new THREE.Mesh(new THREE.RingGeometry(1, 1.08, 128), new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.18 }));
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(0.965, 128),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(mix(vec3(0.16, 0.5, 0.28), vec3(0.06, 0.2, 0.12), d), 0.9); }`,
    }),
  );
  const tank = new THREE.Group();
  tank.add(fill, halo, ring);
  tank.position.z = -0.5;
  scene.add(loose, tank, dense);

  let W = 1, H = 1;

  return {
    scene,
    camera,
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      H = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
      W = H * camera.aspect;
      // desktop: tank to the right of the copy; phones: in the top half
      const wide = w / h > 1.1;
      const R = wide ? H * 0.34 : Math.min(W * 0.4, H * 0.22);
      const cx = wide ? W * 0.22 : 0;
      const cy = wide ? 0 : H * 0.2;
      tank.position.set(cx, cy, -0.5);
      tank.scale.setScalar(R);
      inside.uCenter.value.set(cx, cy);
      inside.uRadius.value = R;
      inside.uHeight.value = R * 2;
      inside.uSpreadX.value = R * 2;
      outside.uHeight.value = H * 1.2;
      outside.uSpreadX.value = W / 16 + 0.2;
    },
    setPointer(nx, ny) { pointer.set((nx * W) / 2, (ny * H) / 2); },
    update(t, _local, reducedMotion) {
      shared.uTime.value = reducedMotion ? 0 : t;
    },
  };
}
