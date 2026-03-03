/**
 * Curvature-based vertex colouring — lightens convex edges.
 *
 * @module geometry/effects/curvature-color
 */
import * as THREE from 'three';
import { register } from '../post-process-registry.js';

register({
  id: 'curvatureColor',
  name: 'Curvature Color',
  order: 210,
  phase: 'color',
  needsAdjacency: true,
  needsNormals: true,
  modifiesGeometry: false,

  controls: [
    { type: 'slider', id: 'curvatureColor', label: 'Curvature Color', min: 0, max: 1, step: 0.05, default: 0.3 },
  ],

  shouldRun(params) {
    return params.curvatureColor > 0;
  },

  process(geo, params, ctx) {
    const strength = params.curvatureColor;
    const adj = ctx.adj;

    const normArr = geo.attributes.normal.array;
    const count = geo.attributes.position.count;
    const aOff = adj.offsets, aData = adj.data;

    if (!geo.attributes.color) {
      const colors = new Float32Array(count * 3);
      colors.fill(1);
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
    const colorArr = geo.attributes.color.array;

    for (let i = 0; i < count; i++) {
      const start = aOff[i], end = aOff[i + 1];
      const nbCount = end - start;
      if (nbCount < 2) continue;
      const i3 = i * 3;
      const nx = normArr[i3], ny = normArr[i3 + 1], nz = normArr[i3 + 2];
      let avgNx = 0, avgNy = 0, avgNz = 0;
      for (let j = start; j < end; j++) {
        const n3 = aData[j] * 3;
        avgNx += normArr[n3]; avgNy += normArr[n3 + 1]; avgNz += normArr[n3 + 2];
      }
      const invN = 1 / nbCount;
      const curvature = 1 - (nx * avgNx * invN + ny * avgNy * invN + nz * avgNz * invN);
      if (curvature > 0.02) {
        const lighten = curvature * strength * 2;
        const l = lighten > 0.3 ? 0.3 : lighten;
        const r = colorArr[i3] + l;
        const g = colorArr[i3 + 1] + l * 0.9;
        const b = colorArr[i3 + 2] + l * 0.8;
        colorArr[i3]     = r > 1 ? 1 : r;
        colorArr[i3 + 1] = g > 1 ? 1 : g;
        colorArr[i3 + 2] = b > 1 ? 1 : b;
      }
    }

    geo.attributes.color.needsUpdate = true;
  },
});
