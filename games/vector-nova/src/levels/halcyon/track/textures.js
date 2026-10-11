import * as THREE from 'three';
import { seededRandom } from '../../../track/geometry.js';

export function concreteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const data = context.createImageData(512, 512);
  const random = seededRandom(2719);
  const base = 198;
  for (let pixel = 0; pixel < 512 * 512; pixel += 1) {
    const grit = Math.floor((random() - 0.5) * 10);
    const x = pixel % 512;
    const fineVariation = Math.sin(x * 0.03) * 4;
    const value = base + grit + fineVariation;
    data.data[pixel * 4] = value;
    data.data[pixel * 4 + 1] = value + 1;
    data.data[pixel * 4 + 2] = value - 5;
    data.data[pixel * 4 + 3] = 255;
  }
  context.putImageData(data, 0, 0);
  context.fillStyle = 'rgba(74,77,69,.2)';
  context.fillRect(0, 0, 512, 2);
  context.fillRect(0, 0, 1, 512);
  for (const x of [22, 488])
    for (const y of [24, 487]) {
      context.beginPath();
      context.arc(x, y, 2.2, 0, Math.PI * 2);
      context.fill();
    }
  for (let i = 0; i < 24; i += 1) {
    context.fillStyle = `rgba(68,80,79,${0.015 + random() * 0.022})`;
    context.fillRect(random() * 512, 0, 3 + random() * 14, 512);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function signTexture(main, secondary, direction = 0) {
  const canvas = document.createElement('canvas');
  const arrowsOnly = !main && !secondary;
  canvas.width = arrowsOnly ? 512 : 1024;
  canvas.height = arrowsOnly ? 256 : 192;
  const context = canvas.getContext('2d');
  context.fillStyle = '#14222b';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#d5603f';
  context.fillRect(0, 0, 14, 192);
  context.fillStyle = '#e9e5d7';
  context.font = '600 68px sans-serif';
  context.textBaseline = 'top';
  context.fillText(main, 40, 23, direction ? 720 : 942);
  context.fillStyle = '#a8b7b8';
  context.font = '500 27px monospace';
  context.fillText(secondary, 43, 128, 934);
  if (direction) {
    context.strokeStyle = '#e6b571';
    context.lineWidth = arrowsOnly ? 20 : 12;
    context.lineJoin = 'miter';
    const arrowWidth = arrowsOnly ? 67 : 31;
    for (const x of arrowsOnly ? [76, 225, 374] : [806, 873, 940]) {
      const offset = direction > 0 ? 0 : arrowWidth;
      context.beginPath();
      context.moveTo(x + offset, arrowsOnly ? 38 : 34);
      context.lineTo(x + arrowWidth - offset, arrowsOnly ? 128 : 70);
      context.lineTo(x + offset, arrowsOnly ? 218 : 106);
      context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
