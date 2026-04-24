import * as THREE from 'three';
import { init as initGame } from './game.js';

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // sky blue

// Camera — behind and above the truck, looking forward
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 5, -10);
camera.lookAt(0, 1, 10);

// Lights
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(10, 20, 10);
sun.castShadow = true;
scene.add(sun);

const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

// Road — flat gray plane stretching ahead
const roadGeo = new THREE.PlaneGeometry(8, 500);
const roadMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
const road = new THREE.Mesh(roadGeo, roadMat);
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0, 120); // stretch ahead of start
road.receiveShadow = true;
scene.add(road);

// Truck placeholder — chunky green box
const truckGeo = new THREE.BoxGeometry(2, 1.5, 3.5);
const truckMat = new THREE.MeshLambertMaterial({ color: 0x2d8a4e });
const truck = new THREE.Mesh(truckGeo, truckMat);
truck.position.set(0, 0.75, 0);
truck.castShadow = true;
scene.add(truck);

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Game logic init (stub)
initGame({ scene, camera, renderer });

// Render loop
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
