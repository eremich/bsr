import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// A low-entry refuse truck with a rear-loader body (Econic / Variopress proportions),
// built from primitives. Units are metres; +x is the front, +z the driver's left.

const ORANGE = "#f2661b";
const WIDTH = 2.5;

export const materials = {
  paint: new THREE.MeshPhysicalMaterial({ color: ORANGE, roughness: 0.3, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
  accent: new THREE.MeshStandardMaterial({ color: "#ffb21a", roughness: 0.4 }),
  glass: new THREE.MeshPhysicalMaterial({ color: "#0a0d11", roughness: 0.03, metalness: 0.3, clearcoat: 1 }),
  grille: new THREE.MeshStandardMaterial({ color: "#2b2e33", roughness: 0.55, metalness: 0.4 }),
  rubber: new THREE.MeshStandardMaterial({ color: "#111214", roughness: 0.9 }),
  steel: new THREE.MeshStandardMaterial({ color: "#c3c7cc", roughness: 0.25, metalness: 0.95 }),
  chassis: new THREE.MeshStandardMaterial({ color: "#1b1c1f", roughness: 0.7, metalness: 0.3 }),
  cavity: new THREE.MeshStandardMaterial({ color: "#2a1a10", roughness: 0.95 }),
  binGrey: new THREE.MeshStandardMaterial({ color: "#3a3d42", roughness: 0.55 }),
  light: new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff3dc", emissiveIntensity: 2.4 }),
  beacon: new THREE.MeshStandardMaterial({ color: "#ff8a1f", emissive: "#ff7a10", emissiveIntensity: 1.5 }),
  tail: new THREE.MeshStandardMaterial({ color: "#5a0d0d", emissive: "#ff2a1a", emissiveIntensity: 1.3 }),
};

function shade(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w, h, d, mat, x, y, z, radius = 0) {
  const geo = radius ? new RoundedBoxGeometry(w, h, d, 3, radius) : new THREE.BoxGeometry(w, h, d);
  const m = shade(new THREE.Mesh(geo, mat));
  m.position.set(x, y, z);
  return m;
}

function rod(from, to, radius, mat) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const m = shade(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 14), mat));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
  return m;
}

// side profile (x, y) extruded across the truck's width, softly bevelled
function profile(draw, mat, depth = WIDTH) {
  const shape = new THREE.Shape();
  draw(shape);
  const bevel = 0.06;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 24 });
  geo.translate(0, 0, -(depth - bevel * 2) / 2);
  return shade(new THREE.Mesh(geo, mat));
}

function wheel(x, z, radius = 0.52, width = 0.42) {
  const g = new THREE.Group();
  const tire = shade(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 48), materials.rubber));
  tire.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, width + 0.02, 40), materials.steel);
  rim.rotation.x = Math.PI / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.22, radius * 0.26, width + 0.08, 20), materials.grille);
  hub.rotation.x = Math.PI / 2;
  g.add(tire, rim, hub);
  // wheel nuts on the outer face
  const side = Math.sign(z);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 6), materials.grille);
    nut.rotation.x = Math.PI / 2;
    nut.position.set(Math.cos(a) * radius * 0.4, Math.sin(a) * radius * 0.4, side * (width / 2 + 0.03));
    g.add(nut);
  }
  g.position.set(x, radius, z);
  return g;
}

function canvasMaterial(w, h, paint) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 });
}

// red/white warning chevrons for the cab corners
const warningMaterial = () => canvasMaterial(256, 128, (ctx, w, h) => {
  ctx.fillStyle = "#f4f1ec";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#d3201b";
  for (let x = -h; x < w + h; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, h); ctx.lineTo(x + 40, h); ctx.lineTo(x + 40 + h, 0); ctx.lineTo(x + h, 0);
    ctx.fill();
  }
});

// BSR mark for the body sides
const logoMaterial = () => canvasMaterial(512, 512, (ctx) => {
  ctx.fillStyle = "#f4f1ec";
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = ORANGE;
  ctx.font = "900 200px Archivo, Arial, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("B", 60, 40);
  ctx.fillText("S", 290, 40);
  ctx.fillText("R", 290, 270);
});

const plateMaterial = () => canvasMaterial(512, 112, (ctx, w, h) => {
  ctx.fillStyle = "#f4f1ec";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#1f4fbf";
  ctx.fillRect(0, 0, 56, h);
  ctx.fillStyle = "#111";
  ctx.font = "700 76px Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("B-SR 2026", 76, h / 2 + 4);
});

export function buildTruck() {
  const truck = new THREE.Group();
  const m = materials;
  const half = WIDTH / 2;

  // ---------- chassis, side guards, tank ----------
  truck.add(box(7.4, 0.3, 1.0, m.chassis, -0.5, 0.78, 0));
  for (const z of [-half + 0.05, half - 0.05]) {
    truck.add(rod([-1.3, 0.78, z], [3.1, 0.78, z], 0.035, m.steel));
    truck.add(rod([-1.3, 0.52, z], [3.1, 0.52, z], 0.035, m.steel));
  }
  truck.add(box(0.95, 0.62, 0.55, m.steel, 1.9, 0.72, -0.85, 0.04));

  // ---------- low-entry cab with front wheel arch ----------
  truck.add(profile((s) => {
    s.moveTo(3.0, 0.5);
    s.lineTo(3.2, 0.5);
    s.absarc(3.85, 0.52, 0.66, Math.PI, 0, true);
    s.lineTo(5.12, 0.5);
    s.lineTo(5.15, 2.72);
    s.lineTo(3.0, 2.78);
    s.closePath();
  }, m.paint));
  // panoramic windscreen + roof hatch
  truck.add(box(0.05, 1.18, WIDTH - 0.16, m.glass, 5.17, 2.04, 0));
  truck.add(box(0.7, 0.05, 0.9, m.glass, 4.1, 2.86, 0, 0.02));
  for (const z of [-half - 0.005, half + 0.005]) {
    truck.add(box(1.0, 1.2, 0.02, m.glass, 3.55, 2.05, z));         // side window
  }
  truck.add(box(0.62, 2.0, 0.02, m.glass, 4.6, 1.62, -half - 0.01)); // full-height glass door (kerb side)
  // front face: grille, lights, warning chevrons, bumper, plate
  truck.add(box(0.05, 0.6, 1.75, m.grille, 5.17, 1.12, 0));
  for (let i = 0; i < 4; i++) truck.add(box(0.03, 0.04, 1.62, m.chassis, 5.2, 0.9 + i * 0.15, 0));
  for (const z of [-0.98, 0.98]) {
    truck.add(box(0.04, 0.1, 0.34, m.light, 5.19, 1.46, z));
    truck.add(box(0.04, 0.12, 0.12, m.light, 5.19, 0.66, z * 0.92));
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16), warningMaterial());
    w.position.set(5.18, 1.18, z * 1.08);
    w.rotation.y = Math.PI / 2;
    truck.add(w);
  }
  truck.add(box(0.12, 0.12, WIDTH - 0.1, m.chassis, 5.13, 0.47, 0));
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), plateMaterial());
  plate.position.set(5.19, 0.66, 0);
  plate.rotation.y = Math.PI / 2;
  truck.add(plate);
  // mirrors on long arms
  for (const z of [-1, 1]) {
    truck.add(rod([5.05, 2.55, z * half], [5.3, 2.55, z * (half + 0.3)], 0.02, m.chassis));
    truck.add(rod([5.3, 2.55, z * (half + 0.3)], [5.3, 1.75, z * (half + 0.3)], 0.02, m.chassis));
    truck.add(box(0.06, 0.42, 0.2, m.chassis, 5.3, 2.05, z * (half + 0.32), 0.02));
  }

  // ---------- refuse body: taller than the cab, clean flanks, diagonal seam at the back ----------
  truck.add(profile((s) => {
    s.moveTo(2.95, 1.12);
    s.lineTo(2.95, 3.55);
    s.lineTo(-3.3, 3.55);
    s.lineTo(-4.05, 1.12);
    s.closePath();
  }, m.paint));
  truck.add(box(0.75, 0.55, WIDTH - 0.2, m.paint, 3.3, 3.05, 0, 0.06));     // bridge over the cab
  for (const z of [-half - 0.06, half + 0.06]) truck.add(box(6.6, 0.05, 0.01, m.accent, -0.4, 1.62, z));
  truck.add(rod([3.0, 1.0, -half + 0.12], [3.0, 3.9, -half + 0.12], 0.06, m.grille)); // exhaust stack
  const logo = logoMaterial();
  for (const z of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), logo);
    p.position.set(1.4, 2.55, z * (half + 0.065));
    if (z < 0) p.rotation.y = Math.PI;
    truck.add(p);
  }

  // beacons on the body front
  const beacons = [];
  for (const z of [-0.95, 0.95]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.beacon.clone());
    b.position.set(3.55, 3.33, z);
    beacons.push(b);
    truck.add(b);
  }

  // ---------- tailgate (press unit) with hydraulic rams and the loading mouth ----------
  truck.add(profile((s) => {
    s.moveTo(-3.3, 3.55);
    s.lineTo(-5.35, 3.45);
    s.lineTo(-5.6, 1.3);
    s.lineTo(-5.15, 0.95);
    s.lineTo(-4.2, 0.95);
    s.lineTo(-4.05, 1.12);
    s.closePath();
  }, m.paint));
  for (const z of [-half - 0.08, half + 0.08]) {
    truck.add(rod([-3.55, 3.25, z], [-4.15, 1.5, z], 0.07, m.chassis));      // cylinder
    truck.add(rod([-3.9, 2.25, z], [-4.3, 1.1, z], 0.035, m.steel));         // piston rod
    truck.add(box(0.45, 0.05, 0.01, m.accent, -4.6, 1.62, z));
  }
  const mouth = box(0.04, 1.55, WIDTH - 0.5, m.cavity, -5.5, 2.15, 0);
  mouth.rotation.z = -0.11;
  truck.add(mouth);
  for (const z of [-1.05, 1.05]) {
    const t = box(0.04, 0.55, 0.13, m.tail, -5.47, 2.35, z);
    t.rotation.z = -0.11;
    truck.add(t);
  }

  // ---------- bin lifter: pivots under the mouth, carries a 1,100 l bin ----------
  const lifter = new THREE.Group();
  lifter.position.set(-5.62, 1.32, 0);
  for (const z of [-0.6, 0.6]) lifter.add(box(0.1, 0.45, 0.1, m.steel, -0.08, -0.2, z));
  lifter.add(box(0.14, 0.12, 1.5, m.steel, -0.12, -0.08, 0));
  const bin = new THREE.Group();
  bin.add(box(1.05, 1.22, 1.3, m.binGrey, -0.66, -0.66, 0, 0.06));
  bin.add(box(1.15, 0.08, 1.38, m.chassis, -0.68, 0.0, 0, 0.03));
  for (const z of [-0.5, 0.5]) for (const dx of [-0.3, 0.3]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), m.rubber);
    w.rotation.x = Math.PI / 2;
    w.position.set(-0.66 + dx, -1.28, z);
    bin.add(w);
  }
  lifter.add(bin);
  truck.add(lifter);

  // ---------- axles: steer + rear tandem ----------
  for (const z of [-1.03, 1.03]) truck.add(wheel(3.85, z));
  for (const x of [-2.0, -3.35]) for (const z of [-1.0, 1.0]) truck.add(wheel(x, z, 0.52, 0.5));

  // points the tour talks about
  const anchors = {
    cab: new THREE.Vector3(5.17, 2.3, 0.9),
    lifter: new THREE.Vector3(-5.75, 1.25, 1.0),
    press: new THREE.Vector3(-3.85, 2.4, half + 0.1),
    drive: new THREE.Vector3(-2.68, 0.52, 1.3),
  };

  return { truck, lifter, beacons, anchors };
}
