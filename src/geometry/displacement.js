/**
 * Noise-based vertex displacement and crack algorithms.
 *
 * ── Adding a new crack algorithm ──
 * 1. Add a new `else if (algo === 'myAlgo')` block in `crackDisplace()`.
 * 2. Add a matching proximity test in `crackNearTest()`.
 * 3. Add a <option value="myAlgo"> to the #crackAlgo select in index.html.
 *
 * @module geometry/displacement
 */

// ── Displacement Helper ─────────────────────────────────────────────────

export function displaceVertices(geo, noiseFn, scale, strength, octaves, baseSize, options = {}) {
  const pos = geo.attributes.position;
  const arr = pos.array;
  const count = pos.count;
  const { ridgeMix = 0, sharpness = 0 } = options;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const x = arr[i3], y = arr[i3+1], z = arr[i3+2];
    const lenSq = x*x + y*y + z*z;
    if (lenSq < 1e-8) continue;
    const invLen = 1 / Math.sqrt(lenSq);
    const len = lenSq * invLen;
    const nx = x * invLen, ny = y * invLen, nz = z * invLen;

    let d = 0;
    const fbmVal = noiseFn.fbm(nx * scale, ny * scale, nz * scale, octaves, 2.0, 0.5);
    d += fbmVal * (1 - ridgeMix);

    if (ridgeMix > 0) {
      const ridge = 1 - Math.abs(noiseFn.fbm(
        nx * scale + 7.8, ny * scale + 3.1, nz * scale + 5.4,
        octaves, 2.0, 0.45
      ));
      d += ridge * ridgeMix;
    }

    if (sharpness > 0) {
      const sharpNoise = Math.abs(noiseFn.fbm(
        nx * scale * 1.3 + 11, ny * scale * 1.3 + 11, nz * scale * 1.3 + 11,
        Math.max(2, octaves - 1), 2.0, 0.5
      ));
      d = d * (1 - sharpness) + (1 - sharpNoise) * sharpness;
    }

    const maxDisp = baseSize * 0.5;
    const rawDisp = d * strength * baseSize;
    const clampedDisp = rawDisp > maxDisp ? maxDisp : rawDisp < -maxDisp ? -maxDisp : rawDisp;
    const newLen = Math.max(baseSize * 0.05, len + clampedDisp);
    arr[i3]   = nx * newLen;
    arr[i3+1] = ny * newLen;
    arr[i3+2] = nz * newLen;
  }
  pos.needsUpdate = true;
}

// ── Crack Helpers ───────────────────────────────────────────────────────

function _ss(t) { return t * t * (3 - 2 * t); }

function _groove(dist, width) {
  if (dist >= width) return 0;
  const t = dist / width;
  return (1 - _ss(t)) * (1 - _ss(t));
}

// ── Crack Displacement ──────────────────────────────────────────────────

export function crackDisplace(x, y, z, params, noiseCrack, noiseWarp) {
  const algo = params.crackAlgo;
  const cs = params.crackDensity;
  const cw = params.crackWidth;
  const bd = params.crackDepth * params.baseSize;
  let disp = 0;

  const dv = 0.6 + 0.4 * (noiseCrack.noise3D(
    x * cs * 3.1 + 7.7, y * cs * 3.1 + 3.3, z * cs * 3.1 + 9.9
  ) * 0.5 + 0.5);

  if (algo === 'ridge') {
    const n1 = Math.abs(noiseCrack.noise3D(x * cs, y * cs, z * cs));
    disp += _groove(n1, cw) * bd * dv;
    if (params.crackDepth > 0.02) {
      const n2 = Math.abs(noiseCrack.noise3D(y * cs * 1.3 + 47.1, z * cs * 1.3 + 83.4, x * cs * 1.3 + 29.6));
      disp += _groove(n2, cw * 0.7) * bd * 0.4;
    }
    if (params.crackDepth > 0.06) {
      const n3 = Math.abs(noiseCrack.noise3D(x * cs * 2.8 + 113.2, y * cs * 2.8 + 67.8, z * cs * 2.8 + 91.5));
      disp += _groove(n3, cw * 0.45) * bd * 0.2;
    }

  } else if (algo === 'voronoi') {
    const w1 = noiseCrack.worley3D(x * cs, y * cs, z * cs);
    disp += _groove(w1.edge, cw) * bd * dv;
    if (params.crackDepth > 0.03) {
      const w2 = noiseCrack.worley3D(x * cs * 1.8 + 31.2, y * cs * 1.8 + 17.8, z * cs * 1.8 + 43.5);
      disp += _groove(w2.edge, cw * 0.6) * bd * 0.35;
    }

  } else if (algo === 'warp') {
    const warpStr = cw * 3;
    const wx = noiseWarp.noise3D(x*cs*0.7+5, y*cs*0.7+5, z*cs*0.7+5) * warpStr;
    const wy = noiseWarp.noise3D(x*cs*0.7+50, y*cs*0.7+50, z*cs*0.7+50) * warpStr;
    const wz = noiseWarp.noise3D(x*cs*0.7+95, y*cs*0.7+95, z*cs*0.7+95) * warpStr;
    const n1 = Math.abs(noiseCrack.noise3D((x+wx)*cs, (y+wy)*cs, (z+wz)*cs));
    disp += _groove(n1, cw) * bd * dv;
    if (params.crackDepth > 0.03) {
      const n2 = Math.abs(noiseCrack.noise3D((y+wy)*cs*1.5+47, (z+wz)*cs*1.5+83, (x+wx)*cs*1.5+29));
      disp += _groove(n2, cw * 0.6) * bd * 0.35;
    }

  } else if (algo === 'branch') {
    const n1 = Math.abs(noiseCrack.noise3D(x*cs*0.7, y*cs*0.7, z*cs*0.7));
    const g1 = _groove(n1, cw * 1.3);
    disp += g1 * bd * dv;
    if (g1 > 0.01) {
      const n2 = Math.abs(noiseCrack.noise3D(x*cs*1.8+47.1, y*cs*1.8+83.4, z*cs*1.8+29.6));
      const g2 = _groove(n2, cw * 0.8);
      const branchMask = Math.min(1, g1 * 3);
      disp += g2 * bd * 0.5 * branchMask;
      if (g2 > 0.01) {
        const n3 = Math.abs(noiseCrack.noise3D(x*cs*3.5+113, y*cs*3.5+67, z*cs*3.5+91));
        const g3 = _groove(n3, cw * 0.5);
        disp += g3 * bd * 0.25 * Math.min(1, g2 * 4);
      }
    }

  } else if (algo === 'shatter') {
    const w1 = noiseCrack.worley3D(x*cs*0.8, y*cs*0.8, z*cs*0.8);
    disp += _groove(w1.edge, cw * 1.2) * bd * dv;
    const n1 = Math.abs(noiseCrack.noise3D(x*cs*1.5, y*cs*1.5, z*cs*1.5));
    disp += _groove(n1, cw * 0.5) * bd * 0.3;
    if (params.crackDepth > 0.03) {
      const n2 = Math.abs(noiseCrack.noise3D(x*cs*2.5+w1.f1*10+33, y*cs*2.5+w1.f1*10+77, z*cs*2.5+w1.f1*10+11));
      disp += _groove(n2, cw * 0.4) * bd * 0.2;
    }

  } else if (algo === 'planar') {
    const a1 = noiseCrack.noise3D(1.1,2.2,3.3)*Math.PI;
    const a2 = noiseCrack.noise3D(4.4,5.5,6.6)*Math.PI*0.5;
    const n1x = Math.cos(a1)*Math.cos(a2), n1y = Math.sin(a2), n1z = Math.sin(a1)*Math.cos(a2);
    const d1 = x*n1x + y*n1y + z*n1z;
    const warp1 = noiseWarp.noise3D(x*cs*0.4, y*cs*0.4, z*cs*0.4)*cw*2;
    const pd1 = Math.abs(Math.sin((d1*cs+warp1)*Math.PI));
    disp += _groove(pd1, cw*1.5) * bd * dv;

    const a3 = noiseCrack.noise3D(7.7,8.8,9.9)*Math.PI;
    const a4 = noiseCrack.noise3D(10.1,11.2,12.3)*Math.PI*0.5;
    const n2x = Math.cos(a3)*Math.cos(a4), n2y = Math.sin(a4), n2z = Math.sin(a3)*Math.cos(a4);
    const d2 = x*n2x + y*n2y + z*n2z;
    const warp2 = noiseWarp.noise3D(x*cs*0.5+20, y*cs*0.5+20, z*cs*0.5+20)*cw*1.5;
    const pd2 = Math.abs(Math.sin((d2*cs*0.7+warp2)*Math.PI));
    disp += _groove(pd2, cw*1.2) * bd * 0.6 * dv;

    if (params.crackDepth > 0.04) {
      const a5 = noiseCrack.noise3D(13.1,14.2,15.3)*Math.PI;
      const a6 = noiseCrack.noise3D(16.4,17.5,18.6)*Math.PI*0.5;
      const n3x = Math.cos(a5)*Math.cos(a6), n3y = Math.sin(a6), n3z = Math.sin(a5)*Math.cos(a6);
      const d3 = x*n3x + y*n3y + z*n3z;
      const pd3 = Math.abs(Math.sin((d3*cs*1.3)*Math.PI));
      disp += _groove(pd3, cw*0.8) * bd * 0.3;
    }

  } else if (algo === 'horizontal') {
    const warpH = noiseWarp.noise3D(x*cs*0.3, y*cs*0.1, z*cs*0.3)*cw*3;
    const layerPhase = y*cs*1.5 + warpH;
    const hCrack = Math.abs(Math.sin(layerPhase*Math.PI));
    disp += _groove(hCrack, cw*1.3) * bd * dv;
    const warpH2 = noiseWarp.noise3D(x*cs*0.4+30, y*cs*0.15+30, z*cs*0.4+30)*cw*2;
    const layerPhase2 = y*cs*2.3 + warpH2 + 0.37;
    const hCrack2 = Math.abs(Math.sin(layerPhase2*Math.PI));
    disp += _groove(hCrack2, cw*0.9) * bd * 0.5 * dv;
    if (params.crackDepth > 0.03) {
      const crossWarp = noiseWarp.noise3D(x*cs*0.2+60, y*cs*0.5+60, z*cs*0.2+60)*cw*2;
      const xzDist = Math.sqrt(x*x+z*z);
      const crossPhase = xzDist*cs*0.8 + crossWarp;
      const crossCrack = Math.abs(Math.sin(crossPhase*Math.PI));
      disp += _groove(crossCrack, cw*0.6) * bd * 0.25;
    }

  } else if (algo === 'vertical') {
    const warpV1 = noiseWarp.noise3D(x*cs*0.2, y*cs*0.1, z*cs*0.2)*cw*3;
    const angleV1 = noiseCrack.noise3D(1.5,2.5,3.5)*Math.PI;
    const projV1 = x*Math.cos(angleV1) + z*Math.sin(angleV1);
    const vCrack1 = Math.abs(Math.sin((projV1*cs+warpV1)*Math.PI));
    disp += _groove(vCrack1, cw*1.3) * bd * dv;
    const angleV2 = angleV1 + Math.PI*(0.3+noiseCrack.noise3D(4.5,5.5,6.5)*0.4);
    const warpV2 = noiseWarp.noise3D(x*cs*0.25+40, y*cs*0.1+40, z*cs*0.25+40)*cw*2;
    const projV2 = x*Math.cos(angleV2) + z*Math.sin(angleV2);
    const vCrack2 = Math.abs(Math.sin((projV2*cs*0.7+warpV2)*Math.PI));
    disp += _groove(vCrack2, cw*1.0) * bd * 0.6 * dv;
    const heightVar = noiseCrack.noise3D(x*cs*0.5, y*cs*2, z*cs*0.5);
    if (Math.abs(heightVar) < cw * 0.5) {
      disp += _groove(Math.abs(heightVar), cw*0.4) * bd * 0.2;
    }

  } else if (algo === 'path') {
    const wStr = cw * 5;
    const w1x = noiseWarp.noise3D(x*cs*0.3+3.7, y*cs*0.3+7.1, z*cs*0.3+1.9) * wStr;
    const w1y = noiseWarp.noise3D(x*cs*0.3+13.2, y*cs*0.3+17.6, z*cs*0.3+11.4) * wStr;
    const w1z = noiseWarp.noise3D(x*cs*0.3+23.8, y*cs*0.3+27.3, z*cs*0.3+21.1) * wStr;
    const w2x = noiseCrack.noise3D((x+w1x)*cs*0.5+40, (y+w1y)*cs*0.5, (z+w1z)*cs*0.5) * wStr*0.5;
    const w2y = noiseCrack.noise3D((x+w1x)*cs*0.5, (y+w1y)*cs*0.5+40, (z+w1z)*cs*0.5) * wStr*0.5;
    const w2z = noiseCrack.noise3D((x+w1x)*cs*0.5, (y+w1y)*cs*0.5, (z+w1z)*cs*0.5+40) * wStr*0.5;
    const px = x+w1x+w2x, py = y+w1y+w2y, pz = z+w1z+w2z;
    const n1 = Math.abs(noiseCrack.noise3D(px*cs, py*cs, pz*cs));
    disp += _groove(n1, cw) * bd * dv;
    if (params.crackDepth > 0.02) {
      const w3x = noiseWarp.noise3D(x*cs*0.4+50, y*cs*0.4+53, z*cs*0.4+57) * wStr*0.7;
      const w3z = noiseWarp.noise3D(x*cs*0.4+60, y*cs*0.4+63, z*cs*0.4+67) * wStr*0.7;
      const n2 = Math.abs(noiseCrack.noise3D((y+w3x)*cs*1.2+80, (z+w3z)*cs*1.2+80, (x+w3x)*cs*1.2+80));
      disp += _groove(n2, cw*0.7) * bd * 0.4;
    }
    if (params.crackDepth > 0.06) {
      const n3 = Math.abs(noiseCrack.noise3D(px*cs*2.2+120, py*cs*2.2+120, pz*cs*2.2+120));
      disp += _groove(n3, cw*0.4) * bd * 0.2;
    }
  }

  return disp;
}

// ── Crack Near Test (for adaptive subdivision) ──────────────────────────

export function crackNearTest(x, y, z, params, noiseCrack, noiseWarp) {
  const algo = params.crackAlgo;
  const cs = params.crackDensity;
  const margin = params.crackWidth * 2.5;

  if (algo === 'ridge') {
    if (Math.abs(noiseCrack.noise3D(x*cs, y*cs, z*cs)) < margin) return true;
    if (params.crackDepth > 0.02) {
      if (Math.abs(noiseCrack.noise3D(y*cs*1.3+47.1,z*cs*1.3+83.4,x*cs*1.3+29.6)) < margin*0.7) return true;
    }
  } else if (algo === 'voronoi') {
    const w = noiseCrack.worley3D(x*cs, y*cs, z*cs);
    if (w.edge < margin) return true;
  } else if (algo === 'warp') {
    const warpStr = params.crackWidth * 3;
    const wx = noiseWarp.noise3D(x*cs*0.7+5,y*cs*0.7+5,z*cs*0.7+5) * warpStr;
    const wy = noiseWarp.noise3D(x*cs*0.7+50,y*cs*0.7+50,z*cs*0.7+50) * warpStr;
    const wz = noiseWarp.noise3D(x*cs*0.7+95,y*cs*0.7+95,z*cs*0.7+95) * warpStr;
    if (Math.abs(noiseCrack.noise3D((x+wx)*cs,(y+wy)*cs,(z+wz)*cs)) < margin) return true;
  } else if (algo === 'branch') {
    if (Math.abs(noiseCrack.noise3D(x*cs*0.7,y*cs*0.7,z*cs*0.7)) < margin*1.3) return true;
  } else if (algo === 'shatter') {
    const w = noiseCrack.worley3D(x*cs*0.8, y*cs*0.8, z*cs*0.8);
    if (w.edge < margin * 1.2) return true;
    if (Math.abs(noiseCrack.noise3D(x*cs*1.5,y*cs*1.5,z*cs*1.5)) < margin*0.5) return true;
  } else if (algo === 'planar') {
    const a1 = noiseCrack.noise3D(1.1,2.2,3.3)*Math.PI;
    const a2 = noiseCrack.noise3D(4.4,5.5,6.6)*Math.PI*0.5;
    const n1x = Math.cos(a1)*Math.cos(a2), n1y = Math.sin(a2), n1z = Math.sin(a1)*Math.cos(a2);
    const d1 = x*n1x + y*n1y + z*n1z;
    const warp1 = noiseWarp.noise3D(x*cs*0.4,y*cs*0.4,z*cs*0.4)*margin*2;
    if (Math.abs(Math.sin((d1*cs+warp1)*Math.PI)) < margin*1.5) return true;
    const a3 = noiseCrack.noise3D(7.7,8.8,9.9)*Math.PI;
    const a4 = noiseCrack.noise3D(10.1,11.2,12.3)*Math.PI*0.5;
    const n2x = Math.cos(a3)*Math.cos(a4), n2y = Math.sin(a4), n2z = Math.sin(a3)*Math.cos(a4);
    const d2 = x*n2x + y*n2y + z*n2z;
    if (Math.abs(Math.sin((d2*cs*0.7)*Math.PI)) < margin*1.2) return true;
  } else if (algo === 'horizontal') {
    const warpH = noiseWarp.noise3D(x*cs*0.3,y*cs*0.1,z*cs*0.3)*margin*3;
    if (Math.abs(Math.sin((y*cs*1.5+warpH)*Math.PI)) < margin*1.3) return true;
    if (Math.abs(Math.sin((y*cs*2.3+0.37)*Math.PI)) < margin*0.9) return true;
  } else if (algo === 'vertical') {
    const angleV1 = noiseCrack.noise3D(1.5,2.5,3.5)*Math.PI;
    const projV1 = x*Math.cos(angleV1) + z*Math.sin(angleV1);
    const warpV = noiseWarp.noise3D(x*cs*0.2,y*cs*0.1,z*cs*0.2)*margin*3;
    if (Math.abs(Math.sin((projV1*cs+warpV)*Math.PI)) < margin*1.3) return true;
    const angleV2 = angleV1 + Math.PI*(0.3+noiseCrack.noise3D(4.5,5.5,6.5)*0.4);
    const projV2 = x*Math.cos(angleV2)+z*Math.sin(angleV2);
    if (Math.abs(Math.sin((projV2*cs*0.7)*Math.PI)) < margin) return true;
  } else if (algo === 'path') {
    const wStr = margin * 5;
    const w1x = noiseWarp.noise3D(x*cs*0.3+3.7,y*cs*0.3+7.1,z*cs*0.3+1.9)*wStr;
    const w1y = noiseWarp.noise3D(x*cs*0.3+13.2,y*cs*0.3+17.6,z*cs*0.3+11.4)*wStr;
    const w1z = noiseWarp.noise3D(x*cs*0.3+23.8,y*cs*0.3+27.3,z*cs*0.3+21.1)*wStr;
    const px = x+w1x, py = y+w1y, pz = z+w1z;
    if (Math.abs(noiseCrack.noise3D(px*cs,py*cs,pz*cs)) < margin) return true;
  }
  return false;
}
