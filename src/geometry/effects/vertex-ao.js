/**
 * Vertex ambient occlusion baking.
 *
 * @module geometry/effects/vertex-ao
 */
import * as THREE from 'three';
import { register } from '../post-process-registry.js';

register({
  id: 'vertexAO',
  name: 'Vertex AO',
  order: 200,
  phase: 'color',
  needsAdjacency: true,
  needsNormals: true,
  modifiesGeometry: false,

  controls: [
    { type: 'slider', id: 'vertexAO', label: 'Vertex AO', min: 0, max: 1, step: 0.05, default: 0.5 },
  ],

  shouldRun(params) {
    return params.vertexAO > 0;
  },

  process(geo, params, ctx) {
    const strength = params.vertexAO;
    const adj = ctx.adj;

    const arr = geo.attributes.position.array;
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
      const vx = arr[i3], vy = arr[i3 + 1], vz = arr[i3 + 2];
      const nx = normArr[i3], ny = normArr[i3 + 1], nz = normArr[i3 + 2];
      let occluded = 0;
      for (let j = start; j < end; j++) {
        const n3 = aData[j] * 3;
        const dx = arr[n3] - vx, dy = arr[n3 + 1] - vy, dz = arr[n3 + 2] - vz;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const dot = (dx * nx + dy * ny + dz * nz) / len;
        if (dot < 0) occluded -= dot;
      }
      let aoVal = 1 - Math.min(occluded / nbCount, 1) * strength;
      if (aoVal < 0.1) aoVal = 0.1;
      colorArr[i3]     *= aoVal;
      colorArr[i3 + 1] *= aoVal;
      colorArr[i3 + 2] *= aoVal;
    }

    geo.attributes.color.needsUpdate = true;
  },
});
