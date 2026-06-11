# Shader3D

Three.js 着色器管理与预览工具。前后端分离：前端 Three.js 渲染 + UI 交互，后端 Express 管理文件系统 + 持久化。

## 快速启动

```bash
# 1. 后端
cd backend
npm install
npm run dev        # 启动于 :3000，文件变更自动重启

# 2. 前端（新终端）
cd frontend
npm install
npm run dev        # 启动于 :5173，代理 /api 和 /shaders 到 :3000
```

浏览器打开 `http://localhost:5173`。

## 项目结构

```
shader3D/
├── backend/
│   ├── server.js          # 开发 API 服务器
│   ├── prod-server.js     # 生产服务器（托管前端 dist）
│   ├── db.json            # 树结构 + 激活着色器持久化
│   └── shaders/           # 着色器磁盘目录
└── frontend/
    ├── index.html         # 入口（含 import map）
    ├── vite.config.js     # Vite 配置 + 代理
    └── js/
        ├── main.js        # 初始化 + 动画循环
        ├── scene.js       # Three.js 场景/相机管理
        ├── globalConfig.js # 全局 uniforms（time/resolution）+ 时间系统
        ├── shaderTree.js  # 树数据 + 服务器同步
        ├── shaderItem.js  # DOM 渲染 + 着色器激活
        ├── dnd.js         # 拖拽排序
        ├── panel.js       # 底部时间面板
        ├── uniformUI.js   # Uniform 控件 + 纹理加载
        └── modal.js       # 模态框（新建/删除/重命名）
```

## 着色器目录结构

每个着色器在 `backend/shaders/` 下组织如下：

```
shaders/
└── 初级着色器/                    # collection（收录目录）
    └── 05光线着色尝试/             # shader（着色器单元）
        ├── shader/
        │   ├── vertex.glsl        # 顶点着色器
        │   └── fragment.glsl      # 片段着色器
        ├── js/
        │   ├── config.js          # 配置（uniforms 定义 + objects 路径）
        │   └── object.js          # 自定义场景构建（ES 模块）
        └── assets/               # 静态资源（纹理、模型等）
```

## config.js

定义着色器的 uniforms 和模型路径：

```javascript
export default {
  uniforms: {
    duration:   { type: 'float',  value: 6.0,  min: 0.1, max: 10.0, step: 0.1 },
    speed:      { type: 'float',  value: 5.0,  min: 0.1, max: 20.0 },
    enabled:    { type: 'bool',   value: true },
    tint:       { type: 'colorAlpha', value: [1, 1, 1, 1] },
    background: { type: 'sampler2D',  value: './background.jpeg' },
  },
  objects: {
    monkey: './assets/初始猴头.glb',
  },
};
```

**uniforms** 中的类型决定前端 UI 控件：`slider` / `toggle` / `colorPicker` / `colorAlpha` / `vec2`~`vec4` / `mat2`~`mat4` / `texture` / `sampler2D`。

前端会自动合并全局 uniform（`time`、`resolution`），并处理相对路径。

**objects** 是键值对，值为模型路径（`./` 开头为着色器目录下的相对路径）。前端加载着色器时自动解析为绝对 URL 传入 object.js。

## object.js

ES 模块，`export function createObjects(config, shader)`：

```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function createObjects(config, shader) {
  return new Promise((resolve, reject) => {
    // config.uniforms  — THREE 格式 uniform 对象（已含 time/resolution）
    // config.objects   — { monkey: '/shaders/.../初始猴头.glb', ... }
    // shader.vertex    — vertex.glsl 源码
    // shader.fragment  — fragment.glsl 源码

    const loader = new GLTFLoader();
    loader.load(config.objects.monkey, (gltf) => {
      const material = new THREE.ShaderMaterial({
        vertexShader: shader.vertex,
        fragmentShader: shader.fragment,
        uniforms: config.uniforms,
      });
      gltf.scene.traverse(c => { if (c.isMesh) c.material = material; });

      const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 100);
      camera.position.set(0, 1, 4);
      resolve({ objects: [gltf.scene], camera });
    }, undefined, reject);
  });
}
```

返回值：`{ objects: THREE.Object3D[], camera: THREE.Camera }`。

无 object.js 时自动回退到默认 plane（2×2 `ShaderMaterial` + `OrthographicCamera`）。

## 后端 API

| 方法 | 路由 | 说明 |
|------|------|------|
| `GET` | `/api/db` | 读取树结构（磁盘 + db.json 合并） |
| `POST` | `/api/db` | 更新 db.json 字段（lastShader 等） |
| `POST` | `/api/create-shader` | 新建着色器 |
| `POST` | `/api/create-collection` | 新建收录目录 |
| `POST` | `/api/delete-shader` | 删除着色器 |
| `POST` | `/api/delete-collection` | 删除收录目录（含锁定检查） |
| `POST` | `/api/rename-shader` | 重命名 |
| `POST` | `/api/move-shader` | 移动排序 |
| `POST` | `/api/tree/lock` | 锁定/解锁着色器 |
| `POST` | `/api/tree/expand` | 折叠/展开收录 |
| `POST` | `/api/tree/camera` | 启用/禁用自定义摄像机 |
| `GET` | `/api/shader/vertex` | 获取 vertex.glsl |
| `GET` | `/api/shader/fragment` | 获取 fragment.glsl |
| `GET` | `/api/shader/config` | 解析 config.js 返回 JSON |
| `GET` | `/api/shader/object-js` | 获取 object.js 源码 |
| `GET` | `/api/shader/asset` | 获取 assets 目录文件 |
| — | `/shaders/` | 静态文件服务 |

## WebSocket 协议

后端在 `ws://localhost:3000` 提供 WebSocket 服务，实现文件热更新自动刷新。

### 客户端 → 服务器

| 消息 | 说明 |
|------|------|
| `{ type: "active", path: "着色器路径" }` | 通知后端当前激活的着色器路径，用于锁定监控范围 |

### 服务器 → 客户端

| 消息 | 说明 |
|------|------|
| `{ type: "reload", file: "js/object.js" }` | object.js 变更 → 前端完整重建造型、材质、摄像机 |
| `{ type: "reload", file: "js/config.js" }` | config.js 变更 → 前端仅更新 uniform 值和 UI 控件，不动模型和摄像机 |
| `{ type: "reload", file: "shader/vertex.glsl" }` 或 `"shader/fragment.glsl"` | GLSL 变更 → 前端仅重编译 ShaderMaterial，不动模型和摄像机 |

### 行为特征

- 自动重连：断线后 2 秒自动尝试重连
- 重连后自动发送当前激活路径，恢复监控
- 防抖：文件保存后 300ms 稳定期后才触发 reload
- 变更类型：文件修改 (`change`) 和新增文件 (`add`) 均触发
- 路由规则：前端根据 `file` 后缀决定刷新等级
  - `object.js` → 完整重载（走 `setActiveShader`）
  - `config.js` → 仅更新 uniform（`updateConfigUniforms`）
  - `shader/*.glsl` → 仅重编译材质（`updateShaderCode`）
  - 其他文件 → 完整重载（安全兜底）

## 生产构建

```bash
cd frontend
npm run build        # Vite build → dist/

cd ../backend
npm run prod         # Express 托管 frontend/dist + API
```

## 运行环境

- Node.js ≥ 18
- 浏览器支持 ES Module、Import Maps<｜end▁of▁thinking｜>

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="TodoWrite">
<｜｜DSML｜｜parameter name="todos" string="false">[{"content":"创建/更新项目 README","id":"1","priority":"high","status":"completed"}]