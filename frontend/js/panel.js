import { togglePause, resetTime, cycleSpeed, setTime, getTime, getMaxDuration, getLoopMode, cycleLoopMode, jumpToSegmentEnd } from './globalConfig.js';

const bottomPanel = document.getElementById('bottom-panel');
const panelHandle = document.getElementById('panel-handle');
const panelTimeline = document.getElementById('panel-timeline');
const panelTimeResetBtn = document.getElementById('panel-time-reset-btn');
const panelTimePauseBtn = document.getElementById('panel-time-pause-btn');
const panelTimeSpeedBtn = document.getElementById('panel-time-speed-btn');
const panelTimeLoopBtn = document.getElementById('panel-time-loop-btn');
const panelTimeEndBtn = document.getElementById('panel-time-end-btn');
const panelTimeDisplay = document.getElementById('panel-time-display');
const panelPauseIcon = document.getElementById('panel-pause-icon');
const panelPlayIcon = document.getElementById('panel-play-icon');
const panelLoopLoopIcon = document.getElementById('panel-loop-loop-icon');
const panelLoopOnceIcon = document.getElementById('panel-loop-once-icon');
const panelCollapseHint = document.getElementById('panel-collapse-hint');

/** 触发 SVG 路径绘制动画（200ms） */
function triggerDrawAnimation(btn) {
  btn.classList.remove('icon-draw');
  void btn.offsetWidth; // 强制回流，确保动画重播
  btn.classList.add('icon-draw');
  setTimeout(() => btn.classList.remove('icon-draw'), 250);
}

const PANEL_HEIGHT_KEY = 'shader3d-panel-height';
const PANEL_COLLAPSED_KEY = 'shader3d-panel-collapsed';
const COLLAPSE_THRESHOLD = 105;

let panelHeight = parseFloat(localStorage.getItem(PANEL_HEIGHT_KEY)) || 200;
let panelCollapsed = localStorage.getItem(PANEL_COLLAPSED_KEY) === '1';

export function getPanelHeight() { return panelHeight; }

function applyPanelState() {
  if (panelCollapsed) {
    bottomPanel.classList.add('collapsed');
    bottomPanel.style.height = '';
  } else {
    bottomPanel.classList.remove('collapsed');
    bottomPanel.style.height = panelHeight + 'px';
    bottomPanel.style.transform = '';
  }
}

let isDragging = false;
let dragStartY = 0;
let dragStartHeight = 0;
let dragMoved = false;
let wasCollapsed = false;

export function initPanel() {
  applyPanelState();

  panelHandle.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    isDragging = true;
    dragMoved = false;
    dragStartY = e.clientY;
    wasCollapsed = panelCollapsed;

    if (!panelCollapsed) {
      dragStartHeight = bottomPanel.getBoundingClientRect().height;
    } else {
      dragStartHeight = 48;
    }

    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const delta = dragStartY - e.clientY;
    if (Math.abs(delta) > 3) {
      if (!dragMoved && wasCollapsed) {
        bottomPanel.classList.remove('collapsed');
        bottomPanel.style.transform = '';
        panelCollapsed = false;
        bottomPanel.style.height = '48px';
      }
      dragMoved = true;
    }
    if (!dragMoved) return;
    const newHeight = Math.max(48, Math.min(600, dragStartHeight + delta));
    bottomPanel.style.height = newHeight + 'px';
    bottomPanel.classList.remove('collapsed');
    bottomPanel.style.transform = '';
    panelCollapsed = false;

    if (newHeight < COLLAPSE_THRESHOLD) {
      panelCollapseHint.classList.remove('hidden');
    } else {
      panelCollapseHint.classList.add('hidden');
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = '';
    panelCollapseHint.classList.add('hidden');

    if (dragMoved) {
      const currentHeight = bottomPanel.getBoundingClientRect().height;
      if (currentHeight < COLLAPSE_THRESHOLD) {
        const rightPanel = document.querySelector('.panel-right');
        const rightRect = rightPanel.getBoundingClientRect();
        const overHint = e.clientX >= rightRect.left && e.clientX <= rightRect.right &&
                         e.clientY >= rightRect.top && e.clientY <= rightRect.bottom;

        if (overHint) {
          panelCollapsed = true;
          localStorage.setItem(PANEL_COLLAPSED_KEY, '1');
          applyPanelState();
        } else {
          panelHeight = currentHeight;
          localStorage.setItem(PANEL_HEIGHT_KEY, panelHeight);
          localStorage.setItem(PANEL_COLLAPSED_KEY, '0');
        }
      } else {
        panelHeight = currentHeight;
        localStorage.setItem(PANEL_HEIGHT_KEY, panelHeight);
        localStorage.setItem(PANEL_COLLAPSED_KEY, '0');
      }
    }
  });

  panelHandle.addEventListener('click', (e) => {
    if (dragMoved) return;
    if (e.target.closest('button')) return;
    panelCollapsed = !panelCollapsed;
    localStorage.setItem(PANEL_COLLAPSED_KEY, panelCollapsed ? '1' : '0');
    if (!panelCollapsed) {
      bottomPanel.style.height = panelHeight + 'px';
    }
    applyPanelState();
  });

  panelTimeResetBtn.addEventListener('click', resetTime);
  panelTimeline.addEventListener('input', () => {
    const val = parseFloat(panelTimeline.value);
    if (getMaxDuration() > 0) {
      setTime(val);
    } else {
      // 无 duration 时 slider 在 0-9.99 窗口内，需加上窗口偏移
      const windowStart = Math.floor(getTime() / 10) * 10;
      setTime(windowStart + val);
    }
  });
}

export function initTimeButtons() {
  panelTimePauseBtn.addEventListener('click', () => {
    const paused = togglePause();
    panelPauseIcon.style.opacity = paused ? '0' : '1';
    panelPlayIcon.style.opacity = paused ? '1' : '0';
    panelTimePauseBtn.title = paused ? '点击播放' : '点击暂停';
    triggerDrawAnimation(panelTimePauseBtn);
  });

  panelTimeSpeedBtn.addEventListener('click', function () {
    const speed = cycleSpeed();
    this.textContent = speed + '\u00D7';
  });

  panelTimeLoopBtn.addEventListener('click', function () {
    const mode = cycleLoopMode();
    panelLoopLoopIcon.style.opacity = mode === 1 ? '1' : '0';
    panelLoopOnceIcon.style.opacity = mode === 1 ? '0' : '1';
    this.title = mode === 1 ? '循环播放' : '播放一次';
    triggerDrawAnimation(this);
  });

  panelTimeEndBtn.addEventListener('click', () => {
    jumpToSegmentEnd();
  });

  // 初始化循环按钮图标
  const initMode = getLoopMode();
  panelLoopLoopIcon.style.opacity = initMode === 1 ? '1' : '0';
  panelLoopOnceIcon.style.opacity = initMode === 1 ? '0' : '1';
}

export function updateTimelineUI(elapsed, maxDur, paused, finished) {
  if (maxDur > 0) {
    panelTimeline.max = maxDur;
    panelTimeline.value = elapsed.toFixed(2);
    panelTimeDisplay.textContent = elapsed.toFixed(2) + 's / ' + maxDur.toFixed(1) + 's';
  } else {
    panelTimeline.max = 9.99;
    panelTimeline.value = (elapsed % 10).toFixed(2);
    panelTimeDisplay.textContent = elapsed.toFixed(2) + 's';
  }

  if (finished || paused) {
    panelPauseIcon.style.opacity = '0';
    panelPlayIcon.style.opacity = '1';
    panelTimePauseBtn.title = '点击播放';
  } else {
    panelPauseIcon.style.opacity = '1';
    panelPlayIcon.style.opacity = '0';
    panelTimePauseBtn.title = '点击暂停';
  }
}
