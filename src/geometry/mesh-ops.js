/**
 * Low-level mesh operations: vertex welding, adjacency, and subdivision.
 *
 * @module geometry/mesh-ops
 */
import * as THREE from 'three';

// ── Weld Coincident Vertices ────────────────────────────────────────────

export function weldVertices(geo, tolerance = 1e-4) {
  const pos = geo.attributes.position;
  const count = pos.count;
  const idx = geo.index ? geo.index.array : null;
  const idxLen = idx ? idx.length : count;

  const scale = 1 / tolerance;
  const vertexMap = new Map();
  const remap = new Int32Array(count);
  const newPositions = [];
  let newCount = 0;

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const kx = Math.round(x * scale);
    const ky = Math.round(y * scale);
    const kz = Math.round(z * scale);
    const key = ((kx * 73856093) ^ (ky * 19349663) ^ (kz * 83492791)) | 0;

    let found = false;
    if (vertexMap.has(key)) {
      const candidates = vertexMap.get(key);
      for (let j = 0; j < candidates.length; j += 4) {
        if (candidates[j] === kx && candidates[j+1] === ky && candidates[j+2] === kz) {
          remap[i] = candidates[j+3];
          found = true;
          break;
        }
      }
      if (!found) {
        candidates.push(kx, ky, kz, newCount);
        remap[i] = newCount;
        newPositions.push(x, y, z);
        newCount++;
      }
    } else {
      vertexMap.set(key, [kx, ky, kz, newCount]);
      remap[i] = newCount;
      newPositions.push(x, y, z);
      newCount++;
    }
  }

  const cleanIndices = [];
  for (let i = 0; i < idxLen; i += 3) {
    const a = remap[idx ? idx[i] : i];
    const b = remap[idx ? idx[i+1] : i+1];
    const c = remap[idx ? idx[i+2] : i+2];
    if (a !== b && b !== c && a !== c) cleanIndices.push(a, b, c);
  }

  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(newPositions), 3));
  newGeo.setIndex(cleanIndices);
  return newGeo;
}

// ── Build CSR Adjacency ─────────────────────────────────────────────────

export function buildAdjacency(geo) {
  const idx = geo.index ? geo.index.array : null;
  const count = geo.attributes.position.count;
  const triCount = idx ? idx.length / 3 : count / 3;
  const tmp = new Array(count);
  for (let i = 0; i < count; i++) tmp[i] = [];
  if (idx) {
    for (let t = 0; t < triCount; t++) {
      const t3 = t * 3;
      const a = idx[t3], b = idx[t3+1], c = idx[t3+2];
      tmp[a].push(b, c);
      tmp[b].push(a, c);
      tmp[c].push(a, b);
    }
  } else {
    for (let t = 0; t < triCount; t++) {
      const a = t * 3, b = a + 1, c = a + 2;
      tmp[a].push(b, c);
      tmp[b].push(a, c);
      tmp[c].push(a, b);
    }
  }
  const offsets = new Uint32Array(count + 1);
  let total = 0;
  for (let i = 0; i < count; i++) {
    const a = tmp[i];
    a.sort((x, y) => x - y);
    let u = 0;
    for (let j = 0; j < a.length; j++) {
      if (j === 0 || a[j] !== a[j-1]) a[u++] = a[j];
    }
    a.length = u;
    offsets[i] = total;
    total += u;
  }
  offsets[count] = total;
  const data = new Uint32Array(total);
  for (let i = 0; i < count; i++) {
    const a = tmp[i], off = offsets[i];
    for (let j = 0; j < a.length; j++) data[off + j] = a[j];
  }
  return { offsets, data, count };
}

// ── Edge-Midpoint Subdivision ───────────────────────────────────────────

export function subdivideGeometry(geo) {
  const srcPos = geo.attributes.position;
  const srcArr = srcPos.array;
  const srcIdx = geo.index ? geo.index.array : null;
  let posCount = srcPos.count;
  let posCapacity = posCount * 3 * 2;
  let positions = new Float32Array(posCapacity);
  for (let i = 0; i < posCount * 3; i++) positions[i] = srcArr[i];

  const triCount = srcIdx ? srcIdx.length / 3 : srcPos.count / 3;
  const idxLen = srcIdx ? srcIdx.length : srcPos.count;
  const edgeMap = new Map();
  const newIndices = new Int32Array(triCount * 12);
  let ni = 0;

  function getMidpoint(a, b) {
    const lo = a < b ? a : b, hi = a < b ? b : a;
    const key = lo * 1000003 + hi;
    const existing = edgeMap.get(key);
    if (existing !== undefined) return existing;
    const idx = posCount++;
    const i3 = idx * 3;
    if (i3 + 3 > posCapacity) {
      posCapacity *= 2;
      const newArr = new Float32Array(posCapacity);
      newArr.set(positions);
      positions = newArr;
    }
    positions[i3]   = (positions[a*3]   + positions[b*3])   * 0.5;
    positions[i3+1] = (positions[a*3+1] + positions[b*3+1]) * 0.5;
    positions[i3+2] = (positions[a*3+2] + positions[b*3+2]) * 0.5;
    edgeMap.set(key, idx);
    return idx;
  }

  for (let i = 0; i < idxLen; i += 3) {
    const a = srcIdx ? srcIdx[i] : i;
    const b = srcIdx ? srcIdx[i+1] : i+1;
    const c = srcIdx ? srcIdx[i+2] : i+2;
    const ab = getMidpoint(a, b);
    const bc = getMidpoint(b, c);
    const ca = getMidpoint(c, a);
    newIndices[ni++] = a; newIndices[ni++] = ab; newIndices[ni++] = ca;
    newIndices[ni++] = ab; newIndices[ni++] = b; newIndices[ni++] = bc;
    newIndices[ni++] = ca; newIndices[ni++] = bc; newIndices[ni++] = c;
    newIndices[ni++] = ab; newIndices[ni++] = bc; newIndices[ni++] = ca;
  }

  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions.subarray(0, posCount * 3), 3));
  newGeo.setIndex(Array.from(newIndices.subarray(0, ni)));
  return newGeo;
}

// ── Adaptive Subdivision (T-junction-free) ──────────────────────────────

export function adaptiveSubdivide(geo, needsDetail) {
  const srcPos = geo.attributes.position;
  const srcArr = srcPos.array;
  const srcIdx = geo.index ? geo.index.array : null;
  let posCount = srcPos.count;
  let posCapacity = posCount * 3 * 2;
  let positions = new Float32Array(posCapacity);
  for (let i = 0; i < posCount * 3; i++) positions[i] = srcArr[i];

  const triCount = srcIdx ? srcIdx.length / 3 : srcPos.count / 3;
  const idxLen = srcIdx ? srcIdx.length : srcPos.count;

  const triNeedsSub = new Uint8Array(triCount);
  for (let ti = 0; ti < triCount; ti++) {
    const i = ti * 3;
    const a = srcIdx ? srcIdx[i] : i, b = srcIdx ? srcIdx[i+1] : i+1, c = srcIdx ? srcIdx[i+2] : i+2;
    const a3=a*3, b3=b*3, c3=c*3;
    const ax=positions[a3], ay=positions[a3+1], az=positions[a3+2];
    const bx=positions[b3], by=positions[b3+1], bz=positions[b3+2];
    const cx=positions[c3], cy=positions[c3+1], cz=positions[c3+2];
    if (needsDetail(ax,ay,az) || needsDetail(bx,by,bz) ||
        needsDetail(cx,cy,cz) || needsDetail((ax+bx+cx)/3,(ay+by+cy)/3,(az+bz+cz)/3)) {
      triNeedsSub[ti] = 1;
    }
  }

  function edgeKey(a, b) { const lo = a < b ? a : b, hi = a < b ? b : a; return lo * 1000003 + hi; }
  const splitEdges = new Set();
  for (let ti = 0; ti < triCount; ti++) {
    if (!triNeedsSub[ti]) continue;
    const i = ti * 3;
    const a = srcIdx ? srcIdx[i] : i, b = srcIdx ? srcIdx[i+1] : i+1, c = srcIdx ? srcIdx[i+2] : i+2;
    splitEdges.add(edgeKey(a, b));
    splitEdges.add(edgeKey(b, c));
    splitEdges.add(edgeKey(c, a));
  }

  const edgeMap = new Map();
  const newIndices = [];

  function getMidpoint(a, b) {
    const key = edgeKey(a, b);
    const existing = edgeMap.get(key);
    if (existing !== undefined) return existing;
    const idx = posCount++;
    const i3 = idx * 3;
    if (i3 + 3 > posCapacity) {
      posCapacity *= 2;
      const newArr = new Float32Array(posCapacity);
      newArr.set(positions);
      positions = newArr;
    }
    positions[i3]   = (positions[a*3]   + positions[b*3])   * 0.5;
    positions[i3+1] = (positions[a*3+1] + positions[b*3+1]) * 0.5;
    positions[i3+2] = (positions[a*3+2] + positions[b*3+2]) * 0.5;
    edgeMap.set(key, idx);
    return idx;
  }

  for (let ti = 0; ti < triCount; ti++) {
    const i = ti * 3;
    const a = srcIdx ? srcIdx[i] : i, b = srcIdx ? srcIdx[i+1] : i+1, c = srcIdx ? srcIdx[i+2] : i+2;

    if (triNeedsSub[ti]) {
      const ab = getMidpoint(a, b);
      const bc = getMidpoint(b, c);
      const ca = getMidpoint(c, a);
      newIndices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    } else {
      const sAB = splitEdges.has(edgeKey(a, b));
      const sBC = splitEdges.has(edgeKey(b, c));
      const sCA = splitEdges.has(edgeKey(c, a));
      const splitCount = (sAB?1:0) + (sBC?1:0) + (sCA?1:0);

      if (splitCount === 0) {
        newIndices.push(a, b, c);
      } else if (splitCount === 3) {
        const ab = getMidpoint(a, b);
        const bc = getMidpoint(b, c);
        const ca = getMidpoint(c, a);
        newIndices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      } else if (splitCount === 1) {
        let va = a, vb = b, vc = c;
        if (sBC) { va = b; vb = c; vc = a; }
        else if (sCA) { va = c; vb = a; vc = b; }
        const m = getMidpoint(va, vb);
        newIndices.push(va, m, vc, m, vb, vc);
      } else {
        let va = a, vb = b, vc = c;
        if (!sAB) { va = c; vb = a; vc = b; }
        else if (!sCA) { va = b; vb = c; vc = a; }
        const mAB = getMidpoint(va, vb);
        const mCA = getMidpoint(vc, va);
        newIndices.push(va, mAB, mCA, mAB, vb, vc, mCA, mAB, vc);
      }
    }
  }

  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions.subarray(0, posCount * 3), 3));
  newGeo.setIndex(newIndices);
  return newGeo;
}
