/**
 * Height-based moss overlay on upward-facing surfaces.
 *
 * @module geometry/effects/moss
 */
import * as THREE from 'three';
import { hexToRgb } from '../../utils.js';
import { register } from '../post-process-registry.js';

register({
  id: 'moss',
  name: 'Moss',
  order: 220,
  phase: 'color',
  needsAdjacency: false,
  needsNormals: true,
  modifiesGeometry: false,

  controls: [
    { type: 'slider', id: 'mossAmount', label: 'Moss Amount', min: 0, max: 1, step: 0.05, default: 0 },
    { type: 'color',  id: 'mossColor',  label: 'Moss Color', default: '#3a6b2a' },
  ],

  driftIds: ['mossAmount'],

  shouldRun(params) {
    return params.mossAmount > 0;
  },

  process(geo, params, ctx) {
    const amount = params.mossAmount;
    const mossHex = params.mossColor || '#3a6b2a';
    const noise = ctx.noise(4444);
    const mc = hexToRgb(mossHex);

    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const arr = pos.array;
    const normArr = norm.array;
    const count = pos.count;

    if (!geo.attributes.color) {
      const colors = new Float32Array(count * 3);
      colors.fill(1);
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
    const colorArr = geo.attributes.color.array;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const x = arr[i3], y = arr[i3 + 1], z = arr[i3 + 2];
      const ny = normArr[i3 + 1];
      if (ny < 0.3) continue;
      const mossNoise = noise.fbm(x * 2.5, y * 2.5, z * 2.5, 3, 2, 0.5) * 0.5 + 0.5;
      const threshold = 1 - amount;
      if (mossNoise < threshold) continue;
      const mossStr = ((mossNoise - threshold) / (1 - threshold)) * (ny - 0.3) / 0.7;
      const blend = Math.min(mossStr * 1.5, 0.85);
      const bInv = 1 - blend;
      colorArr[i3]     = colorArr[i3]     * bInv + mc.r * blend;
      colorArr[i3 + 1] = colorArr[i3 + 1] * bInv + mc.g * blend;
      colorArr[i3 + 2] = colorArr[i3 + 2] * bInv + mc.b * blend;
    }

    geo.attributes.color.needsUpdate = true;
  },
});
