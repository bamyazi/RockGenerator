/**
 * Export functions for various formats.
 *
 * ── Adding a new export format ──
 * 1. Add your `export function exportMyFormat() { ... }` below.
 * 2. Assign it to `window` at the bottom of this file.
 * 3. Add a button in `index.html` with `onclick="exportMyFormat()"`.
 *
 * @module exporters
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { state } from './state.js';
import { collectParams, hexToRgb, buildOBJString, downloadBlob, texToBlob } from './utils.js';
import { generateTextures } from './textures.js';
import { decimateGeometry } from './geometry/decimation.js';

// ── Export GLB (with embedded textures) ──────────────────────────────

export function exportGLB() {
  if (!state.rockMesh) return;
  const params = collectParams();
  const { diffuseTexture, normalTexture, roughnessTexture } = generateTextures(params);
  const hasVC = params.vertexAO > 0 || params.curvatureColor > 0 || params.mossAmount > 0;

  const exportMat = new THREE.MeshStandardMaterial({
    map: diffuseTexture,
    normalMap: normalTexture,
    roughnessMap: roughnessTexture,
    roughness: params.roughnessMap,
    metalness: params.metalness,
    vertexColors: hasVC,
  });

  const exportMesh = new THREE.Mesh(state.rockMesh.geometry, exportMat);
  const exporter = new GLTFExporter();
  exporter.parse(exportMesh, (gltf) => {
    const blob = new Blob([gltf], { type: 'application/octet-stream' });
    downloadBlob(blob, 'rock.glb');
    exportMat.dispose();
  }, (err) => console.error(err), { binary: true });
}

// ── Export OBJ ───────────────────────────────────────────────────────

export function exportOBJ() {
  if (!state.rockMesh) return;
  const obj = buildOBJString(state.rockMesh.geometry);
  const blob = new Blob([obj], { type: 'text/plain' });
  downloadBlob(blob, 'rock.obj');
}

// ── Export Textures as PNGs ──────────────────────────────────────────

export function exportTextures() {
  const params = collectParams();
  const { diffuseTexture, normalTexture, roughnessTexture } = generateTextures(params);

  function downloadTexture(tex, name) {
    const canvas = document.createElement('canvas');
    canvas.width = tex.image.width;
    canvas.height = tex.image.height;
    canvas.getContext('2d').drawImage(tex.image, 0, 0);
    const link = document.createElement('a');
    link.download = name + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  downloadTexture(diffuseTexture, 'rock-diffuse');
  setTimeout(() => downloadTexture(normalTexture, 'rock-normal'), 200);
  setTimeout(() => downloadTexture(roughnessTexture, 'rock-roughness'), 400);
}

// ── Export LODs ──────────────────────────────────────────────────────

export function exportLODs() {
  if (!state.rockMesh) return;
  const baseGeo = state.rockMesh.geometry;
  const levels = [1.0, 0.5, 0.25, 0.1];
  const exporter = new GLTFExporter();

  levels.forEach((ratio, i) => {
    let geo;
    if (ratio >= 1.0) {
      geo = baseGeo.clone();
    } else {
      geo = decimateGeometry(baseGeo.clone(), ratio);
    }
    const mesh = new THREE.Mesh(geo, state.rockMesh.material);
    const vertCount = geo.attributes.position.count;
    const triCount = geo.index ? geo.index.count / 3 : vertCount / 3;

    exporter.parse(mesh, (gltf) => {
      const blob = new Blob([gltf], { type: 'application/octet-stream' });
      downloadBlob(blob, `rock-LOD${i}-${triCount}tris.glb`);
    }, (err) => console.error(err), { binary: true });
  });
}

// ── Export for Godot (OBJ + textures + shader + material) ───────────

export function exportForGodot() {
  if (!state.rockMesh) return;
  const params = collectParams();
  const { diffuseTexture, normalTexture, roughnessTexture } = generateTextures(params);

  function canvasToBlob(tex, name) {
    const c = document.createElement('canvas');
    c.width = tex.image.width;
    c.height = tex.image.height;
    c.getContext('2d').drawImage(tex.image, 0, 0);
    c.toBlob(b => downloadBlob(b, name), 'image/png');
  }

  // OBJ
  const obj = buildOBJString(state.rockMesh.geometry, '# Rock Generator OBJ Export (Godot)\n');
  downloadBlob(new Blob([obj], { type: 'text/plain' }), 'rock.obj');

  // Textures
  setTimeout(() => canvasToBlob(diffuseTexture, 'rock_diffuse.png'), 200);
  setTimeout(() => canvasToBlob(normalTexture, 'rock_normal.png'), 400);
  setTimeout(() => canvasToBlob(roughnessTexture, 'rock_roughness.png'), 600);

  // Godot 4 shader
  const sssCol = hexToRgb(params.sssColor || '#c8a882');
  const gdshader = `shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_burley, specular_schlick_ggx;

uniform sampler2D albedo_texture : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D normal_texture : hint_normal, filter_linear_mipmap, repeat_enable;
uniform sampler2D roughness_texture : filter_linear_mipmap, repeat_enable;
uniform float triplanar_scale : hint_range(0.01, 10.0) = ${params.textureScale.toFixed(3)};
uniform float triplanar_sharpness : hint_range(1.0, 16.0) = 4.0;
uniform float normal_strength : hint_range(0.0, 2.0) = ${(params.bumpIntensity * params.normalStrength).toFixed(3)};
uniform float roughness_value : hint_range(0.0, 1.0) = ${params.roughnessMap.toFixed(3)};
uniform float metallic_value : hint_range(0.0, 1.0) = ${params.metalness.toFixed(3)};
uniform float sss_strength : hint_range(0.0, 1.0) = ${(params.sssStrength || 0).toFixed(3)};
uniform vec3 sss_color : source_color = vec3(${sssCol.r.toFixed(3)}, ${sssCol.g.toFixed(3)}, ${sssCol.b.toFixed(3)});

varying vec3 world_pos;
varying vec3 world_normal;

vec4 triplanar_sample(sampler2D tex, vec3 pos, vec3 blend) {
\tvec4 cx = texture(tex, pos.yz);
\tvec4 cy = texture(tex, pos.xz);
\tvec4 cz = texture(tex, pos.xy);
\treturn cx * blend.x + cy * blend.y + cz * blend.z;
}

vec3 triplanar_normal(sampler2D tex, vec3 pos, vec3 blend, vec3 surf_normal) {
\tvec3 tn_x = texture(tex, pos.yz).rgb * 2.0 - 1.0;
\tvec3 tn_y = texture(tex, pos.xz).rgb * 2.0 - 1.0;
\tvec3 tn_z = texture(tex, pos.xy).rgb * 2.0 - 1.0;
\tvec3 n_x = vec3(surf_normal.x, tn_x.y + surf_normal.y, tn_x.x + surf_normal.z);
\tvec3 n_y = vec3(tn_y.x + surf_normal.x, surf_normal.y, tn_y.y + surf_normal.z);
\tvec3 n_z = vec3(tn_z.x + surf_normal.x, tn_z.y + surf_normal.y, surf_normal.z);
\treturn normalize(n_x * blend.x + n_y * blend.y + n_z * blend.z);
}

void vertex() {
\tworld_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
\tworld_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
\tvec3 blend = pow(abs(world_normal), vec3(triplanar_sharpness));
\tblend /= (blend.x + blend.y + blend.z);
\tvec3 tri_coord = world_pos * triplanar_scale;

\tvec4 albedo = triplanar_sample(albedo_texture, tri_coord, blend);
\tALBEDO = albedo.rgb * COLOR.rgb;

\tvec3 tri_norm = triplanar_normal(normal_texture, tri_coord, blend, NORMAL);
\tNORMAL = normalize(mix(NORMAL, tri_norm, normal_strength));

\tfloat rough = triplanar_sample(roughness_texture, tri_coord, blend).r;
\tROUGHNESS = roughness_value * rough;
\tMETALLIC = metallic_value;

\tif (sss_strength > 0.0) {
\t\tSSS_STRENGTH = sss_strength;
\t\tSSS_TRANSMITTANCE_COLOR = vec4(sss_color, 1.0);
\t}
}
`;

  // Godot 4 .tres material resource
  const tres = `[gd_resource type="ShaderMaterial" load_steps=5 format=3]

[ext_resource type="Shader" path="res://rock_triplanar.gdshader" id="1"]
[ext_resource type="Texture2D" path="res://rock_diffuse.png" id="2"]
[ext_resource type="Texture2D" path="res://rock_normal.png" id="3"]
[ext_resource type="Texture2D" path="res://rock_roughness.png" id="4"]

[resource]
shader = ExtResource("1")
shader_parameter/triplanar_scale = ${params.textureScale.toFixed(3)}
shader_parameter/triplanar_sharpness = 4.0
shader_parameter/normal_strength = ${(params.bumpIntensity * params.normalStrength).toFixed(3)}
shader_parameter/roughness_value = ${params.roughnessMap.toFixed(3)}
shader_parameter/metallic_value = ${params.metalness.toFixed(3)}
shader_parameter/sss_strength = ${(params.sssStrength || 0).toFixed(3)}
shader_parameter/sss_color = Color(${sssCol.r.toFixed(3)}, ${sssCol.g.toFixed(3)}, ${sssCol.b.toFixed(3)}, 1)
shader_parameter/albedo_texture = ExtResource("2")
shader_parameter/normal_texture = ExtResource("3")
shader_parameter/roughness_texture = ExtResource("4")
`;

  setTimeout(() => downloadBlob(new Blob([gdshader], { type: 'text/plain' }), 'rock_triplanar.gdshader'), 800);
  setTimeout(() => downloadBlob(new Blob([tres], { type: 'text/plain' }), 'rock_material.tres'), 1000);
}

// ── Export All as ZIP ─────────────────────────────────────────────────

export async function exportAllZip() {
  if (!state.rockMesh) return;
  const params = collectParams();
  const { diffuseTexture, normalTexture, roughnessTexture } = generateTextures(params);
  const zip = new JSZip();

  // Parameters JSON
  zip.file('rock-params.json', JSON.stringify(params, null, 2));

  // OBJ
  zip.file('rock.obj', buildOBJString(state.rockMesh.geometry));

  // GLB
  const hasVC = params.vertexAO > 0 || params.curvatureColor > 0 || params.mossAmount > 0;
  const exportMat = new THREE.MeshStandardMaterial({
    map: diffuseTexture,
    normalMap: normalTexture,
    roughnessMap: roughnessTexture,
    roughness: params.roughnessMap,
    metalness: params.metalness,
    vertexColors: hasVC,
  });
  const exportMesh = new THREE.Mesh(state.rockMesh.geometry, exportMat);
  const exporter = new GLTFExporter();
  const glbData = await new Promise((resolve, reject) => {
    exporter.parse(exportMesh, resolve, reject, { binary: true });
  });
  zip.file('rock.glb', glbData);
  exportMat.dispose();

  // Textures as PNGs
  zip.file('rock-diffuse.png', await texToBlob(diffuseTexture));
  zip.file('rock-normal.png', await texToBlob(normalTexture));
  zip.file('rock-roughness.png', await texToBlob(roughnessTexture));

  // Generate & download
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, 'rock-export-' + params.seed + '.zip');
}

// ── Save Parameters to JSON ──────────────────────────────────────────

export function saveParams() {
  const params = collectParams();
  const json = JSON.stringify(params, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, 'rock-params-' + params.seed + '.json');
}

// ── Load Parameters from JSON ────────────────────────────────────────

export function loadParams(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const params = JSON.parse(e.target.result);
      for (const [id, val] of Object.entries(params)) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.type === 'checkbox') {
          el.checked = !!val;
        } else {
          el.value = val;
        }
      }
      document.querySelectorAll('.param-slider').forEach(sl => {
        const valEl = document.getElementById(sl.id + '-val');
        if (valEl) {
          const step = sl.step || '1';
          const decimals = step.includes('.') ? (step.split('.')[1]||'').length || 2 : 0;
          valEl.textContent = parseFloat(sl.value).toFixed(decimals);
        }
      });
      // Trigger regeneration (imported lazily to avoid circular deps)
      if (window.generateRock) window.generateRock();
    } catch (err) {
      console.error('Failed to load params:', err);
      alert('Invalid parameter file.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ── Window bindings for HTML onclick handlers ────────────────────────

window.exportGLB = exportGLB;
window.exportOBJ = exportOBJ;
window.exportTextures = exportTextures;
window.exportLODs = exportLODs;
window.exportForGodot = exportForGodot;
window.exportAllZip = exportAllZip;
window.saveParams = saveParams;
window.loadParams = loadParams;
