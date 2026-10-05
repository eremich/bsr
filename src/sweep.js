import * as THREE from "three";

// The signature transition: a rotating street-sweeper brush crosses the screen.
// Behind it scene B shows through; the edge is streaky like bristle marks.

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const fragment = /* glsl */ `
  uniform sampler2D tA;
  uniform sampler2D tB;
  uniform float uProgress;
  uniform float uTime;
  uniform float uAspect;
  uniform float uRadius;
  varying vec2 vUv;

  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise(float x) { float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }

  // x of the sweep line at height y (aspect units), slightly curved
  float frontAt(float y) {
    float travel = mix(-uRadius * 2.2, uAspect + uRadius * 2.2, uProgress);
    return travel + sin(y * 2.4 + 0.6) * 0.06;
  }

  void main() {
    vec2 p = vec2(vUv.x * uAspect, vUv.y);
    float fx = frontAt(p.y);
    // bristle streaks along the direction of travel, plus a wobbly edge
    float streak = noise(p.y * 140.0) * 0.06 + noise(p.y * 22.0 + uTime) * 0.05;
    float clean = smoothstep(fx - streak, fx - streak - 0.04, p.x);
    vec3 a = texture2D(tA, vUv).rgb;
    vec3 b = texture2D(tB, vUv).rgb;
    vec3 col = mix(a, b, clean);

    // fresh sweep marks just behind the brush: faint arcs on the clean side
    float behind = fx - p.x;
    float marks = step(0.0, behind) * smoothstep(0.6, 0.0, behind) * (0.5 + 0.5 * sin(length(p - vec2(fx, p.y + 0.3)) * 90.0));
    col += vec3(0.05, 0.12, 0.07) * marks * 0.6;

    // the brush itself: a spinning disc of bristles riding the front
    vec2 c = vec2(fx + uRadius * 0.15, 0.5 + sin(uProgress * 6.28318) * 0.18);
    vec2 d = p - c;
    float r = length(d);
    float ang = atan(d.y, d.x) + uTime * 9.0;
    // tufts of bristles: coarse radial streaks with jitter, darker toward the hub
    float tuft = noise(ang * 9.0 + floor(r * 30.0) * 1.7);
    float bristles = 0.35 + 0.65 * smoothstep(0.25, 0.85, noise(ang * 38.0 + r * 6.0) * 0.7 + tuft * 0.5);
    // ragged outer edge where bristles fan out
    float edge = uRadius - 0.018 * noise(ang * 60.0);
    float disc = smoothstep(edge, edge - 0.01, r);
    float hub = smoothstep(uRadius * 0.28, uRadius * 0.27, r);
    vec3 brush = mix(vec3(0.06, 0.05, 0.05), vec3(0.32, 0.26, 0.2), bristles * smoothstep(uRadius * 0.3, uRadius, r));
    brush = mix(brush, vec3(0.95, 0.4, 0.11), hub);                                   // orange hub
    brush = mix(brush, vec3(1.0), smoothstep(uRadius * 0.08, uRadius * 0.06, r));     // bolt
    float shadow = smoothstep(uRadius * 1.25, uRadius * 0.9, length(d + vec2(-0.02, 0.03))) * 0.45;
    float visible = step(0.0005, uProgress) * step(uProgress, 0.9995);
    col = mix(col, col * (1.0 - shadow), visible);
    col = mix(col, brush, disc * visible);

    gl_FragColor = vec4(col, 1.0);
  }`;

export const BRUSH_RADIUS = 0.26;

export function createSweep() {
  const uniforms = {
    tA: { value: null }, tB: { value: null },
    uProgress: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 }, uRadius: { value: BRUSH_RADIUS },
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment, depthTest: false }));
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    scene,
    camera,
    uniforms,
    // same curve as the shader, in aspect units (x: 0..aspect, y: 0..1)
    frontAt(y, progress, aspect) {
      const r = uniforms.uRadius.value;
      return -r * 2.2 + (aspect + r * 4.4) * progress + Math.sin(y * 2.4 + 0.6) * 0.06;
    },
    // portrait screens: shrink the brush so it doesn't swallow the whole width
    setAspect(aspect) {
      uniforms.uAspect.value = aspect;
      uniforms.uRadius.value = BRUSH_RADIUS * Math.min(1, aspect * 1.3);
    },
  };
}
