import { syncTreeReorder, syncTreeExpand } from './shaderTree.js';

let dragInfo = null;
let dragHint = null;
let _showToast = null;
let _pendingMove = false;

function isCollectionEl(el) {
  return el.dataset.isFolder === 'true';
}

function dropAction(targetEl, clientX, clientY) {
  const rect = targetEl.getBoundingClientRect();
  if (isCollectionEl(targetEl) && clientX >= rect.left + rect.width * 0.5) return 'inside';
  return clientY < rect.top + rect.height * 0.5 ? 'before' : 'after';
}

function showDragHint(targetEl, action) {
  removeDragHint();
  if (!targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  const hint = document.createElement('div');
  hint.className = 'drag-hint';
  hint.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:10000;`;
  document.body.appendChild(hint);

  if (isCollectionEl(targetEl)) {
    hint.innerHTML = `<div class="drag-hint-left">同级</div><div class="drag-hint-right">移入</div>`;
    hint.querySelector('.drag-hint-left').classList.toggle('active', action !== 'inside');
    hint.querySelector('.drag-hint-right').classList.toggle('active', action === 'inside');
  } else {
    hint.innerHTML = action === 'before'
      ? '<div class="drag-hint-above">插入上方</div>'
      : '<div class="drag-hint-below">插入下方</div>';
  }
  dragHint = hint;
}

function showDisabledHint(targetEl, reason) {
  removeDragHint();
  if (!targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  const hint = document.createElement('div');
  hint.className = 'drag-hint drag-hint-disabled';
  hint.title = reason;
  hint.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:10000;`;
  hint.textContent = reason;
  document.body.appendChild(hint);
  dragHint = hint;
}

function removeDragHint() {
  if (dragHint) { dragHint.remove(); dragHint = null; }
}

function clearDropStyles() {
  document.querySelectorAll('.drop-before, .drop-after, .drop-inside, .drop-disabled').forEach(el => {
    el.classList.remove('drop-before', 'drop-after', 'drop-inside', 'drop-disabled');
  });
}

function getInsertIndex(siblings, targetDirPath, action) {
  const targetIdx = siblings.indexOf(targetDirPath);
  if (targetIdx === -1) return siblings.length;
  return action === 'after' ? targetIdx + 1 : targetIdx;
}

function collectSiblingPaths(container) {
  const paths = [];
  container.querySelectorAll(':scope > li > .shader-item-wrap').forEach(el => {
    if (el.dataset.dirPath) paths.push(el.dataset.dirPath);
  });
  return paths;
}

function getCollectionChildrenUl(collectionWrap) {
  const li = collectionWrap.parentElement;
  const next = li.nextElementSibling;
  if (next && next.classList.contains('folder-children')) return next;
  return null;
}

function expandCollection(collectionWrap) {
  const childrenUl = getCollectionChildrenUl(collectionWrap);
  if (!childrenUl || childrenUl.style.display !== 'none') return;
  childrenUl.style.display = '';
  const toggle = collectionWrap.querySelector('.folder-toggle');
  if (toggle) toggle.textContent = '\u25BC';
  syncTreeExpand(collectionWrap.dataset.dirPath, true);
}

function isAncestorOf(ancestorDirPath, descendantDirPath) {
  if (!ancestorDirPath || !descendantDirPath) return false;
  return descendantDirPath.startsWith(ancestorDirPath + '/')
    || descendantDirPath.startsWith(ancestorDirPath + '\\');
}

function updateParentPaths(wrap, newParentPath) {
  wrap.dataset.parentPath = newParentPath;
}

function replacePathPrefix(path, oldPrefix, newPrefix) {
  if (path === oldPrefix) return newPrefix;
  if (path.startsWith(oldPrefix + '/') || path.startsWith(oldPrefix + '\\')) {
    return newPrefix + path.slice(oldPrefix.length);
  }
  return path;
}

function updateElementPath(wrap, oldDirPath, newPath) {
  wrap.dataset.dirPath = newPath;
  const itemEl = wrap.querySelector('.shader-item');
  if (itemEl) {
    itemEl.setAttribute('data-dir-path', newPath);
    itemEl.title = newPath;
  }

  const childrenUl = isCollectionEl(wrap) ? getCollectionChildrenUl(wrap) : null;
  if (childrenUl) {
    childrenUl.querySelectorAll('.shader-item-wrap').forEach(childWrap => {
      if (childWrap.dataset.dirPath) {
        childWrap.dataset.dirPath = replacePathPrefix(childWrap.dataset.dirPath, oldDirPath, newPath);
        const childItem = childWrap.querySelector('.shader-item');
        if (childItem) {
          childItem.setAttribute('data-dir-path', childWrap.dataset.dirPath);
          childItem.title = childWrap.dataset.dirPath;
        }
      }
      if (childWrap.dataset.parentPath) {
        childWrap.dataset.parentPath = replacePathPrefix(childWrap.dataset.parentPath, oldDirPath, newPath);
      }
    });
  }

  const lastShader = localStorage.getItem('shader3d-last-shader');
  if (lastShader && (lastShader === oldDirPath || lastShader.startsWith(oldDirPath + '/') || lastShader.startsWith(oldDirPath + '\\'))) {
    const newLastShader = replacePathPrefix(lastShader, oldDirPath, newPath);
    localStorage.setItem('shader3d-last-shader', newLastShader);
    fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastShader: newLastShader }),
    }).catch(() => {});
  }
}

function syncParentOrder(parentPath) {
  try {
    const containerEl = parentPath === '.'
      ? document.getElementById('shader-list')
      : (() => {
          const wrap = document.querySelector(`.shader-item-wrap[data-dir-path="${CSS.escape(parentPath)}"]`);
          if (!wrap) return null;
          return getCollectionChildrenUl(wrap) || wrap.parentElement.parentElement;
        })();
    if (containerEl && containerEl.children.length > 0) {
      const order = collectSiblingPaths(containerEl);
      if (order.length > 0) syncTreeReorder(parentPath, order);
    }
  } catch {}
}

function sendMoveAPI(dirPath, targetParent, oldParentPath, onSuccess) {
  _pendingMove = true;
  fetch('/api/move-shader', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: dirPath, target: targetParent }),
  })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) {
        _showToast(data.error || '移动失败');
      } else {
        const newPath = data.newPath;
        if (newPath && onSuccess) onSuccess(newPath);
        syncParentOrder(targetParent);
        if (oldParentPath && oldParentPath !== '.') {
          syncParentOrder(oldParentPath);
        }
      }
    })
    .catch(() => _showToast('网络错误'))
    .finally(() => { _pendingMove = false; });
}

function getDragMovables(dragWrap) {
  const dragLi = dragWrap.parentElement;
  if (!dragLi) return { li: null, childrenUl: null };
  const childrenUl = isCollectionEl(dragWrap) ? getCollectionChildrenUl(dragWrap) : null;
  return { li: dragLi, childrenUl };
}

function moveDOMOut(dragWrap) {
  const { li, childrenUl } = getDragMovables(dragWrap);
  if (!li) return null;
  li.remove();
  if (childrenUl) childrenUl.remove();
  return { li, childrenUl };
}

function moveIntoDOM(targetCollectionWrap) {
  const { li: dragLi, childrenUl } = moveDOMOut(dragInfo.element);
  if (!dragLi) return;

  expandCollection(targetCollectionWrap);

  const targetChildrenUl = getCollectionChildrenUl(targetCollectionWrap);
  if (!targetChildrenUl) return;

  targetChildrenUl.appendChild(dragLi);
  if (childrenUl) targetChildrenUl.appendChild(childrenUl);

  const targetPath = targetCollectionWrap.dataset.dirPath;
  updateParentPaths(dragInfo.element, targetPath);
  dragInfo.parentPath = targetPath;
}

function moveBetweenDOM(targetWrap, action) {
  const { li: dragLi, childrenUl } = moveDOMOut(dragInfo.element);
  if (!dragLi) return;

  const targetLi = targetWrap.parentElement;
  const targetContainer = targetLi.parentElement;
  const targetParent = targetWrap.dataset.parentPath || '.';

  if (action === 'after') {
    const targetChildrenUl = getCollectionChildrenUl(targetWrap);
    if (targetChildrenUl) {
      targetChildrenUl.insertAdjacentElement('afterend', dragLi);
    } else {
      targetContainer.insertBefore(dragLi, targetLi.nextSibling);
    }
  } else {
    targetContainer.insertBefore(dragLi, targetLi);
  }

  if (childrenUl) dragLi.insertAdjacentElement('afterend', childrenUl);

  updateParentPaths(dragInfo.element, targetParent);
  dragInfo.parentPath = targetParent;
}

function moveToRootDOM() {
  const { li: dragLi, childrenUl } = moveDOMOut(dragInfo.element);
  if (!dragLi) return;

  const shaderList = document.getElementById('shader-list');
  shaderList.appendChild(dragLi);
  if (childrenUl) shaderList.appendChild(childrenUl);

  updateParentPaths(dragInfo.element, '.');
  dragInfo.parentPath = '.';
}

export function initDragDrop(showToast) {
  _showToast = showToast;

  document.addEventListener('dragstart', (e) => {
    const dragEl = e.target.querySelector('.shader-item-wrap') || e.target.closest('.shader-item-wrap');
    if (!dragEl || dragEl.dataset.dirPath == null) return;
    const li = dragEl.parentElement;
    if (!li || li.getAttribute('draggable') === 'false') return;
    dragInfo = {
      dirPath: dragEl.dataset.dirPath,
      parentPath: dragEl.dataset.parentPath || '.',
      element: dragEl,
    };
    dragEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragEl.dataset.dirPath);
  });

  document.addEventListener('dragend', () => {
    if (dragInfo?.element) dragInfo.element.classList.remove('dragging');
    dragInfo = null;
    clearDropStyles();
    removeDragHint();
  });

  document.addEventListener('dragenter', (e) => { e.preventDefault(); });

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dragInfo) return;

    const targetEl = e.target.closest('.shader-item-wrap');
    removeDragHint();
    clearDropStyles();

    if (!targetEl || targetEl.dataset.dirPath === dragInfo.dirPath || targetEl.dataset.dirPath == null) return;

    if (isAncestorOf(dragInfo.dirPath, targetEl.dataset.dirPath)) {
      targetEl.classList.add('drop-disabled');
      e.dataTransfer.dropEffect = 'none';
      showDisabledHint(targetEl, '不能将祖收录移入其后代');
      return;
    }

    const rawAction = dropAction(targetEl, e.clientX, e.clientY);

    if (rawAction === 'inside' && dragInfo.parentPath === targetEl.dataset.dirPath) {
      targetEl.classList.add('drop-disabled');
      e.dataTransfer.dropEffect = 'none';
      const name = targetEl.querySelector('.shader-name')?.textContent || '';
      showDisabledHint(targetEl, name ? `已在"${name}"中` : '已在该收录中');
      return;
    }

    e.dataTransfer.dropEffect = 'move';
    if (rawAction === 'before') targetEl.classList.add('drop-before');
    else if (rawAction === 'inside') targetEl.classList.add('drop-inside');
    else targetEl.classList.add('drop-after');
    showDragHint(targetEl, rawAction);
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!dragInfo || _pendingMove) return;

    const targetEl = e.target.closest('.shader-item-wrap');
    removeDragHint();
    clearDropStyles();

    if (targetEl && targetEl.dataset.dirPath && targetEl.dataset.dirPath !== dragInfo.dirPath) {
      if (isAncestorOf(dragInfo.dirPath, targetEl.dataset.dirPath)) {
        _showToast('不能将祖收录移入其后代中');
        return;
      }

      const action = dropAction(targetEl, e.clientX, e.clientY);

      if (action === 'inside' && dragInfo.parentPath === targetEl.dataset.dirPath) return;

      if (action === 'inside') {
        const oldParent = dragInfo.parentPath;
        moveIntoDOM(targetEl);
        const oldDir = dragInfo.dirPath;
        const movedEl = dragInfo.element;
        sendMoveAPI(dragInfo.dirPath, targetEl.dataset.dirPath, oldParent, (newPath) => {
          updateElementPath(movedEl, oldDir, newPath);
        });
        return;
      }

      const targetParent = targetEl.dataset.parentPath || '.';

      if (targetParent === dragInfo.parentPath) {
        const container = dragInfo.element.parentElement.parentElement;
        const siblings = collectSiblingPaths(container);
        const filtered = siblings.filter(p => p !== dragInfo.dirPath);
        const idx = getInsertIndex(siblings, targetEl.dataset.dirPath, action);
        filtered.splice(idx, 0, dragInfo.dirPath);
        syncTreeReorder(targetParent, filtered);

        const dragLi = dragInfo.element.parentElement;
        const targetLi = targetEl.parentElement;
        const { childrenUl: dragChildrenUl } = getDragMovables(dragInfo.element);
        if (dragLi && targetLi && dragLi.parentElement === targetLi.parentElement) {
          if (action === 'after') {
            const targetChildrenUl = getCollectionChildrenUl(targetEl);
            if (targetChildrenUl) {
              targetChildrenUl.insertAdjacentElement('afterend', dragLi);
            } else {
              targetLi.parentElement.insertBefore(dragLi, targetLi.nextSibling);
            }
          } else {
            targetLi.parentElement.insertBefore(dragLi, targetLi);
          }
          if (dragChildrenUl) dragLi.insertAdjacentElement('afterend', dragChildrenUl);
        }
      } else {
        const oldParent = dragInfo.parentPath;
        moveBetweenDOM(targetEl, action);
        const oldDir = dragInfo.dirPath;
        const movedEl = dragInfo.element;
        sendMoveAPI(dragInfo.dirPath, targetParent, oldParent, (newPath) => {
          updateElementPath(movedEl, oldDir, newPath);
        });
      }
      return;
    }

    if (dragInfo.parentPath !== '.' && !targetEl && e.target.closest('#shader-list')) {
      const oldParent = dragInfo.parentPath;
      moveToRootDOM();
      const oldDir = dragInfo.dirPath;
      const movedEl = dragInfo.element;
      sendMoveAPI(dragInfo.dirPath, '.', oldParent, (newPath) => {
        updateElementPath(movedEl, oldDir, newPath);
      });
    }
  });
}
