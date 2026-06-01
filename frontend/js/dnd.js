import { syncTreeReorder, syncTreeExpand } from './shaderTree.js';

let dragInfo = null;
let dragHint = null;
let _showToast = null;

function isFolderEl(el) {
  return el.dataset.isFolder === 'true';
}

function dropAction(targetEl, clientX, clientY) {
  const rect = targetEl.getBoundingClientRect();
  if (isFolderEl(targetEl) && clientX >= rect.left + rect.width * 0.5) return 'inside';
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

  if (isFolderEl(targetEl)) {
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

function removeDragHint() {
  if (dragHint) { dragHint.remove(); dragHint = null; }
}

function clearDropStyles() {
  document.querySelectorAll('.drop-before, .drop-after, .drop-inside').forEach(el => {
    el.classList.remove('drop-before', 'drop-after', 'drop-inside');
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

function sendMoveAPI(dirPath, targetParent) {
  fetch('/api/move-shader', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: dirPath, target: targetParent }),
  })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) _showToast(data.error || '移动失败');
    })
    .catch(() => _showToast('网络错误'));
}

function getDragMovables(dragWrap) {
  const dragLi = dragWrap.parentElement;
  if (!dragLi) return { li: null, childrenUl: null };
  const childrenUl = isFolderEl(dragWrap) ? getCollectionChildrenUl(dragWrap) : null;
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
  dragInfo.element.dataset.parentPath = targetPath;
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

  dragInfo.element.dataset.parentPath = targetParent;
  dragInfo.parentPath = targetParent;
}

function moveToRootDOM() {
  const { li: dragLi, childrenUl } = moveDOMOut(dragInfo.element);
  if (!dragLi) return;

  const shaderList = document.getElementById('shader-list');
  shaderList.appendChild(dragLi);
  if (childrenUl) shaderList.appendChild(childrenUl);

  dragInfo.element.dataset.parentPath = '.';
  dragInfo.parentPath = '.';
}

export function initDragDrop(showToast) {
  _showToast = showToast;

  document.addEventListener('dragstart', (e) => {
    const dragEl = e.target.closest('.shader-item-wrap');
    if (!dragEl || dragEl.getAttribute('draggable') === 'false') return;
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
    e.dataTransfer.dropEffect = 'move';

    const targetEl = e.target.closest('.shader-item-wrap');
    removeDragHint();
    clearDropStyles();

    if (targetEl && targetEl.dataset.dirPath !== dragInfo.dirPath) {
      const action = dropAction(targetEl, e.clientX, e.clientY);
      if (action === 'before') targetEl.classList.add('drop-before');
      else if (action === 'inside') targetEl.classList.add('drop-inside');
      else targetEl.classList.add('drop-after');
      showDragHint(targetEl, action);
    }
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!dragInfo) return;

    const targetEl = e.target.closest('.shader-item-wrap');
    removeDragHint();
    clearDropStyles();

    if (targetEl && targetEl.dataset.dirPath !== dragInfo.dirPath) {
      const action = dropAction(targetEl, e.clientX, e.clientY);

      if (action === 'inside') {
        moveIntoDOM(targetEl);
        sendMoveAPI(dragInfo.dirPath, targetEl.dataset.dirPath);
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
        if (dragLi && targetLi && dragLi.parentElement === targetLi.parentElement) {
          if (action === 'after') {
            targetLi.parentElement.insertBefore(dragLi, targetLi.nextSibling);
          } else {
            targetLi.parentElement.insertBefore(dragLi, targetLi);
          }
        }
      } else {
        moveBetweenDOM(targetEl, action);
        sendMoveAPI(dragInfo.dirPath, targetParent);
      }
      return;
    }

    if (dragInfo.parentPath !== '.' && e.target.closest('#shader-list')) {
      moveToRootDOM();
      sendMoveAPI(dragInfo.dirPath, '.');
    }
  });
}
