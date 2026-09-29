import * as THREE from 'three';

export function roadNeonSections(lattice) {
  const treatments = [
    { name: 'Ion cyan / limb lattice', color: '#087b91' },
    { name: 'Violet magenta / orbital overlook', color: '#981591' },
    { name: 'Electric blue / horizon descent', color: '#135ad0' },
  ];
  return lattice.spans.map((span, index) => ({
    start: span.start - 24,
    end: span.end + 24,
    ...treatments[index],
  }));
}

export function applyRoadNeon(geometry, sections, uvScale = 16) {
  const uv = geometry.getAttribute('uv');
  const attribute = new Float32Array(uv.count * 4);
  const colors = sections.map((section) => new THREE.Color(section.color));
  for (let vertex = 0; vertex < uv.count; vertex += 1) {
    const distance = uv.getY(vertex) * uvScale;
    const index = sections.findIndex(
      (section) => distance >= section.start && distance <= section.end,
    );
    if (index < 0) continue;
    const section = sections[index];
    const mask =
      THREE.MathUtils.smoothstep(distance, section.start, section.start + 8) *
      (1 - THREE.MathUtils.smoothstep(distance, section.end - 8, section.end));
    attribute.set([...colors[index].toArray(), mask], vertex * 4);
  }
  geometry.setAttribute('roadNeon', new THREE.BufferAttribute(attribute, 4));
  return geometry;
}

export function fullRoadNeonMaterial(base) {
  const material = base.clone();
  material.name = `${base.name || 'Orbital alloy'} / full-color magnetic coating`;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `attribute vec4 roadNeon; varying vec4 vRoadNeon;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vRoadNeon = roadNeon;',
      );
    shader.fragmentShader = `varying vec4 vRoadNeon;\n${shader.fragmentShader}`
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float cassetteFinish = 1.0;
        #ifdef USE_MAP
          cassetteFinish = clamp(sampledDiffuseColor.r * 3.3, 0.18, 1.0);
        #endif
        diffuseColor.rgb = mix(diffuseColor.rgb, vRoadNeon.rgb * cassetteFinish, vRoadNeon.a);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.48, vRoadNeon.a);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Broad saturated light-emitting coating, kept below the white bloom
        // threshold. Directional PBR shading still describes its real framing.
        totalEmissiveRadiance = mix(totalEmissiveRadiance, vRoadNeon.rgb * 1.65 * cassetteFinish, vRoadNeon.a);`,
      );
  };
  material.customProgramCacheKey = () => 'orbital-induction-cassette-neon-v2';
  return material;
}

function canvasTexture(width, height, paint) {
  // Pure geometry/clearance tests also build the group without a DOM.
  if (typeof document === 'undefined') {
    const texture = new THREE.DataTexture(
      new Uint8Array([150, 157, 159, 255]),
      1,
      1,
    );
    texture.needsUpdate = true;
    return texture;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function orbitalSurfaceTexture() {
  const texture = canvasTexture(1024, 512, (context, width, height) => {
    // Smooth removable induction cassettes, with etched terminals and sealed
    // joints. No grit, aggregate, streak noise or tire-wear bands.
    context.fillStyle = '#152c3b';
    context.fillRect(0, 0, width, height);
    const palette = ['#94b0be', '#9bb7c4', '#83a1b0'];
    for (let row = 0; row < 2; row += 1)
      for (let column = 0; column < 6; column += 1) {
        const x = (column * width) / 6 + 2;
        const y = (row * height) / 2 + 2;
        const w = width / 6 - 4,
          h = height / 2 - 4,
          cut = 10;
        context.beginPath();
        context.moveTo(x + cut, y);
        context.lineTo(x + w - cut, y);
        context.lineTo(x + w, y + cut);
        context.lineTo(x + w, y + h - cut);
        context.lineTo(x + w - cut, y + h);
        context.lineTo(x + cut, y + h);
        context.lineTo(x, y + h - cut);
        context.lineTo(x, y + cut);
        context.closePath();
        context.fillStyle = palette[(column + row) % palette.length];
        context.fill();
        context.strokeStyle = '#c0d1d9';
        context.lineWidth = 1;
        context.stroke();
        context.strokeStyle = '#4f7489';
        context.lineWidth = 2;
        context.strokeRect(x + 16, y + 20, w - 32, h - 40);
        for (const end of [0, 1]) {
          const terminalY = y + 31 + end * (h - 65);
          context.fillStyle = '#395e76';
          context.fillRect(x + w / 2 - 19, terminalY, 38, 4);
          context.fillStyle = '#c4dce5';
          for (let pin = 0; pin < 4; pin += 1)
            context.fillRect(x + w / 2 - 14 + pin * 8, terminalY + 1, 3, 2);
        }
      }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function orbitalSignsTexture(sections) {
  return canvasTexture(2048, 2048, (context, width, height) => {
    context.fillStyle = '#172a35';
    context.fillRect(0, 0, width, height);
    const rowHeight = height / sections.length;
    sections.forEach((section, index) => {
      const y = index * rowHeight;
      context.fillStyle = '#e9e6d7';
      context.font = '600 78px sans-serif';
      context.fillText(section.name.toUpperCase(), 152, y + 109, 1710);
      context.fillStyle = '#b5c2c5';
      context.font = '500 34px monospace';
      context.fillText(
        `ASTERION  /  ${String(index + 1).padStart(2, '0')}   ·   ${section.id === 'dive' ? 'MAGNETIC DESCENT' : section.id === 'wallride' ? '98° BANK / MAINTAIN LINE' : section.id === 'return' ? 'TIGHT TURN / BRAKE' : 'ORBITAL TRANSIT RING'}`,
        158,
        y + 168,
      );
      context.fillStyle = '#d3a263';
      context.fillRect(45, y + 44, 38, rowHeight - 88);
      context.fillRect(1960, y + 56, 14, rowHeight - 112);
    });
  });
}

export function orbitalGuidanceTexture() {
  const entries = [
    ['BRAKE', 'TIGHT LEFT · DOCKING TURN', 'left'],
    ['98° BANK', 'WALL RIDE AHEAD', 'right'],
    ['75° DIVE', 'DESCENT AHEAD', 'down'],
    ['', '', 'left'],
  ];
  return canvasTexture(1024, 1536, (context, width, height) => {
    const rowHeight = height / entries.length;
    entries.forEach(([title, subtitle, direction], index) => {
      const y = index * rowHeight;
      context.fillStyle = index === 0 || index === 3 ? '#d1ab70' : '#142d38';
      context.fillRect(0, y, width, rowHeight);
      context.strokeStyle = index === 0 || index === 3 ? '#182a31' : '#d7af70';
      context.lineWidth = 8;
      context.strokeRect(19, y + 19, width - 38, rowHeight - 38);
      context.fillStyle = index === 0 ? '#182a31' : '#e8e5d6';
      context.font = '700 119px sans-serif';
      context.fillText(title, 70, y + 157, 845);
      context.font = '600 39px sans-serif';
      context.fillText(subtitle, 73, y + 218, 890);
      context.strokeStyle = index === 0 || index === 3 ? '#182a31' : '#d7af70';
      context.lineWidth = index === 3 ? 31 : 21;
      context.lineJoin = 'miter';
      for (const x of index === 3 ? [100, 380, 660] : [320, 490, 660]) {
        const mid = y + (index === 3 ? 192 : 295);
        const breadth = index === 3 ? 175 : 95;
        const halfHeight = index === 3 ? 116 : 43;
        context.beginPath();
        if (direction === 'left') {
          context.moveTo(x + breadth, mid - halfHeight);
          context.lineTo(x, mid);
          context.lineTo(x + breadth, mid + halfHeight);
        } else if (direction === 'right') {
          context.moveTo(x, mid - halfHeight);
          context.lineTo(x + breadth, mid);
          context.lineTo(x, mid + halfHeight);
        } else {
          context.moveTo(x, mid - halfHeight);
          context.lineTo(x + breadth / 2, mid + halfHeight);
          context.lineTo(x + breadth, mid - halfHeight);
        }
        context.stroke();
      }
    });
  });
}
