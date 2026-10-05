import * as THREE from "three";

// Scene B, what the brush reveals: "Außen orange, innen grün".
// A deep green field with soft biogas bubbles rising and a slow glow.

const BG = "#0d2a1e";

const bubbleVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uHeight;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float speed = 0.25 + fract(aSeed * 7.13) * 0.45;
    p.y = mod(p.y + uTime * speed + uHeight * 0.5, uHeight) - uHeight * 0.5;
    p.x += sin(uTime * 0.8 + aSeed * 20.0) * 0.15;
    vAlpha = smoothstep(-0.5 * uHeight, -0.2 * uHeight, p.y) * (1.0 - smoothstep(0.3 * uHeight, 0.5 * uHeight, p.y));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (6.0 + fract(aSeed * 3.7) * 22.0) * (10.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

const bubbleFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float ring = smoothstep(0.5, 0.42, d) - smoothstep(0.38, 0.3, d) * 0.6;
    float shine = smoothstep(0.14, 0.0, length(c - vec2(-0.15, -0.15)));
    float a = (ring + shine * 0.8) * vAlpha;
    if (a < 0.02) discard;
    gl_FragColor = vec4(mix(vec3(0.45, 0.85, 0.5), vec3(0.9, 1.0, 0.85), shine), a * 0.8);
  }`;

export function createGreen({ count }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.z = 10;

  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - 0.5) * 16, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4], i * 3);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const uniforms = { uTime: { value: 0 }, uHeight: { value: 8 } };
  const bubbles = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, vertexShader: bubbleVertex, fragmentShader: bubbleFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  bubbles.frustumCulled = false;

  // a soft green glow behind the headline
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; void main(){ float d = length(vUv - 0.5); gl_FragColor = vec4(0.18, 0.6, 0.32, smoothstep(0.5, 0.0, d) * 0.5); }`,
    }),
  );
  glow.position.set(2.5, 0, -2);
  scene.add(glow, bubbles);

  return {
    scene,
    camera,
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const H = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
      uniforms.uHeight.value = H * 1.2;
      bubbles.scale.x = (H * camera.aspect) / 16 + 0.2;
    },
    update(t, reducedMotion) {
      uniforms.uTime.value = reducedMotion ? 0 : t;
    },
  };
}
