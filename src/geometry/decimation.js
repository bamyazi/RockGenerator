/**
 * Mesh decimation using quadric error metrics with a min-heap.
 *
 * @module geometry/decimation
 */
import * as THREE from 'three';

// ── Min-Heap ────────────────────────────────────────────────────────────

class MinHeap {
  constructor() { this.h = []; }
  get size() { return this.h.length; }
  _swap(i, j) { const t = this.h[i]; this.h[i] = this.h[j]; this.h[j] = t; }
  push(cost, idx) {
    this.h.push({ c: cost, i: idx });
    let k = this.h.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.h[p].c <= this.h[k].c) break;
      this._swap(p, k); k = p;
    }
  }
  pop() {
    const top = this.h[0];
    const last = this.h.pop();
    if (this.h.length > 0) {
      this.h[0] = last;
      let k = 0, n = this.h.length;
      while (true) {
        let s = k, l = 2*k+1, r = 2*k+2;
        if (l < n && this.h[l].c < this.h[s].c) s = l;
        if (r < n && this.h[r].c < this.h[s].c) s = r;
        if (s === k) break;
        this._swap(k, s); k = s;
      }
    }
    return top;
  }
}

// ── Mesh Decimation (edge-collapse with quadric error) ──────────────────

export function decimateGeometry(geo, ratio) {
  if (!geo.index) return geo;

  const posAttr = geo.attributes.position;
  const idxArr = geo.index.array;
  const vertCount = posAttr.count;
  const triCount = idxArr.length / 3;
  const targetTris = Math.max(4, Math.round(triCount * (1 - ratio)));

  const verts = new Float64Array(vertCount * 3);
  for (let i = 0; i < vertCount; i++) {
    verts[i*3]   = posAttr.getX(i);
    verts[i*3+1] = posAttr.getY(i);
    verts[i*3+2] = posAttr.getZ(i);
  }

  const colorAttr = geo.attributes.color;
  const hasColors = !!colorAttr;
  let colors = null;
  if (hasColors) {
    colors = new Float64Array(vertCount * 3);
    for (let i = 0; i < vertCount; i++) {
      colors[i*3]   = colorAttr.getX(i);
      colors[i*3+1] = colorAttr.getY(i);
      colors[i*3+2] = colorAttr.getZ(i);
    }
  }

  const triVerts = new Int32Array(triCount * 3);
  const triAlive = new Uint8Array(triCount);
  for (let i = 0; i < triCount; i++) {
    triVerts[i*3]   = idxArr[i*3];
    triVerts[i*3+1] = idxArr[i*3+1];
    triVerts[i*3+2] = idxArr[i*3+2];
    triAlive[i] = 1;
  }

  const vertTriList = new Array(vertCount);
  for (let i = 0; i < vertCount; i++) vertTriList[i] = [];
  for (let ti = 0; ti < triCount; ti++) {
    vertTriList[triVerts[ti*3]].push(ti);
    vertTriList[triVerts[ti*3+1]].push(ti);
    vertTriList[triVerts[ti*3+2]].push(ti);
  }

  const Q = new Float64Array(vertCount * 10);
  for (let ti = 0; ti < triCount; ti++) {
    const i3 = ti * 3;
    const ia = triVerts[i3], ib = triVerts[i3+1], ic = triVerts[i3+2];
    const ax = verts[ia*3], ay = verts[ia*3+1], az = verts[ia*3+2];
    const e1x = verts[ib*3]-ax, e1y = verts[ib*3+1]-ay, e1z = verts[ib*3+2]-az;
    const e2x = verts[ic*3]-ax, e2y = verts[ic*3+1]-ay, e2z = verts[ic*3+2]-az;
    let nx = e1y*e2z - e1z*e2y, ny = e1z*e2x - e1x*e2z, nz = e1x*e2y - e1y*e2x;
    const nl = Math.sqrt(nx*nx + ny*ny + nz*nz);
    if (nl < 1e-12) continue;
    nx /= nl; ny /= nl; nz /= nl;
    const d = -(nx*ax + ny*ay + nz*az);
    const qq = [nx*nx, nx*ny, nx*nz, nx*d, ny*ny, ny*nz, ny*d, nz*nz, nz*d, d*d];
    for (const vi of [ia, ib, ic]) {
      const o = vi * 10;
      Q[o]+=qq[0]; Q[o+1]+=qq[1]; Q[o+2]+=qq[2]; Q[o+3]+=qq[3];
      Q[o+4]+=qq[4]; Q[o+5]+=qq[5]; Q[o+6]+=qq[6];
      Q[o+7]+=qq[7]; Q[o+8]+=qq[8]; Q[o+9]+=qq[9];
    }
  }

  const vertEdges = new Array(vertCount);
  for (let i = 0; i < vertCount; i++) vertEdges[i] = new Set();
  for (let ti = 0; ti < triCount; ti++) {
    const i3 = ti * 3;
    const a = triVerts[i3], b = triVerts[i3+1], c = triVerts[i3+2];
    vertEdges[a].add(b); vertEdges[a].add(c);
    vertEdges[b].add(a); vertEdges[b].add(c);
    vertEdges[c].add(a); vertEdges[c].add(b);
  }

  function edgeCost(a, b) {
    const mx = (verts[a*3]+verts[b*3]) * 0.5;
    const my = (verts[a*3+1]+verts[b*3+1]) * 0.5;
    const mz = (verts[a*3+2]+verts[b*3+2]) * 0.5;
    const oa = a * 10, ob = b * 10;
    const q0=Q[oa]+Q[ob], q1=Q[oa+1]+Q[ob+1], q2=Q[oa+2]+Q[ob+2], q3=Q[oa+3]+Q[ob+3];
    const q4=Q[oa+4]+Q[ob+4], q5=Q[oa+5]+Q[ob+5], q6=Q[oa+6]+Q[ob+6];
    const q7=Q[oa+7]+Q[ob+7], q8=Q[oa+8]+Q[ob+8], q9=Q[oa+9]+Q[ob+9];
    return q0*mx*mx + 2*q1*mx*my + 2*q2*mx*mz + 2*q3*mx +
           q4*my*my + 2*q5*my*mz + 2*q6*my +
           q7*mz*mz + 2*q8*mz + q9;
  }

  const removed = new Uint8Array(vertCount);
  const heap = new MinHeap();
  const edgeSeen = new Set();
  for (let v = 0; v < vertCount; v++) {
    for (const nb of vertEdges[v]) {
      const a = Math.min(v, nb), b = Math.max(v, nb);
      const key = a * vertCount + b;
      if (edgeSeen.has(key)) continue;
      edgeSeen.add(key);
      heap.push(edgeCost(a, b), a * vertCount + b);
    }
  }
  edgeSeen.clear();

  let aliveTris = triCount;
  const parent = new Int32Array(vertCount);
  for (let i = 0; i < vertCount; i++) parent[i] = i;
  function find(x) {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }

  while (aliveTris > targetTris && heap.size > 0) {
    const top = heap.pop();
    let va = (top.i / vertCount) | 0;
    let vb = top.i - va * vertCount;
    va = find(va); vb = find(vb);
    if (va === vb || removed[va] || removed[vb]) continue;

    const freshCost = edgeCost(va, vb);
    if (Math.abs(freshCost - top.c) > 1e-10 * (1 + Math.abs(top.c))) {
      heap.push(freshCost, Math.min(va,vb) * vertCount + Math.max(va,vb));
      continue;
    }

    verts[va*3]   = (verts[va*3]   + verts[vb*3])   * 0.5;
    verts[va*3+1] = (verts[va*3+1] + verts[vb*3+1]) * 0.5;
    verts[va*3+2] = (verts[va*3+2] + verts[vb*3+2]) * 0.5;

    if (hasColors) {
      colors[va*3]   = (colors[va*3]   + colors[vb*3])   * 0.5;
      colors[va*3+1] = (colors[va*3+1] + colors[vb*3+1]) * 0.5;
      colors[va*3+2] = (colors[va*3+2] + colors[vb*3+2]) * 0.5;
    }

    const oa = va * 10, ob = vb * 10;
    for (let j = 0; j < 10; j++) Q[oa+j] += Q[ob+j];

    removed[vb] = 1;
    parent[vb] = va;

    const vbTris = vertTriList[vb];
    for (let i = 0; i < vbTris.length; i++) {
      const ti = vbTris[i];
      if (!triAlive[ti]) continue;
      const i3 = ti * 3;
      for (let j = 0; j < 3; j++) {
        if (triVerts[i3+j] === vb) triVerts[i3+j] = va;
      }
      const ta = triVerts[i3], tb = triVerts[i3+1], tc = triVerts[i3+2];
      if (ta === tb || tb === tc || ta === tc) {
        triAlive[ti] = 0;
        aliveTris--;
      } else {
        vertTriList[va].push(ti);
      }
    }
    vertTriList[vb] = [];

    for (const nb of vertEdges[vb]) {
      if (nb === va || removed[nb]) continue;
      vertEdges[va].add(nb);
      vertEdges[nb].delete(vb);
      vertEdges[nb].add(va);
      const ea = Math.min(va, nb), eb = Math.max(va, nb);
      heap.push(edgeCost(ea, eb), ea * vertCount + eb);
    }
    vertEdges[vb].clear();
    for (const nb of vertEdges[va]) {
      if (removed[nb]) continue;
      const ea = Math.min(va, nb), eb = Math.max(va, nb);
      heap.push(edgeCost(ea, eb), ea * vertCount + eb);
    }
  }

  // Rebuild compact geometry
  const remap = new Int32Array(vertCount).fill(-1);
  let newIdx = 0;
  const newPos = [];
  const newColors = [];
  for (let i = 0; i < vertCount; i++) {
    if (removed[i]) continue;
    let used = false;
    const vtl = vertTriList[i];
    for (let j = 0; j < vtl.length; j++) {
      if (triAlive[vtl[j]]) { used = true; break; }
    }
    if (!used) continue;
    remap[i] = newIdx++;
    newPos.push(verts[i*3], verts[i*3+1], verts[i*3+2]);
    if (hasColors) newColors.push(colors[i*3], colors[i*3+1], colors[i*3+2]);
  }

  const newTris = [];
  for (let ti = 0; ti < triCount; ti++) {
    if (!triAlive[ti]) continue;
    const i3 = ti * 3;
    const a = remap[triVerts[i3]], b = remap[triVerts[i3+1]], c = remap[triVerts[i3+2]];
    if (a < 0 || b < 0 || c < 0) continue;
    if (a === b || b === c || a === c) continue;
    newTris.push(a, b, c);
  }

  const newGeo = new THREE.BufferGeometry();
  newGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(newPos), 3));
  newGeo.setIndex(newTris);
  if (hasColors && newColors.length > 0) {
    newGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(newColors), 3));
  }
  newGeo.computeVertexNormals();
  return newGeo;
}
