import * as T from 'three';

const UP = new T.Vector3(0, 1, 0);
const clamp = T.MathUtils.clamp;
export const LANDING_BURST_SPAN = 0.68;
const CONTACT_SPAN = 0.35;

// Four small pooled draws: a road wash, corner clamps, short magnetic ties and
// a swept shower. None of these meshes participates in collision or scoring.
export function createLandingVfx({
  track,
  namePrefix = 'Landing',
  color = 0x68e9e0,
}) {
  const group = new T.Group();
  group.name = `${namePrefix} / magnetic catch`;
  group.visible = false;
  const unit = new T.BoxGeometry(1, 1, 1);
  const washGeometry = new T.PlaneGeometry(1, 1, 4, 8);
  washGeometry.rotateX(-Math.PI / 2);
  const washPositions = washGeometry.getAttribute('position');
  const washUv = washGeometry.getAttribute('uv');
  const materials = [];
  const material = (name, opacity = 0) => {
    const value = new T.MeshBasicMaterial({
      name,
      color: 0xb8fff4,
      opacity,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    materials.push(value);
    return value;
  };
  const washMaterial = new T.ShaderMaterial({
    name: `${namePrefix} / soft magnetic footprint`,
    uniforms: {
      color: { value: new T.Color(color) },
      strength: { value: 0 },
    },
    vertexShader: `varying vec2 vUv;
      void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;
      uniform vec3 color;uniform float strength;
      void main(){
        vec2 p=vUv*2.-1.;
        float bed=exp(-3.5*pow(abs(p.x),4.)-3.*pow(abs(p.y),4.));
        float railDistance=abs(p.x)-.68;
        float rails=exp(-170.*railDistance*railDistance)*exp(-4.*pow(abs(p.y),4.));
        float centre=exp(-5.*p.x*p.x-9.*p.y*p.y);
        float edge=1.-smoothstep(.76,1.,max(abs(p.x),abs(p.y)));
        float glow=(bed*.2+rails*.65+centre*.15)*edge*strength;
        gl_FragColor=vec4(color*(1.+rails*.35),glow);
      }`,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: T.DoubleSide,
    forceSinglePass: true,
  });
  materials.push(washMaterial);
  const wash = new T.Mesh(washGeometry, washMaterial);
  wash.name = `${namePrefix} / landing color wash`;
  wash.renderOrder = 9;
  group.add(wash);

  function instances(name, count, value) {
    const mesh = new T.InstancedMesh(unit, value, count);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    group.add(mesh);
    return mesh;
  }
  const clampMaterial = material(`${namePrefix} / locking corners`);
  const tieMaterial = material(`${namePrefix} / magnetic filaments`);
  const sparkMaterial = material(`${namePrefix} / swept catch splinters`);
  const corners = instances(
    `${namePrefix} / inward seating clamps`,
    8,
    clampMaterial,
  );
  const ties = instances(
    `${namePrefix} / four contracting magnetic ties`,
    4,
    tieMaterial,
  );
  const sparks = instances(
    `${namePrefix} / directional landing burst`,
    24,
    sparkMaterial,
  );
  const matrix = new T.Matrix4();
  const rotation = new T.Quaternion();
  const localPosition = new T.Vector3();
  const localScale = new T.Vector3();
  const localDirection = new T.Vector3();
  const surfacePosition = new T.Vector3();
  const shipPosition = new T.Vector3();
  const inverseSurface = new T.Quaternion();
  const footprintPoint = new T.Vector3();
  let disposed = false;
  const presentation = {
    visible: false,
    contactId: null,
    age: null,
    activeSparks: 0,
    drawCalls: 0,
    triangles: 0,
  };

  function reset() {
    group.visible = false;
    presentation.visible = false;
    presentation.contactId = null;
    presentation.age = null;
    presentation.activeSparks = 0;
    presentation.drawCalls = 0;
    presentation.triangles = 0;
  }
  function box(mesh, index, x, y, z, sx, sy, sz) {
    localPosition.set(x, y, z);
    localScale.set(sx, sy, sz);
    rotation.identity();
    matrix.compose(localPosition, rotation, localScale);
    mesh.setMatrixAt(index, matrix);
  }
  reset();
  return {
    group,
    reset,
    getPresentation() {
      return {
        ...presentation,
        budget: { drawCalls: 4, sparks: 24, triangles: 496 },
      };
    },
    // State comes from the simulation clock; this renderer owns no timers or
    // contact decisions. The optional argument lets adapters reuse their state.
    update(frame, landing = frame.landing) {
      if (disposed) return;
      if (!landing?.supported || !frame.ship?.group || !frame.state) {
        reset();
        return;
      }
      const { clock, contact, burst } = landing;
      const burstAge = burst ? clock - burst.at : Infinity;
      const contactAge = contact ? clock - contact.at : Infinity;
      const burstActive = burstAge >= 0 && burstAge < LANDING_BURST_SPAN;
      const contactActive = contactAge >= 0 && contactAge < CONTACT_SPAN;
      const active = burstActive || contactActive;
      const visible =
        active &&
        ['racing', 'paused', 'countdown', 'results'].includes(frame.mode);
      group.visible = visible;
      presentation.visible = visible;
      presentation.contactId = active
        ? burstActive
          ? burst.id
          : contact.id
        : null;
      presentation.age = active ? (burstActive ? burstAge : contactAge) : null;
      presentation.activeSparks = 0;
      presentation.drawCalls = 0;
      presentation.triangles = 0;
      if (!visible) return;

      const simple = frame.settings?.quality === 'low';
      const reduced = !!frame.settings?.reducedMotion;
      const dimensions = frame.ship.group.userData.dimensionsMetres;
      const halfWidth = clamp((dimensions?.width ?? 8) * 0.51, 2.6, 6.8);
      const halfLength = clamp((dimensions?.length ?? 11) * 0.48, 3.8, 8.5);
      const sampledSurface = track.sampleSurface?.(
        frame.state.distance,
        frame.state.lateral ?? 0,
      );
      const surface = sampledSurface ?? track.sample(frame.state.distance);
      surfacePosition.copy(surface.position);
      if (!sampledSurface)
        surfacePosition.addScaledVector(
          surface.right,
          frame.state.lateral ?? 0,
        );
      group.position.copy(surfacePosition).addScaledVector(surface.up, 0.13);
      group.quaternion.copy(surface.quaternion);
      inverseSurface.copy(surface.quaternion).invert();
      function roadPoint(x, z, target) {
        const distance = frame.state.distance + z;
        const lateral = (frame.state.lateral ?? 0) + x;
        const curved = track.sampleSurface?.(distance, lateral, {
          geometryOnly: true,
        });
        const point = curved ?? track.sample(distance);
        target.copy(point.position);
        if (!curved) target.addScaledVector(point.right, lateral);
        return target.sub(surfacePosition).applyQuaternion(inverseSurface);
      }
      frame.ship.group.getWorldPosition(shipPosition);
      const height = clamp(
        shipPosition.sub(surfacePosition).dot(surface.up),
        0.35,
        3.2,
      );
      const event = burstActive ? burst : contact;
      const tint = event.color ?? color;
      const power = event.strength ?? (burstActive ? 0.88 : 0.38);
      const fade = burstActive
        ? Math.pow(1 - burstAge / LANDING_BURST_SPAN, 1.4)
        : Math.max(0, 1 - contactAge / CONTACT_SPAN);
      const strength = power * fade * (reduced ? 0.42 : 1);
      const clickAge = burstActive ? burstAge : contactAge;
      // A single rapid contraction and short release reads as engagement; it
      // has no oscillation, and reduced motion holds the settled footprint.
      const closing = reduced
        ? 1
        : clickAge < 0.075
          ? T.MathUtils.lerp(1.28, 0.94, clickAge / 0.075)
          : T.MathUtils.lerp(0.94, 1, clamp((clickAge - 0.075) / 0.13, 0, 1));
      washMaterial.uniforms.color.value.setHex(tint);
      washMaterial.uniforms.strength.value = strength;
      const washWidth = halfWidth * 3;
      const washLength = halfLength * (burstActive ? 4 : 2.8);
      const washBehind = burstActive ? -halfLength * 0.6 : 0;
      for (let i = 0; i < washPositions.count; i++) {
        roadPoint(
          (washUv.getX(i) - 0.5) * washWidth,
          (washUv.getY(i) - 0.5) * washLength + washBehind,
          footprintPoint,
        );
        washPositions.setXYZ(
          i,
          footprintPoint.x,
          footprintPoint.y,
          footprintPoint.z,
        );
      }
      washPositions.needsUpdate = true;
      wash.frustumCulled = false;
      clampMaterial.color.setHex(tint);
      tieMaterial.color.setHex(
        burstActive && burst.brightTies ? 0xfff8df : tint,
      );
      sparkMaterial.color.setHex(tint);
      clampMaterial.opacity = strength * 0.86;
      tieMaterial.opacity = reduced
        ? 0
        : strength * Math.max(0, 1 - clickAge / 0.2);
      corners.visible = true;
      ties.visible = !simple && !reduced && tieMaterial.opacity > 0.01;
      let index = 0;
      for (const x of [-1, 1])
        for (const z of [-1, 1]) {
          const px = x * halfWidth * closing;
          const pz = z * halfLength * closing;
          const bar = Math.min(1.6, halfWidth * 0.45);
          roadPoint(px - x * bar * 0.5, pz, footprintPoint);
          box(
            corners,
            index * 2,
            footprintPoint.x,
            footprintPoint.y + 0.1,
            footprintPoint.z,
            bar,
            0.11,
            0.18,
          );
          roadPoint(px, pz - z * bar * 0.5, footprintPoint);
          box(
            corners,
            index * 2 + 1,
            footprintPoint.x,
            footprintPoint.y + 0.1,
            footprintPoint.z,
            0.18,
            0.11,
            bar,
          );
          const contraction = reduced ? 0 : Math.max(0, 1 - clickAge / 0.2);
          const top = height * contraction;
          roadPoint(px, pz, localPosition);
          localPosition.y += top * 0.5;
          localDirection.set(
            -x * 0.8 * contraction,
            top,
            -z * 0.45 * contraction,
          );
          const length = Math.max(0.01, localDirection.length());
          rotation.setFromUnitVectors(
            UP,
            localDirection.multiplyScalar(1 / length),
          );
          localScale.set(0.075, length, 0.075);
          matrix.compose(localPosition, rotation, localScale);
          ties.setMatrixAt(index++, matrix);
        }
      corners.instanceMatrix.needsUpdate = true;
      if (ties.visible) ties.instanceMatrix.needsUpdate = true;

      sparks.visible = burstActive && !reduced && burstAge < 0.52;
      if (sparks.visible) {
        const count = simple ? 12 : 24;
        sparks.count = count;
        sparkMaterial.opacity = Math.pow(1 - burstAge / 0.52, 1.7) * power;
        // Each blade is carried back from the moving craft and spreads across
        // the road. A deterministic fan retains a readable open forward view.
        for (let i = 0; i < count; i++) {
          const side = i % 2 ? 1 : -1;
          const lane = (Math.floor(i / 2) + 0.5) / (count / 2);
          const age = burstAge;
          const travel = age * (5 + lane * 17);
          roadPoint(
            side * (halfWidth * 0.72 + travel * (0.45 + lane * 0.7)),
            -halfLength * 0.2 - age * (8 + (1 - lane) * 15),
            localPosition,
          );
          localPosition.y +=
            0.15 + Math.max(0, age * (2 + lane * 3) - 5 * age * age);
          localDirection.set(side * (0.45 + lane), 0.04, -1.4).normalize();
          rotation.setFromUnitVectors(UP, localDirection);
          localScale.set(0.055, (0.7 + lane * 1.3) * (1 - age / 0.6), 0.055);
          matrix.compose(localPosition, rotation, localScale);
          sparks.setMatrixAt(i, matrix);
        }
        sparks.instanceMatrix.needsUpdate = true;
        presentation.activeSparks = count;
      }
      presentation.drawCalls =
        2 + Number(ties.visible) + Number(sparks.visible);
      presentation.triangles =
        64 +
        8 * 12 +
        (ties.visible ? 4 * 12 : 0) +
        (sparks.visible ? sparks.count * 12 : 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      corners.dispose();
      ties.dispose();
      sparks.dispose();
      unit.dispose();
      washGeometry.dispose();
      materials.forEach((value) => value.dispose());
      group.clear();
      group.removeFromParent();
    },
  };
}
