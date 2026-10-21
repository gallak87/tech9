import * as T from 'three';

/** Small attached runoffs connect the eroded shelf to the shared river plane.
 * They are scenery below the drive surface; gameplay water remains in flow.js.
 */
export function createBankRunoff(track, banks, distance, lifetime) {
  const rows = 6,
    columns = 29,
    positions = [],
    uvs = [],
    indices = [];
  const ray = new T.Raycaster();
  let mouth = null;
  for (let row = 0; row <= rows; row++) {
    const s = distance + (row / rows - 0.5) * 22,
      frame = track.sample(s);
    const surfaces = banks.filter(
      (mesh) =>
        mesh.geometry.userData.side === -1 &&
        s >= mesh.geometry.userData.start &&
        s <= mesh.geometry.userData.end,
    );
    if (!surfaces.length) return null;
    let previous;
    for (let column = 0; column < columns; column++) {
      const height = -2 - (column / (columns - 1)) * (frame.position.y + 58);
      ray.set(
        frame.position
          .clone()
          .addScaledVector(frame.up, height)
          .addScaledVector(frame.right, -220),
        frame.right,
      );
      ray.far = 220;
      const hit = ray.intersectObjects(surfaces, false)[0];
      if (!hit) return null;
      const p = hit.point.clone().addScaledVector(frame.right, -0.45);
      if (row === rows / 2 && previous?.y >= -23.9 && p.y < -23.9)
        mouth = previous
          .clone()
          .lerp(p, (previous.y + 23.9) / (previous.y - p.y));
      previous = p;
      positions.push(...p.toArray());
      uvs.push(row / rows, p.y * 0.16);
      if (row < rows && column < columns - 1) {
        const i = row * columns + column;
        indices.push(
          i,
          i + 1,
          i + columns,
          i + 1,
          i + columns + 1,
          i + columns,
        );
      }
    }
  }
  const geometry = lifetime.own(new T.BufferGeometry());
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const clock = { value: 0 };
  const material = lifetime.own(
    new T.ShaderMaterial({
      name: 'Opaline / attached mineral runoff',
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      uniforms: { clock },
      vertexShader:
        'varying vec2 vUv;varying float height;void main(){vUv=uv;height=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 vUv;varying float height;uniform float clock;
      void main(){
        if(height < -23.95)discard;
        float edge=smoothstep(0.,.18,vUv.x)*smoothstep(0.,.18,1.-vUv.x);
        float line=sin(vUv.x*31.+sin(vUv.y*.4)*1.1);
        float streak=pow(max(0.,line),5.);
        float fall=.5+.5*sin(vUv.y*2.1+clock*3.2+vUv.x*8.);
        vec3 color=mix(vec3(.035,.13,.09),vec3(.48,.67,.49),streak*(.25+fall*.65));
        gl_FragColor=vec4(color,edge*(.22+streak*.48));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  );
  const group = new T.Group(),
    sheet = new T.Mesh(geometry, material);
  group.name = 'Opaline / river-connected runoff';
  sheet.userData.aoExclude = true;
  group.add(sheet);
  if (mouth) {
    const foamMaterial = lifetime.own(
      new T.ShaderMaterial({
        name: 'Opaline / mineral river contact',
        transparent: true,
        depthWrite: false,
        uniforms: { clock },
        vertexShader:
          'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `varying vec2 vUv;uniform float clock;void main(){
        vec2 p=vUv*2.-1.;float radius=length(p);float angle=atan(p.y,p.x);
        float broken=.5+.5*sin(angle*9.+sin(angle*4.)+radius*13.-clock*.25);
        float ring=pow(max(0.,sin(radius*28.-clock*.8)),5.);
        float alpha=(1.-smoothstep(.3,1.,radius))*(.05+ring*.22)*broken;
        gl_FragColor=vec4(.36,.55,.4,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
      }),
    );
    const foam = new T.Mesh(
      lifetime.own(new T.PlaneGeometry(34, 27)),
      foamMaterial,
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.copy(mouth);
    foam.position.y = -23.85;
    foam.userData.aoExclude = true;
    group.add(foam);
  }
  return {
    group,
    update(time) {
      clock.value = time;
    },
  };
}
