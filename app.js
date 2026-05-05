import * as THREE from "./vendor/three.module.min.js";

const mount = document.getElementById("waterfallMount");
const miniSpectrum = document.getElementById("miniSpectrum");
const miniCtx = miniSpectrum.getContext("2d");

const readouts = {
  rpm: document.getElementById("rpmReadout"),
  freq: document.getElementById("freqReadout"),
  amp: document.getElementById("ampReadout"),
  tag: document.getElementById("cursorTag"),
  rms: document.getElementById("rmsMetric"),
  peak: document.getElementById("peakMetric"),
  rpmMetric: document.getElementById("rpmMetric"),
  order: document.getElementById("orderMetric"),
  x: document.getElementById("xMetric"),
  y: document.getElementById("yMetric"),
  z: document.getElementById("zMetric"),
  slice: document.getElementById("sliceMetric")
};

const freqCount = 144;
const rpmCount = 104;
const freqMin = 0;
const freqMax = 5200;
const rpmMin = 600;
const rpmMax = 7200;
const dbMin = -72;
const dbMax = -6;
const xSpan = 8.8;
const zSpan = 5.8;
const yScale = 2.25;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06090d);
scene.fog = new THREE.Fog(0x06090d, 8.5, 17);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
mount.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0x7caed0, 0.72);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xe6fbff, 1.5);
keyLight.position.set(-3.8, 6.4, 3.2);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x189dff, 1.2);
rimLight.position.set(5, 2.8, -5);
scene.add(rimLight);

const data = buildWaterfallData();
const surface = buildSurface(data);
const wire = buildWireframe(data);
const axes = buildAxes();
const peakPoints = buildPeakPoints(data);
scene.add(surface, wire, axes, peakPoints);

const cursorLine = new THREE.LineSegments(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: 0x18c6ff, transparent: true, opacity: 0.9 })
);
scene.add(cursorLine);

let targetFreqIndex = 38;
let targetRpmIndex = 74;
let autoCursor = true;
let orbit = { theta: -0.82, phi: 0.82, radius: 11.3 };
let drag = null;

renderer.domElement.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, y: event.clientY, theta: orbit.theta, phi: orbit.phi };
  renderer.domElement.setPointerCapture(event.pointerId);
});

renderer.domElement.addEventListener("pointermove", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  const nx = (event.clientX - rect.left) / rect.width;
  const ny = (event.clientY - rect.top) / rect.height;
  targetFreqIndex = clamp(Math.round(nx * (freqCount - 1)), 0, freqCount - 1);
  targetRpmIndex = clamp(Math.round((1 - ny) * (rpmCount - 1)), 0, rpmCount - 1);
  autoCursor = false;

  if (drag) {
    orbit.theta = drag.theta - (event.clientX - drag.x) * 0.006;
    orbit.phi = clamp(drag.phi + (event.clientY - drag.y) * 0.004, 0.38, 1.32);
  }
});

renderer.domElement.addEventListener("pointerup", (event) => {
  drag = null;
  renderer.domElement.releasePointerCapture(event.pointerId);
});

renderer.domElement.addEventListener("mouseleave", () => {
  autoCursor = true;
});

renderer.domElement.addEventListener("wheel", (event) => {
  orbit.radius = clamp(orbit.radius + event.deltaY * 0.006, 7.2, 15.5);
}, { passive: true });

function buildWaterfallData() {
  const rows = [];
  for (let r = 0; r < rpmCount; r += 1) {
    const rpmT = r / (rpmCount - 1);
    const rpm = lerp(rpmMin, rpmMax, rpmT);
    const fundamental = rpm / 60;
    const row = [];

    for (let f = 0; f < freqCount; f += 1) {
      const freqT = f / (freqCount - 1);
      const freq = lerp(freqMin, freqMax, freqT);
      const broadband = -68 + 3.2 * Math.sin(freq * 0.0054 + rpmT * 11) + 1.6 * pseudoNoise(f, r);
      const floorLift = 7 * Math.exp(-freq / 950);
      const order1 = ridge(freq, fundamental * 1, 28, 26 + 4 * Math.sin(rpmT * 8));
      const order2 = ridge(freq, fundamental * 2, 30, 14 + 3 * Math.cos(rpmT * 7));
      const order3 = ridge(freq, fundamental * 3, 36, 42 + 16 * Math.exp(-Math.pow((rpmT - 0.66) / 0.16, 2)));
      const order6 = ridge(freq, fundamental * 6.5, 42, 27 + 9 * Math.sin(rpmT * 10 + 0.6));
      const order9 = ridge(freq, fundamental * 9, 52, 23 + 19 * Math.exp(-Math.pow((rpmT - 0.82) / 0.1, 2)));
      const structural = ridge(freq, 1860 + 90 * Math.sin(rpmT * 5), 64, 22);
      const blade = ridge(freq, 3380 + 180 * Math.cos(rpmT * 3.1), 86, 17);
      const db = clamp(broadband + floorLift + order1 + order2 + order3 + order6 + order9 + structural + blade, dbMin, dbMax);
      row.push({ rpm, freq, db });
    }
    rows.push(row);
  }
  return rows;
}

function buildSurface(rows) {
  const vertices = [];
  const colors = [];
  const indices = [];

  for (let r = 0; r < rpmCount; r += 1) {
    for (let f = 0; f < freqCount; f += 1) {
      const p = rows[r][f];
      const ampT = normalizeDb(p.db);
      vertices.push(freqToX(p.freq), dbToY(p.db), rpmToZ(p.rpm));
      const c = colorForDb(p.db);
      colors.push(c.r, c.g, c.b);
    }
  }

  for (let r = 0; r < rpmCount - 1; r += 1) {
    for (let f = 0; f < freqCount - 1; f += 1) {
      const a = r * freqCount + f;
      const b = a + 1;
      const c = a + freqCount;
      const d = c + 1;
      const flip = ampTurbulence(r, f) > 0.5;
      if (flip) {
        indices.push(a, c, d, a, d, b);
      } else {
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.44,
      metalness: 0.06,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0x06121a),
      emissiveIntensity: 0.35
    })
  );
}

function buildWireframe(rows) {
  const verts = [];
  const cols = [];
  const lineColor = new THREE.Color(0x2a779f);

  for (let r = 0; r < rpmCount; r += 4) {
    for (let f = 0; f < freqCount - 1; f += 1) {
      pushLine(verts, cols, lineColor, rows[r][f], rows[r][f + 1], 0.012);
    }
  }

  for (let f = 0; f < freqCount; f += 6) {
    for (let r = 0; r < rpmCount - 1; r += 1) {
      pushLine(verts, cols, lineColor, rows[r][f], rows[r + 1][f], 0.012);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));

  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32 })
  );
}

function buildAxes() {
  const group = new THREE.Group();
  const gridMat = new THREE.LineBasicMaterial({ color: 0x1a5c7e, transparent: true, opacity: 0.48 });
  const axisMat = new THREE.LineBasicMaterial({ color: 0x43c5ff, transparent: true, opacity: 0.85 });

  const gridVerts = [];
  for (let i = 0; i <= 12; i += 1) {
    const x = lerp(-xSpan / 2, xSpan / 2, i / 12);
    gridVerts.push(x, 0, -zSpan / 2, x, 0, zSpan / 2);
  }
  for (let i = 0; i <= 10; i += 1) {
    const z = lerp(-zSpan / 2, zSpan / 2, i / 10);
    gridVerts.push(-xSpan / 2, 0, z, xSpan / 2, 0, z);
  }
  for (let i = 0; i <= 7; i += 1) {
    const y = lerp(0, yScale, i / 7);
    gridVerts.push(-xSpan / 2, y, -zSpan / 2, -xSpan / 2, y, zSpan / 2);
    gridVerts.push(-xSpan / 2, y, -zSpan / 2, xSpan / 2, y, -zSpan / 2);
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridVerts, 3));
  group.add(new THREE.LineSegments(gridGeo, gridMat));

  const axisVerts = [
    -xSpan / 2, 0, -zSpan / 2, xSpan / 2, 0, -zSpan / 2,
    -xSpan / 2, 0, -zSpan / 2, -xSpan / 2, 0, zSpan / 2,
    -xSpan / 2, 0, -zSpan / 2, -xSpan / 2, yScale + 0.35, -zSpan / 2
  ];
  const axisGeo = new THREE.BufferGeometry();
  axisGeo.setAttribute("position", new THREE.Float32BufferAttribute(axisVerts, 3));
  group.add(new THREE.LineSegments(axisGeo, axisMat));

  return group;
}

function buildPeakPoints(rows) {
  const points = [];
  const colors = [];
  for (let r = 0; r < rpmCount; r += 2) {
    for (let f = 0; f < freqCount; f += 2) {
      const p = rows[r][f];
      if (p.db > -28) {
        points.push(freqToX(p.freq), dbToY(p.db) + 0.035, rpmToZ(p.rpm));
        const c = colorForDb(Math.min(p.db + 5, dbMax));
        colors.push(c.r, c.g, c.b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ size: 0.052, vertexColors: true, transparent: true, opacity: 0.98 })
  );
}

function updateCursorGeometry(p) {
  const x = freqToX(p.freq);
  const z = rpmToZ(p.rpm);
  const y = dbToY(p.db);
  const verts = [
    x, 0, -zSpan / 2, x, y + 0.25, z,
    -xSpan / 2, 0, z, x, y + 0.25, z,
    x, 0, z, x, y + 0.42, z
  ];
  cursorLine.geometry.dispose();
  cursorLine.geometry = new THREE.BufferGeometry();
  cursorLine.geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
}

function drawMiniSpectrum(sliceIndex) {
  const width = miniSpectrum.width;
  const height = miniSpectrum.height;
  miniCtx.clearRect(0, 0, width, height);
  miniCtx.fillStyle = "#071015";
  miniCtx.fillRect(0, 0, width, height);

  miniCtx.strokeStyle = "rgba(62, 142, 189, 0.24)";
  miniCtx.lineWidth = 1;
  for (let x = 0; x <= width; x += 41) {
    miniCtx.beginPath();
    miniCtx.moveTo(x, 0);
    miniCtx.lineTo(x, height);
    miniCtx.stroke();
  }
  for (let y = 0; y <= height; y += 29) {
    miniCtx.beginPath();
    miniCtx.moveTo(0, y);
    miniCtx.lineTo(width, y);
    miniCtx.stroke();
  }

  miniCtx.lineWidth = 1.5;
  const gradient = miniCtx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "#126bd2");
  gradient.addColorStop(0.42, "#18c6ff");
  gradient.addColorStop(0.72, "#f7d447");
  gradient.addColorStop(1, "#ff4c43");
  miniCtx.strokeStyle = gradient;
  miniCtx.beginPath();
  data[sliceIndex].forEach((p, f) => {
    const x = (f / (freqCount - 1)) * width;
    const y = height - normalizeDb(p.db) * (height - 18) - 9;
    if (f === 0) miniCtx.moveTo(x, y);
    else miniCtx.lineTo(x, y);
  });
  miniCtx.stroke();

  miniCtx.fillStyle = "#9fb4c0";
  miniCtx.font = "10px SFMono-Regular, Consolas, monospace";
  miniCtx.fillText("0 Hz", 8, height - 8);
  miniCtx.fillText("5.2 kHz", width - 58, height - 8);
  miniCtx.fillText(`slice ${String(sliceIndex).padStart(3, "0")} / FFT 8192`, 8, 13);
}

function updateReadouts(frame) {
  if (autoCursor) {
    targetRpmIndex = Math.round((Math.sin(frame * 0.00052) * 0.5 + 0.5) * (rpmCount - 1));
    const order = 3 + 3.5 * (Math.sin(frame * 0.00033) * 0.5 + 0.5);
    const rpm = data[targetRpmIndex][0].rpm;
    const freq = rpm / 60 * order;
    targetFreqIndex = clamp(Math.round((freq / freqMax) * (freqCount - 1)), 0, freqCount - 1);
  }

  const p = data[targetRpmIndex][targetFreqIndex];
  const rpm = p.rpm;
  const freq = p.freq;
  const order = freq / (rpm / 60);
  const rms = 1.4 + normalizeDb(p.db) * 1.85 + 0.12 * Math.sin(frame * 0.001);
  const peak = rms * (3.1 + normalizeDb(p.db) * 1.2);
  const slice = String(targetRpmIndex).padStart(3, "0");

  readouts.rpm.textContent = rpm.toLocaleString("en-US", { maximumFractionDigits: 0 });
  readouts.freq.textContent = `${freq.toLocaleString("en-US", { maximumFractionDigits: 1 })} Hz`;
  readouts.amp.textContent = `${p.db.toFixed(1)} dB g`;
  readouts.tag.textContent = `slice ${slice} | order ${order.toFixed(2)} | ${p.db.toFixed(1)} dB`;
  readouts.rms.textContent = `${rms.toFixed(3)} g`;
  readouts.peak.textContent = `${peak.toFixed(2)} g`;
  readouts.rpmMetric.textContent = rpm.toFixed(1);
  readouts.order.textContent = `${order.toFixed(2)}x`;
  readouts.x.textContent = rpm.toFixed(1);
  readouts.y.textContent = `${freq.toFixed(1)} Hz`;
  readouts.z.textContent = `${p.db.toFixed(1)} dB`;
  readouts.slice.textContent = slice;
  updateCursorGeometry(p);
  drawMiniSpectrum(targetRpmIndex);
}

function animate(frame = 0) {
  updateCamera();
  updateReadouts(frame);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateCamera() {
  const sinPhi = Math.sin(orbit.phi);
  camera.position.set(
    orbit.radius * sinPhi * Math.sin(orbit.theta),
    orbit.radius * Math.cos(orbit.phi) + 1.8,
    orbit.radius * sinPhi * Math.cos(orbit.theta)
  );
  camera.lookAt(0, 0.8, 0);
}

function resize() {
  const { clientWidth, clientHeight } = mount;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / Math.max(clientHeight, 1);
  camera.updateProjectionMatrix();
}

function pushLine(verts, cols, color, a, b, lift) {
  verts.push(freqToX(a.freq), dbToY(a.db) + lift, rpmToZ(a.rpm));
  verts.push(freqToX(b.freq), dbToY(b.db) + lift, rpmToZ(b.rpm));
  cols.push(color.r, color.g, color.b, color.r, color.g, color.b);
}

function ridge(freq, center, width, gain) {
  return gain * Math.exp(-Math.pow((freq - center) / width, 2));
}

function pseudoNoise(f, r) {
  const n = Math.sin(f * 12.9898 + r * 78.233) * 43758.5453;
  return (n - Math.floor(n)) - 0.5;
}

function ampTurbulence(r, f) {
  return Math.abs(Math.sin(r * 0.37 + f * 0.19));
}

function colorForDb(db) {
  const t = Math.pow(normalizeDb(db), 0.62);
  const stops = [
    [0.0, new THREE.Color(0x07144d)],
    [0.27, new THREE.Color(0x0054bb)],
    [0.52, new THREE.Color(0x03d3ff)],
    [0.74, new THREE.Color(0xffe04f)],
    [1.0, new THREE.Color(0xff3228)]
  ];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [aT, aC] = stops[i];
    const [bT, bC] = stops[i + 1];
    if (t >= aT && t <= bT) {
      return aC.clone().lerp(bC, (t - aT) / (bT - aT));
    }
  }
  return stops[stops.length - 1][1].clone();
}

function freqToX(freq) {
  return lerp(-xSpan / 2, xSpan / 2, (freq - freqMin) / (freqMax - freqMin));
}

function rpmToZ(rpm) {
  return lerp(-zSpan / 2, zSpan / 2, (rpm - rpmMin) / (rpmMax - rpmMin));
}

function dbToY(db) {
  return normalizeDb(db) * yScale;
}

function normalizeDb(db) {
  return clamp((db - dbMin) / (dbMax - dbMin), 0, 1);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

window.addEventListener("resize", resize);
resize();
animate();
