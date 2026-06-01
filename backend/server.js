import express from 'express';
import cors from 'cors';
import { existsSync, mkdirSync, writeFileSync, rmSync, renameSync, readFileSync, cpSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

const DB_PATH = join(__dirname, 'db.json');
const SHADERS_DIR = join(__dirname, 'shaders');

function readDb() {
  try {
    return JSON.parse(readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return { lastShader: null, tree: { type: 'root', children: [] } };
  }
}

function writeDb(data) {
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function findNode(node, path) {
  if (node.path === path) return node;
  if (!node.children) return null;
  for (const child of node.children) {
    const found = findNode(child, path);
    if (found) return found;
  }
  return null;
}

function findParent(node, path, parent = null) {
  if (node.path === path) return parent;
  if (!node.children) return null;
  for (const child of node.children) {
    const found = findParent(child, path, node);
    if (found) return found;
  }
  return null;
}

function removeNodeFromParent(root, path) {
  const parent = findParent(root, path);
  if (!parent || !parent.children) return false;
  const idx = parent.children.findIndex(c => c.path === path);
  if (idx === -1) return false;
  parent.children.splice(idx, 1);
  return true;
}

function insertChild(parent, child, index) {
  if (!parent.children) parent.children = [];
  if (index === undefined || index < 0 || index > parent.children.length) {
    parent.children.push(child);
  } else {
    parent.children.splice(index, 0, child);
  }
}

function reorderChildren(parentNode, orderedPaths) {
  if (!parentNode.children) return;
  const orderMap = new Map(orderedPaths.map((p, i) => [p, i]));
  parentNode.children.sort((a, b) => {
    const ai = orderMap.has(a.path) ? orderMap.get(a.path) : Infinity;
    const bi = orderMap.has(b.path) ? orderMap.get(b.path) : Infinity;
    return ai - bi;
  });
}

function collectShaderPaths(node, arr = []) {
  if (node.type === 'shader') arr.push(node.path);
  if (node.children) node.children.forEach(c => collectShaderPaths(c, arr));
  return arr;
}

function collectCollectionPaths(node, arr = []) {
  if (node.type === 'collection') {
    arr.push(node.path.replace('../shaders/', ''));
  }
  if (node.children) node.children.forEach(c => collectCollectionPaths(c, arr));
  return arr;
}

function collectLocks(node, locks = {}) {
  if (node.locked) locks[node.path] = true;
  if (node.children) node.children.forEach(c => collectLocks(c, locks));
  return locks;
}

function scanShadersDir(basePath, relPath) {
  const nodes = [];
  try {
    const entries = readdirSync(basePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const subPath = join(basePath, entry.name);
      const fullRel = relPath ? `${relPath}/${entry.name}` : entry.name;
      const nodePath = `../shaders/${fullRel}`;

      const hasShader = existsSync(join(subPath, 'shader', 'vertex.glsl')) && existsSync(join(subPath, 'shader', 'fragment.glsl'));

      if (hasShader) {
        nodes.push({ type: 'shader', name: entry.name, path: nodePath, locked: false });
      } else {
        const children = scanShadersDir(subPath, fullRel);
        nodes.push({ type: 'collection', name: entry.name, path: nodePath, expanded: true, children });
      }
    }
  } catch {}
  return nodes;
}

function buildTreeFromFS() {
  const existing = readDb();
  const oldTree = existing.tree;
  const lastShader = existing.lastShader;

  const fsChildren = scanShadersDir(SHADERS_DIR, '');

  function mergeNodes(fsNodes, oldNode) {
    if (!oldNode || !oldNode.children) return fsNodes;
    const oldMap = new Map(oldNode.children.map(c => [c.path, c]));
    return fsNodes.map(fsNode => {
      const old = oldMap.get(fsNode.path);
      if (old) {
        if (fsNode.type === 'shader' && old.type === 'shader') {
          return { ...fsNode, locked: old.locked || false, cameraEnabled: old.cameraEnabled !== false };
        }
        if (fsNode.type === 'collection' && old.type === 'collection') {
          return { ...fsNode, expanded: old.expanded !== false, children: mergeNodes(fsNode.children, old) };
        }
      }
      return fsNode;
    });
  }

  const children = mergeNodes(fsChildren, oldTree);

  return { lastShader, tree: { type: 'root', children } };
}

async function safeRename(oldPath, newPath) {
  for (let i = 0; i < 10; i++) {
    try { renameSync(oldPath, newPath); return; }
    catch (e) {
      if (e.code === 'EPERM' && i < 9) { await new Promise(r => setTimeout(r, 200 * (i + 1))); continue; }
      if (e.code !== 'EPERM') throw e;
    }
  }
  cpSync(oldPath, newPath, { recursive: true });
  for (let i = 0; i < 10; i++) {
    try { rmSync(oldPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); return; }
    catch (e) {
      if (i < 9) { await new Promise(r => setTimeout(r, 500 * (i + 1))); continue; }
      console.error(`[safeRename] 无法删除旧目录: ${oldPath}`, e.message);
    }
  }
}

function fsPath(nodePath) {
  return join(SHADERS_DIR, nodePath.replace(/^\.\.?\/shaders\//, ''));
}

app.get('/api/db', (req, res) => {
  const db = readDb();
  const fresh = buildTreeFromFS();
  db.tree = fresh.tree;
  if (fresh.lastShader) db.lastShader = fresh.lastShader;
  writeDb(db);
  res.json(db);
});

app.post('/api/db', (req, res) => {
  res.json(writeDb({ ...readDb(), ...req.body }));
});

app.post('/api/tree/reorder', (req, res) => {
  const { parentPath, children } = req.body;
  if (!parentPath || !Array.isArray(children)) {
    return res.status(400).json({ error: '参数不完整' });
  }
  const db = readDb();
  const parent = parentPath === '.' ? db.tree : findNode(db.tree, parentPath);
  if (!parent) return res.status(404).json({ error: '父节点不存在' });
  reorderChildren(parent, children);
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/tree/lock', (req, res) => {
  const { path, locked } = req.body;
  if (!path) return res.status(400).json({ error: '路径不能为空' });
  const db = readDb();
  const node = findNode(db.tree, path);
  if (!node) return res.status(404).json({ error: '节点不存在' });
  node.locked = locked;
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/tree/camera', (req, res) => {
  const { path, cameraEnabled } = req.body;
  if (!path) return res.status(400).json({ error: '路径不能为空' });
  const db = readDb();
  const node = findNode(db.tree, path);
  if (!node) return res.status(404).json({ error: '节点不存在' });
  node.cameraEnabled = cameraEnabled;
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/tree/expand', (req, res) => {
  const { path, expanded } = req.body;
  if (!path) return res.status(400).json({ error: '路径不能为空' });
  const db = readDb();
  const node = findNode(db.tree, path);
  if (!node) return res.status(404).json({ error: '节点不存在' });
  node.expanded = !!expanded;
  writeDb(db);
  res.json({ success: true });
});

app.get('/api/shader/vertex', (req, res) => {
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'path 不能为空' });
  const filePath = join(fsPath(path), 'shader', 'vertex.glsl');
  if (!existsSync(filePath)) return res.status(404).json({ error: 'vertex.glsl 不存在' });
  res.type('text/plain').send(readFileSync(filePath, 'utf-8'));
});

app.get('/api/shader/fragment', (req, res) => {
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'path 不能为空' });
  const filePath = join(fsPath(path), 'shader', 'fragment.glsl');
  if (!existsSync(filePath)) return res.status(404).json({ error: 'fragment.glsl 不存在' });
  res.type('text/plain').send(readFileSync(filePath, 'utf-8'));
});

app.get('/api/shader/config', (req, res) => {
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'path 不能为空' });
  const filePath = join(fsPath(path), 'js', 'config.js');
  if (!existsSync(filePath)) return res.json({ uniforms: {} });
  try {
    const code = readFileSync(filePath, 'utf-8');
    const fn = new Function(code.replace('export default', 'return'));
    res.json(fn());
  } catch {
    res.json({ uniforms: {} });
  }
});

app.get('/api/shader/object-spec', (req, res) => {
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'path 不能为空' });
  const dir = fsPath(path);
  const specPath = join(dir, 'object.json');
  if (existsSync(specPath)) {
    try {
      return res.json(JSON.parse(readFileSync(specPath, 'utf-8')));
    } catch {}
  }
  const assetsDir = join(dir, 'assets');
  if (existsSync(assetsDir)) {
    const files = readdirSync(assetsDir).filter(f => /\.(glb|gltf)$/i.test(f));
    if (files.length > 0) {
      return res.json({ type: 'glb', asset: files[0] });
    }
  }
  res.json({ type: 'plane' });
});

app.get('/api/shader/asset', (req, res) => {
  const { path, file } = req.query;
  if (!path || !file) return res.status(400).json({ error: 'path 和 file 不能为空' });
  const filePath = join(fsPath(path), 'assets', file);
  if (!existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });
  res.sendFile(filePath);
});

app.post('/api/create-shader', (req, res) => {
  const { name, parent } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: '名称不能为空' });
  }
  const trimmed = name.trim();
  let relPath = trimmed;
  if (parent) relPath = `${parent}/${trimmed}`;
  const folderPath = join(SHADERS_DIR, relPath);

  if (existsSync(folderPath)) {
    return res.status(409).json({ error: `文件夹 "${relPath}" 已存在` });
  }

  try {
    mkdirSync(join(folderPath, 'shader'), { recursive: true });
    mkdirSync(join(folderPath, 'js'), { recursive: true });
    mkdirSync(join(folderPath, 'assets'), { recursive: true });

    writeFileSync(join(folderPath, 'shader', 'vertex.glsl'), `varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`, 'utf-8');

    writeFileSync(join(folderPath, 'shader', 'fragment.glsl'), `varying vec2 vUv;

void main() {
  gl_FragColor = vec4(vUv, 0.5, 1.0);
}
`, 'utf-8');

    writeFileSync(join(folderPath, 'js', 'config.js'), `export default {
  uniforms: {},
};
`, 'utf-8');

    writeFileSync(join(folderPath, 'object.json'), JSON.stringify({ type: 'plane' }, null, 2), 'utf-8');

    const db = readDb();
    const nodePath = `../shaders/${relPath}`;
    const shaderNode = { type: 'shader', name: trimmed, path: nodePath, locked: false };

    if (parent) {
      const parentNode = findNode(db.tree, `../shaders/${parent}`);
      if (parentNode) {
        insertChild(parentNode, shaderNode);
      } else {
        insertChild(db.tree, shaderNode);
      }
    } else {
      insertChild(db.tree, shaderNode);
    }

    writeDb(db);
    res.json({ success: true, path: relPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/create-collection', (req, res) => {
  const { name, parent } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: '名称不能为空' });
  }
  const trimmed = name.trim();
  let relPath = trimmed;
  if (parent) relPath = `${parent}/${trimmed}`;
  const folderPath = join(SHADERS_DIR, relPath);

  if (existsSync(folderPath)) {
    return res.status(409).json({ error: `收录 "${relPath}" 已存在` });
  }

  try {
    mkdirSync(folderPath, { recursive: true });

    const db = readDb();
    const nodePath = `../shaders/${relPath}`;
    const collNode = { type: 'collection', name: trimmed, path: nodePath, expanded: true, children: [] };

    if (parent) {
      const parentNode = findNode(db.tree, `../shaders/${parent}`);
      if (parentNode) {
        insertChild(parentNode, collNode);
      } else {
        insertChild(db.tree, collNode);
      }
    } else {
      insertChild(db.tree, collNode);
    }

    writeDb(db);
    res.json({ success: true, path: relPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/delete-shader', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: '名称不能为空' });
  }
  const trimmed = name.trim();
  const folderPath = join(SHADERS_DIR, trimmed);
  if (!existsSync(folderPath)) {
    return res.status(404).json({ error: `文件夹 "${trimmed}" 不存在` });
  }
  try {
    rmSync(folderPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

    const db = readDb();
    const nodePath = `../shaders/${trimmed}`;
    if (db.lastShader === nodePath) db.lastShader = null;

    function removeRecursive(node, path) {
      if (!node.children) return false;
      const idx = node.children.findIndex(c => c.path === path);
      if (idx !== -1) { node.children.splice(idx, 1); return true; }
      for (const child of node.children) {
        if (removeRecursive(child, path)) return true;
      }
      return false;
    }
    removeRecursive(db.tree, nodePath);

    writeDb(db);
    res.json({ success: true, path: trimmed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/delete-collection', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: '名称不能为空' });
  }
  const trimmed = name.trim();
  const folderPath = join(SHADERS_DIR, trimmed);
  if (!existsSync(folderPath)) {
    return res.status(404).json({ error: `收录 "${trimmed}" 不存在` });
  }
  try {
    rmSync(folderPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

    const db = readDb();
    const nodePath = `../shaders/${trimmed}`;
    if (db.lastShader && db.lastShader.startsWith(nodePath + '/')) db.lastShader = null;

    removeNodeFromParent(db.tree, nodePath);

    writeDb(db);
    res.json({ success: true, path: trimmed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/check-collection-locks', (req, res) => {
  const { path } = req.body;
  if (!path) return res.json({ locked: false });

  const db = readDb();
  const nodePath = `../shaders/${path.replace(/^\.\.?\/shaders\//, '')}`;
  const node = findNode(db.tree, nodePath);
  if (!node) return res.json({ locked: false });

  function findLocked(n) {
    if (n.locked) return n;
    if (n.children) {
      for (const c of n.children) {
        const found = findLocked(c);
        if (found) return found;
      }
    }
    return null;
  }
  const locked = findLocked(node);
  if (locked) {
    return res.json({ locked: true, firstLocked: locked.name || locked.path.replace(/^.*[/\\]/, '') });
  }
  res.json({ locked: false });
});

app.post('/api/rename-shader', async (req, res) => {
  const { oldPath, newName } = req.body;
  if (!oldPath || !newName || typeof oldPath !== 'string' || typeof newName !== 'string') {
    return res.status(400).json({ error: '参数不完整' });
  }
  const trimmedNew = newName.trim();
  if (trimmedNew.length === 0) return res.status(400).json({ error: '新名称不能为空' });

  const oldRel = oldPath.replace(/^\.\.?\/shaders\//, '');
  const oldDir = join(SHADERS_DIR, oldRel);
  const parentDir = dirname(oldDir);
  const newDir = join(parentDir, trimmedNew);
  const newRel = oldRel.replace(/[^/]+$/, trimmedNew);
  const newFullPath = `../shaders/${newRel}`;

  if (!existsSync(oldDir)) return res.status(404).json({ error: '源文件夹不存在' });
  if (existsSync(newDir)) return res.status(409).json({ error: `名称 "${trimmedNew}" 已存在` });

  try {
    await safeRename(oldDir, newDir);

    const db = readDb();
    const oldFullPath = `../shaders/${oldRel}`;
    const node = findNode(db.tree, oldFullPath);
    if (node) {
      node.name = trimmedNew;
      node.path = newFullPath;
      function updateChildPaths(n) {
        if (n.path && n.path.startsWith(oldFullPath + '/')) {
          n.path = newFullPath + n.path.slice(oldFullPath.length);
        }
        if (n.children) n.children.forEach(updateChildPaths);
      }
      if (node.children) node.children.forEach(updateChildPaths);
    }

    if (db.lastShader === oldFullPath) db.lastShader = newFullPath;
    else if (db.lastShader && db.lastShader.startsWith(oldFullPath + '/')) {
      db.lastShader = newFullPath + db.lastShader.slice(oldFullPath.length);
    }

    writeDb(db);
    res.json({ success: true, newPath: newFullPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/move-shader', async (req, res) => {
  const { source, target } = req.body;
  if (!source || typeof source !== 'string') {
    return res.status(400).json({ error: 'source 不能为空' });
  }

  const sourceRel = source.replace(/^\.\.?\/shaders\//, '');
  const targetRel = target && target !== '.' ? target.replace(/^\.\.?\/shaders\//, '') : '';
  const sourcePath = join(SHADERS_DIR, sourceRel);
  const targetDir = targetRel ? join(SHADERS_DIR, targetRel) : SHADERS_DIR;
  const basename = sourceRel.split('/').pop();
  const destPath = join(targetDir, basename);
  const newDir = targetRel ? `../shaders/${targetRel}/${basename}` : `../shaders/${basename}`;

  if (!existsSync(sourcePath)) return res.status(404).json({ error: '源文件夹不存在' });
  if (existsSync(destPath)) return res.status(409).json({ error: '目标位置已存在同名文件夹' });

  try {
    await safeRename(sourcePath, destPath);

    const db = readDb();
    const oldDir = `../shaders/${sourceRel}`;

    const movingNode = findNode(db.tree, oldDir);
    removeNodeFromParent(db.tree, oldDir);

    if (movingNode) {
      movingNode.path = newDir;
      function updatePaths(n) {
        if (n.path) {
          n.path = n.path.replace(oldDir, newDir);
        }
        if (n.children) n.children.forEach(updatePaths);
      }
      updatePaths(movingNode);

      if (targetRel) {
        const targetNode = findNode(db.tree, `../shaders/${targetRel}`);
        if (targetNode) {
          insertChild(targetNode, movingNode);
        } else {
          insertChild(db.tree, movingNode);
        }
      } else {
        insertChild(db.tree, movingNode);
      }
    }

    if (db.lastShader === oldDir) db.lastShader = newDir;
    else if (db.lastShader && db.lastShader.startsWith(oldDir + '/')) {
      db.lastShader = newDir + db.lastShader.slice(oldDir.length);
    }

    writeDb(db);
    res.json({ success: true, newPath: newDir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`);
});
