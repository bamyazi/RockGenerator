/**
 * Triplanar shader material with PBR, subsurface scattering, and cavity AO.
 *
 * @module materials
 */
import * as THREE from 'three';

/**
 * Create a MeshStandardMaterial with triplanar texture projection via onBeforeCompile.
 *
 * @param {THREE.Texture} diffuseTex
 * @param {THREE.Texture} normalTex
 * @param {THREE.Texture} roughTex
 * @param {Object} params - Rock generation parameters.
 * @param {boolean} [wireframe=false]
 * @returns {THREE.MeshStandardMaterial}
 */
export function createTriplanarMaterial(diffuseTex, normalTex, roughTex, params, wireframe = false) {
  [diffuseTex, normalTex, roughTex].forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  });

  const hasVertexColors = params.vertexAO > 0 || params.curvatureColor > 0 || params.mossAmount > 0;

  const material = new THREE.MeshStandardMaterial({
    roughness: params.roughnessMap,
    metalness: params.metalness,
    wireframe,
    vertexColors: hasVertexColors,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDiffuseMap = { value: diffuseTex };
    shader.uniforms.uNormalMap = { value: normalTex };
    shader.uniforms.uRoughMap = { value: roughTex };
    shader.uniforms.uTriScale = { value: params.textureScale };
    shader.uniforms.uBumpStrength = { value: params.bumpIntensity };
    shader.uniforms.uNormalStrength = { value: params.normalStrength };
    shader.uniforms.uMicroNormalScale = { value: params.microNormalScale };
    shader.uniforms.uMicroNormalStr = { value: params.microNormalStrength };
    shader.uniforms.uTriSharpness = { value: 4.0 };
    shader.uniforms.uSSSStrength = { value: params.sssStrength || 0 };
    shader.uniforms.uSSSColor = { value: new THREE.Color(params.sssColor || '#c8a882') };

    // Vertex shader: inject varyings
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vWorldPos;
varying vec3 vWorldNormal;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);`
    );

    // Fragment shader: inject uniforms, functions, and triplanar sampling
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
uniform sampler2D uDiffuseMap;
uniform sampler2D uNormalMap;
uniform sampler2D uRoughMap;
uniform float uTriScale;
uniform float uBumpStrength;
uniform float uNormalStrength;
uniform float uMicroNormalScale;
uniform float uMicroNormalStr;
uniform float uTriSharpness;
uniform float uSSSStrength;
uniform vec3 uSSSColor;

vec4 triplanarSample(sampler2D tex, vec3 pos, vec3 blend) {
  vec4 cx = texture2D(tex, pos.yz);
  vec4 cy = texture2D(tex, pos.xz);
  vec4 cz = texture2D(tex, pos.xy);
  return cx * blend.x + cy * blend.y + cz * blend.z;
}

vec3 triplanarNormal(sampler2D tex, vec3 pos, vec3 blend, vec3 surfNormal) {
  vec3 tnX = texture2D(tex, pos.yz).rgb * 2.0 - 1.0;
  vec3 tnY = texture2D(tex, pos.xz).rgb * 2.0 - 1.0;
  vec3 tnZ = texture2D(tex, pos.xy).rgb * 2.0 - 1.0;
  vec3 nX = vec3(surfNormal.x, tnX.y + surfNormal.y, tnX.x + surfNormal.z);
  vec3 nY = vec3(tnY.x + surfNormal.x, surfNormal.y, tnY.y + surfNormal.z);
  vec3 nZ = vec3(tnZ.x + surfNormal.x, tnZ.y + surfNormal.y, surfNormal.z);
  return normalize(nX * blend.x + nY * blend.y + nZ * blend.z);
}

float triplanarHeight(sampler2D tex, vec3 pos, vec3 blend) {
  float hx = texture2D(tex, pos.yz).a;
  float hy = texture2D(tex, pos.xz).a;
  float hz = texture2D(tex, pos.xy).a;
  return hx * blend.x + hy * blend.y + hz * blend.z;
}`
    );

    // Replace map sampling with triplanar
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `// Triplanar blending weights
vec3 triBlend = pow(abs(vWorldNormal), vec3(uTriSharpness));
triBlend /= (triBlend.x + triBlend.y + triBlend.z);
vec3 triCoord = vWorldPos * uTriScale;

// Diffuse via triplanar
vec4 triDiffuse = triplanarSample(uDiffuseMap, triCoord, triBlend);
diffuseColor *= triDiffuse;`
    );

    // Replace normal map with triplanar normal
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `// Triplanar normal mapping with strength control
vec3 triNorm = triplanarNormal(uNormalMap, triCoord, triBlend, normal);
normal = normalize(mix(normal, triNorm, uBumpStrength * uNormalStrength));

// Height-based cavity darkening (micro AO)
float triHeight = triplanarHeight(uRoughMap, triCoord, triBlend);
float cavityAO = mix(1.0, pow(triHeight, 1.5), uBumpStrength * 0.4);
diffuseColor.rgb *= cavityAO;

// Edge wear
float fresnel = 1.0 - max(dot(normalize(vViewPosition), normal), 0.0);
fresnel = pow(fresnel, 3.0);
diffuseColor.rgb += vec3(fresnel * 0.03 * uBumpStrength);

// Subsurface scattering approximation
if (uSSSStrength > 0.0) {
  float sssFresnel = pow(1.0 - max(dot(normalize(vViewPosition), normal), 0.0), 2.0);
  float sssWrap = max(0.0, dot(normal, -normalize(vViewPosition)) * 0.5 + 0.5);
  float sssEffect = mix(sssFresnel * 0.5, sssWrap, 0.4) * uSSSStrength;
  diffuseColor.rgb += uSSSColor * sssEffect * 0.3;
}`
    );

    // Replace roughness map with triplanar
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `float triRough = triplanarSample(uRoughMap, triCoord, triBlend).r;
float heightRoughMod = mix(0.95, 1.05, triplanarHeight(uRoughMap, triCoord, triBlend));
float roughnessFactor = roughness * triRough * heightRoughMod;`
    );

    material.userData.shader = shader;
  };

  return material;
}
