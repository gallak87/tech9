import * as THREE from 'three';

const CAPACITY = 128;
const clamp = THREE.MathUtils.clamp;
const ENGINE = {
  jeep: { base: 29, range: 50, filter: 630, gain: 0.13, radius: 0.43 },
  atv: { base: 45, range: 76, filter: 920, gain: 0.095, radius: 0.31 },
  bike: { base: 53, range: 113, filter: 1200, gain: 0.09, radius: 0.35 },
};

/** Bounded surface particles and gesture-unlocked local synthesized sound. */
export class DrivingFeedback {
  constructor({ scene, camera = null }) {
    this.scene = scene;
    this.camera = camera;
    this.volume = 0.55;
    this.context = null;
    this.disposed = false;
    this.emit = 0;
    this.cursor = 0;
    this.seed = 531;
    this.collisionCooldown = 0;
    this.wasAirborne = false;
    this.positions = new Float32Array(CAPACITY * 3);
    this.sizes = new Float32Array(CAPACITY);
    this.alphas = new Float32Array(CAPACITY);
    this.colors = new Float32Array(CAPACITY * 3);
    this.particles = Array.from({ length: CAPACITY }, () => ({
      life: 0,
      duration: 1,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 1,
    }));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      'aSize',
      new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      'aAlpha',
      new THREE.BufferAttribute(this.alphas, 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(this.colors, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      uniforms: {
        fogColor: { value: new THREE.Color(0xa8b8b3) },
        fogDensity: { value: 0.002 },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vDepth;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * 480.0 / max(0.1, -mv.z), 0.0, 112.0);
          vAlpha = aAlpha;
          vColor = color;
          vDepth = -mv.z;
        }
      `,
      fragmentShader: `
        uniform vec3 fogColor;
        uniform float fogDensity;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vDepth;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float falloff = 1.0 - smoothstep(0.1, 1.0, dot(uv, uv));
          float cloud = 0.8 + 0.2 * sin(uv.x * 9.0 + sin(uv.y * 11.0));
          float alpha = falloff * falloff * vAlpha * cloud;
          if (alpha < 0.006) discard;
          float fog = 1.0 - exp(-fogDensity * fogDensity * vDepth * vDepth);
          gl_FragColor = vec4(mix(vColor, fogColor, fog), alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.dust = new THREE.Points(geometry, material);
    this.dust.name = 'bounded-local-wheel-dust';
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 3;
    scene.add(this.dust);
    this.listenerPosition = new THREE.Vector3();
    this.listenerDirection = new THREE.Vector3();
    this.listenerUp = new THREE.Vector3();
  }

  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Call directly from Start/Resume or another user gesture, never the frame loop. */
  async start() {
    if (this.disposed) return;
    const AudioContext =
      globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    if (!this.context) {
      try {
        const context = new AudioContext();
        this.context = context;
        this.master = context.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(context.destination);
        this.panner = context.createPanner();
        this.panner.panningModel = 'equalpower';
        this.panner.distanceModel = 'inverse';
        this.panner.refDistance = 4;
        this.panner.rolloffFactor = 0.35;
        this.panner.maxDistance = 80;
        this.panner.connect(this.master);
        this.engineGain = context.createGain();
        this.engineGain.gain.value = 0;
        this.engineFilter = context.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 700;
        this.engineFilter.Q.value = 0.75;
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.panner);
        this.engineA = context.createOscillator();
        this.engineB = context.createOscillator();
        this.engineA.type = 'sawtooth';
        this.engineB.type = 'triangle';
        this.engineA.frequency.value = 30;
        this.engineB.frequency.value = 60;
        this.harmonicGain = context.createGain();
        this.harmonicGain.gain.value = 0.33;
        this.engineA.connect(this.engineFilter);
        this.engineB.connect(this.harmonicGain);
        this.harmonicGain.connect(this.engineFilter);
        this.engineA.start();
        this.engineB.start();
        const buffer = context.createBuffer(
          1,
          context.sampleRate * 2,
          context.sampleRate,
        );
        const samples = buffer.getChannelData(0);
        let filtered = 0;
        for (let i = 0; i < samples.length; i++) {
          filtered = (filtered + (this.random() * 2 - 1) * 0.035) / 1.035;
          samples[i] = filtered * 5.2;
        }
        this.noise = context.createBufferSource();
        this.noise.buffer = buffer;
        this.noise.loop = true;
        this.tireFilter = context.createBiquadFilter();
        this.tireFilter.type = 'bandpass';
        this.tireFilter.frequency.value = 520;
        this.tireFilter.Q.value = 0.8;
        this.tireGain = context.createGain();
        this.tireGain.gain.value = 0;
        this.noise.connect(this.tireFilter);
        this.tireFilter.connect(this.tireGain);
        this.tireGain.connect(this.panner);
        this.noise.start();
        this.impactOscillator = context.createOscillator();
        this.impactOscillator.type = 'sine';
        this.impactOscillator.frequency.value = 73;
        this.impactGain = context.createGain();
        this.impactGain.gain.value = 0;
        this.impactOscillator.connect(this.impactGain);
        this.impactGain.connect(this.panner);
        this.impactOscillator.start();
      } catch {
        this.disposeAudio();
        return;
      }
    }
    try {
      await this.context.resume();
    } catch {
      /* A denied audio device must not interrupt driving. */
    }
  }

  setVolume(value) {
    this.volume = clamp(Number(value) || 0, 0, 1);
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(
        this.volume,
        this.context.currentTime,
        0.035,
      );
  }

  emitParticle(snapshot, impact = false) {
    const i = this.cursor++ % CAPACITY;
    const particle = this.particles[i];
    const spec = ENGINE[snapshot.vehicle] || ENGINE.jeep;
    const contacts = snapshot.contacts?.filter((contact) => contact.grounded);
    const rear = contacts?.slice(snapshot.vehicle === 'bike' ? -1 : -2);
    const contact = rear?.length
      ? rear[Math.floor(this.random() * rear.length)]
      : null;
    const heading = snapshot.heading || 0;
    const speed = snapshot.speed || 0;
    const surface = snapshot.surface?.kind || snapshot.surface;
    this.positions[i * 3] = contact?.x ?? snapshot.x;
    this.positions[i * 3 + 1] =
      (contact ? contact.y - spec.radius : snapshot.y) + 0.12;
    this.positions[i * 3 + 2] = contact?.z ?? snapshot.z;
    particle.duration = 0.65 + this.random() * 0.8;
    particle.life = particle.duration;
    particle.size = (impact ? 0.62 : 0.22) + this.random() * 0.31;
    particle.vx =
      (this.random() - 0.5) * (impact ? 3.5 : 1.2) -
      Math.sin(heading) * speed * 0.065;
    particle.vy = 0.28 + this.random() * 0.8;
    particle.vz =
      (this.random() - 0.5) * (impact ? 3.5 : 1.2) +
      Math.cos(heading) * speed * 0.065;
    const gravel =
      surface === 'gravel' || surface === 'rock' || surface === 'rocky';
    this.colors[i * 3] = gravel ? 0.47 : 0.48;
    this.colors[i * 3 + 1] = gravel ? 0.44 : 0.36;
    this.colors[i * 3 + 2] = gravel ? 0.34 : 0.22;
  }

  impact(strength) {
    if (!this.context || !this.impactGain) return;
    const t = this.context.currentTime;
    const gain = clamp(strength * 0.032, 0.02, 0.23);
    this.impactGain.gain.cancelScheduledValues(t);
    this.impactGain.gain.setValueAtTime(gain, t);
    this.impactGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
    this.impactOscillator.frequency.cancelScheduledValues(t);
    this.impactOscillator.frequency.setValueAtTime(92, t);
    this.impactOscillator.frequency.exponentialRampToValueAtTime(38, t + 0.2);
  }

  update(snapshot, dt) {
    if (this.disposed || !snapshot) return;
    const delta = clamp(dt, 0, 0.1);
    const speed = Math.abs(snapshot.speed || 0);
    const surface = snapshot.surface?.kind || snapshot.surface;
    const roughness = snapshot.surface?.roughness ?? 0.2;
    const active = snapshot.active !== false && snapshot.paused !== true;
    const landing =
      snapshot.landing || (this.wasAirborne && !snapshot.airborne ? 2 : 0);
    this.wasAirborne = snapshot.airborne;
    this.collisionCooldown = Math.max(0, this.collisionCooldown - delta);
    if (
      active &&
      ((snapshot.collision && this.collisionCooldown === 0) || landing > 0.8)
    ) {
      this.impact(landing || Math.max(speed, 2));
      this.collisionCooldown = 0.24;
      if (!snapshot.airborne)
        for (let i = 0; i < 12; i++) this.emitParticle(snapshot, true);
    }
    const firm =
      surface === 'trail' || surface === 'firm' || surface === 'tarmac';
    if (active && !snapshot.airborne && speed > 1.5) {
      this.emit +=
        delta *
        Math.min(55, speed * (firm ? 1.0 : 2.4) + (snapshot.slip || 0) * 14);
      while (this.emit >= 1) {
        this.emitParticle(snapshot);
        this.emit--;
      }
    } else this.emit = 0;
    for (let i = 0; i < CAPACITY; i++) {
      const particle = this.particles[i];
      particle.life = Math.max(0, particle.life - delta);
      if (particle.life === 0) {
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        continue;
      }
      const fraction = particle.life / particle.duration;
      this.positions[i * 3] += particle.vx * delta;
      this.positions[i * 3 + 1] += particle.vy * delta;
      this.positions[i * 3 + 2] += particle.vz * delta;
      particle.vx *= 1 - delta * 0.4;
      particle.vz *= 1 - delta * 0.4;
      particle.vy *= 1 - delta * 0.6;
      this.sizes[i] = particle.size * (1.4 - fraction * 0.4);
      this.alphas[i] = Math.min(1, (1 - fraction) * 10) * fraction * 0.3;
    }
    for (const attribute of Object.values(this.dust.geometry.attributes))
      attribute.needsUpdate = true;
    if (this.scene.fog) {
      this.dust.material.uniforms.fogColor.value.copy(this.scene.fog.color);
      this.dust.material.uniforms.fogDensity.value =
        this.scene.fog.density ?? 1 / (this.scene.fog.far || 500);
    }
    if (!this.context || this.context.state !== 'running') return;
    const t = this.context.currentTime;
    const spec = ENGINE[snapshot.vehicle] || ENGINE.jeep;
    const throttle = Math.abs(snapshot.throttle || 0);
    const gearPhase = Math.min(0.9, (speed % 8) / 8);
    const frequency =
      spec.base +
      spec.range * (gearPhase * 0.55 + throttle * 0.35 + speed / 80);
    this.engineA.frequency.setTargetAtTime(frequency, t, 0.085);
    this.engineB.frequency.setTargetAtTime(frequency * 2.015, t, 0.085);
    this.engineFilter.frequency.setTargetAtTime(
      spec.filter * (0.62 + throttle * 0.9 + speed / 50),
      t,
      0.1,
    );
    this.engineGain.gain.setTargetAtTime(
      active ? spec.gain * (0.25 + throttle * 0.55 + speed / 85) : 0,
      t,
      0.075,
    );
    const skid = Math.min(
      1,
      (snapshot.slip || 0) * 0.35 + ((snapshot.brake || 0) * speed) / 18,
    );
    this.tireFilter.frequency.setTargetAtTime(
      340 + (firm ? 650 : 140) * skid,
      t,
      0.06,
    );
    this.tireGain.gain.setTargetAtTime(
      active && !snapshot.airborne
        ? Math.min(0.19, speed * (0.0013 + roughness * 0.001) + skid * 0.12)
        : 0,
      t,
      0.06,
    );
    if (this.panner.positionX) {
      this.panner.positionX.setValueAtTime(snapshot.x, t);
      this.panner.positionY.setValueAtTime(snapshot.y + 0.5, t);
      this.panner.positionZ.setValueAtTime(snapshot.z, t);
    } else this.panner.setPosition(snapshot.x, snapshot.y + 0.5, snapshot.z);
    if (this.camera) {
      this.camera.getWorldPosition(this.listenerPosition);
      this.camera.getWorldDirection(this.listenerDirection);
      this.listenerUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    } else {
      this.listenerPosition.set(snapshot.x, snapshot.y + 1.8, snapshot.z + 3);
      this.listenerDirection.set(0, 0, -1);
      this.listenerUp.set(0, 1, 0);
    }
    const listener = this.context.listener;
    if (listener.positionX) {
      ['X', 'Y', 'Z'].forEach((axis, index) => {
        listener[`position${axis}`].setValueAtTime(
          this.listenerPosition.getComponent(index),
          t,
        );
        listener[`forward${axis}`].setValueAtTime(
          this.listenerDirection.getComponent(index),
          t,
        );
        listener[`up${axis}`].setValueAtTime(
          this.listenerUp.getComponent(index),
          t,
        );
      });
    } else {
      listener.setPosition(...this.listenerPosition.toArray());
      listener.setOrientation(
        ...this.listenerDirection.toArray(),
        ...this.listenerUp.toArray(),
      );
    }
  }

  disposeAudio() {
    for (const source of [
      this.engineA,
      this.engineB,
      this.noise,
      this.impactOscillator,
    ]) {
      try {
        source?.stop();
      } catch {
        /* Sources may already have stopped during device shutdown. */
      }
      source?.disconnect();
    }
    for (const node of [
      this.harmonicGain,
      this.engineFilter,
      this.engineGain,
      this.tireFilter,
      this.tireGain,
      this.impactGain,
      this.panner,
      this.master,
    ])
      node?.disconnect();
    if (this.context && this.context.state !== 'closed')
      this.context.close().catch(() => {});
    this.context = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeAudio();
    this.dust.removeFromParent();
    this.dust.geometry.dispose();
    this.dust.material.dispose();
  }
}
