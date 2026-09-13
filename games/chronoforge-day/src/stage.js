import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createHumanoid } from './characters/humanoid.js';
import { applyPose, CLIPS } from './animation/clips.js';

const LOOKS = {
  studio: { background: '#161c28', floor: '#283040', key: '#fff0dc', fill: '#b5d2ff', rim: '#d5b9ff', keyPower: 3.5, fillPower: 1.1, rimPower: 2.4 },
  daylight: { background: '#b2bdc6', floor: '#889590', key: '#fff4db', fill: '#c2ddff', rim: '#ffffff', keyPower: 3.3, fillPower: 1.3, rimPower: 1.1 },
  dusk: { background: '#242035', floor: '#352d40', key: '#ffcfa0', fill: '#91aaff', rim: '#ed9fc9', keyPower: 2.7, fillPower: 1.1, rimPower: 2.7 },
};

function disposeObject(object) {
  const geometries = new Set(), materials = new Set();
  object.traverse(child => {
    if (child.geometry) geometries.add(child.geometry);
    if (child.material) (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => materials.add(m));
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
}

export class CharacterStage {
  constructor(host, { onCameraChange = () => {}, onContextLoss = () => {} } = {}) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute('aria-label', 'Kaida character preview. Drag to orbit; scroll to zoom; right-drag to pan.');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    host.appendChild(this.renderer.domElement);
    this.contextLoss = event => { event.preventDefault(); onContextLoss(); };
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLoss);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(LOOKS.studio.background);
    this.scene.fog = new THREE.Fog(LOOKS.studio.background, 12, 32);
    this.camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.05, 80);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minZoom = 0.55;
    this.controls.maxZoom = 1.8;
    this.controls.rotateSpeed = 0.65;
    this.controls.zoomSpeed = 0.7;
    this.controls.addEventListener('change', () => {
      if (!this.configuring) onCameraChange({
        cameraPose: { position: this.camera.position.toArray(), target: this.controls.target.toArray() },
        zoom: this.camera.zoom,
      });
    });

    // A tiny local reflection environment. Geometry is authored in code and
    // captured once; no HDR download or heavyweight postprocessing chain.
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.45;
    room.dispose();
    pmrem.dispose();

    this.hemi = new THREE.HemisphereLight('#dbe4ff', '#323044', 1.0);
    this.key = new THREE.DirectionalLight('#fff0dc', 3.5);
    this.key.position.set(-3, 5, 4);
    this.key.target.position.set(0, 0.8, 0);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -2.5, right: 2.5, top: 3, bottom: -2, near: 0.5, far: 12 });
    this.key.shadow.normalBias = 0.012;
    this.key.shadow.bias = -0.00015;
    this.fill = new THREE.DirectionalLight('#b5d2ff', 1.1);
    this.fill.position.set(3, 2, 2);
    this.rim = new THREE.DirectionalLight('#d5b9ff', 2.4);
    this.rim.position.set(2, 3, -3);
    this.scene.add(this.hemi, this.key, this.key.target, this.fill, this.rim);

    this.stageProps = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#283040', roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.012;
    floor.receiveShadow = true;
    this.floor = floor;
    this.stageProps.add(floor);
    this.grid = new THREE.GridHelper(6, 30, '#687286', '#414b60');
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.24;
    this.grid.position.y = -0.007;
    this.stageProps.add(this.grid);
    const circlePoints = Array.from({ length: 128 }, (_, i) => new THREE.Vector3(Math.cos(i / 128 * Math.PI * 2) * 1.38, -0.004, Math.sin(i / 128 * Math.PI * 2) * 1.38));
    this.stageProps.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(circlePoints), new THREE.LineBasicMaterial({ color: '#9b8b79', transparent: true, opacity: 0.33 })));

    this.target = new THREE.Group();
    const targetMaterial = new THREE.MeshBasicMaterial({ color: '#d3b17c', transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide });
    this.targetRing = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.0035, 5, 48), targetMaterial);
    this.target.add(this.targetRing);
    const crossMaterial = new THREE.LineBasicMaterial({ color: '#d3b17c', transparent: true, opacity: 0.45 });
    this.target.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.14, 0, 0), new THREE.Vector3(0.14, 0, 0),
      new THREE.Vector3(0, -0.14, 0), new THREE.Vector3(0, 0.14, 0),
    ]), crossMaterial));
    this.stageProps.add(this.target);

    this.contactDiscs = ['left', 'right'].map(() => {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.095, 40), new THREE.MeshBasicMaterial({ color: '#83d8c5', transparent: true, opacity: 0.35, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2;
      this.stageProps.add(disc);
      return disc;
    });
    this.trajectory = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#d49bdb', transparent: true, opacity: 0.45, depthTest: false }));
    this.trajectory.frustumCulled = false;
    this.stageProps.add(this.trajectory);
    this.scene.add(this.stageProps);

    this.tip = new THREE.Vector3();
    this.targetPoint = new THREE.Vector3();
    this.foot = new THREE.Vector3();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
  }

  update(state, previous = null) {
    this.configuring = true;
    const changed = key => !previous || JSON.stringify(state[key]) !== JSON.stringify(previous[key]);
    const newCharacter = changed('character');
    if (newCharacter) {
      if (this.skeletonHelper) {
        this.scene.remove(this.skeletonHelper);
        this.skeletonHelper.dispose();
      }
      if (this.rig) { this.scene.remove(this.rig.root); this.rig.dispose(); }
      this.rig = createHumanoid(state.character);
      this.rig.root.updateMatrixWorld(true);
      this.scene.add(this.rig.root);
      this.skeletonHelper = new THREE.SkeletonHelper(this.rig.root);
      this.skeletonHelper.material.depthTest = false;
      this.skeletonHelper.material.transparent = true;
      this.skeletonHelper.material.opacity = 0.75;
      this.skeletonHelper.renderOrder = 8;
      this.scene.add(this.skeletonHelper);
    }
    if (newCharacter || changed('motion')) {
      this.targetPoint.set(-state.character.height * 0.13, state.character.height * 0.62, state.character.height * 0.65 * state.motion.reach);
      this.target.position.copy(this.targetPoint);
    }
    if (changed('lighting')) {
      const look = LOOKS[state.lighting];
      this.scene.background.set(look.background);
      this.scene.fog.color.set(look.background);
      this.floor.material.color.set(look.floor);
      for (const name of ['key', 'fill', 'rim']) {
        this[name].color.set(look[name]);
        this[name].intensity = look[`${name}Power`];
      }
    }
    this.renderer.toneMappingExposure = state.exposure;
    this.rig.setWireframe(state.view.wireframe);
    this.skeletonHelper.visible = state.view.skeleton;
    this.grid.visible = state.view.grid;
    this.target.visible = state.view.target;
    this.trajectory.visible = state.view.trajectory;
    this.contactDiscs.forEach(disc => { disc.visible = state.view.contacts; });
    this.state = state;
    if (newCharacter || changed('camera') || changed('cameraPose') || changed('zoom')) this.setCamera(state);
    if (newCharacter || changed('clip') || changed('motion')) this.sampleTrajectory(state);
    this.configuring = false;
  }

  setCamera(state) {
    const h = state.character.height;
    if (state.cameraPose) {
      this.camera.position.fromArray(state.cameraPose.position);
      this.controls.target.fromArray(state.cameraPose.target);
    } else {
      const angles = {
        threeQuarter: [-3.6, 2.2, 5.6], front: [0, 0.55, 6],
        side: [6, 0.55, 0], back: [0, 0.55, -6], game: [-5, 6, 8],
      };
      this.controls.target.set(0, h * 0.49, 0.08);
      this.camera.position.fromArray(angles[state.camera]).add(this.controls.target);
    }
    this.camera.zoom = state.zoom;
    this.controls.update();
    this.resize();
  }

  resize() {
    if (!this.state) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    const aspect = width / height;
    const frame = this.state.character.height * (this.state.camera === 'game' ? 2.1 : 1.52) * Math.max(1, 0.82 / aspect);
    this.camera.left = -frame * aspect / 2;
    this.camera.right = frame * aspect / 2;
    this.camera.top = frame / 2;
    this.camera.bottom = -frame / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  sampleTrajectory(state) {
    const clip = CLIPS.find(c => c.id === state.clip) || CLIPS[0];
    const points = [];
    for (let i = 0; i <= 96; i++) {
      applyPose(this.rig, state.clip, clip.duration * i / 96, state.motion);
      this.rig.root.updateMatrixWorld(true);
      points.push(this.rig.weapon.tip.getWorldPosition(new THREE.Vector3()));
    }
    const old = this.trajectory.geometry;
    this.trajectory.geometry = new THREE.BufferGeometry().setFromPoints(points);
    old.dispose();
    applyPose(this.rig, state.clip, state.time, state.motion);
    this.rig.root.updateMatrixWorld(true);
  }

  render(state) {
    const pose = applyPose(this.rig, state.clip, state.time, state.motion);
    this.rig.root.updateMatrixWorld(true);
    this.rig.weapon.tip.getWorldPosition(this.tip);
    const tipDistance = this.tip.distanceTo(this.targetPoint);
    this.targetRing.material.color.set(tipDistance < 0.105 ? '#9ef0bf' : '#d3b17c');
    this.targetRing.material.opacity = tipDistance < 0.105 ? 1 : 0.62;
    ['footL', 'footR'].forEach((bone, i) => {
      this.rig.bones[bone].getWorldPosition(this.foot);
      const disc = this.contactDiscs[i];
      disc.position.set(this.foot.x, 0.002, this.foot.z);
      const planted = pose.contacts?.[i === 0 ? 'left' : 'right'];
      disc.material.color.set(planted ? '#89dfc6' : '#cf8c99');
      disc.material.opacity = planted ? 0.45 : 0.16;
    });
    this.renderer.render(this.scene, this.camera);
    return { ...pose, tipDistance, triangles: this.renderer.info.render.triangles, bones: this.rig.skeleton.bones.length };
  }

  inspect() {
    this.rig.root.updateMatrixWorld(true);
    return {
      target: this.targetPoint.toArray(),
      tip: this.rig.weapon.tip.getWorldPosition(new THREE.Vector3()).toArray(),
      root: this.rig.root.position.toArray(),
      joints: Object.fromEntries(Object.entries(this.rig.bones).map(([key, bone]) => [key, bone.getWorldPosition(new THREE.Vector3()).toArray()])),
      renderer: { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, pixelRatio: this.renderer.getPixelRatio() },
    };
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.skeletonHelper?.dispose();
    this.rig?.dispose();
    disposeObject(this.stageProps);
    this.environment.dispose();
    this.key.shadow.map?.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLoss);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
