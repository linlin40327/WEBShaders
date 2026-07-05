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

### 端口配置

如需更改端口，仅需编辑两个 `.env` 文件：

| 文件 | 变量 | 作用 |
|------|------|------|
| `backend/.env` | `PORT=3000` | 后端监听端口 |
| `frontend/.env` | `VITE_PORT=3000` | 前端连接后端的端口 |

修改后重启对应服务即可。

## 项目结构

```
shader3D/
├── backend/
│   ├── .env                # 端口配置
│   ├── server.js          # 开发 API 服务器
│   ├── prod-server.js     # 生产服务器（托管前端 dist）
│   ├── db.json            # 树结构 + 激活着色器持久化
│   ├── change.log         # 操作日志（追加式 JSON 行）
│   └── shaders/           # 着色器磁盘目录
├── frontend/
│   ├── .env                # 前端端口配置
│   ├── index.html         # 入口（含 import map）
│   ├── vite.config.js     # Vite 配置 + 代理
│   └── js/
│       ├── main.js        # 初始化 + 动画循环
│       ├── scene.js       # Three.js 场景/相机管理
│       ├── globalConfig.js # 全局 uniforms（time/resolution）+ 时间系统
│       ├── shaderTree.js  # 树数据 + 服务器同步
│       ├── shaderItem.js  # DOM 渲染 + 着色器激活
│       ├── dnd.js         # 拖拽排序
│       ├── panel.js       # 底部时间面板
│       ├── uniformUI.js   # Uniform 控件 + 纹理加载
│       └── modal.js       # 模态框（新建/删除/重命名）
└── V0.1.2                # V0.1.2 更新日志
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

**uniforms** 支持以下类型，由前端 `uniformTypeTool.js` 解析为 Three.js 格式并生成对应 UI 控件：

| 类型名 | GLSL 类型 | UI 控件 | JS 值格式 | 默认 min/max/step |
|---|---|---|---|---|
| `float` | `float` | 滑块+数字输入 | `number` | 0 / 100 / 0.1 |
| `int` | `int` | 滑块+数字输入 | `number` | 0 / 100 / 1 |
| `bool` | `bool` | 开关 | `boolean` | 无 |
| `vec2` | `vec2` | 双输入框(x,y) | `[x, y]` 数组 | 0 / 1 / 0.01 |
| `vec3` | `vec3` | 三输入框(x,y,z) | `[x, y, z]` 数组 | -1 / 1 / 0.01 |
| `vec4` | `vec4` | 四输入框(x,y,z,w) | `[x, y, z, w]` 数组 | 0 / 1 / 0.01 |
| `bvec2` | `bvec2` | 双复选框 | `[bool, bool]` 数组 | 无 |
| `bvec3` | `bvec3` | 三复选框 | `[bool, bool, bool]` 数组 | 无 |
| `bvec4` | `bvec4` | 四复选框 | `[bool, bool, bool, bool]` 数组 | 无 |
| `color` | `vec3` | 颜色选择器 | `"#ff6600"` 字符串 | 无 |
| `colorAlpha` | `vec4` | 颜色选择器+Alpha滑块 | `"#ff6600"` 字符串 | 无 |
| `mat2` | `mat2` | 2x2 矩阵网格 | 数组(4个) | 0 / 1 / 0.01 |
| `mat3` | `mat3` | 3x3 矩阵网格 | 数组(9个) | 0 / 1 / 0.01 |
| `mat4` | `mat4` | 4x4 矩阵网格 | 数组(16个) | 0 / 1 / 0.01 |
| `sampler2D` | `sampler2D` | 纹理上传按钮 | 图片路径字符串 | 无 |

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

## 时间面板

底部控制栏提供以下时间控制：

| 按钮 | 图标 | 功能 |
|------|------|------|
| 循环类型 | repeat / repeat-1 | 切换**循环播放**与**播放一次**，200ms 路径动画 |
| 重置 | — | 转至初始时间 |
| 暂停/播放 | 暂停 / 播放 | 暂停或恢复动画，200ms 路径动画 |
| 转至末尾 | — | 跳转到当前窗口末尾 |
| 倍速切换 | 文字 | 循环切换 0.5× → 1× → 2× → 4× |
| 时间轴 | 滑块 | 0~9.99 秒范围（无持续时长时） |

**时间行为**：
- 无持续时长（`maxDuration=0`）时，以 10 秒为窗口循环
- **循环播放**：窗口末尾自动回到窗口开头继续
- **播放一次**：在当前窗口内播放到末尾后自动暂停，不会跨窗口跳回
- 有持续时长（`maxDuration>0`）时，在 0~maxDuration 范围内按上述规则运作

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

新建着色器/收录时，以下字段有默认值：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `locked` | `false` | 着色器不锁定（允许删除） |
| `cameraEnabled` | `false` | 不启用自定义摄像机移动 |

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
- 重命名暂停：着色器重命名后，暂停 WebSocket 自动重载 2 秒，避免加载过程中被文件变更中断
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