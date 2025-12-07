// =====================
// MEASUREMENT TRACKING
// =====================
let velocityX = 0; // vertical rotation speed
let velocityY = 0; // horizontal rotation speed

// =====================
// CANVAS SETUP
// =====================
const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d", { alpha: true });
let dpr = window.devicePixelRatio || 1;

const measurement = {
  result: 0,
  rotationX: 0,
  rotationZ: 0,
};

const measurements = [];

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

resize();
window.addEventListener("resize", () => {
  dpr = window.devicePixelRatio || 1;
  resize();
});

// =====================
// STATE
// =====================
let rotationX = 0; // rotation around X axis
let rotationZ = 0; // rotation around Z axis
let dragging = false;
let lastX = 0;
let lastY = 0;
let pUp = 0;
let pDown = 0;
let measurementActive = false;
let tempLabel = null;

function randomUnitVector() {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return {
    x: Math.sin(phi) * Math.cos(theta),
    y: Math.sin(phi) * Math.sin(theta),
    z: Math.cos(phi)
  };
}

let trueState = randomUnitVector();

// =====================
// INPUT HANDLING
// =====================
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  
  // Quick align to axes
  if (e.key.toLowerCase() === 'x') {
    rotationX = Math.PI / 2;
    rotationY =  0;
  } else if (e.key.toLowerCase() === 'y') {
    rotationX = Math.PI / 2;
    rotationY =  Math.PI / 2;
  } else if (e.key.toLowerCase() === 'z') {
    rotationX = 0;
    rotationY =  0;
  }
});

window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

canvas.addEventListener("pointerdown", (e) => {
  if (e.ctrlKey || e.metaKey) {
    measurementActive = true;
    return;
  }
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});

canvas.addEventListener("pointerup", (e) => {
  if (measurementActive) {
    // Get measurement axis in lab frame
    const measAxisLabFrame = inverseRotateVec(0, 0, 1);
    
    measurements.push({
      result: Math.random() < pUp / 100 ? +1 : -1,
      rotationX: rotationX,
      rotationZ: rotationZ,
      nx: measAxisLabFrame.x,
      ny: measAxisLabFrame.y,
      nz: measAxisLabFrame.z
    });
    tempLabel = {
      text: `Result: ${measurements[measurements.length - 1].result > 0 ? "|up⟩" : "|down⟩"}`,
      startTime: performance.now()
    };
    calculateEstimatedState();
  }
  dragging = false;
  measurementActive = false;
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging || measurementActive) return;
  
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  
  const sensitivity = 0.005;
  
  // Update velocity
  velocityY = dx * sensitivity;  // horizontal drag -> rotation around Z
  velocityX = dy * sensitivity;  // vertical drag -> rotation around X
  
  rotationZ += velocityY;
  rotationX += velocityX;
  
  // Wrap angles
  rotationX = ((rotationX + Math.PI) % (2 * Math.PI)) - Math.PI;
  rotationZ = ((rotationZ + Math.PI) % (2 * Math.PI)) - Math.PI;
});

function updateRotationWithMomentum() {
  if (!dragging && !measurementActive) {
    const damping = 0.95;
    
    rotationX += velocityX;
    rotationZ += velocityY;
    
    velocityX *= damping;
    velocityY *= damping;
    
    if (Math.abs(velocityX) < 0.0001) velocityX = 0;
    if (Math.abs(velocityY) < 0.0001) velocityY = 0;
    
    rotationX = ((rotationX + Math.PI) % (2 * Math.PI)) - Math.PI;
    rotationZ = ((rotationZ + Math.PI) % (2 * Math.PI)) - Math.PI;
  }
}

canvas.addEventListener("pointerleave", () => {
  dragging = false;
  measurementActive = false;
});

// =====================
// 3D MATH
// =====================
function rotateVec(x, y, z) {
  // First rotate around X axis
  let y2 = y * Math.cos(rotationX) - z * Math.sin(rotationX);
  let z2 = y * Math.sin(rotationX) + z * Math.cos(rotationX);
  y = y2;
  z = z2;
  
  // Then rotate around Z axis
  let x3 = x * Math.cos(rotationZ) - y * Math.sin(rotationZ);
  let y3 = x * Math.sin(rotationZ) + y * Math.cos(rotationZ);
  x = x3;
  y = y3;
  
  return { x, y, z };
}

function inverseRotateVec(x, y, z) {
  // Apply inverse rotations in reverse order
  // First inverse rotate around Z axis
  let x2 = x * Math.cos(rotationZ) + y * Math.sin(rotationZ);
  let y2 = -x * Math.sin(rotationZ) + y * Math.cos(rotationZ);
  x = x2;
  y = y2;
  
  // Then inverse rotate around X axis
  let y3 = y * Math.cos(rotationX) + z * Math.sin(rotationX);
  let z3 = -y * Math.sin(rotationX) + z * Math.cos(rotationX);
  y = y3;
  z = z3;
  
  return { x, y, z };
}

function projectVector(vec3, cx, cy, radius) {
  const r = rotateVec(vec3.x, vec3.y, vec3.z);
  // Standard projection: x maps to screen x, z maps to screen y (inverted)
  return {
    x: cx + radius * r.x,
    y: cy - radius * r.z,  // negative because canvas Y increases downward
    z: r.y  // depth (for visibility)
  };
}

function calculateEstimatedState() {
  if (!measurements || measurements.length === 0) return null;
  
  // Get measurement axes from stored values
  const nVectors = measurements.map(m => ({
    n: { x: m.nx, y: m.ny, z: m.nz },
    result: m.result
  }));
  
  // For a single measurement, MLE is exactly along the measurement axis
  if (nVectors.length === 1) {
    const { n, result } = nVectors[0];
    return {
      x: n.x * result,
      y: n.y * result,
      z: n.z * result
    };
  }
  
  // Initialize v as weighted sum of measurement axes
  let sumX = 0, sumY = 0, sumZ = 0;
  for (const { n, result } of nVectors) {
    sumX += n.x * result;
    sumY += n.y * result;
    sumZ += n.z * result;
  }
  
  let norm = Math.sqrt(sumX * sumX + sumY * sumY + sumZ * sumZ);
  if (norm < 1e-10) {
    // If all measurements cancel, return a default
    return { x: 0, y: 0, z: 1 };
  }
  
  let v = { x: sumX / norm, y: sumY / norm, z: sumZ / norm };
  
  // Gradient ascent to maximize log-likelihood
  const lr = 0.01;
  const maxIter = 100;
  const eps = 1e-6;
  
  for (let iter = 0; iter < maxIter; iter++) {
    let grad = { x: 0, y: 0, z: 0 };
    
    for (const { n, result } of nVectors) {
      const dot = n.x * v.x + n.y * v.y + n.z * v.z;
      const denom = 1 + result * dot;
      
      if (denom > eps) {
        const factor = result / denom;
        grad.x += factor * n.x;
        grad.y += factor * n.y;
        grad.z += factor * n.z;
      }
    }
    
    // Project gradient onto tangent space (perpendicular to v)
    const gradDotV = grad.x * v.x + grad.y * v.y + grad.z * v.z;
    grad.x -= gradDotV * v.x;
    grad.y -= gradDotV * v.y;
    grad.z -= gradDotV * v.z;
    
    // Update v
    v.x += lr * grad.x;
    v.y += lr * grad.y;
    v.z += lr * grad.z;
    
    // Renormalize to stay on unit sphere
    norm = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    v.x /= norm;
    v.y /= norm;
    v.z /= norm;
    
    // Check convergence
    const gradNorm = Math.sqrt(grad.x * grad.x + grad.y * grad.y + grad.z * grad.z);
    if (gradNorm < 1e-6) break;
  }
  
  return v;
}

// =====================
// DRAWING
// =====================
function drawArrow(fromX, fromY, toX, toY, color = "red") {
  const headSize = 10;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headSize * Math.cos(angle - Math.PI / 6), toY - headSize * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - headSize * Math.cos(angle + Math.PI / 6), toY - headSize * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawGlobe(cx, cy, r) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = "white";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  
  const latSteps = [-60, -30, 0, 30, 60];
  for (let lat of latSteps) drawLatitudeLine(cx, cy, r, lat * Math.PI / 180);
  for (let lon = 0; lon < 360; lon += 30) drawLongitudeLine(cx, cy, r, lon * Math.PI / 180);
}

function drawLatitudeLine(cx, cy, r, lat) {
  const steps = 120;
  let prev = null;
  
  for (let i = 0; i <= steps; i++) {
    const lon = (i / steps) * Math.PI * 2;
    // Standard spherical coordinates: theta=latitude, phi=longitude
    const x = Math.cos(lat) * Math.cos(lon);
    const y = Math.cos(lat) * Math.sin(lon);
    const z = Math.sin(lat);
    
    const p = rotateVec(x, y, z);
    const px = cx + r * p.x;
    const py = cy - r * p.z;  // Z maps to vertical
    
    if (prev) {
      const isFront = (prev.z > 0) && (p.y > 0);
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(px, py);
      ctx.strokeStyle = isFront ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    prev = { x: px, y: py, z: p.y };
  }
}

function drawLongitudeLine(cx, cy, r, lon) {
  const steps = 120;
  let prev = null;
  
  for (let i = 0; i <= steps; i++) {
    const lat = -Math.PI / 2 + (i / steps) * Math.PI;
    const x = Math.cos(lat) * Math.cos(lon);
    const y = Math.cos(lat) * Math.sin(lon);
    const z = Math.sin(lat);
    
    const p = rotateVec(x, y, z);
    const px = cx + r * p.x;
    const py = cy - r * p.z;
    
    if (prev) {
      const isFront = (prev.z > 0) && (p.y > 0);
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(px, py);
      ctx.strokeStyle = isFront ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    prev = { x: px, y: py, z: p.y };
  }
}

function drawMeasurementBar(cx, cy, radius, stateVec) {
  const topY = cy - radius;
  const bottomY = cy + radius;
  const barX = cx;
  
  // Rotate state vector and get Z component
  const r = rotateVec(stateVec.x, stateVec.y, stateVec.z);
  
  // Z component determines up/down probabilities
  const projZ = r.z;
  
  // Convert to probability: z=1 -> 100% up, z=-1 -> 100% down
  const t = (1 - projZ) / 2;  // 0 at top (z=1), 1 at bottom (z=-1)
  const projY = topY + t * (bottomY - topY);
  
  // Draw top (up state - green)
  ctx.beginPath();
  ctx.moveTo(barX, topY);
  ctx.lineTo(barX, projY);
  ctx.strokeStyle = "blue";
  ctx.lineWidth = 6;
  ctx.stroke();
  
  // Draw bottom (down state - blue)
  ctx.beginPath();
  ctx.moveTo(barX, projY);
  ctx.lineTo(barX, bottomY);
  ctx.strokeStyle = "green";
  ctx.lineWidth = 6;
  ctx.stroke();
  
  // Dashed line from state to bar
  const tip = projectVector(stateVec, cx, cy, radius);
  ctx.save();
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(barX, projY);
  ctx.stroke();
  ctx.restore();
  
  // Labels
  ctx.font = "18px Arial";
  ctx.textAlign = "left";
  ctx.fillStyle = "green";
  ctx.fillText("|up⟩", barX + 15, topY + 5);
  ctx.fillStyle = "blue";
  ctx.fillText("|down⟩", barX + 15, bottomY);
  
  // Percentages
  pUp = ((projZ + 1) / 2) * 100;
  pDown = 100 - pUp;
  
  ctx.font = "16px Arial";
  ctx.textAlign = "left";
  ctx.fillStyle = "blue";
  ctx.fillText(`${pDown.toFixed(1)}%`, barX + 15, (topY + projY) / 2);
  ctx.fillStyle = "green";
  ctx.fillText(`${pUp.toFixed(1)}%`, barX + 15, (projY + bottomY) / 2);
}

// =====================
// RENDER LOOP
// =====================
function render() {
  updateRotationWithMomentum();
  
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  
  ctx.clearRect(0, 0, w, h);
  
  // Display current measurement axis
  ctx.font = "14px Arial";
  ctx.fillStyle = "pink";
  ctx.textAlign = "left";
  ctx.fillText(`Rotation X: ${rotationX.toFixed(3)}`, 20, 20);
  ctx.fillText(`Rotation Z: ${rotationZ.toFixed(3)}`, 20, 40);
  
  // Calculate measurement axis - inverse rotate (0,0,1) to get lab frame axis
  const measAxisLabFrame = inverseRotateVec(0, 0, 1);
  const nx = measAxisLabFrame.x;
  const ny = measAxisLabFrame.y;
  const nz = measAxisLabFrame.z;
  ctx.fillText(`n: (${nx.toFixed(3)}, ${ny.toFixed(3)}, ${nz.toFixed(3)})`, 20, 60);
  
  ctx.font = "14px Arial";
  ctx.fillStyle = "blue";
  ctx.textAlign = "left";
  ctx.fillText(`Drag to rotate Bloch Sphere`, 20, 80);
  ctx.fillText(`CTRL+Click to take measurement`, 20, 100);
  ctx.fillText(`w,a,s,d for Bloch sphere rotations`, 20, 120);
  ctx.fillText(`x,y,z to align to Pauli axes`, 20, 140);

  // Divider
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.stroke();
  
  const radius = Math.min(w, h) * 0.25;
  const centerX = w * 0.25;
  const centerY = h / 2;
  const rightX = w * 0.75;
  const rightY = h / 2;
  
  // Left globe (true state)
  if (!measurementActive) drawGlobe(centerX, centerY, radius);
  const tip = projectVector(trueState, centerX, centerY, radius);
  drawArrow(centerX, centerY, tip.x, tip.y, "red");
  
  // Draw measurement axis on left sphere (should always point up in viewer frame)
  const measAxis = measAxisLabFrame;  // Z-axis in viewer frame
  const measTip = projectVector(measAxis, centerX, centerY, radius);
  if(!measurementActive) drawArrow(centerX, centerY, measTip.x, measTip.y, "yellow");
  //drawArrow(centerX, centerY, 1, 0, "yellow");
  
  if(measurementActive) drawMeasurementBar(centerX, centerY, radius, trueState);
  
  // Right globe (estimated state)
  drawGlobe(rightX, rightY, radius);
  const estState = calculateEstimatedState();
  if (estState) {
    const tipEst = projectVector(estState, rightX, rightY, radius);
    drawArrow(rightX, rightY, tipEst.x, tipEst.y, "cyan");

  }
  
  // WASD controls
  const wasdSpeed = 0.03;
  if (keys['w']) velocityX -= wasdSpeed;
  if (keys['s']) velocityX += wasdSpeed;
  if (keys['a']) velocityY -= wasdSpeed;
  if (keys['d']) velocityY += wasdSpeed;
  
  
  // Legend
  ctx.font = "14px Arial";
  ctx.textAlign = "left";
  ctx.fillStyle = "yellow";
  ctx.fillText("Measurement Axis", rightX + radius + 20, rightY - 30);
  ctx.fillStyle = "cyan";
  ctx.fillText("ML estimate", rightX + radius + 20, rightY - 10);
  ctx.fillStyle = "red";
  ctx.fillText("True state", rightX + radius + 20, rightY + 10);
  if (estState) {
    ctx.fillStyle = "blue";
    ctx.fillText(`Overlap: ${(estState.x * trueState.x+estState.z * trueState.z+estState.y * trueState.y).toFixed(3)}`, rightX + radius + 20, rightY + 30);
  }
  // Temporary label
  if (tempLabel) {
    const elapsed = performance.now() - tempLabel.startTime;
    const fadeDuration = 2000;
    if (elapsed < fadeDuration) {
      ctx.fillStyle = `rgba(255,255,255,${1 - elapsed / fadeDuration})`;
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText(tempLabel.text, rightX, 50);
    } else {
      tempLabel = null;
    }
  }
  
  requestAnimationFrame(render);
}

requestAnimationFrame(render);