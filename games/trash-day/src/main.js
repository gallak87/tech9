// PREVIEW MODE — swap back to main.game.js after art review
import * as THREE from 'three';
import { createTruck, createHouse, createTrashCan, createRoadSegment, createParticle } from './entities.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// Camera looking at the lineup from a slight angle
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 9, -18);
camera.lookAt(0, 1, 2);

// Art agent recommended: HemisphereLight for toy-set vibe
const hemi = new THREE.HemisphereLight(0x87ceeb, 0x7BC96F, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(10, 20, -10);
sun.castShadow = true;
scene.add(sun);

// Ground / road
const road = createRoadSegment(28, 30);
road.position.set(0, 0, 5);
scene.add(road);

// Grass on sides
const grassMat = new THREE.MeshLambertMaterial({ color: 0x7BC96F });
const grassL = new THREE.Mesh(new THREE.PlaneGeometry(12, 30), grassMat);
grassL.rotation.x = -Math.PI / 2;
grassL.position.set(-20, -0.01, 5);
scene.add(grassL);
const grassR = grassL.clone();
grassR.position.set(20, -0.01, 5);
scene.add(grassR);

// --- Truck ---
const truck = createTruck();
truck.position.set(-7, 0, 2);
scene.add(truck);

// --- Trash can (next to truck) ---
const can = createTrashCan();
can.position.set(-3, 0, 2);
scene.add(can);

// --- House ---
const house = createHouse();
house.position.set(4, 0, 4);
scene.add(house);

// Second house (different color)
const house2 = createHouse();
house2.position.set(9, 0, 0);
scene.add(house2);

// --- Confetti burst preview (frozen mid-air above the can) ---
for (let i = 0; i < 20; i++) {
  const p = createParticle();
  p.position.set(
    -3 + (Math.random() - 0.5) * 3,
    1.5 + Math.random() * 2.5,
    2 + (Math.random() - 0.5) * 3
  );
  scene.add(p);
}

// Label overlay
const label = document.createElement('div');
label.style.cssText = `
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  font: 700 16px system-ui; color: #fff;
  text-shadow: 0 1px 4px #000;
  pointer-events: none;
`;
label.textContent = 'ART PREVIEW — truck · trash can · houses · confetti';
document.body.appendChild(label);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  // Slowly rotate the truck so you can see all sides
  truck.rotation.y += 0.004;
  renderer.render(scene, camera);
}
animate();
