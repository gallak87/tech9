import * as THREE from 'three';
import { seededRandom } from '../geometry.js';

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
    const random = seededRandom(49017);
    const pixels = context.createImageData(width, height);
    for (let i = 0; i < width * height; i += 1) {
      const x = i % width;
      const grain = (random() - 0.5) * 7;
      let value = 145 + grain;
      for (const wheel of [260, 375, 650, 765])
        value -= 11 * Math.exp(-((x - wheel) ** 2) / 420);
      pixels.data[i * 4] = value;
      pixels.data[i * 4 + 1] = value + 4;
      pixels.data[i * 4 + 2] = value + 5;
      pixels.data[i * 4 + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    context.fillStyle = 'rgba(35,48,55,0.2)';
    for (const x of [0, 170, 341, 682, 853, 1022])
      context.fillRect(x, 0, 1, height);
    context.fillStyle = 'rgba(205,216,214,0.09)';
    for (const x of [8, 178, 349, 690, 861]) context.fillRect(x, 0, 1, height);
    for (let i = 0; i < 90; i += 1) {
      context.fillStyle = `rgba(200,215,218,${0.01 + random() * 0.025})`;
      context.fillRect(
        random() * width,
        random() * height,
        0.6,
        8 + random() * 35,
      );
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
