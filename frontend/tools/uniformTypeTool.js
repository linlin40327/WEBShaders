import * as THREE from 'three';

/**
 * @typedef {Object} UniformConfigEntry
 * @property {string} type   - 类型: 'float'|'int'|'bool'|'vec2'|'vec3'|'color'|'colorAlpha'|'mat3'|'mat4'|'sampler2D'
 * @property {*}      value  - 初始值（number / number[] / "#rrggbb" 等）
 * @property {number} [min]  - 最小值（可选，省略按类型默认）
 * @property {number} [max]  - 最大值（可选，省略按类型默认）
 * @property {number} [step] - 步长（可选，省略按类型默认）
 *
 * ===== 默认 min / max / step =====
 *   float      : min=0    max=100   step=0.1
 *   int        : min=0    max=100   step=1
 *   bool       : 无（toggle 开关）
 *   vec2       : min=0    max=1     step=0.01
 *   vec3       : min=-1   max=1     step=0.01
 *   color      : 无（颜色选择器）
 *   colorAlpha : 无（颜色选择器 + Alpha 滑块）
 *   mat3       : min=0    max=1     step=0.01
 *   mat4       : min=0    max=1     step=0.01
 *   sampler2D  : 无（纹理上传按钮）
 *
 * ===== config.js 示例 =====
 *   export default {
 *     uniforms: {
 *       speed:     { type: 'float', value: 1.5,  min: 0, max: 10 },
 *       offset:    { type: 'vec2',  value: [0.5, 0.5] },
 *       colorMain: { type: 'color', value: '#ff6600' },
 *       transform: { type: 'mat3',  value: [1,0,0, 0,1,0, 0,0,1] },
 *     },
 *   };
 */

const TYPE_META = {
  float: { glsl: 'float', component: 'float', ui: 'slider', defaultMin: 0, defaultMax: 100, defaultStep: 0.1, jsType: 'number', size: 1, isBool: false },
  int:   { glsl: 'int',   component: 'int',   ui: 'slider', defaultMin: 0, defaultMax: 100, defaultStep: 1,   jsType: 'number', size: 1, isBool: false },
  bool:  { glsl: 'bool',  component: 'bool',  ui: 'toggle', defaultMin: null, defaultMax: null, defaultStep: null, jsType: 'boolean', size: 1, isBool: true },
  vec2:  { glsl: 'vec2',  component: 'vec2',  ui: 'vec2',   defaultMin: 0, defaultMax: 1, defaultStep: 0.01, jsType: 'object', size: 2, isBool: false },
  vec3:  { glsl: 'vec3',  component: 'vec3',  ui: 'vec3',   defaultMin: -1, defaultMax: 1, defaultStep: 0.01, jsType: 'object', size: 3, isBool: false },
  vec4:  { glsl: 'vec4',  component: 'vec4',  ui: 'vec4',   defaultMin: 0, defaultMax: 1, defaultStep: 0.01, jsType: 'object', size: 4, isBool: false },
  bvec2: { glsl: 'bvec2', component: 'bvec2', ui: 'bvec2',  defaultMin: null, defaultMax: null, defaultStep: null, jsType: 'object', size: 2, isBool: true },
  bvec3: { glsl: 'bvec3', component: 'bvec3', ui: 'bvec3',  defaultMin: null, defaultMax: null, defaultStep: null, jsType: 'object', size: 3, isBool: true },
  bvec4: { glsl: 'bvec4', component: 'bvec4', ui: 'bvec4',  defaultMin: null, defaultMax: null, defaultStep: null, jsType: 'object', size: 4, isBool: true },
  color: { glsl: 'vec3',  component: 'color', ui: 'colorPicker', defaultMin: null, defaultMax: null, defaultStep: null, jsType: 'string', size: 3, isBool: false },
  colorAlpha: { glsl: 'vec4', component: 'color', ui: 'colorAlpha', defaultMin: null, defaultMax: null, defaultStep: null, jsType: 'string', size: 4, isBool: false },
  mat2:  { glsl: 'mat2',  component: 'mat2',  ui: 'mat2',  defaultMin: 0, defaultMax: 1, defaultStep: 0.01, jsType: 'object', size: 4, isBool: false },
  mat3:  { glsl: 'mat3',  component: 'mat3',  ui: 'mat3',  defaultMin: 0, defaultMax: 1, defaultStep: 0.01, jsType: 'object', size: 9, isBool: false },
  mat4:  { glsl: 'mat4',  component: 'mat4',  ui: 'mat4',  defaultMin: 0, defaultMax: 1, defaultStep: 0.01, jsType: 'object', size: 16, isBool: false },
  sampler2D: { glsl: 'sampler2D', component: 'sampler2D', ui: 'texture', defaultMin: null, defaultMax: null, defaultStep: null, jsType: 'object', size: 1, isBool: false },
};

const TYPE_NAMES = Object.keys(TYPE_META);

function getTypeMeta(type) { return TYPE_META[type] || null; }
function hasTypeMeta(type) { return type in TYPE_META; }

// ======================= 正向：浏览器 JS → Three.js =======================

function toUniformValue(raw, type) {
  if (!hasTypeMeta(type)) return raw;

  switch (type) {
    case 'float': return typeof raw === 'number' ? raw : parseFloat(raw) || 0;
    case 'int':   return Math.floor(typeof raw === 'number' ? raw : parseFloat(raw) || 0);

    case 'bool':
      return !!raw;

    case 'bvec2':
      if (Array.isArray(raw)) return [!!raw[0], !!raw[1]];
      return [false, false];
    case 'bvec3':
      if (Array.isArray(raw)) return [!!raw[0], !!raw[1], !!raw[2]];
      return [false, false, false];
    case 'bvec4':
      if (Array.isArray(raw)) return [!!raw[0], !!raw[1], !!raw[2], !!raw[3]];
      return [false, false, false, false];

    case 'vec2':
      if (raw instanceof THREE.Vector2) return raw.clone();
      if (Array.isArray(raw)) return new THREE.Vector2(raw[0], raw[1]);
      if (raw && typeof raw.x === 'number') return new THREE.Vector2(raw.x, raw.y);
      return new THREE.Vector2(0, 0);
    case 'vec3':
      if (raw instanceof THREE.Vector3) return raw.clone();
      if (Array.isArray(raw)) return new THREE.Vector3(raw[0], raw[1], raw[2]);
      if (raw && typeof raw.x === 'number') return new THREE.Vector3(raw.x, raw.y, raw.z);
      return new THREE.Vector3(0, 0, 0);
    case 'vec4':
      if (raw instanceof THREE.Vector4) return raw.clone();
      if (Array.isArray(raw)) return new THREE.Vector4(raw[0], raw[1], raw[2], raw[3]);
      if (raw && typeof raw.x === 'number') return new THREE.Vector4(raw.x, raw.y, raw.z, raw.w);
      return new THREE.Vector4(0, 0, 0, 0);

    case 'color':
      if (raw instanceof THREE.Color) return raw.clone();
      if (typeof raw === 'string') return new THREE.Color(raw);
      if (Array.isArray(raw)) return new THREE.Color(raw[0], raw[1], raw[2]);
      return new THREE.Color('#ffffff');
    case 'colorAlpha':
      if (raw instanceof THREE.Vector4) return raw.clone();
      if (raw instanceof THREE.Color) return new THREE.Vector4(raw.r, raw.g, raw.b, 1);
      if (typeof raw === 'string') { const c = new THREE.Color(raw); return new THREE.Vector4(c.r, c.g, c.b, 1); }
      if (Array.isArray(raw)) return new THREE.Vector4(raw[0], raw[1], raw[2], raw[3] ?? 1);
      return new THREE.Vector4(1, 1, 1, 1);

    case 'mat2': {
      const m = new THREE.Matrix3();
      if (Array.isArray(raw) && raw.length === 4) m.set(raw[0], raw[2], 0, raw[1], raw[3], 0, 0, 0, 1);
      return m;
    }
    case 'mat3':
      if (raw instanceof THREE.Matrix3) return raw.clone();
      if (Array.isArray(raw)) return new THREE.Matrix3().fromArray(raw);
      return new THREE.Matrix3();
    case 'mat4':
      if (raw instanceof THREE.Matrix4) return raw.clone();
      if (Array.isArray(raw) && raw.length >= 16) return new THREE.Matrix4().fromArray(raw);
      return new THREE.Matrix4();

    case 'sampler2D':
      return raw instanceof THREE.Texture ? raw : null;

    default: return raw;
  }
}

// ======================= 反向：Three.js → 浏览器 JS =======================

function fromUniformValue(threeValue, type) {
  if (!hasTypeMeta(type)) return threeValue;

  switch (type) {
    case 'float': return typeof threeValue === 'number' ? threeValue : 0;
    case 'int':   return Math.floor(typeof threeValue === 'number' ? threeValue : 0);
    case 'bool':  return !!threeValue;

    case 'bvec2': return Array.isArray(threeValue) ? [!!threeValue[0], !!threeValue[1]] : [false, false];
    case 'bvec3': return Array.isArray(threeValue) ? [!!threeValue[0], !!threeValue[1], !!threeValue[2]] : [false, false, false];
    case 'bvec4': return Array.isArray(threeValue) ? [!!threeValue[0], !!threeValue[1], !!threeValue[2], !!threeValue[3]] : [false, false, false, false];

    case 'vec2': return threeValue instanceof THREE.Vector2 ? [threeValue.x, threeValue.y] : [0, 0];
    case 'vec3': return threeValue instanceof THREE.Vector3 ? [threeValue.x, threeValue.y, threeValue.z] : [0, 0, 0];
    case 'vec4': return threeValue instanceof THREE.Vector4 ? [threeValue.x, threeValue.y, threeValue.z, threeValue.w] : [0, 0, 0, 0];

    case 'color':
      if (threeValue instanceof THREE.Color) return '#' + threeValue.getHexString();
      return '#ffffff';
    case 'colorAlpha':
      if (threeValue instanceof THREE.Vector4) return [threeValue.x, threeValue.y, threeValue.z, threeValue.w];
      return [1, 1, 1, 1];

    case 'mat2': {
      if (threeValue instanceof THREE.Matrix3) {
        const e = threeValue.elements;
        return [e[0], e[1], e[3], e[4]];
      }
      return [1, 0, 0, 1];
    }
    case 'mat3':
      if (threeValue instanceof THREE.Matrix3) return threeValue.toArray().slice(0, 9);
      return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    case 'mat4':
      if (threeValue instanceof THREE.Matrix4) return threeValue.toArray().slice(0, 16);
      return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

    case 'sampler2D': return threeValue instanceof THREE.Texture ? threeValue : null;

    default: return threeValue;
  }
}

function getUIDefaults(type) {
  const meta = getTypeMeta(type);
  if (!meta) return {};
  return { ui: meta.ui, min: meta.defaultMin, max: meta.defaultMax, step: meta.defaultStep, jsType: meta.jsType };
}

// ======================= config 解析 =======================

function parseUniformConfig(rawConfig) {
  if (!rawConfig || !rawConfig.uniforms) return {};

  const result = {};

  for (const [name, def] of Object.entries(rawConfig.uniforms)) {
    if (def === null || def === undefined) continue;

    if (typeof def === 'object' && 'value' in def && !('type' in def)) {
      result[name] = inferTypeAndBuild(name, def.value);
      continue;
    }
    if (typeof def !== 'object' || def === null) {
      result[name] = inferTypeAndBuild(name, def);
      continue;
    }

    const type = def.type || inferType(def.value);
    const meta = getTypeMeta(type);

    result[name] = {
      type,
      glslType: meta ? meta.glsl : 'float',
      value: toUniformValue(def.value, type),
      ui: meta ? meta.ui : 'slider',
      min: def.min !== undefined ? def.min : (meta ? meta.defaultMin : 0),
      max: def.max !== undefined ? def.max : (meta ? meta.defaultMax : 100),
      step: def.step !== undefined ? def.step : (meta ? meta.defaultStep : 0.1),
      raw: def,
      isBool: meta ? meta.isBool : false,
      size: meta ? meta.size : 1,
    };
  }

  return result;
}

function inferType(value) {
  if (value === null || value === undefined) return 'float';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return Number.isInteger(value) && value < 65536 ? 'int' : 'float';
  if (value instanceof THREE.Color) return 'color';
  if (value instanceof THREE.Vector2) return 'vec2';
  if (value instanceof THREE.Vector3) return 'vec3';
  if (value instanceof THREE.Vector4) return 'vec4';
  if (value instanceof THREE.Matrix3) return 'mat3';
  if (value instanceof THREE.Matrix4) return 'mat4';
  if (value instanceof THREE.Texture) return 'sampler2D';
  if (Array.isArray(value)) {
    if (value.length === 2) return 'vec2';
    if (value.length === 3) return 'vec3';
    if (value.length === 4) return 'vec4';
  }
  return 'float';
}

function inferTypeAndBuild(name, value) {
  const type = inferType(value);
  const meta = getTypeMeta(type);
  return {
    type,
    glslType: meta ? meta.glsl : 'float',
    value: toUniformValue(value, type),
    ui: meta ? meta.ui : 'slider',
    min: meta ? meta.defaultMin : 0,
    max: meta ? meta.defaultMax : 100,
    step: meta ? meta.defaultStep : 0.1,
    raw: { value },
    isBool: meta ? meta.isBool : false,
    size: meta ? meta.size : 1,
  };
}

function buildThreeUniforms(parsed) {
  const result = {};
  for (const [name, def] of Object.entries(parsed)) {
    result[name] = { value: def.value };
  }
  return result;
}

function updateUniformValue(parsed, name, newRawValue) {
  if (!parsed[name]) return false;
  const def = parsed[name];
  def.value = toUniformValue(newRawValue, def.type);
  def.raw.value = newRawValue;
  return true;
}

export {
  TYPE_META, TYPE_NAMES,
  getTypeMeta, hasTypeMeta,
  toUniformValue, fromUniformValue,
  getUIDefaults,
  parseUniformConfig, inferType,
  buildThreeUniforms, updateUniformValue,
};
