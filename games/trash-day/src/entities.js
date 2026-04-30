import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const C = {
  truckYellow:     0xF5C518,
  truckOrange:     0xE87722,
  truckDark:       0x2B2B2B,
  truckWindshield: 0xA8D8EA,
  truckBumper:     0x888888,
  armGray:         0x9E9E9E,
  armClaw:         0xBDBDBD,
  roadAsphalt:     0x4A4A52,
  trashBody:       0x3D3D3D,
  trashLid:        0x555555,
  roofBrown:       0x7A4E2D,
  windowPale:      0xD6EEFF,
  doorWarm:        0xC47C3A,
  grass:           0x7BC96F,
};

const HOUSE_COLORS = [0xE05C5C, 0x5B8DD9, 0xF0E2A0, 0x6FCF97, 0xB47FD8];
let _houseColorIndex = 0;

const CONFETTI_COLORS = [0xFF3B30, 0xFFD60A, 0x007AFF, 0x34C759, 0xFF9500, 0xFF2D78];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rTop, rBot, h, segs, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, h, segs),
    mat(color)
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// createTruck
// ---------------------------------------------------------------------------
/**
 * Returns a THREE.Group representing the garbage truck.
 * The arm is a named child group: truck.getObjectByName('arm')
 *
 * Coordinate convention (local space, truck faces +Z):
 *   - truck sits at y=0 (bottom of wheels on ground)
 *   - total footprint roughly 2.4 wide × 5.0 long
 */
export function createTruck() {
  const truck = new THREE.Group();

  // --- Chassis (flat underframe) ---
  const chassis = box(2.6, 0.25, 5.2, C.truckDark, 0, 0.125, 0.1);
  truck.add(chassis);

  // --- Wheels (4 cylinders, rotated to lie flat) ---
  const wheelPositions = [
    [-1.35,  0.38,  1.4],  // front-left
    [ 1.35,  0.38,  1.4],  // front-right
    [-1.35,  0.38, -1.4],  // rear-left
    [ 1.35,  0.38, -1.4],  // rear-right
  ];
  for (const [wx, wy, wz] of wheelPositions) {
    const wheel = cyl(0.38, 0.38, 0.28, 12, C.truckDark, wx, wy, wz);
    wheel.rotation.z = Math.PI / 2;
    truck.add(wheel);
  }

  // --- Cab (front block) ---
  // Cab sits on top of chassis, occupies front ~1.8 units of length
  const cab = box(2.0, 1.4, 1.8, C.truckYellow, 0, 0.25 + 0.7, 1.4);
  truck.add(cab);

  // Windshield — recessed on front face of cab (+Z face)
  const windshield = box(1.3, 0.7, 0.08, C.truckWindshield, 0, 0.25 + 1.0, 2.3 + 0.01);
  truck.add(windshield);

  // Bumper strip along front bottom
  const bumper = box(2.15, 0.2, 0.15, C.truckBumper, 0, 0.25 + 0.1, 2.35);
  truck.add(bumper);

  // Cab roof — slightly wider/taller cap
  const cabRoof = box(2.05, 0.18, 1.85, C.truckYellow, 0, 0.25 + 1.44, 1.4);
  truck.add(cabRoof);

  // --- Hopper (rear block, larger) ---
  // Hopper sits directly behind cab
  const hopper = box(2.2, 1.8, 3.0, C.truckOrange, 0, 0.25 + 0.9, -1.0);
  truck.add(hopper);

  // Hopper lip/top trim
  const hopperLip = box(2.25, 0.14, 3.05, C.truckDark, 0, 0.25 + 1.87, -1.0);
  truck.add(hopperLip);

  // --- Arm (mounted on right side of hopper) ---
  // The arm Group pivot is at hopper right-side mid-height
  // Dev rotates this group around Z to swing the arm up/out
  const arm = new THREE.Group();
  arm.name = 'arm';
  // Position pivot at right side of hopper, mid-height
  arm.position.set(1.1, 0.25 + 0.9, -0.8);

  // Lower boom — vertical bar extending upward from pivot
  const boom = box(0.22, 1.4, 0.22, C.armGray, 0, 0.7, 0);
  arm.add(boom);

  // Upper claw/scoop — sits at top of boom, extends outward
  const clawPivot = new THREE.Group();
  clawPivot.position.set(0, 1.4, 0);
  arm.add(clawPivot);

  const clawArm = box(0.7, 0.2, 0.2, C.armGray, 0.35, 0, 0);
  clawPivot.add(clawArm);

  const clawTip = box(0.28, 0.38, 0.28, C.armClaw, 0.72, -0.1, 0);
  clawPivot.add(clawTip);

  truck.add(arm);

  return truck;
}

// ---------------------------------------------------------------------------
// createHouse
// ---------------------------------------------------------------------------
/**
 * Returns a THREE.Group for a chunky low-poly house.
 * Body color cycles through HOUSE_COLORS on each call.
 * House sits at y=0 (bottom of body on ground).
 */
export function createHouse() {
  const house = new THREE.Group();

  const bodyColor = HOUSE_COLORS[_houseColorIndex % HOUSE_COLORS.length];
  _houseColorIndex++;

  // Body
  const body = box(3.0, 2.4, 2.6, bodyColor, 0, 1.2, 0);
  house.add(body);

  // Roof — pyramid (CylinderGeometry with radiusTop=0, 4 sides)
  const roofMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0, 2.1, 1.4, 4, 1),
    mat(C.roofBrown)
  );
  roofMesh.position.set(0, 2.4 + 0.7, 0);
  roofMesh.rotation.y = Math.PI / 4; // align pyramid corners with body corners
  roofMesh.castShadow = true;
  house.add(roofMesh);

  // Windows — two small squares on front face (+Z)
  const winZ = 1.31;
  const winY = 1.5;
  house.add(box(0.55, 0.55, 0.06, C.windowPale, -0.75, winY, winZ));
  house.add(box(0.55, 0.55, 0.06, C.windowPale,  0.75, winY, winZ));

  // Door — lower center front
  house.add(box(0.55, 0.9, 0.06, C.doorWarm, 0, 0.45, winZ));

  return house;
}

// ---------------------------------------------------------------------------
// createTrashCan
// ---------------------------------------------------------------------------
/**
 * Returns a THREE.Group for a trash can.
 * Sits at y=0 (bottom on ground). Total height ~1.8 units.
 */
export function createTrashCan() {
  const can = new THREE.Group();

  // Body — slightly tapered cylinder (narrower at bottom)
  const body = cyl(0.38, 0.30, 1.5, 10, C.trashBody, 0, 0.75, 0);
  can.add(body);

  // Lid — wider, short cylinder on top
  const lid = cyl(0.44, 0.44, 0.2, 10, C.trashLid, 0, 1.6, 0);
  can.add(lid);

  // Lid rim — thin dark ring at base of lid
  const rim = cyl(0.46, 0.46, 0.06, 10, 0x222222, 0, 1.48, 0);
  can.add(rim);

  return can;
}

// ---------------------------------------------------------------------------
// createRoadSegment
// ---------------------------------------------------------------------------
/**
 * Returns a flat THREE.Mesh road panel.
 * Rotated to lie flat on XZ plane.
 * @param {number} width  - road width in world units
 * @param {number} length - road length (depth, along Z axis)
 */
export function createRoadSegment(width = 8, length = 20) {
  const geo = new THREE.PlaneGeometry(width, length);
  const mesh = new THREE.Mesh(geo, mat(C.roadAsphalt));
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// createParticle
// ---------------------------------------------------------------------------
/**
 * Returns a single confetti chip (small flat box).
 * Color is random from the confetti palette.
 * Spawn position, velocity, and lifetime are managed by game logic.
 */
export function createParticle() {
  const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.15, 0.02),
    mat(color)
  );
  // Random initial rotation so chips look varied
  mesh.rotation.set(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2
  );
  return mesh;
}
