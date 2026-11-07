/* zensical-theme: neon hero animation (partials/neon-hero.html).
   A strange attractor, drawn with Three.js: the whole trajectory as a dim
   violet thread, plus a few bright "comets" that race along it and glow
   through an UnrealBloom pass. Slow orbit, slight parallax with the mouse.
   Respects prefers-reduced-motion (one still frame), pauses off-screen. */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// dx/dt for a point [x, y, z]; dt is the integration step, start a seed that
// lies in the basin of attraction. Shapes are normalised later, so the raw
// scale of a system does not matter.
const ATTRACTORS = {
  thomas: {
    dt: 0.08,
    start: [0.1, 0.0, 0.0],
    f: ([x, y, z]) => {
      const b = 0.208186;
      return [Math.sin(y) - b * x, Math.sin(z) - b * y, Math.sin(x) - b * z];
    },
  },
  aizawa: {
    dt: 0.012,
    start: [0.1, 0.0, 0.0],
    f: ([x, y, z]) => {
      const a = 0.95, b = 0.7, c = 0.6, d = 3.5, e = 0.25, f = 0.1;
      return [
        (z - b) * x - d * y,
        d * x + (z - b) * y,
        c + a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + e * z) + f * z * x * x * x,
      ];
    },
  },
  halvorsen: {
    dt: 0.006,
    start: [-1.48, -1.51, 2.04],
    f: ([x, y, z]) => {
      const a = 1.89;
      return [
        -a * x - 4 * y - 4 * z - y * y,
        -a * y - 4 * z - 4 * x - z * z,
        -a * z - 4 * x - 4 * y - x * x,
      ];
    },
  },
  dadras: {
    dt: 0.005,
    start: [1.1, 2.1, -2.0],
    f: ([x, y, z]) => {
      const a = 3, b = 2.7, c = 1.7, d = 2, e = 9;
      return [y - a * x + b * y * z, c * y - x * z + z, d * x * y - e * z];
    },
  },
  lorenz: {
    dt: 0.004,
    start: [0.1, 0.0, 0.0],
    f: ([x, y, z]) => [10 * (y - x), x * (28 - z) - y, x * y - (8 / 3) * z],
  },
};

const SHAPE_POINTS = 36000;   // dim thread: the attractor's whole form
const COMETS = 5;             // bright trails
const COMET_POINTS = 700;     // length of one trail
const STEPS_PER_SECOND = 170; // integration steps per comet per second

// Colours per Zensical colour scheme (body[data-md-color-scheme]). On the
// dark scheme light adds up (additive blending, bloom on the comets); on the
// light scheme the lines multiply into the pale background like ink, no
// bloom. Vertex colours are linear; the extra convertSRGBToLinear on the
// dark palette deepens the hues on purpose.
const SCHEMES = {
  slate: {
    background: 0x07040f,
    comets: [0xff2bd6, 0x9d4dff, 0x00e5ff, 0xff5ce6, 0x5aa9ff].map(
      (hex) => new THREE.Color(hex).convertSRGBToLinear(),
    ),
    threadFrom: new THREE.Color(0x2a1060).convertSRGBToLinear(),
    threadTo: new THREE.Color(0x9d4dff).convertSRGBToLinear(),
    threadStrength: 0.09,
    threadOpacity: 0.7,
    blending: THREE.AdditiveBlending,
    headBlending: THREE.AdditiveBlending,
    headGain: 1.4,
    headScale: 0.045,
    bloom: true,
    // Dark tail, head brighter than 1 so it blooms.
    cometColor: (base, t, out) => out.copy(base).multiplyScalar(Math.pow(t, 2.2) * 1.5),
    // Dim thread: the attractor's form, well below the bloom threshold.
    threadColor: (scheme, t, out) =>
      out.copy(scheme.threadFrom).lerp(scheme.threadTo, 0.5 + 0.5 * Math.sin(t * Math.PI * 6))
        .multiplyScalar(scheme.threadStrength),
  },
  default: {
    background: 0xfbf9ff,
    comets: [0xd6007f, 0x6d28d9, 0x0088a3, 0xe0218a, 0x3b5bdb].map((hex) => new THREE.Color(hex)),
    threadTo: new THREE.Color(0x6d28d9),
    threadOpacity: 1, // premultiplied: less than 1 would grey the "white" parts
    blending: THREE.MultiplyBlending,
    headBlending: THREE.NormalBlending,
    headGain: 1,
    headScale: 0.07, // no bloom here, so the head itself gives the presence
    bloom: false,
    // Multiply: white leaves the background alone, so the tail fades out.
    // Lines are one pixel wide, so the tail stays strong for longer.
    cometColor: (base, t, out) => out.setRGB(1, 1, 1).lerp(base, Math.pow(t, 1.4)),
    // Light violet tint; where the thread is dense it darkens like hatching.
    threadColor: (scheme, t, out) =>
      out.setRGB(1, 1, 1).lerp(scheme.threadTo, 0.22 + 0.1 * Math.sin(t * Math.PI * 6)),
  },
};

function currentScheme() {
  return document.body.getAttribute("data-md-color-scheme") === "slate" ? SCHEMES.slate : SCHEMES.default;
}

// "aizawa" (default), "random" or a comma list ("aizawa,thomas") to choose
// from at random. Preview aid: #attractor=thomas in the URL wins over the front matter.
function pickAttractor(spec) {
  const fromUrl = new URLSearchParams(location.hash.slice(1)).get("attractor");
  const names = (fromUrl || spec || "aizawa").split(",").map((n) => n.trim()).filter(Boolean);
  const pool = names.includes("random") ? Object.keys(ATTRACTORS) : names.filter((n) => n in ATTRACTORS);
  if (pool.length === 0) return ATTRACTORS.aizawa;
  return ATTRACTORS[pool[Math.floor(Math.random() * pool.length)]];
}

function rk4(system, p, dt) {
  const f = system.f;
  const k1 = f(p);
  const k2 = f([p[0] + k1[0] * dt / 2, p[1] + k1[1] * dt / 2, p[2] + k1[2] * dt / 2]);
  const k3 = f([p[0] + k2[0] * dt / 2, p[1] + k2[1] * dt / 2, p[2] + k2[2] * dt / 2]);
  const k4 = f([p[0] + k3[0] * dt, p[1] + k3[1] * dt, p[2] + k3[2] * dt]);
  return [
    p[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    p[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    p[2] + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
  ];
}

// Integrates the whole thread once and returns points plus a transform that
// centres the shape and scales its extent to about one unit.
function buildShape(system) {
  let p = system.start;
  for (let i = 0; i < 2000; i++) p = rk4(system, p, system.dt); // skip transient
  const raw = new Float32Array(SHAPE_POINTS * 3);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < SHAPE_POINTS; i++) {
    p = rk4(system, p, system.dt);
    for (let k = 0; k < 3; k++) {
      raw[i * 3 + k] = p[k];
      if (p[k] < min[k]) min[k] = p[k];
      if (p[k] > max[k]) max[k] = p[k];
    }
  }
  const center = [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
  const extent = Math.max(...[0, 1, 2].map((k) => max[k] - min[k]));
  const scale = 2.1 / extent;
  const positions = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i += 3) {
    positions[i] = (raw[i] - center[0]) * scale;
    positions[i + 1] = (raw[i + 1] - center[1]) * scale;
    positions[i + 2] = (raw[i + 2] - center[2]) * scale;
  }
  return { positions, raw, center, scale, last: p };
}

function makeShapeLine(shape) {
  const colors = new Float32Array(SHAPE_POINTS * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(shape.positions, 3));
  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  geometry.setAttribute("color", colorAttribute);
  // premultipliedAlpha: required by MultiplyBlending (light scheme); with it
  // opacity still scales the additive colour on the dark scheme.
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  const c = new THREE.Color();
  const recolor = (scheme) => {
    for (let i = 0; i < SHAPE_POINTS; i++) {
      scheme.threadColor(scheme, i / SHAPE_POINTS, c);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    colorAttribute.needsUpdate = true;
    material.blending = scheme.blending;
    material.opacity = scheme.threadOpacity;
  };
  return { line, recolor };
}

// One bright trail. The buffer is a queue: index 0 is the oldest point. New
// points are appended after shifting, so vertex colours (faint tail, strong
// head) can stay fixed. "index" picks the colour from the scheme's palette.
function makeComet(system, shape, index, startIndex) {
  const positions = new Float32Array(COMET_POINTS * 3);
  const colors = new Float32Array(COMET_POINTS * 3);
  let p = [shape.raw[startIndex * 3], shape.raw[startIndex * 3 + 1], shape.raw[startIndex * 3 + 2]];
  const fill = () => {
    positions[0] = positions[3] = (p[0] - shape.center[0]) * shape.scale;
    positions[1] = positions[4] = (p[1] - shape.center[1]) * shape.scale;
    positions[2] = positions[5] = (p[2] - shape.center[2]) * shape.scale;
    for (let i = 2; i < COMET_POINTS; i++) {
      p = rk4(system, p, system.dt);
      positions[i * 3] = (p[0] - shape.center[0]) * shape.scale;
      positions[i * 3 + 1] = (p[1] - shape.center[1]) * shape.scale;
      positions[i * 3 + 2] = (p[2] - shape.center[2]) * shape.scale;
    }
  };
  fill();

  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", attribute);
  const colorAttribute = new THREE.BufferAttribute(colors, 3);
  geometry.setAttribute("color", colorAttribute);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
    }),
  );

  const head = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      transparent: true,
      depthWrite: false,
    }),
  );
  const c = new THREE.Color();
  const recolor = (scheme) => {
    const base = scheme.comets[index % scheme.comets.length];
    for (let i = 0; i < COMET_POINTS; i++) {
      scheme.cometColor(base, i / (COMET_POINTS - 1), c);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    colorAttribute.needsUpdate = true;
    line.material.blending = scheme.blending;
    head.material.color.copy(base).multiplyScalar(scheme.headGain);
    head.material.blending = scheme.headBlending;
    head.scale.setScalar(scheme.headScale);
  };

  let carry = 0;
  const advance = (seconds) => {
    carry += seconds * STEPS_PER_SECOND;
    const steps = Math.min(Math.floor(carry), COMET_POINTS - 1);
    carry -= steps;
    if (steps === 0) return;
    positions.copyWithin(0, steps * 3);
    for (let i = COMET_POINTS - steps; i < COMET_POINTS; i++) {
      p = rk4(system, p, system.dt);
      positions[i * 3] = (p[0] - shape.center[0]) * shape.scale;
      positions[i * 3 + 1] = (p[1] - shape.center[1]) * shape.scale;
      positions[i * 3 + 2] = (p[2] - shape.center[2]) * shape.scale;
    }
    attribute.needsUpdate = true;
    const h = (COMET_POINTS - 1) * 3;
    head.position.set(positions[h], positions[h + 1], positions[h + 2]);
  };
  const h = (COMET_POINTS - 1) * 3;
  head.position.set(positions[h], positions[h + 1], positions[h + 2]);
  return { line, head, advance, recolor };
}

let cachedGlow;
function glowTexture() {
  if (cachedGlow) return cachedGlow;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  cachedGlow = new THREE.CanvasTexture(canvas);
  return cachedGlow;
}

function start(section) {
  const canvas = section.querySelector(".neon-hero__canvas");
  if (!canvas || canvas.dataset.started) return;
  canvas.dataset.started = "1";

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    return; // no WebGL: the CSS background stays
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.NoToneMapping;

  const system = pickAttractor(section.dataset.attractor);
  const shape = buildShape(system);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
  camera.position.set(0, 0, 3.4);

  const group = new THREE.Group();
  const thread = makeShapeLine(shape);
  group.add(thread.line);
  const comets = [];
  for (let i = 0; i < COMETS; i++) {
    const comet = makeComet(system, shape, i, Math.floor((i / COMETS) * SHAPE_POINTS));
    group.add(comet.line, comet.head);
    comets.push(comet);
  }
  scene.add(group);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.1, 0.6, 0.35);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Follow the palette toggle: Zensical switches data-md-color-scheme on body.
  const applyScheme = () => {
    const scheme = currentScheme();
    scene.background.set(scheme.background);
    thread.recolor(scheme);
    for (const comet of comets) comet.recolor(scheme);
    bloom.enabled = scheme.bloom;
    if (reduced) composer.render();
  };
  applyScheme();
  new MutationObserver(applyScheme).observe(document.body, {
    attributes: true, attributeFilter: ["data-md-color-scheme"],
  });

  const wide = window.matchMedia("(min-width: 60em)");
  const resize = () => {
    const w = section.clientWidth;
    const h = section.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Wide layout: attractor right of the text, a bit above centre; narrow: behind it.
    const halfWidth = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z * camera.aspect;
    group.position.set(wide.matches ? halfWidth * 0.5 : 0, wide.matches ? 0.08 : 0, 0);
    const fit = Math.min(1, (w / h) * 0.9);
    group.scale.setScalar(wide.matches ? Math.min(1, halfWidth * 0.42) : 0.85 * fit);
  };
  new ResizeObserver(resize).observe(section);
  resize();

  const pointer = { x: 0, y: 0 };
  section.addEventListener("pointermove", (event) => {
    const rect = section.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  });
  section.addEventListener("pointerleave", () => { pointer.x = 0; pointer.y = 0; });

  // Timer resets itself when the tab comes back, so no jump after a pause.
  const timer = new THREE.Timer();
  timer.connect(document);
  let elapsed = 0;
  const tilt = { x: 0.35, y: 0 };
  const frame = (time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1);
    elapsed += dt;
    tilt.y += (pointer.x * 0.25 - tilt.y) * 0.04;
    tilt.x += (0.35 + pointer.y * 0.15 - tilt.x) * 0.04;
    group.rotation.y = elapsed * 0.12 + tilt.y;
    group.rotation.x = tilt.x + Math.sin(elapsed * 0.17) * 0.08;
    for (const comet of comets) comet.advance(dt);
    composer.render();
  };

  if (reduced) {
    group.rotation.set(0.35, 0.6, 0);
    composer.render();
    return;
  }

  // Render only while the hero is on screen.
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) timer.reset();
    renderer.setAnimationLoop(entry.isIntersecting ? frame : null);
  }, { threshold: 0.05 }).observe(section);
}

function init() {
  document.querySelectorAll(".neon-hero").forEach(start);
}

// With navigation.instant the bundle swaps the page body; document$ fires
// for every page, including the first.
if (window.document$ && typeof window.document$.subscribe === "function") {
  window.document$.subscribe(init);
} else {
  init();
}
