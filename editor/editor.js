// ============================================================
// Clatasha Studio — YouTube Thumbnail Creator (Chrome Extension)
// Fully offline, no APIs. Built on Fabric.js 6.
// ============================================================

import * as fabric from '../lib/fabric.min.mjs';
import { STICKER_ASSET_PACKS } from './sticker-assets.js';
import {
  CLATASHA_TOOL_GUIDE,
  CLATASHA_FEATURE_GUIDE,
  CLATASHA_SHORTCUTS,
  CLATASHA_CHANGELOG,
} from './help-content.js';
import {
  summarizeClickCheckPixels,
  getClickCheckCanvasWarnings,
  getClickCheckImageLayerWarnings,
} from './click-check-analysis.js';
import { createPluginSystem } from './plugin-system.js';

const { Canvas, Rect, Circle, Line, Text, Textbox, FabricImage, Shadow, ActiveSelection, Path, Group, Triangle, Polygon } = fabric;

// ===== CONSTANTS =====
let CANVAS_W = 1920;
let CANVAS_H = 1080;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const MAX_HISTORY = 50;
const MAX_HISTORY_MEMORY_BYTES = 96 * 1024 * 1024;
const BLEND_MODES = [
  ['Normal', 'source-over'],
  ['Multiply', 'multiply'],
  ['Screen', 'screen'],
  ['Overlay', 'overlay'],
  ['Darken', 'darken'],
  ['Lighten', 'lighten'],
  ['Color Dodge', 'color-dodge'],
  ['Color Burn', 'color-burn'],
  ['Hard Light', 'hard-light'],
  ['Soft Light', 'soft-light'],
  ['Difference', 'difference'],
  ['Exclusion', 'exclusion'],
  ['Hue', 'hue'],
  ['Saturation', 'saturation'],
  ['Color', 'color'],
  ['Luminosity', 'luminosity'],
];
const CLATASHA_OBJECT_PROPERTIES = [
  'name', 'selectable', 'evented', 'originX', 'originY',
  'globalCompositeOperation',
  '_clatashaLocked', '_clatashaCurve', '_clatashaText', '_clatashaStyle',
  '_clatashaMaskType', '_clatashaMaskRadius',
  '_clatashaVectorAsset', '_clatashaVectorColors', '_clatashaAssetId',
  '_clatashaSourceName', '_clatashaImageOutlineColor', '_clatashaImageOutlineWidth',
  '_clatashaArrow', '_clatashaAutoFitText', '_clatashaVerticalText', '_clatashaPolygonSides',
  '_clatashaSliceSource', '_clatashaUserGroup', '_clatashaGroupExpanded',
  '_clatashaCutoutOriginalSrc', '_clatashaClipRole', '_clatashaClipId', '_clatashaPaintLayer',
  '_clatashaAdjustmentPreset', '_clatashaAdjustmentValues', '_clatashaAdjustmentPresetModified',
  '_clatashaPluginId', '_clatashaPluginVersion',
];

const PAINT_BRUSH_PRESETS = {
  'hard-round': { name: 'Hard Round', kind: 'round', size: 40, hardness: 100, opacity: 100, flow: 100, spacing: 15, smoothing: 55, composite: 'source-over' },
  'soft-round': { name: 'Soft Round', kind: 'round', size: 70, hardness: 12, opacity: 100, flow: 55, spacing: 12, smoothing: 60, composite: 'source-over' },
  airbrush: { name: 'Airbrush', kind: 'round', size: 120, hardness: 0, opacity: 55, flow: 12, spacing: 7, smoothing: 65, composite: 'source-over' },
  marker: { name: 'Marker', kind: 'marker', size: 55, hardness: 88, opacity: 78, flow: 55, spacing: 10, smoothing: 72, composite: 'source-over' },
  highlighter: { name: 'Highlighter', kind: 'marker', size: 85, hardness: 92, opacity: 28, flow: 12, spacing: 9, smoothing: 75, composite: 'multiply' },
  glow: { name: 'Glow Brush', kind: 'glow', size: 105, hardness: 8, opacity: 72, flow: 24, spacing: 8, smoothing: 72, composite: 'screen' },
  spray: { name: 'Spray Paint', kind: 'spray', size: 105, hardness: 35, opacity: 78, flow: 32, spacing: 9, smoothing: 35, composite: 'source-over' },
  texture: { name: 'Texture Brush', kind: 'texture', size: 90, hardness: 70, opacity: 86, flow: 48, spacing: 11, smoothing: 42, composite: 'source-over' },
};

const WORKSPACE_THEME_STORAGE_KEY = 'clatasha.workspaceTheme';
const WORKSPACE_THEMES = Object.freeze({
  default: { name: 'Default', iconRoot: null },
  bowetech: { name: 'Bowetech', iconRoot: '../assets/themes/bowetech/' },
});
let workspaceTheme = 'default';
let helpCenterOpen = false;
let activeHelpPage = 'guide';
let helpLastFocusedElement = null;
let pluginSystem = null;

function getSavedWorkspaceTheme() {
  try {
    const saved = localStorage.getItem(WORKSPACE_THEME_STORAGE_KEY);
    return WORKSPACE_THEMES[saved] ? saved : 'default';
  } catch (_) {
    return 'default';
  }
}

function updateWorkspaceThemeMenu() {
  document.querySelectorAll('[data-workspace-theme]').forEach(button => {
    const selected = button.dataset.workspaceTheme === workspaceTheme;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  const defaultCheck = document.getElementById('themeDefaultCheck');
  const bowetechCheck = document.getElementById('themeBowetechCheck');
  if (defaultCheck) defaultCheck.textContent = workspaceTheme === 'default' ? '\u2713' : '';
  if (bowetechCheck) bowetechCheck.textContent = workspaceTheme === 'bowetech' ? '\u2713' : '';
}

function applyWorkspaceTheme(themeId, options = {}) {
  const theme = WORKSPACE_THEMES[themeId] || WORKSPACE_THEMES.default;
  workspaceTheme = WORKSPACE_THEMES[themeId] ? themeId : 'default';
  document.body.dataset.workspaceTheme = workspaceTheme;

  document.querySelectorAll('.tool-btn[data-theme-icon]').forEach(button => {
    const existingImage = button.querySelector('.workspace-theme-icon-image');
    if (!theme.iconRoot) {
      button.classList.remove('workspace-theme-icon');
      if (existingImage) existingImage.remove();
      return;
    }
    const assetUrl = new URL(theme.iconRoot + button.dataset.themeIcon + '.svg', import.meta.url).href;
    const iconImage = existingImage || document.createElement('img');
    iconImage.className = 'workspace-theme-icon-image';
    iconImage.src = assetUrl;
    iconImage.alt = '';
    iconImage.draggable = false;
    iconImage.setAttribute('aria-hidden', 'true');
    if (!existingImage) button.appendChild(iconImage);
    button.classList.add('workspace-theme-icon');
  });

  if (options.persist !== false) {
    try { localStorage.setItem(WORKSPACE_THEME_STORAGE_KEY, workspaceTheme); } catch (_) {}
  }
  if (helpCenterOpen) {
    const currentSearch = document.getElementById('helpGuideSearch')?.value || '';
    buildHelpGuide();
    filterHelpGuide(currentSearch);
  }
  pluginSystem?.setTheme(workspaceTheme);
  updateWorkspaceThemeMenu();
  if (options.announce) showPerspToast(theme.name + ' workspace theme applied');
}

function closeWorkspaceThemeSubmenu() {
  const submenu = document.getElementById('menu-workspace-themes');
  const trigger = document.getElementById('workspaceThemesTrigger');
  if (submenu) {
    submenu.style.display = 'none';
    submenu.style.visibility = '';
  }
  if (trigger) {
    trigger.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }
}

function toggleWorkspaceThemeSubmenu() {
  const submenu = document.getElementById('menu-workspace-themes');
  const parentMenu = document.getElementById('menu-workspace');
  const trigger = document.getElementById('workspaceThemesTrigger');
  if (!submenu || !parentMenu || !trigger) return;
  if (submenu.style.display !== 'none') {
    closeWorkspaceThemeSubmenu();
    return;
  }

  submenu.style.display = 'block';
  submenu.style.visibility = 'hidden';
  const parentRect = parentMenu.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  const submenuRect = submenu.getBoundingClientRect();
  const gap = 6;
  let left = parentRect.right + gap;
  if (left + submenuRect.width > window.innerWidth - 8) {
    left = Math.max(8, parentRect.left - submenuRect.width - gap);
  }
  const top = Math.max(8, Math.min(triggerRect.top - 4, window.innerHeight - submenuRect.height - 8));
  submenu.style.left = left + 'px';
  submenu.style.top = top + 'px';
  submenu.style.visibility = 'visible';
  trigger.classList.add('open');
  trigger.setAttribute('aria-expanded', 'true');
}

function setupWorkspaceThemes() {
  document.getElementById('workspaceThemesTrigger')?.addEventListener('click', event => {
    event.stopPropagation();
    toggleWorkspaceThemeSubmenu();
  });
  document.querySelectorAll('[data-workspace-theme]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      applyWorkspaceTheme(button.dataset.workspaceTheme, { announce: true });
      closeMenus();
    });
  });
  applyWorkspaceTheme(getSavedWorkspaceTheme(), { persist: false });
}

function isInternalEditorObject(obj) {
  return !!obj && typeof obj.name === 'string' && obj.name.startsWith('__');
}

function isClippingBase(obj) {
  return !!obj && obj._clatashaClipRole === 'base' && !!obj._clatashaClipId;
}

function isClippedLayer(obj) {
  return !!obj && obj._clatashaClipRole === 'content' && !!obj._clatashaClipId;
}

function getClippingBase(objOrId) {
  if (!canvas) return null;
  const id = typeof objOrId === 'string' ? objOrId : objOrId?._clatashaClipId;
  if (!id) return null;
  return canvas.getObjects().find(obj => isClippingBase(obj) && obj._clatashaClipId === id) || null;
}

function getClippedLayers(objOrId) {
  if (!canvas) return [];
  const id = typeof objOrId === 'string' ? objOrId : objOrId?._clatashaClipId;
  if (!id) return [];
  return canvas.getObjects().filter(obj => isClippedLayer(obj) && obj._clatashaClipId === id);
}

let clippingMaskCounter = 0;
let restoringClippingState = false;

function getNextClippingId() {
  const used = new Set(canvas.getObjects().map(obj => obj._clatashaClipId).filter(Boolean));
  let id;
  do {
    clippingMaskCounter++;
    id = 'clip-' + Date.now().toString(36) + '-' + clippingMaskCounter.toString(36);
  } while (used.has(id));
  return id;
}

function clearClippingMetadata(obj, clearPath = true) {
  if (!obj) return;
  const wasClippedContent = isClippedLayer(obj);
  delete obj._clatashaClipRole;
  delete obj._clatashaClipId;
  if (clearPath) {
    const imageMaskType = wasClippedContent && obj.type === 'image' ? getImageMaskType(obj) : 'none';
    if (imageMaskType !== 'none') applyImageMask(obj, imageMaskType, obj._clatashaMaskRadius ?? 18, false);
    else obj.set('clipPath', null);
  }
  obj.dirty = true;
}

function prepareClippingPath(clipPath, base) {
  if (!clipPath || !base) return null;
  clipPath.set({
    left: 0,
    top: 0,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    skewX: 0,
    skewY: 0,
    flipX: false,
    flipY: false,
    shadow: null,
    clipPath: null,
    selectable: false,
    evented: false,
    absolutePositioned: true,
    globalCompositeOperation: 'source-over',
  });
  clearClippingMetadata(clipPath, false);
  fabric.util.applyTransformToObject(clipPath, base.calcTransformMatrix());
  clipPath.absolutePositioned = true;
  clipPath.setCoords();
  clipPath.dirty = true;
  return clipPath;
}

async function buildClippingPath(base) {
  if (!base) return null;
  const clone = await base.clone();
  return prepareClippingPath(clone, base);
}

function syncClippingPathTransform(base, clipPath) {
  if (!base || !clipPath) return;
  prepareClippingPath(clipPath, base);
}

function getClippingBasesAffectedBy(target) {
  if (!target) return [];
  const objects = isActiveSelectionObject(target) && target.getObjects ? target.getObjects() : [target];
  return [...new Set(objects.map(obj => isClippingBase(obj) ? obj : null).filter(Boolean))];
}

function syncClippingMasksForObject(target) {
  getClippingBasesAffectedBy(target).forEach(base => {
    getClippedLayers(base).forEach(content => {
      if (content.clipPath) syncClippingPathTransform(base, content.clipPath);
      content.dirty = true;
    });
  });
}

async function refreshClippingMasksForBase(base) {
  if (!isClippingBase(base) || !canvas.getObjects().includes(base)) return;
  const linked = getClippedLayers(base);
  for (const content of linked) {
    if (!canvas.getObjects().includes(content)) continue;
    content.set('clipPath', await buildClippingPath(base));
    content.dirty = true;
  }
  canvas.requestRenderAll();
}

async function refreshClippingMasksForObject(target) {
  for (const base of getClippingBasesAffectedBy(target)) {
    await refreshClippingMasksForBase(base);
  }
}

const clippingRefreshTimers = new WeakMap();
function scheduleClippingMaskRefresh(target) {
  getClippingBasesAffectedBy(target).forEach(base => {
    const previous = clippingRefreshTimers.get(base);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(async () => {
      clippingRefreshTimers.delete(base);
      await refreshClippingMasksForBase(base);
    }, 40);
    clippingRefreshTimers.set(base, timer);
  });
}

function syncEditedClippingBase(target) {
  syncClippingMasksForObject(target);
  scheduleClippingMaskRefresh(target);
}

function getClippingPair(objects = canvas?.getActiveObjects?.() || []) {
  const pair = [...new Set(objects)].filter(obj => obj && !isInternalEditorObject(obj));
  if (pair.length !== 2) return null;
  if (pair.some(obj => obj._clatashaLocked || obj.visible === false || (obj.group && !isActiveSelectionObject(obj.group)))) return null;

  const images = pair.filter(obj => obj.type === 'image');
  let base;
  let content;
  if (images.length === 1) {
    content = images[0];
    base = pair.find(obj => obj !== content);
  } else {
    const order = canvas.getObjects();
    [base, content] = pair.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  if (!base || !content || base.type === 'image') return null;
  if (isClippedLayer(base) || isClippingBase(content)) return null;
  return { base, content };
}

function releaseClippingMask(objects = canvas?.getActiveObjects?.() || [], save = true) {
  const selected = [...new Set(objects)].filter(Boolean);
  const selectedIds = new Set(selected.map(obj => obj._clatashaClipId).filter(Boolean));
  if (!selectedIds.size) return false;
  let changed = false;

  selectedIds.forEach(id => {
    const base = getClippingBase(id);
    const selectedBase = selected.some(obj => isClippingBase(obj) && obj._clatashaClipId === id);
    const contentToRelease = selectedBase
      ? getClippedLayers(id)
      : selected.filter(obj => isClippedLayer(obj) && obj._clatashaClipId === id);
    contentToRelease.forEach(content => {
      clearClippingMetadata(content, true);
      changed = true;
    });
    if (base && (selectedBase || getClippedLayers(id).length === 0)) {
      clearClippingMetadata(base, false);
      changed = true;
    }
  });

  if (!changed) return false;
  canvas.requestRenderAll();
  updateLayersList();
  updateGroupingMenuState(canvas.getActiveObject());
  const active = canvas.getActiveObject();
  if (active) updatePropertiesPanel(active);
  if (save) saveHistory();
  return true;
}

async function createClippingMask() {
  const active = canvas.getActiveObject();
  const pair = getClippingPair(canvas.getActiveObjects());
  if (!pair) {
    showPerspToast('Select one image or layer and one shape, text, or vector frame');
    return false;
  }
  const { base, content } = pair;
  if (isClippedLayer(content)) releaseClippingMask([content], false);

  if (isActiveSelectionObject(active)) {
    active.removeAll();
    canvas.discardActiveObject();
    base.setCoords();
    content.setCoords();
  }

  const id = isClippingBase(base) ? base._clatashaClipId : getNextClippingId();
  base._clatashaClipRole = 'base';
  base._clatashaClipId = id;
  content._clatashaClipRole = 'content';
  content._clatashaClipId = id;
  content.set('clipPath', await buildClippingPath(base));
  content.dirty = true;

  const objects = canvas.getObjects();
  const baseIndex = objects.indexOf(base);
  const linkedIndices = getClippedLayers(id).filter(obj => obj !== content).map(obj => objects.indexOf(obj));
  const insertIndex = Math.max(baseIndex, ...linkedIndices) + 1;
  canvas.moveObjectTo(content, Math.min(insertIndex, canvas.getObjects().length - 1));
  canvas.setActiveObject(content);
  content.setCoords();
  canvas.requestRenderAll();
  updateLayersList();
  updatePropertiesPanel(content);
  updateGroupingMenuState(content);
  saveHistory();
  showPerspToast('Clipping mask created');
  return true;
}

function toggleClippingMask() {
  const selected = canvas.getActiveObjects();
  if (selected.some(obj => isClippingBase(obj) || isClippedLayer(obj))) {
    releaseClippingMask(selected, true);
  } else {
    createClippingMask();
  }
}

async function restoreClippingMasksFromLinks() {
  const bases = canvas.getObjects().filter(isClippingBase);
  const baseIds = new Set(bases.map(base => base._clatashaClipId));
  for (const content of canvas.getObjects().filter(isClippedLayer)) {
    if (!baseIds.has(content._clatashaClipId)) {
      clearClippingMetadata(content, true);
    }
  }
  for (const base of bases) {
    if (getClippedLayers(base).length) await refreshClippingMasksForBase(base);
    else clearClippingMetadata(base, false);
  }
  canvas.requestRenderAll();
}

function cleanupClippingLinksAfterRemoval(removed) {
  if (!removed || restoringClippingState) return;
  if (isClippingBase(removed)) {
    getClippedLayers(removed).forEach(content => clearClippingMetadata(content, true));
  } else if (isClippedLayer(removed)) {
    const base = getClippingBase(removed);
    if (base && getClippedLayers(removed).length === 0) clearClippingMetadata(base, false);
  }
}

// Preserve Clatasha metadata during duplicate, undo/redo, and project reloads.
fabric.FabricObject.customProperties = CLATASHA_OBJECT_PROPERTIES;
const EASTER_EGG_MIN_DELAY = 1 * 60 * 1000;
const EASTER_EGG_MAX_DELAY = 20 * 60 * 1000;
const EASTER_EGG_CAR_DELAY = 1500;
const EASTER_EGG_CAR_DURATION = 4400;

let easterEggTimer = null;
let easterEggPlayedThisSession = false;
let easterEggSequenceTimers = [];
let easterEggVisibilityHandler = null;
let easterEggAnimationFrame = 0;

// ===== TEXT PRESETS =====
const TEXT_PRESETS = [
  {
    name: 'Impact Classic',
    preview: 'IMPACT',
    style: {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: 72,
      fontWeight: 'normal',
      fill: '#FFFFFF',
      stroke: '#000000',
      strokeWidth: 3,
      shadow: { color: 'rgba(0,0,0,0.6)', blur: 6, offsetX: 3, offsetY: 3 },
      textAlign: 'center',
    }
  },
  {
    name: 'Red Alert',
    preview: 'ALERT',
    style: {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: 72,
      fontWeight: 'normal',
      fill: '#FF0000',
      stroke: '#FFFFFF',
      strokeWidth: 2,
      shadow: { color: 'rgba(0,0,0,0.8)', blur: 8, offsetX: 2, offsetY: 4 },
      textAlign: 'center',
    }
  },
  {
    name: 'Yellow Pop',
    preview: 'POP',
    style: {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 68,
      fontWeight: '900',
      fill: '#FFD700',
      stroke: '#000000',
      strokeWidth: 4,
      shadow: { color: 'rgba(0,0,0,0.7)', blur: 4, offsetX: 2, offsetY: 3 },
      textAlign: 'center',
    }
  },
  {
    name: 'Neon Glow',
    preview: 'NEON',
    style: {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 64,
      fontWeight: '900',
      fill: '#00FFFF',
      stroke: '#0088FF',
      strokeWidth: 1,
      shadow: { color: '#00FFFF', blur: 20, offsetX: 0, offsetY: 0 },
      textAlign: 'center',
    }
  },
  {
    name: 'Clean White',
    preview: 'CLEAN',
    style: {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: 56,
      fontWeight: '700',
      fill: '#FFFFFF',
      stroke: '',
      strokeWidth: 0,
      shadow: { color: 'rgba(0,0,0,0.5)', blur: 10, offsetX: 0, offsetY: 2 },
      textAlign: 'center',
    }
  },
  {
    name: 'Dark Outline',
    preview: 'DARK',
    previewBackground: '#F2F2F2',
    style: {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: 72,
      fontWeight: 'normal',
      fill: '#000000',
      stroke: '#FFFFFF',
      strokeWidth: 3,
      shadow: null,
      textAlign: 'center',
    }
  },
  {
    name: 'Thin White',
    preview: 'THIN',
    style: {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: 62,
      fontWeight: '700',
      fill: '#FFFFFF',
      stroke: '#111111',
      strokeWidth: 0.75,
      shadow: { color: 'rgba(0,0,0,0.45)', blur: 5, offsetX: 2, offsetY: 2 },
      textAlign: 'center',
    }
  },
  {
    name: 'Thin Black',
    preview: 'THIN',
    previewBackground: '#ECECEC',
    style: {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: 62,
      fontWeight: '700',
      fill: '#111111',
      stroke: '#FFFFFF',
      strokeWidth: 0.75,
      shadow: { color: 'rgba(0,0,0,0.2)', blur: 3, offsetX: 1, offsetY: 2 },
      textAlign: 'center',
    }
  },
  {
    name: 'Thin Gold',
    preview: 'GOLD',
    style: {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 64,
      fontWeight: '900',
      fill: '#FFD34E',
      stroke: '#5A3500',
      strokeWidth: 1,
      shadow: { color: 'rgba(0,0,0,0.45)', blur: 4, offsetX: 2, offsetY: 3 },
      textAlign: 'center',
    }
  },
  {
    name: 'Thin Cyan',
    preview: 'CYAN',
    style: {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 64,
      fontWeight: '900',
      fill: '#25E7FF',
      stroke: '#063A52',
      strokeWidth: 1,
      shadow: { color: 'rgba(37,231,255,0.55)', blur: 8, offsetX: 0, offsetY: 1 },
      textAlign: 'center',
    }
  },
  {
    name: 'Thin Pink',
    preview: 'PINK',
    style: {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 64,
      fontWeight: '900',
      fill: '#FF5CC8',
      stroke: '#5B143F',
      strokeWidth: 1,
      shadow: { color: 'rgba(255,92,200,0.5)', blur: 8, offsetX: 0, offsetY: 1 },
      textAlign: 'center',
    }
  },
  {
    name: 'Minimal Light',
    preview: 'LIGHT',
    style: {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: 58,
      fontWeight: '700',
      fill: '#FFFFFF',
      stroke: '',
      strokeWidth: 0,
      shadow: { color: 'rgba(0,0,0,0.35)', blur: 8, offsetX: 0, offsetY: 3 },
      textAlign: 'center',
    }
  },
  {
    name: 'Minimal Dark',
    preview: 'DARK',
    previewBackground: '#F2F2F2',
    style: {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: 58,
      fontWeight: '700',
      fill: '#181818',
      stroke: '',
      strokeWidth: 0,
      shadow: { color: 'rgba(0,0,0,0.18)', blur: 6, offsetX: 0, offsetY: 2 },
      textAlign: 'center',
    }
  },
  {
    name: 'Soft Caption',
    preview: 'SOFT',
    previewBackground: '#455064',
    style: {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: 56,
      fontWeight: '600',
      fill: '#F8FAFC',
      stroke: '',
      strokeWidth: 0,
      shadow: { color: 'rgba(0,0,0,0.5)', blur: 12, offsetX: 0, offsetY: 4 },
      textAlign: 'center',
    }
  },
  {
    name: 'Electric Purple',
    preview: 'POWER',
    style: {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: 72,
      fontWeight: 'normal',
      fill: '#9B5CFF',
      stroke: '#F1E8FF',
      strokeWidth: 2,
      shadow: { color: '#6C2BFF', blur: 13, offsetX: 0, offsetY: 2 },
      textAlign: 'center',
    }
  },
  {
    name: 'Orange Punch',
    preview: 'PUNCH',
    style: {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: 72,
      fontWeight: 'normal',
      fill: '#FF7A18',
      stroke: '#3A1400',
      strokeWidth: 3,
      shadow: { color: 'rgba(0,0,0,0.65)', blur: 5, offsetX: 4, offsetY: 5 },
      textAlign: 'center',
    }
  },
  {
    name: 'Blue Steel',
    preview: 'STEEL',
    style: {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 66,
      fontWeight: '900',
      fill: '#BFE5FF',
      stroke: '#17395C',
      strokeWidth: 2,
      shadow: { color: '#071D36', blur: 2, offsetX: 5, offsetY: 6 },
      textAlign: 'center',
    }
  },
  {
    name: 'Classic 3D',
    preview: '3D',
    style: {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: 76,
      fontWeight: 'normal',
      fill: '#FFFFFF',
      stroke: '#111111',
      strokeWidth: 2,
      shadow: { color: '#666666', blur: 0, offsetX: 2, offsetY: 0 },
      textAlign: 'center',
    }
  },
  {
    name: 'Red 3D',
    preview: 'RED',
    style: {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: 76,
      fontWeight: 'normal',
      fill: '#FF3131',
      stroke: '#4A0000',
      strokeWidth: 2,
      shadow: { color: '#760000', blur: 0, offsetX: 0, offsetY: 5 },
      textAlign: 'center',
    }
  },
  {
    name: 'Gold 3D',
    preview: 'GOLD',
    style: {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 70,
      fontWeight: '900',
      fill: '#FFD83D',
      stroke: '#5A3600',
      strokeWidth: 2,
      shadow: { color: '#8C5200', blur: 0, offsetX: 2, offsetY: 2 },
      textAlign: 'center',
    }
  },
  {
    name: 'Purple 3D',
    preview: '3D',
    style: {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 70,
      fontWeight: '900',
      fill: '#A970FF',
      stroke: '#2B0959',
      strokeWidth: 2,
      shadow: { color: '#54209D', blur: 0, offsetX: 0, offsetY: 3 },
      textAlign: 'center',
    }
  },
  {
    name: 'Cyan 3D',
    preview: 'CYAN',
    style: {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 70,
      fontWeight: '900',
      fill: '#52F3FF',
      stroke: '#063B4B',
      strokeWidth: 2,
      shadow: { color: '#057A8E', blur: 0, offsetX: 1, offsetY: 1 },
      textAlign: 'center',
    }
  },
  {
    name: 'Retro Shadow',
    preview: 'RETRO',
    style: {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 68,
      fontWeight: '900',
      fill: '#FFF1A8',
      stroke: '#31204F',
      strokeWidth: 2,
      shadow: { color: '#FF4FA3', blur: 0, offsetX: 2, offsetY: 0 },
      textAlign: 'center',
    }
  },
  {
    name: 'Comic Depth',
    preview: 'WOW',
    style: {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: 76,
      fontWeight: 'normal',
      fill: '#FFF200',
      stroke: '#121212',
      strokeWidth: 4,
      shadow: { color: '#E22B2B', blur: 0, offsetX: 1, offsetY: 0 },
      textAlign: 'center',
    }
  },
  {
    name: 'Ice 3D',
    preview: 'ICE',
    style: {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: 70,
      fontWeight: '900',
      fill: '#E8FBFF',
      stroke: '#46BDE1',
      strokeWidth: 2,
      shadow: { color: '#15749A', blur: 0, offsetX: -3, offsetY: 0 },
      textAlign: 'center',
    }
  },
];

// ===== TEMPLATES (positions for 1920×1080) =====
const TEMPLATES = [
  {
    name: 'Gaming Dark',
    bg: '#0D0D0D',
    objects: [
      { type: 'rect', left: 0, top: 0, width: 1920, height: 1080, fill: '#0D0D0D' },
      { type: 'rect', left: 0, top: 900, width: 1920, height: 180, fill: 'rgba(124,58,237,0.3)' },
      { type: 'rect', left: 0, top: 0, width: 1920, height: 8, fill: '#7C3AED' },
      { type: 'rect', left: 0, top: 1072, width: 1920, height: 8, fill: '#EC4899' },
    ]
  },
  {
    name: 'Vlog Bright',
    bg: '#FFE4E1',
    objects: [
      { type: 'rect', left: 0, top: 0, width: 1920, height: 1080, fill: '#FFE4E1' },
      { type: 'circle', left: 1410, top: 60, radius: 300, fill: 'rgba(236,72,153,0.2)' },
      { type: 'circle', left: -60, top: 750, radius: 270, fill: 'rgba(124,58,237,0.15)' },
      { type: 'rect', left: 60, top: 870, width: 1800, height: 120, fill: '#FFFFFF', rx: 30, ry: 30 },
    ]
  },
  {
    name: 'Tutorial Split',
    bg: '#1A1A2E',
    objects: [
      { type: 'rect', left: 0, top: 0, width: 1920, height: 1080, fill: '#1A1A2E' },
      { type: 'rect', left: 0, top: 0, width: 750, height: 1080, fill: '#16213E' },
      { type: 'rect', left: 750, top: 0, width: 8, height: 1080, fill: '#E94560' },
      { type: 'rect', left: 810, top: 60, width: 1050, height: 960, fill: 'rgba(233,69,96,0.08)', rx: 24, ry: 24 },
    ]
  },
  {
    name: 'Reaction',
    bg: '#0F0F0F',
    objects: [
      { type: 'rect', left: 0, top: 0, width: 1920, height: 1080, fill: '#0F0F0F' },
      { type: 'circle', left: 60, top: 90, radius: 420, fill: 'rgba(255,255,255,0.06)' },
      { type: 'circle', left: 1200, top: -120, radius: 450, fill: 'rgba(245,158,11,0.1)' },
      { type: 'rect', left: 900, top: 690, width: 960, height: 300, fill: 'rgba(0,0,0,0.5)', rx: 24, ry: 24 },
    ]
  },
  {
    name: 'Minimal Clean',
    bg: '#FFFFFF',
    objects: [
      { type: 'rect', left: 0, top: 0, width: 1920, height: 1080, fill: '#FFFFFF' },
      { type: 'rect', left: 120, top: 120, width: 1680, height: 840, fill: 'none', stroke: '#000000', strokeWidth: 3, rx: 0, ry: 0 },
    ]
  },
  {
    name: 'Neon Vibes',
    bg: '#0A0A1A',
    objects: [
      { type: 'rect', left: 0, top: 0, width: 1920, height: 1080, fill: '#0A0A1A' },
      { type: 'rect', left: 90, top: 90, width: 1740, height: 900, fill: 'none', stroke: '#7C3AED', strokeWidth: 2, rx: 30, ry: 30 },
      { type: 'line', x1: 90, y1: 180, x2: 1830, y2: 180, stroke: 'rgba(124,58,237,0.3)', strokeWidth: 1 },
      { type: 'line', x1: 90, y1: 900, x2: 1830, y2: 900, stroke: 'rgba(236,72,153,0.3)', strokeWidth: 1 },
    ]
  },
  {
    name: 'Derspawn & Spadomur',
    bg: '#FFDCC9',
    objects: [
      { type: 'rect', left: 0, top: 0, width: 1920, height: 160, fill: '#FFFFFF' },
      { type: 'text', text: 'DERSPAWN', left: 520, top: 80, width: 800, fontFamily: 'Righteous, Impact, Haettenschweiler, sans-serif', fontSize: 130, fontWeight: 'normal', fill: '#00b1fb', stroke: '#000000', strokeWidth: 2, textAlign: 'center' },
      { type: 'text', text: '&', left: 960, top: 80, width: 200, fontFamily: 'Righteous, Impact, Haettenschweiler, sans-serif', fontSize: 120, fontWeight: 'normal', fill: '#000000', stroke: '', strokeWidth: 0, textAlign: 'center' },
      { type: 'text', text: 'SPADOMUR', left: 1400, top: 80, width: 800, fontFamily: 'Righteous, Impact, Haettenschweiler, sans-serif', fontSize: 130, fontWeight: 'normal', fill: '#f87b00', stroke: '#000000', strokeWidth: 2, textAlign: 'center' },
    ]
  },
  {
    name: 'Shorts Gaming',
    width: 1080,
    height: 1920,
    category: 'shorts',
    bg: '#0B0B18',
    objects: [
      { type: 'rect', left: 0, top: 0, width: 1080, height: 1920, fill: '#0B0B18' },
      { type: 'circle', left: 880, top: 330, radius: 420, fill: 'rgba(124,58,237,0.42)' },
      { type: 'circle', left: 160, top: 1470, radius: 360, fill: 'rgba(236,72,153,0.30)' },
      { type: 'rect', left: 70, top: 1160, width: 940, height: 590, fill: 'rgba(0,0,0,0.58)', stroke: '#7C3AED', strokeWidth: 5, rx: 42, ry: 42 },
      { type: 'text', text: 'EPIC\nMOMENT', left: 540, top: 1440, width: 840, fontFamily: 'Impact, Haettenschweiler, sans-serif', fontSize: 174, fontWeight: 'normal', fill: '#FFFFFF', stroke: '#000000', strokeWidth: 6, textAlign: 'center' },
    ]
  },
  {
    name: 'Shorts Reaction',
    width: 1080,
    height: 1920,
    category: 'shorts',
    bg: '#FFE84A',
    objects: [
      { type: 'rect', left: 0, top: 0, width: 1080, height: 1920, fill: '#FFE84A' },
      { type: 'circle', left: 540, top: 710, radius: 390, fill: '#FFFFFF', stroke: '#111111', strokeWidth: 10 },
      { type: 'rect', left: 70, top: 1250, width: 940, height: 470, fill: '#111111', rx: 48, ry: 48 },
      { type: 'text', text: 'WAIT...', left: 540, top: 1485, width: 820, fontFamily: 'Impact, Haettenschweiler, sans-serif', fontSize: 210, fontWeight: 'normal', fill: '#FFFFFF', textAlign: 'center' },
    ]
  },
  {
    name: 'Shorts Update',
    width: 1080,
    height: 1920,
    category: 'shorts',
    bg: '#F5F5F5',
    objects: [
      { type: 'rect', left: 0, top: 0, width: 1080, height: 1920, fill: '#F5F5F5' },
      { type: 'rect', left: 0, top: 0, width: 1080, height: 190, fill: '#E11D48' },
      { type: 'rect', left: 70, top: 310, width: 940, height: 900, fill: '#FFFFFF', stroke: '#161616', strokeWidth: 7, rx: 36, ry: 36 },
      { type: 'rect', left: 70, top: 1300, width: 940, height: 420, fill: '#161616', rx: 36, ry: 36 },
      { type: 'text', text: 'NEW\nUPDATE', left: 540, top: 1510, width: 820, fontFamily: 'Arial Black, sans-serif', fontSize: 164, fontWeight: '900', fill: '#FFFFFF', textAlign: 'center' },
    ]
  },
];

// ===== FILTER DEFINITIONS =====
const FILTER_SLIDERS = [
  { name: 'brightness', label: 'Brightness', min: -1, max: 1, step: 0.01, default: 0, filterClass: 'Brightness' },
  { name: 'contrast', label: 'Contrast', min: -1, max: 1, step: 0.01, default: 0, filterClass: 'Contrast' },
  { name: 'saturation', label: 'Saturation', min: -1, max: 1, step: 0.01, default: 0, filterClass: 'Saturation' },
  { name: 'blur', label: 'Blur', min: 0, max: 1, step: 0.01, default: 0, filterClass: 'Blur' },
  { name: 'hue', label: 'Hue Rotation', min: -1, max: 1, step: 0.01, default: 0, filterClass: 'HueRotation' },
  { name: 'noise', label: 'Noise', min: 0, max: 1000, step: 1, default: 0, filterClass: 'Noise' },
  { name: 'pixelate', label: 'Pixelate', min: 1, max: 20, step: 1, default: 1, filterClass: 'Pixelate' },
];

const ADJUSTMENT_PRESETS = [
  {
    id: 'bright-clean',
    name: 'Bright & Clean',
    previewFilter: 'brightness(1.09) contrast(1.08) saturate(1.06)',
    values: { brightness: 0.08, contrast: 0.10, saturation: 0.05 },
  },
  {
    id: 'rich-contrast',
    name: 'Rich Contrast',
    previewFilter: 'brightness(1.01) contrast(1.28) saturate(1.10)',
    values: { brightness: 0.01, contrast: 0.22, saturation: 0.08 },
  },
  {
    id: 'color-pop',
    name: 'Color Pop',
    previewFilter: 'brightness(1.02) contrast(1.14) saturate(1.38)',
    values: { brightness: 0.02, contrast: 0.12, saturation: 0.18 },
    toneFilters: [{ type: 'Vibrance', options: { vibrance: 0.28 } }],
  },
  {
    id: 'warm-contrast',
    name: 'Warm Contrast',
    previewFilter: 'brightness(1.03) contrast(1.18) saturate(1.15) sepia(0.14) hue-rotate(-5deg)',
    values: { brightness: 0.03, contrast: 0.16, saturation: 0.08 },
    toneFilters: [{
      type: 'ColorMatrix',
      options: { matrix: [
        1.06, 0.02, 0.00, 0, 0.010,
        0.01, 1.02, 0.00, 0, 0.003,
        0.00, 0.01, 0.92, 0, -0.006,
        0.00, 0.00, 0.00, 1, 0.000,
      ] },
    }],
  },
  {
    id: 'cool-tone',
    name: 'Cool Tone',
    previewFilter: 'brightness(1.01) contrast(1.12) saturate(0.96) hue-rotate(8deg)',
    values: { brightness: 0.01, contrast: 0.10, saturation: -0.04 },
    toneFilters: [{
      type: 'ColorMatrix',
      options: { matrix: [
        0.94, 0.00, 0.02, 0, -0.004,
        0.00, 1.01, 0.02, 0, 0.000,
        0.00, 0.02, 1.08, 0, 0.008,
        0.00, 0.00, 0.00, 1, 0.000,
      ] },
    }],
  },
  {
    id: 'cinematic-split',
    name: 'Cinematic Split Tone',
    previewFilter: 'brightness(0.99) contrast(1.24) saturate(0.84) hue-rotate(8deg)',
    values: { brightness: -0.01, contrast: 0.20, saturation: -0.14 },
    toneFilters: [{
      type: 'ColorMatrix',
      options: { matrix: [
        1.02, 0.03, -0.02, 0, 0.005,
        -0.02, 1.00, 0.04, 0, 0.002,
        -0.04, 0.04, 1.08, 0, 0.012,
        0.00, 0.00, 0.00, 1, 0.000,
      ] },
    }],
  },
  {
    id: 'faded-film',
    name: 'Faded Film',
    previewFilter: 'brightness(1.05) contrast(0.84) saturate(0.80) sepia(0.08)',
    values: { brightness: 0.05, contrast: -0.12, saturation: -0.18 },
    toneFilters: [{
      type: 'ColorMatrix',
      options: { matrix: [
        0.86, 0.04, 0.02, 0, 0.055,
        0.03, 0.86, 0.02, 0, 0.045,
        0.02, 0.03, 0.82, 0, 0.040,
        0.00, 0.00, 0.00, 1, 0.000,
      ] },
    }],
  },
  {
    id: 'bw-punch',
    name: 'Black & White Punch',
    previewFilter: 'grayscale(1) brightness(1.02) contrast(1.30)',
    values: { brightness: 0.02, contrast: 0.25 },
    toneFilters: [{ type: 'Grayscale', options: { mode: 'luminosity' } }],
  },
];

const ADJUSTMENT_PRESET_BY_ID = new Map(ADJUSTMENT_PRESETS.map(preset => [preset.id, preset]));
const ADJUSTMENT_PRESET_PREVIEW_URL = new URL('../assets/adjustment-presets/tribute.webp', import.meta.url).href;

const RIGHT_PANEL_TAB_STORAGE_KEY = 'clatasha.rightPanelTab';
const RIGHT_PANEL_TABS = ['layers', 'properties', 'adjustments'];

// ===== STATE =====
let canvas;
let currentTool = 'select';
let zoomLevel = 1;
let history = [];
let historyIndex = -1;
let nextHistoryAssetId = 1;
const historyAssets = new Map();
const historyAssetIdsBySource = new Map();
let isPanning = false;
let lastPanPoint = { x: 0, y: 0 };
let isDrawingShape = false;
let shapeStart = { x: 0, y: 0 };
let tempShape = null;
let activeObject = null;
let projectId = null;
let showRulers = true;
let showGuides = true;
let snapEnabled = false;
let userGuides = { horizontal: [], vertical: [] };
let panOffsetX = 0;
let panOffsetY = 0;
let panelInteracting = false; // true while user is clicking/interacting in the panel
let activeRightPanelTab = 'layers';
let rightPanelScrollPositions = { layers: 0, properties: 0, adjustments: 0 };
let adjustmentPresetPreview = null;
let textEditingHost = null;
let lastLayerSelectionKey = '';
let isApplyingCurve = false; // true while curve slider is being dragged
let customFonts = []; // { name, base64, format }
let keyboardNudgePending = false;
let arrangeReference = 'selection';
let activeGroupEditPath = [];
let activeGroupEditParent = null;
let activeGroupEditRoot = null;
let eyedropperActive = false;
let eyedropperSavedInteraction = null;
let cutoutBrushActive = false;
let cutoutBrushTarget = null;
let cutoutBrushMode = 'erase';
let cutoutBrushSize = 90;
let cutoutBrushHardness = 75;
let cutoutBrushDrawing = false;
let cutoutBrushChanged = false;
let cutoutBrushLastPoint = null;
let cutoutBrushWorkingCanvas = null;
let cutoutBrushWorkingContext = null;
let cutoutBrushWorkingData = null;
let cutoutBrushOriginalData = null;
let cutoutBrushOriginalSrc = null;
let cutoutBrushPreservedFilters = [];
let cutoutBrushSavedInteraction = null;
let cutoutBrushTargetControlState = null;
let cutoutBrushStartToken = 0;
let healingBrushActive = false;
let healingBrushTarget = null;
let healingBrushSize = 70;
let healingBrushHardness = 65;
let healingBrushStrength = 100;
let healingBrushDrawing = false;
let healingBrushChanged = false;
let healingBrushLastPoint = null;
let healingBrushWorkingCanvas = null;
let healingBrushWorkingContext = null;
let healingBrushWorkingData = null;
let healingBrushStrokeSourceData = null;
let healingBrushSavedInteraction = null;
let healingBrushTargetControlState = null;
let videoFrameObjectUrl = null;
let videoFrameSourceName = '';
let videoFrameReady = false;
let videoFrameBusy = false;
let videoFrameJobToken = 0;
const VIDEO_FRAME_STEP_SECONDS = 1 / 30;
let paintBrushActive = false;
let paintBrushDrawing = false;
let paintBrushChanged = false;
let paintBrushTarget = null;
let paintBrushWorkingCanvas = null;
let paintBrushWorkingContext = null;
let paintBrushLastPoint = null;
let paintBrushSmoothedPoint = null;
let paintBrushSavedInteraction = null;
let paintBrushTargetControlState = null;
let paintBrushPresetId = 'hard-round';
let paintBrushSettings = { ...PAINT_BRUSH_PRESETS['hard-round'], color: '#000000' };
let paintBrushEraseMode = false;
let zoomGestureActive = false;
let zoomGestureStart = null;
let zoomGestureStartClient = null;
let zoomGestureFrame = null;
let sliceActive = false;
let sliceBusy = false;
let sliceTargetImage = null;
let sliceStart = null;
let sliceEnd = null;
let slicePreviewLine = null;
let sliceObjectStates = new Map();
let sliceJobToken = 0;
const WORKSPACE_TRANSFORM_CONTROLS = ['tl', 'tr', 'br', 'bl', 'ml', 'mr', 'mt', 'mb', 'mtr'];
const CLATASHA_CONTROL_SCREEN_SIZE = 15;
const CLATASHA_TOUCH_CONTROL_SCREEN_SIZE = 28;
let workspaceTransformFrame = 0;
let workspaceTransformDrag = null;
let workspaceTransformAutoPanFrame = 0;

// Small, high-contrast cursor artwork for tools that need more meaning than
// the browser's generic crosshair. The hotspot is supplied separately so the
// visible symbol can stay centered while the click point remains predictable.
const TOOL_CURSOR_SVGS = {
  rect: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 5h14v14H5z" fill="none" stroke="#fff" stroke-width="2"/><path d="M5 5h14v14H5z" fill="none" stroke="#111" stroke-width="1"/></svg>',
  circle: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="#fff" stroke-width="3"/><circle cx="12" cy="12" r="7" fill="none" stroke="#111" stroke-width="1"/></svg>',
  line: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 19 19 5" stroke="#fff" stroke-width="4"/><path d="M5 19 19 5" stroke="#111" stroke-width="1.5"/></svg>',
  arrow: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M4 20 19 5M10 5h9v9" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20 19 5M10 5h9v9" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bubble: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 9h8M8 12h5" stroke="#7c3aed" stroke-width="1.5" stroke-linecap="round"/></svg>',
  triangle: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 4 21 20H3Z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  polygon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M7 3h10l5 9-5 9H7l-5-9Z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  crop: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="square"/><path d="M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="square"/></svg>',
  eyedropper: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="m14 4 6 6-2.5 2.5-1.5-1.5-8 8H4v-4l8-8-1.5-1.5z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/><path d="m7 17 3 3" stroke="#35a7ff" stroke-width="2"/></svg>',
  bucket: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="m6 7 11 4-4 9H6z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/><path d="m6 7 2-3 9 4-1 3" fill="none" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/><path d="M18 15c0 2 3 2 3 0" fill="none" stroke="#35a7ff" stroke-width="1.5" stroke-linecap="round"/></svg>',
  bgremove: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="m5 19 8-8M13 11l3-3 3 3-3 3z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="m5 19 8-8M13 11l3-3 3 3-3 3z" fill="none" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/><path d="M18 4v4M16 6h4" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round"/></svg>',
  eraser: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="m4 16 9-9a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3l-5 5H8z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/><path d="m9 20 5-5" stroke="#7c3aed" stroke-width="2"/></svg>'
};

const TOOL_CURSOR_ASSETS = {
  rect: 'rectangle.svg',
  circle: 'ellipse.svg',
  line: 'line.svg',
  arrow: 'arrow.svg',
  bubble: 'speech-bubble.svg',
  crop: 'crop.svg',
  perspective: 'perspective.svg',
  slice: 'slice.svg',
  eyedropper: 'eyedropper.svg',
  bucket: 'bucket.svg',
  bgremove: 'background-remover.svg',
  eraser: 'eraser.svg',
};

function toolCursorUrl(tool) {
  const asset = TOOL_CURSOR_ASSETS[tool];
  if (asset) {
    // editor.html is one directory below the extension root. Resolve the
    // asset against the document URL so Chrome loads it from /assets/cursors.
    const assetUrl = new URL('../assets/cursors/' + asset, document.baseURI).href;
    return `url("${assetUrl}") 5 27, crosshair`;
  }
  const svg = TOOL_CURSOR_SVGS[tool];
  return svg ? `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}") 12 12, crosshair` : null;
}

function applyToolCursor(tool = currentTool) {
  const area = document.getElementById('canvasArea');
  const upper = canvas?.upperCanvasEl;
  if (!area) return;

  // Brush tools draw their own scalable cursor overlays and must keep the
  // browser cursor hidden underneath them.
  if (paintBrushActive || cutoutBrushActive || healingBrushActive) {
    if (canvas) {
      canvas.defaultCursor = 'none';
      canvas.hoverCursor = 'none';
    }
    area.style.cursor = 'none';
    if (upper) upper.style.cursor = 'none';
    return;
  }

  let cursor = 'default';
  let hoverCursor = 'move';
  if (tool === 'hand') {
    cursor = 'grab';
    hoverCursor = 'grab';
  } else if (tool === 'text') {
    cursor = 'text';
    hoverCursor = 'text';
  } else if (tool === 'vertical-text') {
    cursor = 'vertical-text';
    hoverCursor = 'vertical-text';
  } else if (tool === 'zoom') {
    cursor = 'zoom-in';
    hoverCursor = 'zoom-in';
  } else if (toolCursorUrl(tool)) {
    cursor = toolCursorUrl(tool);
    hoverCursor = cursor;
  } else if (['rect', 'circle', 'triangle', 'polygon', 'line', 'arrow', 'bubble', 'slice'].includes(tool)) {
    cursor = 'crosshair';
    hoverCursor = 'crosshair';
  }

  if (canvas) {
    canvas.defaultCursor = cursor;
    canvas.hoverCursor = hoverCursor;
  }
  area.style.cursor = cursor;
  if (upper) upper.style.cursor = cursor === 'default' ? '' : cursor;
}

// ===== WORKSPACE TRANSFORM CONTROLS =====
// Fabric renders its native controls into the document-sized upper canvas, so
// any handle beyond that bitmap is clipped. This DOM overlay mirrors only the
// clipped handles into the surrounding pasteboard and forwards their gestures
// to Fabric's own transform handlers. The document and export size never move.
function renderClatashaAnchorControl(context, left, top, styleOverride, target) {
  const scale = Math.max(MIN_ZOOM, zoomLevel || 1);
  const size = this.sizeX || styleOverride?.cornerSize || target.cornerSize || CLATASHA_CONTROL_SCREEN_SIZE / scale;
  context.save();
  context.beginPath();
  context.arc(left, top, size / 2, 0, Math.PI * 2);
  context.fillStyle = '#ffffff';
  context.strokeStyle = '#111827';
  context.lineWidth = 2 / scale;
  context.shadowColor = 'rgba(0,0,0,0.38)';
  context.shadowBlur = 2.5 / scale;
  context.fill();
  context.stroke();
  context.shadowColor = 'transparent';
  context.beginPath();
  context.arc(left, top, 2.1 / scale, 0, Math.PI * 2);
  context.fillStyle = '#7c3aed';
  context.fill();
  context.restore();
}

function configureClatashaObjectControls(obj) {
  if (!obj || obj.name === '__bg__') return;
  const scale = Math.max(MIN_ZOOM, zoomLevel || 1);
  obj.set({
    cornerSize: CLATASHA_CONTROL_SCREEN_SIZE / scale,
    touchCornerSize: CLATASHA_TOUCH_CONTROL_SCREEN_SIZE / scale,
    transparentCorners: false,
    cornerColor: '#ffffff',
    cornerStrokeColor: '#111827',
    cornerStyle: 'circle',
    borderColor: '#7c3aed',
    borderScaleFactor: 1.5 / scale,
    borderOpacityWhenMoving: 1,
  });
  WORKSPACE_TRANSFORM_CONTROLS.forEach(controlName => {
    const control = obj.controls?.[controlName];
    if (control) control.render = renderClatashaAnchorControl;
  });
  obj.setCoords?.();
}

function refreshClatashaControlScale() {
  if (!canvas) return;
  const visited = new Set();
  const visit = obj => {
    if (!obj || visited.has(obj)) return;
    visited.add(obj);
    configureClatashaObjectControls(obj);
    if (typeof obj.getObjects === 'function') obj.getObjects().forEach(visit);
  };
  canvas.getObjects().forEach(visit);
  visit(canvas.getActiveObject());
}

function scheduleWorkspaceTransformOverlay() {
  if (workspaceTransformFrame) return;
  workspaceTransformFrame = requestAnimationFrame(() => {
    workspaceTransformFrame = 0;
    updateWorkspaceTransformOverlay();
  });
}

function hideWorkspaceTransformOverlay() {
  const overlay = document.getElementById('workspaceTransformOverlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  overlay.querySelectorAll('.workspace-transform-handle').forEach(handle => { handle.hidden = true; });
  ['workspaceTransformBorderOuter', 'workspaceTransformBorderInner', 'workspaceTransformRotationOuter', 'workspaceTransformRotationInner']
    .forEach(id => document.getElementById(id)?.setAttribute('d', ''));
}

function isWorkspaceTransformUnavailable(target) {
  if (!target || target.name === '__bg__' || isInternalEditorObject(target)) return true;
  if (target.visible === false || target.selectable === false || target.hasControls === false || target._clatashaLocked) return true;
  if (target.isEditing || currentTool !== 'select') return true;
  return cropActive || perspActive || sliceActive || paintBrushActive || cutoutBrushActive ||
    healingBrushActive || paintBucketActive || bgRemovalActive || eyedropperActive || isDrawingShape;
}

function canvasPointToWorkspace(point, wrapperRect, areaRect) {
  return {
    x: wrapperRect.left - areaRect.left + point.x * wrapperRect.width / Math.max(1, CANVAS_W),
    y: wrapperRect.top - areaRect.top + point.y * wrapperRect.height / Math.max(1, CANVAS_H),
  };
}

function workspaceClientToCanvasPoint(clientX, clientY) {
  const wrapperRect = document.getElementById('canvasWrapper').getBoundingClientRect();
  return new fabric.Point(
    (clientX - wrapperRect.left) * CANVAS_W / Math.max(1, wrapperRect.width),
    (clientY - wrapperRect.top) * CANVAS_H / Math.max(1, wrapperRect.height),
  );
}

function getWorkspaceControlCursor(target, controlName) {
  if (controlName === 'mtr') return 'grab';
  const control = target.controls?.[controlName];
  try {
    const cursor = control?.cursorStyleHandler?.({ shiftKey: false, altKey: false }, control, target);
    if (cursor && cursor !== 'not-allowed') return cursor;
  } catch (_) {}
  const fallback = {
    tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize',
    ml: 'ew-resize', mr: 'ew-resize', mt: 'ns-resize', mb: 'ns-resize',
  };
  return fallback[controlName] || 'default';
}

function updateWorkspaceTransformOverlay() {
  const overlay = document.getElementById('workspaceTransformOverlay');
  const target = workspaceTransformDrag?.target || canvas?.getActiveObject?.();
  if (!overlay || isWorkspaceTransformUnavailable(target)) {
    hideWorkspaceTransformOverlay();
    return;
  }

  configureClatashaObjectControls(target);
  target.setCoords();
  const area = document.getElementById('canvasArea');
  const wrapper = document.getElementById('canvasWrapper');
  const areaRect = area.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  if (!areaRect.width || !areaRect.height || !wrapperRect.width || !wrapperRect.height) {
    hideWorkspaceTransformOverlay();
    return;
  }

  const borderPoints = target.getCoords?.().map(point => canvasPointToWorkspace(point, wrapperRect, areaRect)) || [];
  if (borderPoints.length !== 4 || borderPoints.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    hideWorkspaceTransformOverlay();
    return;
  }
  const borderPath = `M ${borderPoints.map(point => `${point.x} ${point.y}`).join(' L ')} Z`;
  document.getElementById('workspaceTransformBorderOuter').setAttribute('d', borderPath);
  document.getElementById('workspaceTransformBorderInner').setAttribute('d', borderPath);

  const documentInset = CLATASHA_CONTROL_SCREEN_SIZE / 2 + 1;
  let visibleHandleCount = 0;
  let rotationPoint = null;
  let topPoint = null;
  overlay.querySelectorAll('.workspace-transform-handle').forEach(handle => {
    const controlName = handle.dataset.control;
    const control = target.controls?.[controlName];
    const point = target.oCoords?.[controlName];
    const controlVisible = !!control && !!point && target.isControlVisible(controlName);
    if (!controlVisible) {
      handle.hidden = true;
      return;
    }
    const workspacePoint = canvasPointToWorkspace(point, wrapperRect, areaRect);
    const clientX = areaRect.left + workspacePoint.x;
    const clientY = areaRect.top + workspacePoint.y;
    const outsideDocument = clientX <= wrapperRect.left + documentInset ||
      clientX >= wrapperRect.right - documentInset ||
      clientY <= wrapperRect.top + documentInset ||
      clientY >= wrapperRect.bottom - documentInset;
    const insideWorkspace = workspacePoint.x >= -documentInset && workspacePoint.x <= areaRect.width + documentInset &&
      workspacePoint.y >= -documentInset && workspacePoint.y <= areaRect.height + documentInset;
    handle.hidden = !outsideDocument || !insideWorkspace;
    if (handle.hidden) return;
    handle.style.left = workspacePoint.x + 'px';
    handle.style.top = workspacePoint.y + 'px';
    handle.style.cursor = workspaceTransformDrag?.controlName === controlName
      ? (controlName === 'mtr' ? 'grabbing' : getWorkspaceControlCursor(target, controlName))
      : getWorkspaceControlCursor(target, controlName);
    handle.classList.toggle('active', workspaceTransformDrag?.controlName === controlName);
    visibleHandleCount++;
    if (controlName === 'mtr') rotationPoint = workspacePoint;
    if (controlName === 'mt') topPoint = workspacePoint;
  });

  const rotationPath = rotationPoint && topPoint ? `M ${topPoint.x} ${topPoint.y} L ${rotationPoint.x} ${rotationPoint.y}` : '';
  document.getElementById('workspaceTransformRotationOuter').setAttribute('d', rotationPath);
  document.getElementById('workspaceTransformRotationInner').setAttribute('d', rotationPath);
  overlay.classList.toggle('visible', visibleHandleCount > 0 || !!workspaceTransformDrag);
}

function performWorkspaceTransform(event) {
  const drag = workspaceTransformDrag;
  const transform = canvas?._currentTransform;
  if (!drag || !transform || transform.target !== drag.target) return false;
  const scenePoint = workspaceClientToCanvasPoint(event.clientX, event.clientY);
  const targetPoint = drag.target.group
    ? fabric.util.transformPoint(scenePoint, fabric.util.invertTransform(drag.target.group.calcTransformMatrix()))
    : scenePoint;
  transform.shiftKey = !!event.shiftKey;
  transform.altKey = !!canvas.centeredKey && !!event[canvas.centeredKey];
  const performedBefore = transform.actionPerformed;
  canvas._performTransformAction(event, transform, targetPoint);
  if (transform.actionPerformed || performedBefore) {
    drag.target.setCoords();
    syncClippingMasksForObject(drag.target);
    liveUpdatePositionFields(drag.target);
    canvas.requestRenderAll();
    scheduleWorkspaceTransformOverlay();
    return true;
  }
  return false;
}

function calculateWorkspaceAutoPan(clientPosition, minimum, maximum) {
  const edge = 38;
  const speed = 0.34;
  if (clientPosition < minimum + edge) return Math.min(18, (minimum + edge - clientPosition) * speed);
  if (clientPosition > maximum - edge) return -Math.min(18, (clientPosition - (maximum - edge)) * speed);
  return 0;
}

function runWorkspaceTransformAutoPan() {
  workspaceTransformAutoPanFrame = 0;
  const drag = workspaceTransformDrag;
  if (!drag) return;
  const areaRect = document.getElementById('canvasArea').getBoundingClientRect();
  const rulerInset = showRulers ? 22 : 0;
  const dx = calculateWorkspaceAutoPan(drag.lastEvent.clientX, areaRect.left + rulerInset, areaRect.right);
  const dy = calculateWorkspaceAutoPan(drag.lastEvent.clientY, areaRect.top + rulerInset, areaRect.bottom);
  if (dx || dy) {
    panOffsetX += dx;
    panOffsetY += dy;
    applyCanvasTransform();
    performWorkspaceTransform(drag.lastEvent);
  }
  workspaceTransformAutoPanFrame = requestAnimationFrame(runWorkspaceTransformAutoPan);
}

function beginWorkspaceTransform(event) {
  const handle = event.currentTarget;
  const target = canvas?.getActiveObject?.();
  const controlName = handle?.dataset?.control;
  if (event.button !== 0 || !target || isWorkspaceTransformUnavailable(target) || !target.controls?.[controlName]) return;
  event.preventDefault();
  event.stopPropagation();
  target.exitEditing?.();
  configureClatashaObjectControls(target);
  target.setCoords();
  target.__corner = controlName;
  const scenePoint = workspaceClientToCanvasPoint(event.clientX, event.clientY);
  canvas._pointer = scenePoint;
  canvas._absolutePointer = scenePoint;
  canvas._setupCurrentTransform(event, target, true);
  canvas._resetTransformEventData();
  if (!canvas._currentTransform?.actionHandler) {
    target.__corner = undefined;
    return;
  }

  const control = target.controls[controlName];
  const mouseDownHandler = control.getMouseDownHandler?.(event, target, control);
  mouseDownHandler?.call(control, event, canvas._currentTransform, scenePoint.x, scenePoint.y);
  workspaceTransformDrag = {
    target,
    control,
    controlName,
    handle,
    pointerId: event.pointerId,
    lastEvent: event,
  };
  handle.classList.add('active');
  document.getElementById('canvasWrapper').classList.add('workspace-transform-active');
  try { handle.setPointerCapture(event.pointerId); } catch (_) {}
  if (!workspaceTransformAutoPanFrame) workspaceTransformAutoPanFrame = requestAnimationFrame(runWorkspaceTransformAutoPan);
  scheduleWorkspaceTransformOverlay();
}

function moveWorkspaceTransform(event) {
  if (!workspaceTransformDrag || event.pointerId !== workspaceTransformDrag.pointerId) return;
  event.preventDefault();
  workspaceTransformDrag.lastEvent = event;
  performWorkspaceTransform(event);
}

function finishWorkspaceTransform(event) {
  const drag = workspaceTransformDrag;
  if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
  event.preventDefault?.();
  const finalEvent = event.clientX === undefined ? drag.lastEvent : event;
  performWorkspaceTransform(finalEvent);
  const scenePoint = workspaceClientToCanvasPoint(finalEvent.clientX, finalEvent.clientY);
  const mouseUpHandler = drag.control.getMouseUpHandler?.(finalEvent, drag.target, drag.control);
  mouseUpHandler?.call(drag.control, finalEvent, canvas._currentTransform, scenePoint.x, scenePoint.y);
  if (canvas._currentTransform) canvas.endCurrentTransform(finalEvent);
  drag.target.__corner = undefined;
  drag.handle.classList.remove('active');
  try { drag.handle.releasePointerCapture(drag.pointerId); } catch (_) {}
  workspaceTransformDrag = null;
  document.getElementById('canvasWrapper').classList.remove('workspace-transform-active');
  if (workspaceTransformAutoPanFrame) {
    cancelAnimationFrame(workspaceTransformAutoPanFrame);
    workspaceTransformAutoPanFrame = 0;
  }
  applyToolCursor(currentTool);
  canvas.requestRenderAll();
  scheduleWorkspaceTransformOverlay();
}

function setupWorkspaceTransformOverlay() {
  const handles = document.getElementById('workspaceTransformHandles');
  if (!handles) return;
  WORKSPACE_TRANSFORM_CONTROLS.forEach(controlName => {
    const handle = document.createElement('div');
    handle.className = 'workspace-transform-handle';
    handle.dataset.control = controlName;
    handle.hidden = true;
    handle.addEventListener('pointerdown', beginWorkspaceTransform);
    handle.addEventListener('mousedown', event => event.stopPropagation());
    handle.addEventListener('dragstart', event => event.preventDefault());
    handles.appendChild(handle);
  });
  window.addEventListener('pointermove', moveWorkspaceTransform, { passive: false });
  window.addEventListener('pointerup', finishWorkspaceTransform, { passive: false });
  window.addEventListener('pointercancel', finishWorkspaceTransform, { passive: false });
  window.addEventListener('resize', scheduleWorkspaceTransformOverlay);
  if ('ResizeObserver' in window) {
    new ResizeObserver(scheduleWorkspaceTransformOverlay).observe(document.getElementById('canvasArea'));
  }
  scheduleWorkspaceTransformOverlay();
}

function isActiveSelectionObject(obj) {
  return !!obj && String(obj.type || '').toLowerCase() === 'activeselection';
}

function isUserGroup(obj) {
  return !!obj && obj.type === 'group' && obj._clatashaUserGroup === true;
}

function isEditableTextObject(obj) {
  return !!obj && ['textbox', 'i-text', 'text'].includes(String(obj.type || '').toLowerCase()) && obj.editable !== false;
}

function getUserGroupAncestors(obj) {
  const groups = [];
  let parent = obj?.group;
  while (parent) {
    if (isUserGroup(parent)) groups.push(parent);
    parent = parent.group;
  }
  return groups;
}

function setGroupEditPath(groups) {
  const next = [...new Set(groups.filter(isUserGroup))];
  activeGroupEditPath.forEach(group => {
    if (!next.includes(group)) group.set({ subTargetCheck: true, interactive: false });
  });
  next.forEach(group => {
    group.set({ subTargetCheck: true, interactive: true });
    group._clatashaGroupExpanded = true;
    group.setCoords();
  });
  activeGroupEditPath = next;
  activeGroupEditParent = next[0] || null;
  activeGroupEditRoot = next[next.length - 1] || null;
}

function exitGroupEditMode(options = {}) {
  if (!activeGroupEditPath.length) return false;
  const selectParent = options.selectParent === true;
  const parent = activeGroupEditParent;
  const selected = canvas?.getActiveObject?.();
  if (selected?.isEditing && typeof selected.exitEditing === 'function') selected.exitEditing();

  activeGroupEditPath.forEach(group => {
    group.set({ subTargetCheck: true, interactive: false });
    group.setCoords();
  });
  activeGroupEditPath = [];
  activeGroupEditParent = null;
  activeGroupEditRoot = null;

  if (selectParent && parent && parent.canvas === canvas && !parent._clatashaLocked) {
    canvas.setActiveObject(parent);
    updatePropertiesPanel(parent);
  }
  canvas?.requestRenderAll?.();
  updateLayersList();
  return true;
}

function reconcileGroupEditSelection(obj) {
  if (!activeGroupEditRoot) return;
  const ancestors = getUserGroupAncestors(obj);
  const rootIndex = ancestors.indexOf(activeGroupEditRoot);
  if (rootIndex >= 0) {
    setGroupEditPath(ancestors.slice(0, rootIndex + 1));
    return;
  }
  exitGroupEditMode({ selectParent: false });
}

function selectChildInsideGroup(obj, options = {}) {
  const ancestors = getUserGroupAncestors(obj);
  if (!ancestors.length) return false;
  if (obj._clatashaLocked || ancestors.some(group => group._clatashaLocked)) {
    showPerspToast('Unlock the layer or its group before editing');
    return false;
  }

  setGroupEditPath(ancestors);
  canvas.setActiveObject(obj);
  obj.setCoords();

  if (options.editText && isEditableTextObject(obj)) {
    attachTextEditingHost(obj);
    obj.enterEditing(options.event);
    if (options.event && typeof obj.setCursorByClick === 'function') obj.setCursorByClick(options.event);
    if (typeof obj.selectWord === 'function') obj.selectWord(obj.selectionStart || 0);
  }

  canvas.requestRenderAll();
  updateLayersList();
  return true;
}

function getGroupedTextHit(pointerEvent) {
  const hits = [...(pointerEvent?.subTargets || []), pointerEvent?.target].filter(Boolean);
  return hits.find(obj => isEditableTextObject(obj) && getUserGroupAncestors(obj).length > 0) || null;
}

function configureUserGroupTree(obj) {
  if (!obj) return;
  configureClatashaObjectControls(obj);
  attachTextEditingHost(obj);
  if (!obj.getObjects || typeof obj.getObjects !== 'function') return;
  if (isUserGroup(obj)) {
    obj.set({
      subTargetCheck: true,
      interactive: activeGroupEditPath.includes(obj),
    });
  }
  obj.getObjects().forEach(configureUserGroupTree);
}

function refreshContainingGroupLayouts(obj) {
  getUserGroupAncestors(obj).forEach(group => {
    group.dirty = true;
    if (typeof group.triggerLayout === 'function') group.triggerLayout();
    group.setCoords();
  });
}

function normalizeSerializedGroupInteractions(serialized) {
  const visit = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (obj._clatashaUserGroup === true) {
      obj.subTargetCheck = true;
      obj.interactive = false;
    }
    if (Array.isArray(obj.objects)) obj.objects.forEach(visit);
  };
  if (Array.isArray(serialized?.objects)) serialized.objects.forEach(visit);
  return serialized;
}

// ===== ALPHA-AWARE IMAGE OUTLINES =====
// Fabric's regular image stroke follows the rectangular image bounds. Images
// use a cached alpha dilation instead so transparent PNG outlines follow the
// visible subject while the original pixels remain untouched.
const MAX_IMAGE_OUTLINE_CACHE_SIDE = 1536;

function maxFilterAlphaHorizontal(source, width, height, radius) {
  const output = new Uint8ClampedArray(source.length);
  const deque = new Int32Array(width);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let head = 0, tail = 0, next = 0;
    for (let x = 0; x < width; x++) {
      const end = Math.min(width - 1, x + radius);
      while (next <= end) {
        const value = source[row + next];
        while (tail > head && source[row + deque[tail - 1]] <= value) tail--;
        deque[tail++] = next++;
      }
      const start = Math.max(0, x - radius);
      while (tail > head && deque[head] < start) head++;
      output[row + x] = source[row + deque[head]];
    }
  }
  return output;
}

function maxFilterAlphaVertical(source, width, height, radius) {
  const output = new Uint8ClampedArray(source.length);
  const deque = new Int32Array(height);
  for (let x = 0; x < width; x++) {
    let head = 0, tail = 0, next = 0;
    for (let y = 0; y < height; y++) {
      const end = Math.min(height - 1, y + radius);
      while (next <= end) {
        const value = source[next * width + x];
        while (tail > head && source[deque[tail - 1] * width + x] <= value) tail--;
        deque[tail++] = next++;
      }
      const start = Math.max(0, y - radius);
      while (tail > head && deque[head] < start) head++;
      output[y * width + x] = source[deque[head] * width + x];
    }
  }
  return output;
}

function getImageOutlineWidth(obj) {
  return Math.max(0, Number(obj?._clatashaImageOutlineWidth) || 0);
}

function getImageOutlineColor(obj) {
  const color = obj?._clatashaImageOutlineColor || obj?.stroke;
  return typeof color === 'string' && color ? color : '#000000';
}

function clearImageOutlineCache(obj) {
  if (obj) delete obj._clatashaImageOutlineCache;
}

function ensureImageOutlineMetadata(obj) {
  if (!obj || obj.type !== 'image' || obj._clatashaImageOutlineWidth !== undefined) return;
  const legacyWidth = obj.stroke && obj.strokeWidth ? Math.max(0, Number(obj.strokeWidth) || 0) : 0;
  obj._clatashaImageOutlineColor = obj.stroke || '#000000';
  obj._clatashaImageOutlineWidth = legacyWidth;
  obj.set('strokeWidth', legacyWidth > 0 ? legacyWidth * 2 : 0);
  clearImageOutlineCache(obj);
  obj.dirty = true;
}

function setImageOutline(obj, color, width) {
  if (!obj || obj.type !== 'image') return;
  const safeWidth = Math.max(0, Math.min(50, Number(width) || 0));
  const safeColor = color || getImageOutlineColor(obj);
  obj._clatashaImageOutlineColor = safeColor;
  obj._clatashaImageOutlineWidth = safeWidth;
  // Doubling the internal stroke width reserves enough Fabric cache and
  // control-box padding for an outline that extends fully outside the pixels.
  obj.set({
    stroke: safeColor,
    strokeWidth: safeWidth > 0 ? safeWidth * 2 : 0,
  });
  clearImageOutlineCache(obj);
  obj.dirty = true;
  obj.setCoords();
  obj.setCoords();
  canvas?.requestRenderAll();
}

function buildImageOutlineCanvas(obj) {
  const outlineWidth = getImageOutlineWidth(obj);
  const element = obj?.getElement?.();
  if (!element || outlineWidth <= 0) return null;

  const objectWidth = Math.max(1, Number(obj.width) || 1);
  const objectHeight = Math.max(1, Number(obj.height) || 1);
  const rasterScale = Math.min(1, MAX_IMAGE_OUTLINE_CACHE_SIDE / Math.max(objectWidth, objectHeight));
  const drawWidth = Math.max(1, Math.round(objectWidth * rasterScale));
  const drawHeight = Math.max(1, Math.round(objectHeight * rasterScale));
  const outlinePixels = Math.max(1, Math.round(outlineWidth * rasterScale));
  const canvasWidth = drawWidth + outlinePixels * 2;
  const canvasHeight = drawHeight + outlinePixels * 2;
  const filterScaleX = obj._filterScalingX || 1;
  const filterScaleY = obj._filterScalingY || 1;
  const cropX = Math.max(Number(obj.cropX) || 0, 0);
  const cropY = Math.max(Number(obj.cropY) || 0, 0);
  const elementWidth = element.naturalWidth || element.width || objectWidth;
  const elementHeight = element.naturalHeight || element.height || objectHeight;
  const sourceX = cropX * filterScaleX;
  const sourceY = cropY * filterScaleY;
  const sourceWidth = Math.min(objectWidth * filterScaleX, elementWidth - sourceX);
  const sourceHeight = Math.min(objectHeight * filterScaleY, elementHeight - sourceY);
  const destinationWidth = Math.min(objectWidth, elementWidth / filterScaleX - cropX);
  const destinationHeight = Math.min(objectHeight, elementHeight / filterScaleY - cropY);
  const color = getImageOutlineColor(obj);
  const cacheKey = [
    objectWidth, objectHeight, cropX, cropY, filterScaleX, filterScaleY,
    outlineWidth, color, elementWidth, elementHeight,
  ].join('|');
  const cached = obj._clatashaImageOutlineCache;
  if (cached && cached.key === cacheKey && cached.element === element) return cached.canvas;

  if (sourceWidth <= 0 || sourceHeight <= 0 || destinationWidth <= 0 || destinationHeight <= 0) return null;

  try {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = canvasWidth;
    sourceCanvas.height = canvasHeight;
    const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    sourceCtx.imageSmoothingEnabled = true;
    sourceCtx.imageSmoothingQuality = 'high';
    sourceCtx.drawImage(
      element,
      sourceX, sourceY, sourceWidth, sourceHeight,
      outlinePixels, outlinePixels,
      destinationWidth * rasterScale, destinationHeight * rasterScale
    );

    const sourceData = sourceCtx.getImageData(0, 0, canvasWidth, canvasHeight);
    const sourceAlpha = new Uint8ClampedArray(canvasWidth * canvasHeight);
    for (let i = 0, pixel = 0; i < sourceData.data.length; i += 4, pixel++) {
      sourceAlpha[pixel] = sourceData.data[i + 3];
    }
    const horizontal = maxFilterAlphaHorizontal(sourceAlpha, canvasWidth, canvasHeight, outlinePixels);
    const dilated = maxFilterAlphaVertical(horizontal, canvasWidth, canvasHeight, outlinePixels);

    let rgba = [0, 0, 0, 1];
    try { rgba = new fabric.Color(color).getSource(); } catch (error) {}
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = canvasWidth;
    outputCanvas.height = canvasHeight;
    const outputCtx = outputCanvas.getContext('2d');
    const outputData = outputCtx.createImageData(canvasWidth, canvasHeight);
    const colorAlpha = rgba[3] === undefined ? 1 : rgba[3];
    for (let pixel = 0, i = 0; pixel < dilated.length; pixel++, i += 4) {
      const alpha = Math.max(0, dilated[pixel] - sourceAlpha[pixel]);
      outputData.data[i] = rgba[0];
      outputData.data[i + 1] = rgba[1];
      outputData.data[i + 2] = rgba[2];
      outputData.data[i + 3] = Math.round(alpha * colorAlpha);
    }
    outputCtx.putImageData(outputData, 0, 0);
    obj._clatashaImageOutlineCache = { key: cacheKey, element, canvas: outputCanvas };
    return outputCanvas;
  } catch (error) {
    console.warn('Unable to render image outline:', error);
    obj._clatashaImageOutlineCache = { key: cacheKey, element, canvas: null };
    return null;
  }
}

function renderImageSilhouetteOutline(obj, ctx) {
  const outlineWidth = getImageOutlineWidth(obj);
  if (outlineWidth <= 0) return;
  const outlineCanvas = buildImageOutlineCanvas(obj);
  if (!outlineCanvas) return;
  ctx.drawImage(
    outlineCanvas,
    -obj.width / 2 - outlineWidth,
    -obj.height / 2 - outlineWidth,
    obj.width + outlineWidth * 2,
    obj.height + outlineWidth * 2
  );
}

function installImageSilhouetteOutlineRenderer() {
  const prototype = FabricImage.prototype;
  if (prototype._clatashaOutlineRendererInstalled) return;
  const originalRenderFill = prototype._renderFill;
  const originalRenderStroke = prototype._renderStroke;
  prototype._renderFill = function(ctx) {
    renderImageSilhouetteOutline(this, ctx);
    return originalRenderFill.call(this, ctx);
  };
  prototype._renderStroke = function(ctx) {
    if (getImageOutlineWidth(this) > 0) return;
    return originalRenderStroke.call(this, ctx);
  };
  Object.defineProperty(prototype, '_clatashaOutlineRendererInstalled', { value: true });
}

installImageSilhouetteOutlineRenderer();

// ===== SHARED INDEXED DB =====
// Single DB opener — bumped to v2 to add customPresets store.
// IMPORTANT: both stores are created here so there's one source of truth.
function getDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('clatasha_fonts', 2);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('fonts')) {
        db.createObjectStore('fonts', { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains('customPresets')) {
        db.createObjectStore('customPresets', { keyPath: 'name' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

// ===== CUSTOM FONTS =====
function getCustomFontDB() {
  return getDB();
}

async function loadCustomFonts() {
  try {
    const db = await getCustomFontDB();
    const tx = db.transaction('fonts', 'readonly');
    const store = tx.objectStore('fonts');
    const req = store.getAll();
    return new Promise((resolve) => {
      req.onsuccess = async () => {
        customFonts = req.result || [];
        await Promise.all(customFonts.map(f => registerFontFace(f.name, f.base64, f.format)));
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch (e) { console.warn('Font DB error', e); }
}

function registerFontFace(name, base64, format) {
  const fontFace = new FontFace(name, 'url(' + base64 + ')', { style: 'normal', weight: 'normal' });
  return fontFace.load().then((loadedFace) => {
    document.fonts.add(loadedFace);
    return loadedFace;
  }).catch((error) => {
    console.warn('Unable to load font:', name, error);
    return null;
  });
}

async function ensureFontFamilyReady(fontFamily) {
  const firstFamily = String(fontFamily || '')
    .split(',')[0]
    .trim()
    .replace(/['"\\]/g, '');
  if (!firstFamily || !document.fonts) return;
  try {
    await document.fonts.load(`normal 400 32px "${firstFamily}"`);
    await document.fonts.ready;
  } catch (error) {
    console.warn('Font readiness check failed:', firstFamily, error);
  }
}

async function addCustomFont(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const formatMap = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' };
  const format = formatMap[ext];
  if (!format) { alert('Unsupported font format. Use .ttf, .otf, .woff, or .woff2'); return; }

  const base64 = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });

  // Clean font name (remove extension, replace dashes/spaces)
  let fontName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  // Ensure uniqueness
  let finalName = fontName;
  let counter = 2;
  while (customFonts.some(f => f.name === finalName)) {
    finalName = fontName + ' ' + counter++;
  }

  const fontEntry = { name: finalName, base64, format };
  customFonts.push(fontEntry);
  await registerFontFace(finalName, base64, format);

  // Persist to IndexedDB
  try {
    const db = await getCustomFontDB();
    const tx = db.transaction('fonts', 'readwrite');
    tx.objectStore('fonts').put(fontEntry);
  } catch (e) { console.warn('Font save error', e); }

  return finalName;
}

async function deleteCustomFont(name) {
  customFonts = customFonts.filter(f => f.name !== name);
  try {
    const db = await getCustomFontDB();
    const tx = db.transaction('fonts', 'readwrite');
    tx.objectStore('fonts').delete(name);
  } catch (e) {}
}

// ===== INIT =====
async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  projectId = urlParams.get('id') || null;

  setupWorkspaceThemes();

  canvas = new Canvas('mainCanvas', {
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: '#FFFFFF',
    preserveObjectStacking: true,
    selection: true,
  });

  setupWorkspaceTransformOverlay();
  setupCanvasEvents();
  setupToolbar();
  setupBrushStudio();
  setupMenu();
  pluginSystem = createPluginSystem({
    getTheme: () => workspaceTheme,
    getDocumentSize: () => ({ width: CANVAS_W, height: CANVAS_H }),
    getSelectedImage: getSelectedImageForPlugin,
    addImageBlob: addPluginImageBlob,
    notify: showPerspToast,
    closeMenus,
    beforeOpenModal: () => {
      if (helpCenterOpen) closeHelpCenter();
    },
  });
  await pluginSystem.initialize();
  setupHelpCenter();
  setupVideoFrameGrabber();
  setupExportOptions();
  setupClickCheck();
  setupZoom();
  initSnapLines();
  setupRulersAndGuides();
  setupKeyboard();
  setupDragDrop();
  setupColorPickers();
  await ensureFontFamilyReady('Righteous');
  // Load custom presets & fonts before building UI
  await loadCustomPresets();
  await loadCustomFonts();
  buildTextPresets();
  setupTemplateUI();
  await buildTemplates();
  buildFilters();
  setupRightPanelTabs();
  setupLayerAppearanceControls();
  setupPanelDelegation();
  setupLayersDelegation();
  setupContextMenu();
  setupStickers();
  setupStandardCrop();
  setupPerspectiveCrop();
  setupSliceTool();
  setupDonatePopup();
  setupBackgroundPanel();
  setupFriendEasterEgg();

  document.getElementById('fontInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (healingBrushActive) finishHealingBrush();
    const name = await addCustomFont(file);
    if (name) {
      const obj = canvas.getActiveObject();
      if (obj && obj.type === 'textbox') {
        obj.set('fontFamily', name);
        obj.setCoords();
        canvas.renderAll();
      }
      // Always rebuild panel so the new font appears in the dropdown
      const panelObj = obj && obj.name !== '__bg__' ? obj : activeObject;
      if (panelObj && panelObj.name !== '__bg__') {
        updatePropertiesPanel(panelObj);
      }
    }
    e.target.value = '';
  });

  // Initial white background rect
  addBackgroundRect();

  // Fit canvas to view
  setTimeout(() => zoomToFit(), 100);

  // Load project if ID provided
  if (projectId) {
    await loadProject(projectId);
  }

  // loadFromJSON also creates objects asynchronously; make sure every
  // editable text layer uses the isolated hidden-input host before the first
  // user interaction.
  attachTextEditingHosts();

  saveHistory();
  updateLayersList();
  updateObjectCount();
  applyToolCursor();
}

function addBackgroundRect() {
  const bg = new Rect({
    left: 0, top: 0, width: CANVAS_W, height: CANVAS_H,
    fill: '#FFFFFF',
    selectable: false,
    evented: false,
    name: '__bg__',
  });
  canvas.add(bg);
  canvas.moveObjectTo(bg, 0);
}

function getTextEditingHost() {
  if (textEditingHost && textEditingHost.isConnected) return textEditingHost;
  textEditingHost = document.getElementById('fabricTextEditingHost');
  if (!textEditingHost) {
    textEditingHost = document.createElement('div');
    textEditingHost.id = 'fabricTextEditingHost';
    document.body.appendChild(textEditingHost);
  }
  return textEditingHost;
}

function attachTextEditingHost(obj) {
  if (!obj || (obj.type !== 'textbox' && obj.type !== 'i-text' && obj.type !== 'text')) return;
  obj.hiddenTextareaContainer = getTextEditingHost();
  if (obj._clatashaVerticalText && obj.type === 'textbox') fitVerticalTextColumn(obj);
}

function attachTextEditingHosts() {
  if (!canvas) return;
  canvas.getObjects().forEach(configureUserGroupTree);
}

// ===== CANVAS EVENTS =====
function setupCanvasEvents() {
  canvas.on('after:render', scheduleWorkspaceTransformOverlay);
  canvas.on('selection:created', (e) => {
    const target = e.target || canvas.getActiveObject() || e.selected[0];
    reconcileGroupEditSelection(target);
    onObjectSelected(target);
  });
  canvas.on('selection:updated', (e) => {
    const target = e.target || canvas.getActiveObject() || e.selected[0];
    reconcileGroupEditSelection(target);
    onObjectSelected(target);
  });
  canvas.on('selection:cleared', () => {
    exitGroupEditMode({ selectParent: false });
    resetSnapDragState();
    onObjectDeselected();
  });
  canvas.on('object:modified', (e) => {
    const snappedOnRelease = snapEnabled && commitObjectSnap(e.target);
    resetSnapDragState();
    hideSnapLines();
    if (!isInternalEditorObject(e.target)) {
      refreshContainingGroupLayouts(e.target);
      syncClippingMasksForObject(e.target);
      if (snappedOnRelease) {
        liveUpdatePositionFields(e.target);
        canvas.requestRenderAll();
      }
      saveHistory();
      updateLayersList();
    }
  });
  canvas.on('object:added', (e) => {
    configureUserGroupTree(e.target);
    if (!isInternalEditorObject(e.target)) { updateObjectCount(); updateLayersList(); }
  });
  canvas.on('object:removed', (e) => {
    if (!isInternalEditorObject(e.target)) {
      cleanupClippingLinksAfterRemoval(e.target);
      updateObjectCount();
      updateLayersList();
    }
  });

  // Live position/size updates while moving or scaling
  canvas.on('object:moving', (e) => {
    if (!isInternalEditorObject(e.target)) {
      if (snapEnabled) previewObjectSnap(e.target);
      syncClippingMasksForObject(e.target);
      liveUpdatePositionFields(e.target);
    }
  });
  canvas.on('object:scaling', (e) => {
    if (!isInternalEditorObject(e.target)) {
      syncClippingMasksForObject(e.target);
      liveUpdatePositionFields(e.target);
    }
  });
  canvas.on('object:rotating', (e) => {
    if (!isInternalEditorObject(e.target)) syncClippingMasksForObject(e.target);
    const angleInput = document.querySelector('[data-prop="angle"]');
    if (angleInput) {
      angleInput.value = Math.round(e.target.angle || 0);
      if (angleInput.nextElementSibling) angleInput.nextElementSibling.textContent = Math.round(e.target.angle || 0) + '\u00B0';
    }
  });
  canvas.on('text:changed', (e) => {
    if (!isInternalEditorObject(e.target)) {
      if (e.target?._clatashaVerticalText) fitVerticalTextColumn(e.target);
      refreshContainingGroupLayouts(e.target);
      syncEditedClippingBase(e.target);
    }
  });

  // Shape drawing
  canvas.on('mouse:down', onCanvasMouseDown);
  canvas.on('mouse:move', onCanvasMouseMove);
  canvas.on('mouse:up', onCanvasMouseUp);
  canvas.on('mouse:up', resetSnapDragState);
  canvas.on('mouse:dblclick', (opt) => {
    const groupedText = getGroupedTextHit(opt);
    if (groupedText) {
      opt.e.preventDefault();
      opt.e.stopPropagation();
      selectChildInsideGroup(groupedText, { editText: true, event: opt.e });
      return;
    }
    if (!cropActive && opt.target && opt.target.type === 'image' && !opt.target._clatashaPaintLayer && !isInternalEditorObject(opt.target)) {
      canvas.setActiveObject(opt.target);
      if (isClippedLayer(opt.target)) {
        showPerspToast('Move or resize the image inside its frame');
      } else {
        enterStandardCrop();
      }
    }
  });

  // Fabric creates a hidden editing textarea when editing begins. Move it into
  // the fixed containment host immediately, and keep it at input-only size.
  // This prevents the focused editor bridge from affecting page/flex layout.
  canvas.on('text:editing:entered', (event) => {
    const textarea = event?.target?.hiddenTextarea;
    if (!textarea) return;
    const host = getTextEditingHost();
    if (textarea.parentNode !== host) host.appendChild(textarea);
    event.target.hiddenTextareaContainer = host;
    textarea.style.position = 'absolute';
    textarea.style.left = '0px';
    textarea.style.top = '0px';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    textarea.style.maxWidth = '1px';
    textarea.style.maxHeight = '1px';
    textarea.style.overflow = 'hidden';
  });

  // Keep ordinary single-line labels snug after editing. Deliberately wrapped
  // or multiline text boxes retain their authored width.
  canvas.on('text:editing:exited', (e) => {
    const text = e.target;
    if (!text || text.type !== 'textbox') return;
    if (text._clatashaVerticalText) {
      text._clatashaAutoFitText = false;
      fitVerticalTextColumn(text);
      text.dirty = true;
      text.setCoords();
      refreshContainingGroupLayouts(text);
      canvas.requestRenderAll();
      updatePropertiesPanel(text);
      updateLayersList();
      return;
    }
    text._clatashaAutoFitText = true;
    if (fitSingleLineTextbox(text, true)) {
      refreshContainingGroupLayouts(text);
      canvas.requestRenderAll();
      updatePropertiesPanel(text);
      updateLayersList();
    }
  });

  // Panning with middle mouse or hand tool
  canvas.on('mouse:wheel', (opt) => {
    const delta = opt.e.deltaY;
    let newZoom = zoomLevel - delta * 0.001;
    newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
    zoomTo(newZoom);
    opt.e.preventDefault();
    opt.e.stopPropagation();
  });

  // Click outside canvas to deselect
  const canvasArea = document.getElementById('canvasArea');
  if (canvasArea) {
    canvasArea.addEventListener('mousedown', function(e) {
      if (!e.target.closest('.canvas-wrapper') && !e.target.closest('.canvas-ruler') && !e.target.closest('.ruler-corner') && !e.target.closest('.brush-studio-bar') && !e.target.closest('.workspace-transform-handle')) {
        canvas.discardActiveObject();
        canvas.requestRenderAll();
      }
    });
  }
}

function onCanvasMouseDown(opt) {
  const pointer = canvas.getPointer(opt.e);

  if (paintBrushActive && (opt.e.button === undefined || opt.e.button === 0)) {
    beginPaintBrushStroke(pointer, opt.e);
    opt.e.preventDefault();
    opt.e.stopPropagation();
    return;
  }

  if (healingBrushActive && (opt.e.button === undefined || opt.e.button === 0)) {
    beginHealingBrushStroke(pointer);
    opt.e.preventDefault();
    opt.e.stopPropagation();
    return;
  }

  if (cutoutBrushActive && (opt.e.button === undefined || opt.e.button === 0)) {
    beginCutoutBrushStroke(pointer, !!opt.e.altKey);
    opt.e.preventDefault();
    opt.e.stopPropagation();
    return;
  }

  // Sample the fully rendered canvas without changing the current selection.
  if (eyedropperActive && (opt.e.button === undefined || opt.e.button === 0)) {
    sampleCanvasColor(opt.e, !!opt.e.shiftKey);
    opt.e.preventDefault();
    opt.e.stopPropagation();
    return;
  }

  // Paint bucket mode: fill the clicked connected area on the selected image.
  if (paintBucketActive) {
    if (applyPaintBucketAtPoint(pointer)) {
      opt.e.preventDefault();
      opt.e.stopPropagation();
    }
    return;
  }

  // BG removal mode: intercept click
  if (bgRemovalActive) {
    if (window.removeBgAtPoint(pointer)) {
      opt.e.preventDefault();
      opt.e.stopPropagation();
    }
    return;
  }

  if (sliceActive && (opt.e.button === undefined || opt.e.button === 0)) {
    beginSliceLine(pointer, opt.e);
    opt.e.preventDefault();
    opt.e.stopPropagation();
    return;
  }

  if (currentTool === 'zoom' && (opt.e.button === undefined || opt.e.button === 0)) {
    beginZoomGesture(pointer, opt.e);
    opt.e.preventDefault();
    opt.e.stopPropagation();
    return;
  }

  // Hand tool panning
  if (currentTool === 'hand' || opt.e.button === 1) {
    isPanning = true;
    lastPanPoint = { x: opt.e.clientX, y: opt.e.clientY };
    canvas.selection = false;
    if (currentTool === 'hand') {
      const area = document.getElementById('canvasArea');
      if (area) area.style.cursor = 'grabbing';
      if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.cursor = 'grabbing';
    }
    return;
  }

  // Drawing tools
  if (['rect', 'circle', 'triangle', 'polygon', 'line', 'arrow'].includes(currentTool)) {
    isDrawingShape = true;
    shapeStart = { x: pointer.x, y: pointer.y };
    canvas.selection = false;
    canvas.discardActiveObject();

    if (currentTool === 'rect') {
      tempShape = new Rect({
        left: pointer.x, top: pointer.y, width: 0, height: 0,
        fill: document.getElementById('fillColor').value,
        stroke: document.getElementById('strokeColor').value,
        strokeWidth: 2,
        strokeUniform: true,
      });
    } else if (currentTool === 'circle') {
      tempShape = new Circle({
        left: pointer.x, top: pointer.y, radius: 0,
        fill: document.getElementById('fillColor').value,
        stroke: document.getElementById('strokeColor').value,
        strokeWidth: 2,
        strokeUniform: true,
        originX: 'center', originY: 'center',
      });
    } else if (currentTool === 'triangle') {
      tempShape = new Triangle({
        left: pointer.x, top: pointer.y, width: 0, height: 0,
        fill: document.getElementById('fillColor').value,
        stroke: document.getElementById('strokeColor').value,
        strokeWidth: 2,
        strokeUniform: true,
      });
    } else if (currentTool === 'polygon') {
      tempShape = new Polygon(createRegularPolygonPoints(6, 1, 1), {
        left: pointer.x, top: pointer.y,
        originX: 'center', originY: 'center',
        fill: document.getElementById('fillColor').value,
        stroke: document.getElementById('strokeColor').value,
        strokeWidth: 2,
        strokeUniform: true,
        _clatashaPolygonSides: 6,
      });
    } else if (currentTool === 'line') {
      tempShape = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: '#000000',
        strokeWidth: 3,
        strokeUniform: true,
      });
    } else if (currentTool === 'arrow') {
      // Use a temporary line only as a live preview. The completed arrow is
      // rebuilt as one Fabric Path, so it becomes one selectable layer.
      tempShape = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: '#000000',
        strokeWidth: 3,
        strokeUniform: true,
        selectable: false,
        evented: false,
        name: '__arrowPreview__',
        excludeFromExport: true,
      });
    }
    if (tempShape) canvas.add(tempShape);
  }

  // Speech bubble tool
  if (currentTool === 'bubble') {
    addSpeechBubble(pointer.x, pointer.y);
    setTool('select');
    return;
  }

  // Text tool
  if (currentTool === 'text') {
    addTextAtPosition(pointer.x, pointer.y);
    setTool('select');
  }

  if (currentTool === 'vertical-text') {
    addVerticalTextAtPosition(pointer.x, pointer.y);
    setTool('select');
  }

  // Eraser tool
  if (currentTool === 'eraser' && opt.target && opt.target.name !== '__bg__') {
    canvas.remove(opt.target);
    saveHistory();
  }
}

function onCanvasMouseMove(opt) {
  if (sliceActive) {
    updateSliceLine(canvas.getPointer(opt.e), opt.e);
    return;
  }

  if (currentTool === 'zoom' && zoomGestureActive) {
    updateZoomGesture(canvas.getPointer(opt.e));
    return;
  }

  if (paintBrushActive) {
    updatePaintBrushCursor(opt.e);
    if (paintBrushDrawing) continuePaintBrushStroke(canvas.getPointer(opt.e), opt.e);
    return;
  }

  if (healingBrushActive) {
    updateHealingBrushCursor(opt.e);
    if (healingBrushDrawing) continueHealingBrushStroke(canvas.getPointer(opt.e));
    return;
  }

  if (cutoutBrushActive) {
    updateCutoutBrushCursor(opt.e);
    if (cutoutBrushDrawing) continueCutoutBrushStroke(canvas.getPointer(opt.e), !!opt.e.altKey);
    return;
  }

  if (isPanning) {
    const dx = opt.e.clientX - lastPanPoint.x;
    const dy = opt.e.clientY - lastPanPoint.y;
    panOffsetX += dx;
    panOffsetY += dy;
    applyCanvasTransform();
    lastPanPoint = { x: opt.e.clientX, y: opt.e.clientY };
    return;
  }

  if (!isDrawingShape || !tempShape) return;
  const pointer = canvas.getPointer(opt.e);

  if (currentTool === 'rect') {
    const left = Math.min(shapeStart.x, pointer.x);
    const top = Math.min(shapeStart.y, pointer.y);
    const width = Math.abs(pointer.x - shapeStart.x);
    const height = Math.abs(pointer.y - shapeStart.y);
    tempShape.set({ left, top, width, height });
  } else if (currentTool === 'circle') {
    const radius = Math.sqrt(Math.pow(pointer.x - shapeStart.x, 2) + Math.pow(pointer.y - shapeStart.y, 2)) / 2;
    const cx = (shapeStart.x + pointer.x) / 2;
    const cy = (shapeStart.y + pointer.y) / 2;
    tempShape.set({ left: cx, top: cy, radius: Math.max(1, radius) });
  } else if (currentTool === 'triangle') {
    const left = Math.min(shapeStart.x, pointer.x);
    const top = Math.min(shapeStart.y, pointer.y);
    tempShape.set({
      left,
      top,
      width: Math.abs(pointer.x - shapeStart.x),
      height: Math.abs(pointer.y - shapeStart.y),
    });
  } else if (currentTool === 'polygon') {
    const width = Math.abs(pointer.x - shapeStart.x);
    const height = Math.abs(pointer.y - shapeStart.y);
    tempShape.set({
      points: createRegularPolygonPoints(tempShape._clatashaPolygonSides || 6, Math.max(1, width), Math.max(1, height)),
      left: (shapeStart.x + pointer.x) / 2,
      top: (shapeStart.y + pointer.y) / 2,
    });
    tempShape.setDimensions();
  } else if (currentTool === 'line' || currentTool === 'arrow') {
    tempShape.set({ x2: pointer.x, y2: pointer.y });
  }

  canvas.renderAll();
}

function onCanvasMouseUp(opt) {
  if (sliceActive) {
    finishSliceLine(canvas.getPointer(opt.e), opt.e);
    return;
  }

  if (currentTool === 'zoom' && zoomGestureActive) {
    finishZoomGesture(canvas.getPointer(opt.e), opt.e);
    return;
  }

  if (paintBrushActive) {
    endPaintBrushStroke(canvas.getPointer(opt.e), opt.e);
    return;
  }

  if (healingBrushActive) {
    endHealingBrushStroke();
    return;
  }

  if (cutoutBrushActive) {
    endCutoutBrushStroke();
    return;
  }

  if (isPanning) {
    isPanning = false;
    canvas.selection = true;
    applyToolCursor(currentTool);
    return;
  }

  if (isDrawingShape && tempShape) {
    isDrawingShape = false;
    if (currentTool === 'arrow') {
      const end = canvas.getPointer(opt.e);
      const color = tempShape.stroke || document.getElementById('strokeColor').value;
      canvas.remove(tempShape);
      const arrow = createArrowPath(shapeStart.x, shapeStart.y, end.x, end.y, color, 3);
      tempShape = null;
      canvas.selection = true;
      if (arrow) {
        canvas.add(arrow);
        canvas.setActiveObject(arrow);
        canvas.requestRenderAll();
        saveHistory();
      }
      // Arrow is a one-shot tool. This prevents a normal follow-up click from
      // leaving another zero-length shaft or duplicate tip behind.
      setTool('select');
      return;
    }
    // Remove tiny accidental shapes
    if (currentTool === 'rect' && tempShape.width < 5 && tempShape.height < 5) {
      canvas.remove(tempShape);
    } else if (currentTool === 'circle' && tempShape.radius < 3) {
      canvas.remove(tempShape);
    } else if (currentTool === 'triangle' && tempShape.width < 5 && tempShape.height < 5) {
      canvas.remove(tempShape);
    } else if (currentTool === 'polygon' && tempShape.width < 5 && tempShape.height < 5) {
      canvas.remove(tempShape);
    } else if (currentTool === 'line' && Math.hypot(tempShape.x2 - tempShape.x1, tempShape.y2 - tempShape.y1) < 5) {
      canvas.remove(tempShape);
    } else {
      tempShape.setCoords();
      canvas.setActiveObject(tempShape);
      saveHistory();
    }
    tempShape = null;
    canvas.selection = true;
  }
}

function createRegularPolygonPoints(sides, width, height) {
  const count = Math.max(3, Math.min(12, Math.round(Number(sides) || 6)));
  const rx = Math.max(0.5, width / 2);
  const ry = Math.max(0.5, height / 2);
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    return { x: Math.cos(angle) * rx, y: Math.sin(angle) * ry };
  });
}

function updateRegularPolygonSides(polygon, sides) {
  if (!polygon || polygon.type !== 'polygon') return;
  const count = Math.max(3, Math.min(12, Math.round(Number(sides) || 6)));
  const center = polygon.getCenterPoint();
  const scaledWidth = polygon.getScaledWidth();
  const scaledHeight = polygon.getScaledHeight();
  polygon.set({
    points: createRegularPolygonPoints(count, Math.max(1, polygon.width), Math.max(1, polygon.height)),
    _clatashaPolygonSides: count,
  });
  polygon.setDimensions();
  polygon.set({
    scaleX: polygon.width ? scaledWidth / polygon.width : polygon.scaleX,
    scaleY: polygon.height ? scaledHeight / polygon.height : polygon.scaleY,
  });
  polygon.setPositionByOrigin(center, 'center', 'center');
  polygon.dirty = true;
  polygon.setCoords();
}

function createArrowPath(x1, y1, x2, y2, color, shaftWidth = 3) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 6) return null;

  const headLength = Math.min(28, Math.max(14, length * 0.22));
  const headWidth = Math.min(24, Math.max(12, headLength * 0.8));
  const shaftHalf = Math.max(1, shaftWidth / 2);
  const headBase = Math.max(shaftWidth * 2, length - headLength);
  const pathData = [
    `M 0 ${-shaftHalf}`,
    `L ${headBase} ${-shaftHalf}`,
    `L ${headBase} ${-headWidth / 2}`,
    `L ${length} 0`,
    `L ${headBase} ${headWidth / 2}`,
    `L ${headBase} ${shaftHalf}`,
    `L 0 ${shaftHalf}`,
    'Z',
  ].join(' ');

  return new Path(pathData, {
    left: x1,
    top: y1,
    originX: 'left',
    originY: 'center',
    angle: Math.atan2(dy, dx) * 180 / Math.PI,
    fill: color || '#000000',
    stroke: '',
    strokeWidth: 0,
    strokeUniform: true,
    name: 'Arrow',
    _clatashaArrow: true,
  });
}

// ===== OBJECT SELECTION / PROPERTIES =====
function updateGroupingMenuState(obj = canvas?.getActiveObject?.()) {
  const groupButton = document.getElementById('menuGroup');
  const ungroupButton = document.getElementById('menuUngroup');
  const createClippingButton = document.getElementById('menuCreateClippingMask');
  const releaseClippingButton = document.getElementById('menuReleaseClippingMask');
  const selected = canvas?.getActiveObjects?.() || [];
  const hasClippingLink = selected.some(item => isClippingBase(item) || isClippedLayer(item));
  if (groupButton) groupButton.disabled = !(isActiveSelectionObject(obj) && obj.getObjects && obj.getObjects().length >= 2) || hasClippingLink;
  if (ungroupButton) ungroupButton.disabled = !isUserGroup(obj) || hasClippingLink;
  if (createClippingButton) createClippingButton.disabled = !getClippingPair(selected);
  if (releaseClippingButton) releaseClippingButton.disabled = !selected.some(item => isClippingBase(item) || isClippedLayer(item));
}

function getRightPanelScroller(tabId) {
  if (tabId === 'layers') return document.getElementById('layersList');
  return document.querySelector('[data-panel-view="' + tabId + '"]');
}

function isRightPanelTabActive(tabId) {
  return activeRightPanelTab === tabId;
}

function activateRightPanelTab(tabId, options = {}) {
  const nextTab = RIGHT_PANEL_TABS.includes(tabId) ? tabId : 'layers';
  const currentScroller = getRightPanelScroller(activeRightPanelTab);
  if (currentScroller) rightPanelScrollPositions[activeRightPanelTab] = currentScroller.scrollTop;

  document.querySelectorAll('[data-panel-tab]').forEach(button => {
    const active = button.dataset.panelTab === nextTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });

  document.querySelectorAll('[data-panel-view]').forEach(view => {
    const active = view.dataset.panelView === nextTab;
    view.classList.toggle('active', active);
    view.hidden = !active;
  });

  activeRightPanelTab = nextTab;
  const nextScroller = getRightPanelScroller(nextTab);
  if (nextScroller) nextScroller.scrollTop = rightPanelScrollPositions[nextTab] || 0;

  if (options.persist !== false) {
    try { localStorage.setItem(RIGHT_PANEL_TAB_STORAGE_KEY, nextTab); } catch (_) {}
  }
  if (options.focus) document.querySelector('[data-panel-tab="' + nextTab + '"]')?.focus();
}

function setupRightPanelTabs() {
  const tabBar = document.querySelector('.panel-tab-bar');
  if (!tabBar) return;

  tabBar.addEventListener('click', event => {
    const button = event.target.closest('[data-panel-tab]');
    if (button) activateRightPanelTab(button.dataset.panelTab);
  });

  tabBar.addEventListener('keydown', event => {
    const button = event.target.closest('[data-panel-tab]');
    if (!button) return;
    const index = RIGHT_PANEL_TABS.indexOf(button.dataset.panelTab);
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % RIGHT_PANEL_TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + RIGHT_PANEL_TABS.length) % RIGHT_PANEL_TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = RIGHT_PANEL_TABS.length - 1;
    else return;
    event.preventDefault();
    activateRightPanelTab(RIGHT_PANEL_TABS[nextIndex], { focus: true });
  });

  let savedTab = 'layers';
  try { savedTab = localStorage.getItem(RIGHT_PANEL_TAB_STORAGE_KEY) || 'layers'; } catch (_) {}
  activateRightPanelTab(savedTab, { persist: false });
  updateAdjustmentsAvailability(null);
}

function getLayerAppearanceTargets() {
  if (!canvas) return [];
  const selected = canvas.getActiveObjects ? canvas.getActiveObjects() : [];
  return selected.filter(obj => obj && !isInternalEditorObject(obj));
}

function getLayerOpacity(obj) {
  const opacity = Number(obj?.opacity);
  return Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
}

function updateLayerOpacitySliderVisual(percent, label = null) {
  const slider = document.getElementById('layersOpacitySlider');
  const output = document.getElementById('layersOpacitySliderValue');
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  if (slider) {
    slider.value = String(Math.round(value));
    slider.style.setProperty('--opacity-level', `${value}%`);
  }
  if (output) output.textContent = label ?? `${Math.round(value)}%`;
}

function openLayerOpacityPopover() {
  const opacity = document.getElementById('layersOpacity');
  const popover = document.getElementById('layersOpacityPopover');
  const disclosure = document.getElementById('layersOpacityDisclosure');
  if (!opacity || opacity.disabled || !popover || !disclosure) return;
  popover.hidden = false;
  disclosure.setAttribute('aria-expanded', 'true');
}

function closeLayerOpacityPopover(options = {}) {
  const popover = document.getElementById('layersOpacityPopover');
  const disclosure = document.getElementById('layersOpacityDisclosure');
  if (!popover || popover.hidden) return;
  popover.hidden = true;
  disclosure?.setAttribute('aria-expanded', 'false');
  if (options.focus) disclosure?.focus();
}

function syncLayerAppearanceControls() {
  const blend = document.getElementById('layersBlendMode');
  const opacity = document.getElementById('layersOpacity');
  const slider = document.getElementById('layersOpacitySlider');
  const disclosure = document.getElementById('layersOpacityDisclosure');
  if (!blend || !opacity || !slider || !disclosure) return;
  const targets = getLayerAppearanceTargets();
  const hasSelection = targets.length > 0;
  blend.disabled = !hasSelection;
  opacity.disabled = !hasSelection;
  slider.disabled = !hasSelection;
  disclosure.disabled = !hasSelection;
  if (!hasSelection) {
    blend.value = 'source-over';
    opacity.value = '100';
    opacity.placeholder = 'Opacity';
    updateLayerOpacitySliderVisual(100);
    closeLayerOpacityPopover();
    return;
  }

  const firstBlend = targets[0].globalCompositeOperation || 'source-over';
  const sharedBlend = targets.every(obj => (obj.globalCompositeOperation || 'source-over') === firstBlend);
  blend.value = sharedBlend ? firstBlend : '';

  const firstOpacity = Math.round(getLayerOpacity(targets[0]) * 100);
  const sharedOpacity = targets.every(obj => Math.round(getLayerOpacity(obj) * 100) === firstOpacity);
  opacity.value = sharedOpacity ? String(firstOpacity) : '';
  opacity.placeholder = sharedOpacity ? 'Opacity' : 'Mixed';
  updateLayerOpacitySliderVisual(firstOpacity, sharedOpacity ? `${firstOpacity}%` : 'Mixed');
}

function applyLayerAppearance(property, value, commitHistory = false) {
  const targets = getLayerAppearanceTargets();
  if (!targets.length) return;
  targets.forEach(obj => {
    obj.set(property, value);
    obj.dirty = true;
    syncEditedClippingBase(obj);
  });
  canvas.requestRenderAll();
  syncLayerAppearanceControls();
  if (!commitHistory) return;
  const active = canvas.getActiveObject();
  if (active && !isActiveSelectionObject(active)) updatePropertiesPanel(active);
  saveHistory();
}

function setupLayerAppearanceControls() {
  const blend = document.getElementById('layersBlendMode');
  const opacity = document.getElementById('layersOpacity');
  const picker = document.getElementById('layersOpacityPicker');
  const disclosure = document.getElementById('layersOpacityDisclosure');
  const slider = document.getElementById('layersOpacitySlider');
  if (!blend || !opacity || !picker || !disclosure || !slider) return;

  blend.addEventListener('change', () => {
    if (!blend.value) return;
    applyLayerAppearance('globalCompositeOperation', blend.value, true);
  });
  opacity.addEventListener('input', () => {
    if (opacity.value === '') return;
    const percent = Math.max(0, Math.min(100, Number(opacity.value)));
    if (!Number.isFinite(percent)) return;
    applyLayerAppearance('opacity', percent / 100, false);
  });
  opacity.addEventListener('change', () => {
    if (opacity.value === '') {
      syncLayerAppearanceControls();
      return;
    }
    const percent = Math.max(0, Math.min(100, Number(opacity.value)));
    if (!Number.isFinite(percent)) return;
    opacity.value = String(Math.round(percent));
    applyLayerAppearance('opacity', percent / 100, true);
  });
  opacity.addEventListener('click', openLayerOpacityPopover);
  disclosure.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const popover = document.getElementById('layersOpacityPopover');
    if (popover?.hidden) openLayerOpacityPopover();
    else closeLayerOpacityPopover();
  });
  slider.addEventListener('input', () => {
    const percent = Math.max(0, Math.min(100, Number(slider.value)));
    opacity.value = String(Math.round(percent));
    applyLayerAppearance('opacity', percent / 100, false);
  });
  slider.addEventListener('change', () => {
    const percent = Math.max(0, Math.min(100, Number(slider.value)));
    opacity.value = String(Math.round(percent));
    applyLayerAppearance('opacity', percent / 100, true);
  });
  document.addEventListener('pointerdown', event => {
    if (!picker.contains(event.target)) closeLayerOpacityPopover();
  }, true);
  document.addEventListener('keydown', event => {
    const popover = document.getElementById('layersOpacityPopover');
    if (event.key !== 'Escape' || !popover || popover.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    closeLayerOpacityPopover({ focus: true });
  }, true);
  syncLayerAppearanceControls();
}

function updateAdjustmentsAvailability(obj) {
  const panel = document.getElementById('filtersPanel');
  if (!panel) return;
  const available = obj?.type === 'image';
  panel.classList.toggle('adjustments-unavailable', !available);
  panel.querySelectorAll('[data-requires-image]').forEach(control => {
    control.disabled = !available;
  });
}

function onObjectSelected(obj) {
  if (adjustmentPresetPreview && adjustmentPresetPreview.object !== obj) endAdjustmentPresetPreview();
  activeObject = obj;
  configureClatashaObjectControls(obj);
  scheduleWorkspaceTransformOverlay();
  updateToolbarPaintAvailability(obj);
  syncStateFromObject(obj);
  // Skip panel rebuild during curve drag — it would destroy the slider mid-drag
  if (!isApplyingCurve) updatePropertiesPanel(obj);
  document.getElementById('menuDelete').disabled = false;
  updateGroupingMenuState(obj);

  updateAdjustmentsAvailability(obj);
  if (obj.type === 'image') updateFilterSliders(obj);

  updateLayersList();
  syncLayerAppearanceControls();
}

// Sync _shadowState and _gradState from the selected object's current properties
function syncStateFromObject(obj) {
  // Sync shadow state
  const sh = obj.shadow;
  if (sh) {
    _shadowState.blur = sh.blur || 0;
    _shadowState.offsetX = sh.offsetX || 0;
    _shadowState.offsetY = sh.offsetY || 0;
    if (sh.color) {
      if (sh.color.startsWith('#')) {
        _shadowState.color = sh.color;
      } else {
        const m = sh.color.match(/rgba?\(\d+,\s*\d+,\s*\d+/);
        if (m) _shadowState.color = '#' + [m[1],m[2],m[3]].map(x => parseInt(x).toString(16).padStart(2,'0')).join('');
        else _shadowState.color = '#000000';
      }
    }
  }

  // Sync gradient state
  const fill = obj.fill;
  if (fill && typeof fill === 'object' && fill.colorStops) {
    const cs = fill.colorStops;
    if (cs.length >= 2) {
      _gradState.c1 = cs[0].color || '#7C3AED';
      _gradState.c2 = cs[cs.length - 1].color || '#EC4899';
    }
    if (fill.coords) {
      const c = fill.coords;
      let gradAngle = Math.round(Math.atan2(c.y2 - c.y1, c.x2 - c.x1) * 180 / Math.PI);
      if (gradAngle < 0) gradAngle += 360;
      _gradState.angle = gradAngle;
    }
  } else if (typeof fill === 'string') {
    _gradState.c1 = fill;
  }
}

// Live update position/size fields in properties panel during drag/resize
function liveUpdatePositionFields(obj) {
  const xInput = document.querySelector('[data-prop="left"]');
  const yInput = document.querySelector('[data-prop="top"]');
  const wInput = document.querySelector('[data-scale="width"]');
  const hInput = document.querySelector('[data-scale="height"]');
  if (xInput) xInput.value = Math.round(obj.left);
  if (yInput) yInput.value = Math.round(obj.top);
  try {
    if (wInput) wInput.value = Math.round(obj.getScaledWidth());
    if (hInput) hInput.value = Math.round(obj.getScaledHeight());
  } catch(e) {
    if (wInput) wInput.value = Math.round(obj.width * (obj.scaleX || 1));
    if (hInput) hInput.value = Math.round(obj.height * (obj.scaleY || 1));
  }
}

// Smart snapping lines
const SNAP_SCREEN_THRESHOLD = 6;
let snapLinesH = null;
let snapLinesV = null;
let snapDragState = { object: null, x: null, y: null };

function initSnapLines() {
  const wrapper = document.getElementById('canvasWrapper');
  snapLinesH = document.createElement('div');
  snapLinesH.className = 'snap-line snap-line-h';
  snapLinesH.style.display = 'none';
  wrapper.appendChild(snapLinesH);
  snapLinesV = document.createElement('div');
  snapLinesV.className = 'snap-line snap-line-v';
  snapLinesV.style.display = 'none';
  wrapper.appendChild(snapLinesV);
}

function getObjectBounds(obj) {
  const rect = obj.getBoundingRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
  };
}

function uniqueSnapTargets(values) {
  const seen = new Set();
  return values.filter(value => {
    const rounded = Math.round(value * 100) / 100;
    if (seen.has(rounded)) return false;
    seen.add(rounded);
    return true;
  });
}

function getSnapExcludedObjects(obj) {
  const excluded = new Set();
  const addObjectBranch = item => {
    if (!item || excluded.has(item)) return;
    excluded.add(item);
    if (isActiveSelectionObject(item) && item.getObjects) {
      item.getObjects().forEach(addObjectBranch);
    }
  };

  addObjectBranch(obj);
  let parent = obj?.group;
  while (parent) {
    excluded.add(parent);
    parent = parent.group;
  }
  return excluded;
}

function getSnapTargets(obj) {
  const xTargets = [0, CANVAS_W / 2, CANVAS_W];
  const yTargets = [0, CANVAS_H / 2, CANVAS_H];

  if (showGuides) {
    xTargets.push(...userGuides.vertical);
    yTargets.push(...userGuides.horizontal);
  }

  // A child being edited inside a group must not snap to its own parent. The
  // parent contains the child, so treating its bounds as an external target
  // makes the child repeatedly pull toward the group edge while it is dragged.
  const excludedObjects = getSnapExcludedObjects(obj);
  canvas.getObjects().forEach(other => {
    if (excludedObjects.has(other) || other.name === '__bg__' || other.visible === false) return;
    const bounds = getObjectBounds(other);
    xTargets.push(bounds.left, bounds.centerX, bounds.right);
    yTargets.push(bounds.top, bounds.centerY, bounds.bottom);
  });

  return {
    x: uniqueSnapTargets(xTargets),
    y: uniqueSnapTargets(yTargets),
  };
}

function findClosestSnap(anchors, targets, threshold) {
  let best = null;
  anchors.forEach((anchor, anchorIndex) => {
    targets.forEach(target => {
      const delta = target - anchor;
      const distance = Math.abs(delta);
      if (distance <= threshold && (!best || distance < best.distance)) {
        best = { delta, target, distance, anchorIndex };
      }
    });
  });
  return best;
}

function resetSnapDragState() {
  snapDragState = { object: null, x: null, y: null };
}

function sceneDeltaToParentDelta(obj, deltaX, deltaY) {
  const parent = obj?.group;
  if (!parent || isActiveSelectionObject(parent) || !parent.calcTransformMatrix) {
    return { x: deltaX, y: deltaY };
  }

  try {
    const inverse = fabric.util.invertTransform(parent.calcTransformMatrix());
    const origin = fabric.util.transformPoint(new fabric.Point(0, 0), inverse);
    const moved = fabric.util.transformPoint(new fabric.Point(deltaX, deltaY), inverse);
    return { x: moved.x - origin.x, y: moved.y - origin.y };
  } catch (e) {
    return { x: deltaX, y: deltaY };
  }
}

function applySceneSnapDelta(obj, deltaX, deltaY) {
  if (Math.abs(deltaX) < 0.0001 && Math.abs(deltaY) < 0.0001) return;
  const localDelta = sceneDeltaToParentDelta(obj, deltaX, deltaY);
  obj.set({
    left: (obj.left || 0) + localDelta.x,
    top: (obj.top || 0) + localDelta.y,
  });
  let parent = obj.group;
  while (parent) {
    parent.dirty = true;
    parent = parent.group;
  }
  obj.setCoords();
}

function previewObjectSnap(obj) {
  if (!obj || obj.name === '__bg__') return;
  const bounds = getObjectBounds(obj);

  if (snapDragState.object !== obj) {
    resetSnapDragState();
    snapDragState.object = obj;
  }

  const targets = getSnapTargets(obj);
  const threshold = SNAP_SCREEN_THRESHOLD / Math.max(zoomLevel, MIN_ZOOM);
  const xAnchors = [bounds.left, bounds.centerX, bounds.right];
  const yAnchors = [bounds.top, bounds.centerY, bounds.bottom];
  const snapX = findClosestSnap(xAnchors, targets.x, threshold);
  const snapY = findClosestSnap(yAnchors, targets.y, threshold);

  // Only preview the alignment during movement. Changing the Fabric object on
  // every mouse event creates a second competing drag position and can look
  // like a flickering shadow. The final correction is applied once on release.
  snapDragState.x = snapX;
  snapDragState.y = snapY;

  if (snapLinesV) {
    snapLinesV.style.left = snapX ? snapX.target + 'px' : '';
    snapLinesV.style.display = snapX ? 'block' : 'none';
  }
  if (snapLinesH) {
    snapLinesH.style.top = snapY ? snapY.target + 'px' : '';
    snapLinesH.style.display = snapY ? 'block' : 'none';
  }
}

function commitObjectSnap(obj) {
  if (!obj || snapDragState.object !== obj) return false;
  const bounds = getObjectBounds(obj);
  const xAnchors = [bounds.left, bounds.centerX, bounds.right];
  const yAnchors = [bounds.top, bounds.centerY, bounds.bottom];
  const threshold = SNAP_SCREEN_THRESHOLD / Math.max(zoomLevel, MIN_ZOOM);
  const snapX = snapDragState.x;
  const snapY = snapDragState.y;
  const deltaX = snapX && Math.abs(snapX.target - xAnchors[snapX.anchorIndex]) <= threshold
    ? snapX.target - xAnchors[snapX.anchorIndex]
    : 0;
  const deltaY = snapY && Math.abs(snapY.target - yAnchors[snapY.anchorIndex]) <= threshold
    ? snapY.target - yAnchors[snapY.anchorIndex]
    : 0;
  if (Math.abs(deltaX) < 0.0001 && Math.abs(deltaY) < 0.0001) return false;
  applySceneSnapDelta(obj, deltaX, deltaY);
  return true;
}

function hideSnapLines() {
  if (snapLinesH) snapLinesH.style.display = 'none';
  if (snapLinesV) snapLinesV.style.display = 'none';
}

function onObjectDeselected() {
  // If the user is clicking a slider/input in the panel, keep the properties
  // panel showing the last object so sliders remain usable.
  if (!panelInteracting) {
    endAdjustmentPresetPreview();
    activeObject = null;
    document.getElementById('propertiesContent').innerHTML = '<div class="empty-state">Select an object to edit</div>';
    updateAdjustmentsAvailability(null);
    updateFilterSliders(null);
    updateToolbarPaintAvailability(null);
  } else {
    updateToolbarPaintAvailability(activeObject);
    updateAdjustmentsAvailability(activeObject);
  }
  hideSnapLines();
  scheduleWorkspaceTransformOverlay();
  document.getElementById('menuDelete').disabled = true;
  updateGroupingMenuState(null);
  syncLayerAppearanceControls();
}

function updateToolbarPaintAvailability(obj) {
  const fillInput = document.getElementById('fillColor');
  const strokeInput = document.getElementById('strokeColor');
  const fillWrapper = fillInput?.closest('.color-pick-wrapper');
  const strokeWrapper = strokeInput?.closest('.color-pick-wrapper');
  const isImage = obj?.type === 'image';
  const isAggregate = isActiveSelectionObject(obj) || isUserGroup(obj);

  if (fillInput && fillWrapper) {
    fillInput.disabled = isImage || isAggregate;
    fillWrapper.classList.toggle('disabled', isImage || isAggregate);
    fillWrapper.title = isImage ? 'Fill Color is not available for images' : (isAggregate ? 'Edit colors on the individual layers' : 'Fill Color');
  }
  if (strokeInput) strokeInput.disabled = isAggregate;
  if (strokeWrapper) {
    strokeWrapper.classList.toggle('disabled', isAggregate);
    strokeWrapper.title = isImage ? 'Image Outline Color' : (isAggregate ? 'Edit outlines on the individual layers' : 'Stroke Color');
  }

  if (isImage && strokeInput) {
    const outlineColor = getImageOutlineColor(obj);
    if (/^#[0-9a-f]{6}$/i.test(outlineColor)) {
      strokeInput.value = outlineColor;
      document.getElementById('strokePreview').style.background = outlineColor;
    }
  }
}

// ===== CURVED TEXT =====

// Propagate visual properties (fill/stroke/shadow) from a curved text group
// to its child Text objects. Call after any visual property change.
function propagateToChildren(obj) {
  if (obj.type === 'group' && obj._clatashaCurve !== undefined) {
    obj.getObjects().forEach(c => {
      c.set({ fill: obj.fill, stroke: obj.stroke, strokeWidth: obj.strokeWidth, shadow: obj.shadow });
    });
  }
}

function colorsEqual(colorA, colorB) {
  if (!colorA || !colorB || typeof colorA !== 'string' || typeof colorB !== 'string') return false;
  try {
    return new fabric.Color(colorA).toHexa() === new fabric.Color(colorB).toHexa();
  } catch (e) {
    return colorA.toLowerCase() === colorB.toLowerCase();
  }
}

function visitVectorAssetObjects(obj, callback) {
  if (obj.type === 'group' && typeof obj.getObjects === 'function') {
    obj.getObjects().forEach(child => visitVectorAssetObjects(child, callback));
    return;
  }
  callback(obj);
}

function applyVectorAssetColor(obj, colorIndex, newColor) {
  const slots = obj?._clatashaVectorColors;
  const slot = Array.isArray(slots) ? slots[colorIndex] : null;
  if (!slot) return;

  const previousColor = slot.current || slot.source;
  visitVectorAssetObjects(obj, child => {
    if (colorsEqual(child.fill, previousColor)) {
      child.set('fill', newColor);
      child.dirty = true;
    }
    if (colorsEqual(child.stroke, previousColor)) {
      child.set('stroke', newColor);
      child.dirty = true;
    }
  });

  slot.current = newColor;
  if (colorIndex === 0) obj.set('fill', newColor);
  obj.dirty = true;
  obj.setCoords();
  canvas.renderAll();
}

function createCurvedTextGroup(text, style, curveAmount) {
  const n = text.length;
  if (n === 0) return null;

  // Measure character widths using a temp canvas
  const tmpCanvas = document.createElement('canvas');
  const tmpCtx = tmpCanvas.getContext('2d');
  const fontStr = (style.fontStyle || 'normal') + ' ' + (style.fontWeight || 'normal') + ' ' + style.fontSize + 'px ' + style.fontFamily;
  tmpCtx.font = fontStr;

  const spacing = ((style.charSpacing || 0) * style.fontSize) / 1000;
  const charWidths = [];
  let totalWidth = 0;
  for (let i = 0; i < n; i++) {
    const w = tmpCtx.measureText(text[i]).width + spacing;
    charWidths.push(w);
    totalWidth += w;
  }
  if (totalWidth < 1) return null;

  // Arc parameters: curveAmount -100..100 maps to ±144° total arc (very dramatic)
  // Positive = smile (middle highest), Negative = frown (middle lowest)
  // Use absCurve for angle math to prevent negative values from flipping text
  const absCurve = Math.abs(curveAmount);
  const sign = curveAmount >= 0 ? 1 : -1;
  const halfAngle = (absCurve / 100) * (Math.PI * 0.4);
  const radius = halfAngle > 0.001 ? (totalWidth / 2) / Math.sin(halfAngle) : 999999;

  const chars = [];
  let xAccum = 0;
  for (let i = 0; i < n; i++) {
    const charCenter = xAccum + charWidths[i] / 2;
    const t = totalWidth > 0 ? charCenter / totalWidth : 0.5;
    const angle = -halfAngle + 2 * halfAngle * t;
    const x = radius * Math.sin(angle);
    // sign controls direction: positive=smile (ends go down), negative=frown (ends go up)
    const y = sign * radius * (1 - Math.cos(angle));
    // Rotate each character to 50% of the tangent angle, with sign for direction
    const rotation = sign * angle * 180 / Math.PI * 0.5;

    const charObj = new Text(text[i], {
      left: x, top: y,
      fontSize: style.fontSize, fontFamily: style.fontFamily,
      fill: style.fill,
      stroke: style.stroke || null, strokeWidth: style.strokeWidth || 0,
      fontWeight: style.fontWeight, fontStyle: style.fontStyle,
      originX: 'center', originY: 'center',
      angle: rotation, selectable: false, evented: false,
      name: '__curvedChar__',
    });
    if (style.shadow) {
      const s = style.shadow;
      charObj.set('shadow', new Shadow(typeof s === 'object' && s.color ? s : { color: '#000', blur: 6, offsetX: 2, offsetY: 2 }));
    }
    chars.push(charObj);
    xAccum += charWidths[i];
  }
  return new Group(chars);
}

function applyCurve(obj, curveAmount, saveHist = true) {
  const isTextbox = obj.type === 'textbox';
  const isCurved = obj.type === 'group' && obj._clatashaCurve !== undefined;
  if (!isTextbox && !isCurved) return;

  // Get source data
  let text, style, left, top, ox, oy, sx, sy, ang, name;

  if (isTextbox) {
    text = obj.text;
    style = {
      fontSize: obj.fontSize, fontFamily: obj.fontFamily, fill: obj.fill,
      stroke: obj.stroke, strokeWidth: obj.strokeWidth || 0,
      fontWeight: obj.fontWeight, fontStyle: obj.fontStyle,
      charSpacing: obj.charSpacing || 0,
      shadow: obj.shadow ? (typeof obj.shadow === 'object' ? { ...obj.shadow } : null) : null,
    };
    left = obj.left; top = obj.top; ox = obj.originX; oy = obj.originY;
    sx = obj.scaleX; sy = obj.scaleY; ang = obj.angle; name = obj.name;
  } else {
    text = obj._clatashaText;
    style = obj._clatashaStyle;
    left = obj.left; top = obj.top; ox = obj.originX; oy = obj.originY;
    sx = obj.scaleX; sy = obj.scaleY; ang = obj.angle; name = obj.name;
  }

  const idx = canvas.getObjects().indexOf(obj);
  const clippingRole = obj._clatashaClipRole;
  const clippingId = obj._clatashaClipId;

  // Suppress panel/layers rebuild during curve drag to avoid destroying the slider
  isApplyingCurve = true;
  canvas.discardActiveObject();

  let replacement;
  if (Math.abs(curveAmount) < 1) {
    // Convert back to textbox
    const tb = new Textbox(text, {
      ...style, left, top, originX: ox, originY: oy,
      scaleX: sx, scaleY: sy, angle: ang, name,
    });
    if (style.shadow) tb.set('shadow', new Shadow(style.shadow));
    replacement = tb;
  } else {
    // Create or recreate curved text group
    const group = createCurvedTextGroup(text, style, curveAmount);
    if (!group) { isApplyingCurve = false; return; }
    group.set({
      left, top, originX: ox, originY: oy,
      scaleX: sx, scaleY: sy, angle: ang, name,
      _clatashaCurve: curveAmount, _clatashaText: text, _clatashaStyle: style,
    });
    replacement = group;
  }
  if (clippingRole && clippingId) {
    replacement._clatashaClipRole = clippingRole;
    replacement._clatashaClipId = clippingId;
  }
  restoringClippingState = true;
  canvas.remove(obj);
  canvas.insertAt(Math.max(1, idx), replacement);
  restoringClippingState = false;
  if (clippingRole === 'base') {
    refreshClippingMasksForBase(replacement);
  } else if (clippingRole === 'content') {
    const base = getClippingBase(clippingId);
    if (base) buildClippingPath(base).then(clipPath => {
      replacement.set('clipPath', clipPath);
      canvas.requestRenderAll();
    });
    else clearClippingMetadata(replacement, true);
  }
  canvas.setActiveObject(replacement);
  canvas.renderAll();
  isApplyingCurve = false;

  if (saveHist) {
    saveHistory();
    updateLayersList();
    updatePropertiesPanel(canvas.getActiveObject());
  }
}

function updatePropertiesPanel(obj) {
  if (!obj) return;
  const panel = document.getElementById('propertiesContent');

  if (obj.name === '__bg__') {
    panel.innerHTML = '<div class="empty-state">Background — change fill color above</div>';
    return;
  }

  if (isActiveSelectionObject(obj)) {
    const count = obj.getObjects ? obj.getObjects().length : 0;
    const canDistribute = count >= 3;
    const canClip = !!getClippingPair(obj.getObjects ? obj.getObjects() : []);
    const hasClippingLink = obj.getObjects && obj.getObjects().some(item => isClippingBase(item) || isClippedLayer(item));
    panel.innerHTML =
      '<div class="prop-group"><div class="prop-group-title">Selected Objects</div>' +
        '<div class="selection-summary">' + count + ' layers selected</div>' +
        (canClip ? '<button class="prop-btn group-wide-btn" data-clipping-action="create">Create Clipping Mask <span>Ctrl+Alt+G</span></button>' : '') +
        (!hasClippingLink ? '<button class="prop-btn group-wide-btn" data-arrange="group">Group Layers <span>Ctrl+G</span></button>' :
          '<button class="prop-btn group-wide-btn" data-clipping-action="release">Release Clipping Mask</button>') +
      '</div>' +
      '<div class="prop-group"><div class="prop-group-title">Align &amp; Distribute</div>' +
        '<div class="prop-row"><span class="prop-label">Relative to</span><div class="prop-btn-row" style="flex:1">' +
          '<button class="prop-btn ' + (arrangeReference === 'selection' ? 'active' : '') + '" data-align-reference="selection">Selection</button>' +
          '<button class="prop-btn ' + (arrangeReference === 'canvas' ? 'active' : '') + '" data-align-reference="canvas">Canvas</button>' +
        '</div></div>' +
        '<div class="arrange-label">Horizontal alignment</div>' +
        '<div class="arrange-grid arrange-grid-three">' +
          '<button class="prop-btn" data-arrange="left" title="Align left edges">Left</button>' +
          '<button class="prop-btn" data-arrange="centerX" title="Align horizontal centers">Center</button>' +
          '<button class="prop-btn" data-arrange="right" title="Align right edges">Right</button>' +
        '</div>' +
        '<div class="arrange-label">Vertical alignment</div>' +
        '<div class="arrange-grid arrange-grid-three">' +
          '<button class="prop-btn" data-arrange="top" title="Align top edges">Top</button>' +
          '<button class="prop-btn" data-arrange="centerY" title="Align vertical centers">Middle</button>' +
          '<button class="prop-btn" data-arrange="bottom" title="Align bottom edges">Bottom</button>' +
        '</div>' +
        '<div class="arrange-label">Distribution</div>' +
        '<div class="arrange-grid arrange-grid-two">' +
          '<button class="prop-btn" data-arrange="distributeCenterX" ' + (canDistribute ? '' : 'disabled') + ' title="Distribute horizontal centers">H Centers</button>' +
          '<button class="prop-btn" data-arrange="distributeCenterY" ' + (canDistribute ? '' : 'disabled') + ' title="Distribute vertical centers">V Centers</button>' +
          '<button class="prop-btn" data-arrange="distributeGapX" ' + (canDistribute ? '' : 'disabled') + ' title="Create equal horizontal gaps">H Gaps</button>' +
          '<button class="prop-btn" data-arrange="distributeGapY" ' + (canDistribute ? '' : 'disabled') + ' title="Create equal vertical gaps">V Gaps</button>' +
        '</div>' +
        '<div class="arrange-hint">Distribution requires at least three selected layers.</div>' +
      '</div>';
    return;
  }
  if (obj.type === 'image') ensureImageOutlineMetadata(obj);

  // Safe width/height (lines don't have traditional dimensions)
  let objW = 0, objH = 0;
  try { objW = Math.round(obj.getScaledWidth()); } catch(e) { objW = Math.round(obj.width * (obj.scaleX || 1)); }
  try { objH = Math.round(obj.getScaledHeight()); } catch(e) { objH = Math.round(obj.height * (obj.scaleY || 1)); }

  let html = '';

  // Position
  html += '<div class="prop-group"><div class="prop-group-title">Position</div>' +
    '<div class="prop-row"><span class="prop-label">X</span><input class="prop-input prop-input-sm" type="number" data-prop="left" value="' + Math.round(obj.left) + '"><span class="prop-label">Y</span><input class="prop-input prop-input-sm" type="number" data-prop="top" value="' + Math.round(obj.top) + '"></div>' +
  '</div>';

  // Size
  html += '<div class="prop-group"><div class="prop-group-title">Size</div>' +
    '<div class="prop-row"><span class="prop-label">W</span><input class="prop-input prop-input-sm" type="number" data-scale="width" value="' + objW + '"><span class="prop-label">H</span><input class="prop-input prop-input-sm" type="number" data-scale="height" value="' + objH + '"></div>' +
    (obj.type === 'rect' ? '<div class="prop-slider-row"><label>Corner Radius</label><input type="range" data-prop="rx" data-suffix="px" min="0" max="100" value="' + Math.round(obj.rx || 0) + '"><span class="slider-val">' + Math.round(obj.rx || 0) + 'px</span></div>' : '') +
    (obj.type === 'polygon' && obj._clatashaPolygonSides ? '<div class="prop-slider-row"><label>Sides</label><input type="range" data-polygon-sides min="3" max="12" step="1" value="' + Math.round(obj._clatashaPolygonSides) + '"><span class="slider-val">' + Math.round(obj._clatashaPolygonSides) + '</span></div>' : '') +
  '</div>';

  // Rotation, opacity & compositing
  const currentBlendMode = obj.globalCompositeOperation || 'source-over';
  const currentOpacity = getLayerOpacity(obj);
  const blendOptions = BLEND_MODES.map(([label, value]) =>
    '<option value="' + value + '" ' + (currentBlendMode === value ? 'selected' : '') + '>' + label + '</option>'
  ).join('');
  html += '<div class="prop-group"><div class="prop-group-title">Appearance</div>' +
    '<div class="prop-slider-row"><label>Rotation</label><input type="range" data-prop="angle" data-suffix="\u00B0" min="0" max="360" value="' + Math.round(obj.angle || 0) + '"><span class="slider-val">' + Math.round(obj.angle || 0) + '\u00B0</span></div>' +
    '<div class="prop-slider-row"><label>Opacity</label><input type="range" data-prop="opacity" data-divide="100" data-suffix="%" min="0" max="100" value="' + Math.round(currentOpacity * 100) + '"><span class="slider-val">' + Math.round(currentOpacity * 100) + '%</span></div>' +
    '<div class="prop-row"><span class="prop-label">Blend</span><select class="prop-input" data-prop="globalCompositeOperation">' + blendOptions + '</select></div>' +
    '<div class="appearance-hint">Blend modes combine this layer with the layers beneath it.</div>' +
  '</div>';

  if (isClippingBase(obj) || isClippedLayer(obj)) {
    const base = isClippingBase(obj) ? obj : getClippingBase(obj);
    const baseName = base ? getLayerPresentation(base).name : 'frame';
    const status = isClippingBase(obj)
      ? getClippedLayers(obj).length + ' layer' + (getClippedLayers(obj).length === 1 ? '' : 's') + ' clipped to this frame'
      : 'Clipped to ' + baseName;
    html += '<div class="prop-group"><div class="prop-group-title">Clipping Mask</div>' +
      '<div class="selection-summary">' + escapeHtml(status) + '</div>' +
      '<button class="prop-btn group-wide-btn" data-clipping-action="release">Release Clipping Mask</button>' +
    '</div>';
  }

  if (isUserGroup(obj)) {
    html += '<div class="prop-group"><div class="prop-group-title">Layer Group</div>' +
      '<div class="selection-summary">' + (obj.getObjects ? obj.getObjects().length : 0) + ' layers in this group</div>' +
      '<button class="prop-btn group-wide-btn" data-arrange="ungroup">Ungroup Layers <span>Ctrl+Shift+G</span></button>' +
    '</div>';
    panel.innerHTML = html;
    return;
  }

  // ===== FILL / EDITABLE VECTOR COLORS =====
  const isVectorAsset = obj._clatashaVectorAsset && Array.isArray(obj._clatashaVectorColors);
  const isImage = obj.type === 'image';
  if (isVectorAsset) {
    const colorRows = obj._clatashaVectorColors.map((slot, index) => {
      const color = slot.current || slot.source || '#5e4a6e';
      return '<div class="prop-color-row"><span class="prop-label">' + escapeHtml(slot.label || `Color ${index + 1}`) + '</span>' +
        '<div class="prop-color-swatch" style="background:' + color + '">' +
          '<input type="color" data-vector-color="' + index + '" value="' + color + '">' +
        '</div></div>';
    }).join('');
    html += '<div class="prop-group"><div class="prop-group-title">Shape Colors</div>' + colorRows +
      '<div class="vector-color-hint">Vector colors remain editable after saving and reopening the project.</div></div>';
  } else if (!isImage) {
    const currentFill = obj.fill;
    let isGradient = false;
    let gradColor1 = '#7C3AED', gradColor2 = '#EC4899', gradAngle = 0;
    let solidColor = '#000000';

    if (currentFill && typeof currentFill === 'object' && currentFill.colorStops) {
      isGradient = true;
      const cs = currentFill.colorStops;
      if (cs.length >= 2) {
        gradColor1 = cs[0].color || '#7C3AED';
        gradColor2 = cs[cs.length - 1].color || '#EC4899';
      }
      if (currentFill.coords) {
        const c = currentFill.coords;
        gradAngle = Math.round(Math.atan2(c.y2 - c.y1, c.x2 - c.x1) * 180 / Math.PI);
        if (gradAngle < 0) gradAngle += 360;
      }
    } else {
      solidColor = typeof currentFill === 'string' ? currentFill : '#000000';
    }

    html += '<div class="prop-group"><div class="prop-group-title">Fill</div>' +
      '<div class="prop-toggle-row"><button class="prop-btn ' + (!isGradient ? 'active' : '') + '" data-action="fillSolid">Solid</button>' +
      '<button class="prop-btn ' + (isGradient ? 'active' : '') + '" data-action="fillGradient">Gradient</button></div>' +
      '<div class="fill-solid" style="' + (isGradient ? 'display:none' : '') + '">' +
        '<div class="prop-color-row"><span class="prop-label">Color</span><div class="prop-color-swatch" style="background:' + solidColor + '"><input type="color" data-fill-color value="' + solidColor + '"></div></div>' +
      '</div>' +
      '<div class="fill-gradient" style="' + (isGradient ? '' : 'display:none') + '">' +
        '<div class="prop-color-row"><span class="prop-label">Start</span><div class="prop-color-swatch" style="background:' + gradColor1 + '"><input type="color" data-grad="c1" value="' + gradColor1 + '"></div><span class="prop-label">End</span><div class="prop-color-swatch" style="background:' + gradColor2 + '"><input type="color" data-grad="c2" value="' + gradColor2 + '"></div></div>' +
        '<div class="prop-slider-row"><label>Angle</label><input type="range" data-grad="angle" data-suffix="\u00B0" min="0" max="360" value="' + gradAngle + '"><span class="slider-val">' + gradAngle + '\u00B0</span></div>' +
        '<div class="prop-btn-row"><button class="prop-btn" data-grad-preset="purple-pink">Purple \u2192 Pink</button><button class="prop-btn" data-grad-preset="blue-cyan">Blue \u2192 Cyan</button></div>' +
        '<div class="prop-btn-row"><button class="prop-btn" data-grad-preset="red-orange">Red \u2192 Orange</button><button class="prop-btn" data-grad-preset="green-lime">Green \u2192 Lime</button></div>' +
        '<div class="prop-btn-row"><button class="prop-btn" data-grad-preset="gold-white">Gold \u2192 White</button><button class="prop-btn" data-grad-preset="sunset">Sunset</button></div>' +
      '</div>' +
    '</div>';
  }

  // ===== STROKE =====
  if (!isVectorAsset) {
    const strokeRaw = isImage ? getImageOutlineColor(obj) : (typeof obj.stroke === 'string' ? obj.stroke : '#000000');
    const strokeHex = strokeRaw.startsWith('#') ? strokeRaw : '#000000';
    const sw = isImage ? getImageOutlineWidth(obj) : (obj.strokeWidth || 0);

    html += '<div class="prop-group"><div class="prop-group-title">' + (isImage ? 'Image Outline' : 'Stroke / Outline') + '</div>' +
      '<div class="prop-color-row"><span class="prop-label">Color</span><div class="prop-color-swatch" style="background:' + strokeHex + '"><input type="color" ' + (isImage ? 'data-image-outline-color' : 'data-stroke-color') + ' value="' + strokeHex + '"></div><span class="prop-label">Width</span><input class="prop-input prop-input-sm" type="number" ' + (isImage ? 'data-image-outline-width' : 'data-prop="strokeWidth"') + ' value="' + sw + '" min="0" max="50"></div>' +
      '<div class="prop-btn-row"><button class="prop-btn" data-stroke-quick="0">None</button>' +
      '<button class="prop-btn" data-stroke-quick="2">Thin</button>' +
      '<button class="prop-btn" data-stroke-quick="4">Medium</button>' +
      '<button class="prop-btn" data-stroke-quick="8">Thick</button></div>' +
    '</div>';
  }

  // ===== SHADOW =====
  const sh = obj.shadow;
  const hasShadow = !!sh;
  let shHex = '#000000';
  let shBlur = 10, shOX = 3, shOY = 3;
  if (sh) {
    shBlur = sh.blur || 0;
    shOX = sh.offsetX || 0;
    shOY = sh.offsetY || 0;
    if (sh.color) {
      if (sh.color.startsWith('#')) shHex = sh.color;
      else {
        const m = sh.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) shHex = '#' + [m[1],m[2],m[3]].map(x => parseInt(x).toString(16).padStart(2,'0')).join('');
      }
    }
  }

  html += '<div class="prop-group"><div class="prop-group-title">Shadow</div>' +
    '<div class="prop-toggle-row"><button class="prop-btn ' + (hasShadow ? 'active' : '') + '" data-action="shadowOn">On</button>' +
    '<button class="prop-btn ' + (!hasShadow ? 'active' : '') + '" data-action="shadowOff">Off</button></div>' +
    '<div class="shadow-controls" style="' + (hasShadow ? '' : 'display:none') + '">' +
      '<div class="prop-color-row"><span class="prop-label">Color</span><div class="prop-color-swatch" style="background:' + shHex + '"><input type="color" data-shadow="color" value="' + shHex + '"></div></div>' +
      '<div class="prop-slider-row"><label>Blur</label><input type="range" data-shadow="blur" min="0" max="80" value="' + shBlur + '"><span class="slider-val">' + shBlur + '</span></div>' +
      '<div class="prop-slider-row"><label>Offset X</label><input type="range" data-shadow="offsetX" min="-30" max="30" value="' + shOX + '"><span class="slider-val">' + shOX + '</span></div>' +
      '<div class="prop-slider-row"><label>Offset Y</label><input type="range" data-shadow="offsetY" min="-30" max="30" value="' + shOY + '"><span class="slider-val">' + shOY + '</span></div>' +
      '<div class="prop-btn-row"><button class="prop-btn" data-shadow-preset="drop">Drop</button><button class="prop-btn" data-shadow-preset="hard">Hard</button><button class="prop-btn" data-shadow-preset="glow">Glow</button></div>' +
      '<div class="prop-btn-row"><button class="prop-btn" data-shadow-preset="neon">Neon</button><button class="prop-btn" data-shadow-preset="long">Long</button><button class="prop-btn" data-shadow-preset="retro">Retro</button></div>' +
    '</div>' +
  '</div>';

  // Text-specific
  if (obj.type === 'textbox') {
    const builtInFonts = [
      // Bold / Impact
      'Righteous', 'Impact', 'Arial Black', 'Haettenschweiler', 'Stencil', 'Rockwell', 'Franklin Gothic Medium',
      // Modern Sans
      'Segoe UI', 'Helvetica', 'Helvetica Neue', 'Calibri', 'Candara', 'Corbel', 'Century Gothic', 'Tahoma', 'Verdana', 'Trebuchet MS', 'Gill Sans', 'Futura', 'Bahnschrift',
      // Serif / Classic
      'Georgia', 'Times New Roman', 'Palatino', 'Cambria', 'Constantia', 'Garamond', 'Baskerville', 'Book Antiqua',
      // Monospace
      'Courier New', 'Consolas', 'Lucida Console',
      // Fun / Display
      'Comic Sans MS', 'Papyrus', 'Lucida Handwriting', 'Bradley Hand', 'Segoe Print', 'Segoe Script', 'Copperplate', 'Marker Felt', 'American Typewriter',
    ];
    const customNames = customFonts.map(f => f.name);
    const rawFont = (obj.fontFamily || '').replace(/["']/g, '');
    const isCustomFont = customNames.some(f => rawFont.indexOf(f) !== -1);

    // Build options: built-in fonts, then custom fonts in an optgroup
    const firstFont = (obj.fontFamily || '').split(',')[0].trim().replace(/['"]/g, '');
    let fontOpts = builtInFonts.map(f =>
      '<option value="' + f + '" ' + (firstFont === f ? 'selected' : '') + '>' + f + '</option>'
    ).join('');

    if (customNames.length) {
      fontOpts += '<optgroup label="Custom Fonts">' +
        customNames.map(f =>
          '<option value="' + f + '" ' + (firstFont === f ? 'selected' : '') + '>' + f + '</option>'
        ).join('') +
      '</optgroup>';
    }

    html += '<div class="prop-group"><div class="prop-group-title">Typography</div>' +
      '<div class="font-row"><span style="flex:1;display:block"><select class="prop-input" data-prop="fontFamily">' + fontOpts + '</select></span>' +
      '<button class="font-upload-btn" id="fontUploadBtn" title="Upload custom font">+</button>' +
      (isCustomFont ? '<button class="font-upload-btn" id="fontDeleteBtn" title="Remove this custom font" style="color:var(--danger);font-size:14px">×</button>' : '') +
      '</div>' +
      '<div class="prop-row"><span class="prop-label">Size</span><input class="prop-input prop-input-sm" type="number" data-prop="fontSize" value="' + Math.round(obj.fontSize) + '" min="8" max="400"></div>' +
      '<div class="prop-row"><span class="prop-label">Align</span>' +
        '<div class="prop-btn-row" style="flex:1">' + ['left','center','right'].map(a => '<button class="prop-btn ' + (obj.textAlign === a ? 'active' : '') + '" data-align="' + a + '">' + a[0].toUpperCase() + '</button>').join('') + '</div></div>' +
      '<div class="prop-row"><span class="prop-label">Text Box</span><button class="prop-btn" data-action="fitText" style="flex:1">' + (obj._clatashaVerticalText ? 'Fit Column' : 'Fit to Text') + '</button></div>' +
      '<div class="prop-row"><span class="prop-label">Weight</span><div class="prop-btn-row" style="flex:1">' + ['normal','bold','900'].map(w => '<button class="prop-btn ' + (obj.fontWeight == w ? 'active' : '') + '" data-weight="' + w + '">' + w + '</button>').join('') + '</div></div>' +
      '<div class="prop-row"><span class="prop-label">Style</span><div class="prop-btn-row" style="flex:1">' + ['normal','italic'].map(s => '<button class="prop-btn ' + (obj.fontStyle === s ? 'active' : '') + '" data-fstyle="' + s + '">' + (s === 'normal' ? 'Reg' : 'Ital') + '</button>').join('') + '</div></div>' +
      '<div class="prop-row"><span class="prop-label">Spacing</span><input class="prop-input prop-input-sm" type="number" data-prop="charSpacing" value="' + (obj.charSpacing || 0) + '" min="-200" max="800"><span class="prop-label" style="margin-left:4px">Line H</span><input class="prop-input prop-input-sm" type="number" data-prop="lineHeight" data-divide="100" value="' + (Math.round((obj.lineHeight || 1.2) * 100)) + '" min="50" max="300"></div>' +
      (obj._clatashaVerticalText
        ? '<div class="appearance-hint">Vertical Text keeps one editable character column. Use Horizontal Text when applying a curve.</div>'
        : '<div class="prop-slider-row"><label>Curve</label><input type="range" id="curveSlider" min="-100" max="100" value="' + (obj._clatashaCurve || 0) + '"><span class="slider-val" id="curveValue">' + (obj._clatashaCurve || 0) + '</span></div>') +
    '</div>';
  }

  // Curved text group: show curve slider + font size only
  if (obj.type === 'group' && obj._clatashaCurve !== undefined) {
    const cv = Math.round(obj._clatashaCurve || 0);
    html += '<div class="prop-group"><div class="prop-group-title">Curved Text</div>' +
      '<div class="prop-slider-row"><label>Curve</label><input type="range" id="curveSlider" min="-100" max="100" value="' + cv + '"><span class="slider-val" id="curveValue">' + cv + '</span></div>' +
      '<div style="font-size:11px;color:var(--text-muted);padding:4px 0">Set curve to 0 to edit text content</div>' +
    '</div>';
  }

  // Image-specific mask controls
  if (obj.type === 'image' && !isClippedLayer(obj)) {
    const maskType = getImageMaskType(obj);
    const maskRadius = Math.round(obj._clatashaMaskRadius ?? 18);
    html += '<div class="prop-group"><div class="prop-group-title">Image Mask</div>' +
      '<div class="prop-toggle-row">' +
        '<button class="prop-btn ' + (maskType === 'none' ? 'active' : '') + '" data-image-mask="none">None</button>' +
        '<button class="prop-btn ' + (maskType === 'circle' ? 'active' : '') + '" data-image-mask="circle">Circle</button>' +
        '<button class="prop-btn ' + (maskType === 'rounded' ? 'active' : '') + '" data-image-mask="rounded">Rounded</button>' +
      '</div>' +
      '<div class="mask-radius-controls" style="' + (maskType === 'rounded' ? '' : 'display:none') + '">' +
        '<div class="prop-slider-row"><label>Roundness</label><input type="range" data-mask-radius min="1" max="50" value="' + maskRadius + '"><span class="slider-val">' + maskRadius + '%</span></div>' +
      '</div>' +
      '<div style="font-size:10px;color:var(--text-muted);padding-top:2px">Masks stay editable and do not erase the original image.</div>' +
    '</div>';
  }

  panel.innerHTML = html;

  // Font upload button
  const fontBtn = document.getElementById('fontUploadBtn');
  if (fontBtn) {
    fontBtn.addEventListener('click', () => {
      document.getElementById('fontInput').click();
    });
  }

  // Font delete button (remove custom font)
  const fontDelBtn = document.getElementById('fontDeleteBtn');
  if (fontDelBtn) {
    fontDelBtn.addEventListener('click', async () => {
      const fontName = obj.fontFamily;
      if (!fontName) return;
      if (!confirm('Remove custom font "' + fontName + '"?')) return;
      await deleteCustomFont(fontName);
      // Revert to a default font
      if (obj.type === 'textbox') {
        obj.set('fontFamily', 'Arial');
        obj.setCoords();
        canvas.renderAll();
      }
      updatePropertiesPanel(obj);
    });
  }
}

// ===== EVENT DELEGATION FOR PROPERTIES PANEL =====
function setupPanelDelegation() {
  const panel = document.getElementById('propertiesContent');

  // Helper: get active object or fall back to stored reference
  function getObj() {
    return canvas.getActiveObject() || activeObject || null;
  }

  function refreshAfter() {
    const obj = getObj();
    if (obj) updatePropertiesPanel(obj);
  }

  // --- Curve slider: save history on mouse release ---
  panel.addEventListener('change', function(e) {
    if (e.target.id === 'curveSlider') {
      saveHistory();
    }
  });

  // --- Direct property setters (data-prop) ---
  panel.addEventListener('input', function(e) {
    const el = e.target;
    const obj = getObj();
    if (!obj) return;

    if (el.dataset.imageOutlineColor !== undefined && obj.type === 'image') {
      setImageOutline(obj, el.value, getImageOutlineWidth(obj));
      el.parentElement.style.background = el.value;
      return;
    }

    if (el.dataset.imageOutlineWidth !== undefined && obj.type === 'image') {
      setImageOutline(obj, getImageOutlineColor(obj), el.value);
      return;
    }

    if (el.dataset.polygonSides !== undefined && obj.type === 'polygon') {
      updateRegularPolygonSides(obj, el.value);
      if (el.nextElementSibling) el.nextElementSibling.textContent = String(obj._clatashaPolygonSides);
      canvas.requestRenderAll();
      return;
    }

    // Apply paint colors while the native color picker is still open.
    if ('fillColor' in el.dataset) {
      obj.set('fill', el.value);
      propagateToChildren(obj);
      el.parentElement.style.background = el.value;
      obj.dirty = true;
      obj.setCoords();
      syncEditedClippingBase(obj);
      canvas.requestRenderAll();
      return;
    }

    if ('strokeColor' in el.dataset) {
      obj.set('stroke', el.value);
      propagateToChildren(obj);
      el.parentElement.style.background = el.value;
      obj.dirty = true;
      obj.setCoords();
      syncEditedClippingBase(obj);
      canvas.requestRenderAll();
      return;
    }

    // Editable colors for SVG asset packs.
    if (el.dataset.vectorColor !== undefined) {
      applyVectorAssetColor(obj, Number.parseInt(el.dataset.vectorColor, 10), el.value);
      syncEditedClippingBase(obj);
      el.parentElement.style.background = el.value;
      return;
    }

    // data-prop: generic property
    if (el.dataset.prop) {
      let val = el.value;
      if (el.dataset.divide) val = parseFloat(val) / parseFloat(el.dataset.divide);
      else if (el.type === 'range' || el.type === 'number') val = parseFloat(val);
      obj.set(el.dataset.prop, val);
      if (obj.type === 'textbox' && ['fontSize', 'fontWeight', 'fontStyle', 'charSpacing'].includes(el.dataset.prop)) {
        if (obj._clatashaVerticalText) fitVerticalTextColumn(obj);
        else if (obj._clatashaAutoFitText) fitSingleLineTextbox(obj, true);
      }
      // For rect corner radius, keep rx and ry in sync
      if (el.dataset.prop === 'rx' && obj.type === 'rect') obj.set('ry', val);
      obj.setCoords();
      syncEditedClippingBase(obj);
      canvas.requestRenderAll();
      if (el.dataset.prop === 'opacity' || el.dataset.prop === 'globalCompositeOperation') syncLayerAppearanceControls();
      // Update the slider/number display
      const suffix = el.dataset.suffix || '';
      if (el.nextElementSibling) el.nextElementSibling.textContent = (el.dataset.divide ? el.value + suffix : val + suffix);
      // Font metrics can be measured incorrectly if the face has not finished
      // loading. Re-measure and redraw once the selected face is ready.
      if (el.dataset.prop === 'fontFamily') {
        const selectedFamily = val;
        obj.dirty = true;
        ensureFontFamilyReady(selectedFamily).then(() => {
          if (obj.fontFamily !== selectedFamily) return;
          if (typeof obj.initDimensions === 'function') obj.initDimensions();
          if (obj._clatashaVerticalText) fitVerticalTextColumn(obj);
          else if (obj._clatashaAutoFitText) fitSingleLineTextbox(obj, true);
          obj.dirty = true;
          obj.setCoords();
          canvas.requestRenderAll();
          saveHistory();
        });
        setTimeout(() => {
          if (canvas.getActiveObject() === obj || activeObject === obj) updatePropertiesPanel(obj);
        }, 0);
      }
      return;
    }

    // Curve slider for text — live preview on input, save history on release
    if (el.id === 'curveSlider') {
      const val = parseInt(el.value);
      const cv = document.getElementById('curveValue');
      if (cv) cv.textContent = val;
      applyCurve(obj, val, false); // no history during drag
      return;
    }

    // data-scale: width/height scaling
    if (el.dataset.scale) {
      const v = parseFloat(el.value);
      if (el.dataset.scale === 'width') obj.set('scaleX', v / obj.width);
      else obj.set('scaleY', v / obj.height);
      obj.setCoords(); syncEditedClippingBase(obj); canvas.renderAll();
      return;
    }

    // data-shadow: shadow property sliders
    if (el.dataset.shadow) {
      const prop = el.dataset.shadow;
      if (prop === 'color') {
        _shadowState.color = el.value;
        el.parentElement.style.background = el.value;
      } else {
        _shadowState[prop] = parseFloat(el.value);
 }
      if (el.nextElementSibling) el.nextElementSibling.textContent = el.value;
      obj.set('shadow', new Shadow({
        color: _shadowState.color,
        blur: _shadowState.blur,
        offsetX: _shadowState.offsetX,
        offsetY: _shadowState.offsetY,
      }));
      propagateToChildren(obj);
      obj.setCoords(); syncEditedClippingBase(obj); canvas.renderAll();
      return;
    }

    // data-grad: gradient property
    if (el.dataset.grad) {
      const prop = el.dataset.grad;
      if (prop === 'c1') { _gradState.c1 = el.value; el.parentElement.style.background = el.value; }
      else if (prop === 'c2') { _gradState.c2 = el.value; el.parentElement.style.background = el.value; }
      else if (prop === 'angle') { _gradState.angle = parseInt(el.value); }
      if (el.nextElementSibling && prop === 'angle') el.nextElementSibling.textContent = el.value + '\u00B0';
      applyGradientToObj(obj);
      return;
    }

    // data-shape: shape properties
    if (el.dataset.shape === 'radius') {
      const v = parseInt(el.value);
      obj.set({ rx: v, ry: v });
      obj.setCoords(); canvas.renderAll();
      if (el.nextElementSibling) el.nextElementSibling.textContent = v;
      return;
    }

    // Non-destructive rounded image mask
    if (el.dataset.maskRadius !== undefined && obj.type === 'image') {
      const radius = Math.max(1, Math.min(50, parseFloat(el.value) || 1));
      applyImageMask(obj, 'rounded', radius, false);
      if (el.nextElementSibling) el.nextElementSibling.textContent = Math.round(radius) + '%';
      return;
    }
  });

  // Also handle 'change' for number inputs and color inputs
  panel.addEventListener('change', function(e) {
    const el = e.target;
    const obj = getObj();
    if (!obj) return;

    if ((el.dataset.imageOutlineColor !== undefined || el.dataset.imageOutlineWidth !== undefined) && obj.type === 'image') {
      saveHistory();
      return;
    }

    if (el.dataset.vectorColor !== undefined) {
      saveHistory();
      return;
    }

    if (el.dataset.polygonSides !== undefined && obj.type === 'polygon') {
      saveHistory();
      return;
    }

    // data-fill-color: solid fill color
    if ('fillColor' in el.dataset) {
      obj.set('fill', el.value);
      propagateToChildren(obj);
      el.parentElement.style.background = el.value;
      obj.setCoords(); syncEditedClippingBase(obj); canvas.renderAll(); saveHistory();
      return;
    }

    // data-stroke-color: stroke color
    if ('strokeColor' in el.dataset) {
      obj.set('stroke', el.value);
      propagateToChildren(obj);
      el.parentElement.style.background = el.value;
      obj.setCoords(); syncEditedClippingBase(obj); canvas.renderAll(); saveHistory();
      return;
    }

    // data-prop on change (for number inputs that also need history save)
    if (el.dataset.prop) {
      let val = el.value;
      if (el.dataset.divide) val = parseFloat(val) / parseFloat(el.dataset.divide);
      else if (el.type === 'number') val = parseFloat(val);
      obj.set(el.dataset.prop, val);
      propagateToChildren(obj);
      obj.setCoords(); syncEditedClippingBase(obj); canvas.renderAll();
      if (el.dataset.prop === 'opacity' || el.dataset.prop === 'globalCompositeOperation') syncLayerAppearanceControls();
      saveHistory();
      return;
    }

    // data-scale on change
    if (el.dataset.scale) {
      const v = parseFloat(el.value);
      if (el.dataset.scale === 'width') obj.set('scaleX', v / obj.width);
      else obj.set('scaleY', v / obj.height);
      obj.setCoords(); syncEditedClippingBase(obj); canvas.renderAll(); saveHistory();
      return;
    }

    if (el.dataset.maskRadius !== undefined && obj.type === 'image') {
      saveHistory();
      return;
    }
  });

  // --- Button clicks ---
  panel.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action], [data-stroke-quick], [data-grad-preset], [data-shadow-preset], [data-align], [data-weight], [data-fstyle], [data-image-mask], [data-arrange], [data-align-reference], [data-clipping-action]');
    if (!btn) return;
    const obj = getObj();
    if (!obj) return;

    if (btn.dataset.alignReference) {
      arrangeReference = btn.dataset.alignReference;
      updatePropertiesPanel(obj);
      return;
    }

    if (btn.dataset.clippingAction) {
      if (btn.dataset.clippingAction === 'create') createClippingMask();
      else releaseClippingMask(canvas.getActiveObjects(), true);
      return;
    }

    if (btn.dataset.arrange) {
      const action = btn.dataset.arrange;
      if (action === 'group') groupSelectedLayers();
      else if (action === 'ungroup') ungroupSelectedLayers();
      else arrangeSelectedLayers(action);
      return;
    }

    // Non-destructive image masks
    if (btn.dataset.imageMask && obj.type === 'image') {
      applyImageMask(obj, btn.dataset.imageMask, obj._clatashaMaskRadius ?? 18, true);
      refreshAfter();
      return;
    }

    if (btn.dataset.action === 'fitText' && obj.type === 'textbox') {
      if (obj._clatashaVerticalText) fitVerticalTextColumn(obj);
      else {
        obj._clatashaAutoFitText = true;
        fitSingleLineTextbox(obj, true);
      }
      obj.setCoords(); syncEditedClippingBase(obj); canvas.requestRenderAll(); saveHistory(); refreshAfter();
      return;
    }

    // Fill mode toggles
    if (btn.dataset.action === 'fillSolid') {
      obj.set('fill', _gradState.c1 || '#000000');
      propagateToChildren(obj);
      obj.setCoords(); syncEditedClippingBase(obj); canvas.renderAll(); saveHistory(); refreshAfter();
      return;
    }
    if (btn.dataset.action === 'fillGradient') {
      applyGradientToObj(obj);
      propagateToChildren(obj);
      syncEditedClippingBase(obj);
      saveHistory(); refreshAfter();
      return;
    }

    // Shadow on/off
    if (btn.dataset.action === 'shadowOn') {
      obj.set('shadow', new Shadow({ color: _shadowState.color, blur: _shadowState.blur, offsetX: _shadowState.offsetX, offsetY: _shadowState.offsetY }));
      propagateToChildren(obj);
      obj.setCoords(); syncEditedClippingBase(obj); canvas.renderAll(); saveHistory(); refreshAfter();
      return;
    }
    if (btn.dataset.action === 'shadowOff') {
      obj.set('shadow', null);
      propagateToChildren(obj);
      obj.setCoords(); syncEditedClippingBase(obj); canvas.renderAll(); saveHistory(); refreshAfter();
      return;
    }

    // Stroke quick buttons
    if (btn.dataset.strokeQuick !== undefined) {
      const w = parseInt(btn.dataset.strokeQuick);
      if (obj.type === 'image') {
        setImageOutline(obj, getImageOutlineColor(obj), w);
      } else {
        obj.set('strokeWidth', w);
        if (w === 0) obj.set('stroke', '');
        else if (!obj.stroke) obj.set('stroke', '#000000');
      }
      propagateToChildren(obj);
      obj.setCoords(); syncEditedClippingBase(obj); canvas.renderAll(); saveHistory(); refreshAfter();
      return;
    }

    // Gradient presets
    if (btn.dataset.gradPreset) {
      const colors = GRADIENT_PRESETS[btn.dataset.gradPreset];
      if (colors) {
        _gradState.c1 = colors[0]; _gradState.c2 = colors[1];
        applyGradientToObj(obj);
        syncEditedClippingBase(obj);
        saveHistory(); refreshAfter();
      }
      return;
    }

    // Shadow presets
    if (btn.dataset.shadowPreset) {
      const p = SHADOW_PRESETS[btn.dataset.shadowPreset];
      if (p) {
        _shadowState = { color: p.color, blur: p.blur, offsetX: p.offsetX, offsetY: p.offsetY };
        obj.set('shadow', new Shadow(p));
        propagateToChildren(obj);
        obj.setCoords(); syncEditedClippingBase(obj); canvas.renderAll(); saveHistory(); refreshAfter();
      }
      return;
    }

    // Text align
    if (btn.dataset.align) {
      obj.set('textAlign', btn.dataset.align);
      obj.setCoords(); syncEditedClippingBase(obj); canvas.renderAll(); saveHistory(); refreshAfter();
      return;
    }

    // Font weight
    if (btn.dataset.weight) {
      obj.set('fontWeight', btn.dataset.weight);
      obj.setCoords(); syncEditedClippingBase(obj); canvas.renderAll(); saveHistory(); refreshAfter();
      return;
    }

    // Font style
    if (btn.dataset.fstyle) {
      obj.set('fontStyle', btn.dataset.fstyle);
      obj.setCoords(); syncEditedClippingBase(obj); canvas.renderAll(); saveHistory(); refreshAfter();
      return;
    }
  });
}

function applyGradientToObj(obj) {
  if (!obj) return;
  const angleRad = (_gradState.angle || 0) * Math.PI / 180;
  const w = (obj.getScaledWidth ? obj.getScaledWidth() : obj.width) / 2 || 100;
  const h = (obj.getScaledHeight ? obj.getScaledHeight() : obj.height) / 2 || 100;
  const dist = Math.max(w, h);
  const cx = obj.left + w;
  const cy = obj.top + h;
  const grad = new fabric.Gradient({
    type: 'linear',
    gradientUnits: 'pixels',
    coords: {
      x1: cx - Math.cos(angleRad) * dist,
      y1: cy - Math.sin(angleRad) * dist,
      x2: cx + Math.cos(angleRad) * dist,
      y2: cy + Math.sin(angleRad) * dist,
    },
    colorStops: [
      { offset: 0, color: _gradState.c1 },
      { offset: 1, color: _gradState.c2 },
    ]
  });
  obj.set('fill', grad);
  propagateToChildren(obj);
  obj.setCoords();
  canvas.renderAll();
}

// ===== STATE & PRESETS (used by event delegation) =====
let _gradState = { c1: '#7C3AED', c2: '#EC4899', angle: 0 };
let _shadowState = { color: '#000000', blur: 10, offsetX: 3, offsetY: 3 };

const GRADIENT_PRESETS = {
  'purple-pink': ['#7C3AED', '#EC4899'],
  'blue-cyan': ['#3B82F6', '#06B6D4'],
  'red-orange': ['#EF4444', '#F97316'],
  'green-lime': ['#22C55E', '#A3E635'],
  'gold-white': ['#F59E0B', '#FFFFFF'],
  'sunset': ['#FF6B35', '#FFD700'],
};

const SHADOW_PRESETS = {
  drop:  { color: 'rgba(0,0,0,0.5)', blur: 10, offsetX: 3, offsetY: 3 },
  hard:  { color: 'rgba(0,0,0,0.9)', blur: 0,  offsetX: 5, offsetY: 5 },
  glow:  { color: 'rgba(124,58,237,0.8)', blur: 30, offsetX: 0, offsetY: 0 },
  neon:  { color: 'rgba(0,255,255,0.9)', blur: 20, offsetX: 0, offsetY: 0 },
  long:  { color: 'rgba(0,0,0,0.4)', blur: 4, offsetX: 8, offsetY: 12 },
  retro: { color: 'rgba(236,72,153,0.7)', blur: 15, offsetX: 4, offsetY: 4 },
};

// ===== TEXT =====
function getTextboxAnchorOrigin(textbox) {
  if (textbox.textAlign === 'right') return 'right';
  if (textbox.textAlign === 'center') return 'center';
  return 'left';
}

function fitSingleLineTextbox(textbox, force = false) {
  if (!textbox || textbox.type !== 'textbox') return false;
  const rawText = String(textbox.text || '');
  if (rawText.includes('\n')) return false;

  if (typeof textbox.initDimensions === 'function') textbox.initDimensions();
  const lines = textbox._textLines || textbox.textLines || [];
  if (lines.length > 1) return false;

  const measured = typeof textbox.getLineWidth === 'function'
    ? textbox.getLineWidth(0)
    : (typeof textbox.calcTextWidth === 'function' ? textbox.calcTextWidth() : 0);
  if (!Number.isFinite(measured) || measured <= 0) return false;

  const minimum = Number.isFinite(textbox.minWidth) ? textbox.minWidth : 2;
  const targetWidth = Math.max(minimum, measured + 2);
  const currentWidth = Number(textbox.width) || targetWidth;
  const clearlyOversized = currentWidth > targetWidth + Math.max(12, targetWidth * 0.25);
  if (!force && !clearlyOversized) return false;
  if (Math.abs(currentWidth - targetWidth) < 0.5) return false;

  const anchorOrigin = getTextboxAnchorOrigin(textbox);
  const anchor = typeof textbox.getPointByOrigin === 'function'
    ? textbox.getPointByOrigin(anchorOrigin, 'center')
    : null;
  textbox.set('width', targetWidth);
  textbox._clatashaAutoFitText = true;
  if (typeof textbox.initDimensions === 'function') textbox.initDimensions();
  if (anchor && typeof textbox.setPositionByOrigin === 'function') {
    textbox.setPositionByOrigin(anchor, anchorOrigin, 'center');
  }
  textbox.dirty = true;
  textbox.setCoords();
  return true;
}

function installVerticalTextWrapping(textbox) {
  if (!textbox || textbox._clatashaVerticalWrapInstalled) return;
  textbox._wrapLine = function(lineIndex, _desiredWidth, graphemeData) {
    const entries = graphemeData?.wordsData?.[lineIndex] || [];
    this.dynamicMinWidth = entries.reduce((widest, entry) => Math.max(widest, entry.width || 0), 0);
    return entries.length ? entries.map(entry => [...entry.word]) : [[]];
  };
  textbox._clatashaVerticalWrapInstalled = true;
}

function fitVerticalTextColumn(textbox) {
  if (!textbox || textbox.type !== 'textbox' || !textbox._clatashaVerticalText) return false;
  installVerticalTextWrapping(textbox);
  const center = textbox.getCenterPoint ? textbox.getCenterPoint() : null;
  const targetWidth = Math.max(8, (Number(textbox.fontSize) || 100) * 1.05);
  textbox.set({ width: targetWidth, splitByGrapheme: true, _clatashaAutoFitText: false });
  if (typeof textbox.initDimensions === 'function') textbox.initDimensions();
  if (center && typeof textbox.setPositionByOrigin === 'function') {
    textbox.setPositionByOrigin(center, 'center', 'center');
  }
  textbox.dirty = true;
  textbox.setCoords();
  return true;
}

function normalizeLegacyTextboxes() {
  let changed = false;
  canvas.getObjects().forEach((obj) => {
    if (obj.type === 'textbox' && !obj._clatashaVerticalText && fitSingleLineTextbox(obj, false)) changed = true;
  });
  return changed;
}

function addSpeechBubble(x, y) {
  const w = 200, h = 100, r = 16, tailW = 30, tailH = 25;
  // SVG path: rounded rect + tail at bottom-left
  const pathStr =
    'M ' + r + ' 0 ' +
    'H ' + (w - r) + ' Q ' + w + ' 0 ' + w + ' ' + r +
    ' V ' + (h - r) + ' Q ' + w + ' ' + h + ' ' + (w - r) + ' ' + h +
    ' H ' + (tailW + 8) + ' L ' + tailW + ' ' + (h + tailH) +
    ' L ' + (tailW + 16) + ' ' + h +
    ' H ' + r + ' Q 0 ' + h + ' 0 ' + (h - r) +
    ' V ' + r + ' Q 0 0 ' + r + ' 0 Z';

  const bubble = new Path(pathStr, {
    left: x,
    top: y,
    fill: document.getElementById('fillColor').value,
    stroke: document.getElementById('strokeColor').value,
    strokeWidth: 2,
    strokeUniform: true,
  });
  canvas.add(bubble);
  canvas.setActiveObject(bubble);
  saveHistory();
}

function addTextAtPosition(x, y) {
  const fillColor = document.getElementById('fillColor').value;
  const text = new Textbox('YOUR TEXT', {
    left: x, top: y,
    width: 400,
    fontFamily: 'Righteous, Impact, Haettenschweiler, sans-serif',
    fontSize: 130,
    fill: fillColor,
    stroke: '#000000',
    strokeWidth: 2,
    textAlign: 'center',
    shadow: { color: 'rgba(0,0,0,0.5)', blur: 6, offsetX: 2, offsetY: 2 },
    originX: 'center',
    originY: 'center',
    _clatashaAutoFitText: true,
  });
  fitSingleLineTextbox(text, true);
  canvas.add(text);
  canvas.setActiveObject(text);
  saveHistory();
}

function addVerticalTextAtPosition(x, y) {
  const fillColor = document.getElementById('fillColor').value;
  const text = new Textbox('YOUR TEXT', {
    left: x,
    top: y,
    width: 105,
    fontFamily: 'Righteous, Impact, Haettenschweiler, sans-serif',
    fontSize: 100,
    fill: fillColor,
    stroke: '#000000',
    strokeWidth: 2,
    textAlign: 'center',
    lineHeight: 0.95,
    splitByGrapheme: true,
    shadow: { color: 'rgba(0,0,0,0.5)', blur: 6, offsetX: 2, offsetY: 2 },
    originX: 'center',
    originY: 'center',
    _clatashaVerticalText: true,
    _clatashaAutoFitText: false,
    name: 'Vertical Text',
  });
  fitVerticalTextColumn(text);
  canvas.add(text);
  canvas.setActiveObject(text);
  saveHistory();
}

function addTextWithPreset(preset) {
  const style = { ...preset.style };
  const text = new Textbox('YOUR TEXT', {
    left: CANVAS_W / 2,
    top: CANVAS_H / 2,
    width: 600,
    originX: 'center',
    originY: 'center',
    _clatashaAutoFitText: true,
    ...style,
    shadow: style.shadow ? new Shadow(style.shadow) : null,
  });
  fitSingleLineTextbox(text, true);
  canvas.add(text);
  canvas.setActiveObject(text);
  setTool('select');
  saveHistory();
}

function clonePresetStyle(style) {
  const cloned = {};
  Object.entries(style || {}).forEach(([key, value]) => {
    cloned[key] = value && typeof value === 'object'
      ? JSON.parse(JSON.stringify(value))
      : value;
  });
  return cloned;
}

function isEditableTextLayer(obj) {
  return !!obj && (
    obj.type === 'textbox' ||
    (obj.type === 'group' && obj._clatashaCurve !== undefined)
  );
}

function getTextVisualStyle(style) {
  const visual = {};
  ['fill', 'stroke', 'strokeWidth', 'textAlign'].forEach((property) => {
    if (Object.prototype.hasOwnProperty.call(style, property)) visual[property] = style[property];
  });
  if (Object.prototype.hasOwnProperty.call(style, 'shadow')) {
    visual.shadow = style.shadow ? JSON.parse(JSON.stringify(style.shadow)) : null;
  }
  return visual;
}

async function applyTextPreset(preset) {
  const selected = canvas.getActiveObject() || activeObject;
  if (!isEditableTextLayer(selected)) {
    showPerspToast('Select a text layer to apply a text style');
    return;
  }

  const style = clonePresetStyle(preset.style);
  const visualStyle = getTextVisualStyle(style);

  if (selected.type === 'textbox') {
    const shadow = Object.prototype.hasOwnProperty.call(visualStyle, 'shadow')
      ? (visualStyle.shadow ? new Shadow(visualStyle.shadow) : null)
      : undefined;
    delete visualStyle.shadow;
    selected.set(visualStyle);
    if (shadow !== undefined) selected.set('shadow', shadow);
    selected.dirty = true;
    selected.setCoords();
    canvas.setActiveObject(selected);
    canvas.requestRenderAll();
    saveHistory();
    updateLayersList();
    updatePropertiesPanel(selected);
    syncStateFromObject(selected);
    return;
  }

  // Curved text stores its editable styling as metadata, then rebuilds its
  // character group using the same curve, position, rotation and scale.
  selected._clatashaStyle = {
    ...(selected._clatashaStyle || {}),
    ...visualStyle,
  };
  applyCurve(selected, selected._clatashaCurve, false);
  const rebuilt = canvas.getActiveObject();
  if (rebuilt) {
    rebuilt.dirty = true;
    rebuilt.setCoords();
    syncStateFromObject(rebuilt);
    updatePropertiesPanel(rebuilt);
  }
  canvas.requestRenderAll();
  saveHistory();
  updateLayersList();
}

function getPresetSwatchFill(fill) {
  if (typeof fill === 'string' && fill) return fill;
  if (fill && typeof fill === 'object' && fill.colorStops) {
    const stops = Array.isArray(fill.colorStops)
      ? fill.colorStops
      : Object.values(fill.colorStops);
    const colors = stops.map(stop => stop?.color).filter(Boolean);
    if (colors.length === 1) return colors[0];
    if (colors.length > 1) return `linear-gradient(135deg, ${colors.join(', ')})`;
  }
  return '#FFFFFF';
}

function buildTextPresets() {
  const grid = document.getElementById('presetGrid');
  grid.innerHTML = '';
  const allPresets = [...TEXT_PRESETS, ...customTextPresets];
  allPresets.forEach((preset) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'preset-swatch' + (preset.custom ? ' custom-preset' : '');
    swatch.setAttribute('aria-label', 'Apply text style ' + preset.name);

    const previewFill = getPresetSwatchFill(preset.previewStyle?.fill || preset.style.fill);
    const previewStroke = preset.previewStyle?.stroke ?? preset.style.stroke;
    const previewStrokeWidth = preset.previewStyle?.strokeWidth ?? preset.style.strokeWidth;
    const previewBlock = document.createElement('span');
    previewBlock.className = 'preset-style-preview';
    previewBlock.style.setProperty('--preset-fill', previewFill);

    if (preset.style.shadow) {
      const shadowScale = 0.28;
      const offsetX = Math.max(-6, Math.min(6, Number(preset.style.shadow.offsetX || 0) * shadowScale));
      const offsetY = Math.max(-6, Math.min(6, Number(preset.style.shadow.offsetY || 0) * shadowScale));
      const blur = Math.max(0, Math.min(9, Number(preset.style.shadow.blur || 0) * shadowScale));
      previewBlock.style.setProperty('--preset-shadow-x', `${offsetX}px`);
      previewBlock.style.setProperty('--preset-shadow-y', `${offsetY}px`);
      previewBlock.style.setProperty('--preset-shadow-blur', `${blur}px`);
      previewBlock.style.setProperty('--preset-shadow-color', preset.style.shadow.color || 'transparent');
    }

    if (previewStroke && previewStrokeWidth) {
      const swStrokeW = Math.max(0.5, Math.min(Number(previewStrokeWidth) * 0.75, 3));
      previewBlock.style.setProperty('--preset-stroke-width', `${swStrokeW}px`);
      previewBlock.style.setProperty('--preset-stroke-color', previewStroke);
    }

    swatch.appendChild(previewBlock);

    if (preset.custom) {
      const customDot = document.createElement('span');
      customDot.className = 'custom-dot';
      swatch.appendChild(customDot);
    }

    // Tooltip
    const tipText = (preset.custom ? '\u2B50 ' : '') + preset.name;
    swatch.addEventListener('mouseenter', function(e) {
      let tip = document.getElementById('activePresetTooltip');
      if (!tip) {
        tip = document.createElement('div');
        tip.id = 'activePresetTooltip';
        tip.className = 'preset-tooltip';
        document.body.appendChild(tip);
      }
      tip.textContent = tipText;
      tip.style.display = 'block';
      const r = swatch.getBoundingClientRect();
      tip.style.left = (r.left + r.width / 2) + 'px';
      tip.style.top = (r.top - 8) + 'px';
      tip.style.transform = 'translate(-50%, -100%)';
    });
    swatch.addEventListener('mouseleave', function() {
      const tip = document.getElementById('activePresetTooltip');
      if (tip) tip.style.display = 'none';
    });

    swatch.addEventListener('click', () => applyTextPreset(preset));

    if (preset.custom) {
      swatch.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm('Delete preset "' + preset.name + '"?')) {
          deleteCustomPreset(preset.name);
          customTextPresets = customTextPresets.filter(p => p.name !== preset.name);
          buildTextPresets();
        }
      });
    }
    grid.appendChild(swatch);
  });
}

// ===== TEMPLATES =====
let activeTemplateFilter = 'all';
let templateContextMenu = null;

function getTemplateDimensions(tpl) {
  return {
    width: Number(tpl?.width) || 1920,
    height: Number(tpl?.height) || 1080,
  };
}

function getTemplateCategory(width, height) {
  if (width === 1920 && height === 1080) return 'youtube';
  if (width === 1080 && height === 1920) return 'shorts';
  return 'other';
}

function getTemplateCategoryLabel(category, width, height) {
  if (category === 'youtube') return 'YouTube • 1920 × 1080';
  if (category === 'shorts') return 'Shorts • 1080 × 1920';
  return `Other Size • ${width} × ${height}`;
}

function setupTemplateUI() {
  document.getElementById('saveTemplateBtn')?.addEventListener('click', showSaveTemplateModal);
  document.querySelectorAll('[data-template-filter]').forEach(button => {
    button.addEventListener('click', async () => {
      activeTemplateFilter = button.dataset.templateFilter;
      document.querySelectorAll('[data-template-filter]').forEach(item => {
        item.classList.toggle('active', item === button);
      });
      await buildTemplates();
    });
  });
  document.addEventListener('click', closeTemplateContextMenu);
  window.addEventListener('blur', closeTemplateContextMenu);
}

function drawBuiltinTemplatePreview(preview, tpl) {
  const { width, height } = getTemplateDimensions(tpl);
  const isPortrait = height > width;
  preview.width = isPortrait ? 135 : 240;
  preview.height = isPortrait ? 240 : 135;
  const ctx = preview.getContext('2d');
  const sx = preview.width / width;
  const sy = preview.height / height;
  ctx.fillStyle = tpl.bg || '#FFFFFF';
  ctx.fillRect(0, 0, preview.width, preview.height);

  (tpl.objects || []).forEach(def => {
    ctx.save();
    if (def.type === 'rect') {
      const x = def.left * sx;
      const y = def.top * sy;
      const w = def.width * sx;
      const h = def.height * sy;
      const radius = Math.max(0, Math.min(Number(def.rx) || 0, Number(def.ry) || Number(def.rx) || 0)) * Math.min(sx, sy);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
      else ctx.rect(x, y, w, h);
      if (def.fill && def.fill !== 'none' && def.fill !== 'transparent') {
        ctx.fillStyle = def.fill;
        ctx.fill();
      }
      if (def.stroke && def.stroke !== 'none' && Number(def.strokeWidth) > 0) {
        ctx.strokeStyle = def.stroke;
        ctx.lineWidth = Math.max(1, Number(def.strokeWidth) * Math.min(sx, sy));
        ctx.stroke();
      }
    } else if (def.type === 'circle') {
      ctx.beginPath();
      ctx.arc(def.left * sx, def.top * sy, def.radius * Math.min(sx, sy), 0, Math.PI * 2);
      if (def.fill && def.fill !== 'none' && def.fill !== 'transparent') {
        ctx.fillStyle = def.fill;
        ctx.fill();
      }
      if (def.stroke && Number(def.strokeWidth) > 0) {
        ctx.strokeStyle = def.stroke;
        ctx.lineWidth = Math.max(1, Number(def.strokeWidth) * Math.min(sx, sy));
        ctx.stroke();
      }
    } else if (def.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(def.x1 * sx, def.y1 * sy);
      ctx.lineTo(def.x2 * sx, def.y2 * sy);
      ctx.strokeStyle = def.stroke || '#FFFFFF';
      ctx.lineWidth = Math.max(1, (Number(def.strokeWidth) || 1) * Math.min(sx, sy));
      ctx.stroke();
    } else if (def.type === 'text') {
      const fontSize = Math.max(7, (Number(def.fontSize) || 72) * sy);
      ctx.font = `${def.fontWeight || 'normal'} ${fontSize}px ${String(def.fontFamily || 'sans-serif').split(',')[0]}`;
      ctx.textAlign = def.textAlign || 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = def.fill || '#FFFFFF';
      ctx.strokeStyle = def.stroke || 'transparent';
      ctx.lineWidth = Math.max(1, (Number(def.strokeWidth) || 0) * Math.min(sx, sy));
      const lines = String(def.text || 'Your Text').split('\n');
      const lineHeight = fontSize * 1.02;
      const startY = def.top * sy - ((lines.length - 1) * lineHeight / 2);
      lines.forEach((line, index) => {
        const y = startY + index * lineHeight;
        if (def.stroke && Number(def.strokeWidth) > 0) ctx.strokeText(line, def.left * sx, y);
        ctx.fillText(line, def.left * sx, y);
      });
    }
    ctx.restore();
  });
}

function createTemplateCard(tpl, userOwned = false) {
  const { width, height } = getTemplateDimensions(tpl);
  const category = tpl.category || getTemplateCategory(width, height);
  const card = document.createElement('div');
  card.className = 'template-card';
  card.dataset.templateCategory = category;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${userOwned ? 'Use saved template' : 'Use template'} ${tpl.name}`);

  const preview = document.createElement('div');
  preview.className = 'template-preview';
  if (userOwned && tpl.preview) {
    const image = document.createElement('img');
    image.src = tpl.preview;
    image.alt = '';
    preview.appendChild(image);
    const badge = document.createElement('span');
    badge.className = 'template-owner-badge';
    badge.textContent = 'Yours';
    preview.appendChild(badge);
  } else {
    const previewCanvas = document.createElement('canvas');
    drawBuiltinTemplatePreview(previewCanvas, tpl);
    preview.appendChild(previewCanvas);
  }

  if (userOwned) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'template-more-btn';
    more.textContent = '•••';
    more.title = 'Template options';
    more.setAttribute('aria-label', `Options for ${tpl.name}`);
    more.addEventListener('click', event => {
      event.stopPropagation();
      showTemplateContextMenu(event.clientX, event.clientY, tpl);
    });
    preview.appendChild(more);
    card.addEventListener('contextmenu', event => {
      event.preventDefault();
      showTemplateContextMenu(event.clientX, event.clientY, tpl);
    });
  }

  const label = document.createElement('div');
  label.className = 'template-label';
  label.textContent = tpl.name;
  card.append(preview, label);
  const use = () => userOwned ? applyUserTemplate(tpl) : applyTemplate(tpl);
  card.addEventListener('click', use);
  card.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    use();
  });
  return card;
}

function renderTemplateSection(container, title, sizeLabel, templates) {
  if (!templates.length) return;
  const section = document.createElement('section');
  section.className = 'template-section';
  const heading = document.createElement('div');
  heading.className = 'template-section-heading';
  heading.innerHTML = `<span>${escapeHtml(title)}</span><span>${escapeHtml(sizeLabel)}</span>`;
  const grid = document.createElement('div');
  grid.className = 'template-grid';
  templates.forEach(item => grid.appendChild(createTemplateCard(item.template, item.userOwned)));
  section.append(heading, grid);
  container.appendChild(section);
}

async function buildTemplates() {
  const container = document.getElementById('templateGrid');
  if (!container) return;
  const userTemplates = await getAllUserTemplates().catch(error => {
    console.error('Unable to load saved templates:', error);
    return [];
  });
  const builtIns = TEMPLATES.map(template => {
    const dimensions = getTemplateDimensions(template);
    return {
      template: { ...template, ...dimensions, category: template.category || getTemplateCategory(dimensions.width, dimensions.height) },
      userOwned: false,
    };
  });
  const saved = userTemplates.map(template => ({ template, userOwned: true }));
  let items = activeTemplateFilter === 'mine' ? saved : [...saved, ...builtIns];
  if (activeTemplateFilter === 'youtube') items = [...saved, ...builtIns].filter(item => item.template.category === 'youtube');
  if (activeTemplateFilter === 'shorts') items = [...saved, ...builtIns].filter(item => item.template.category === 'shorts');

  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'template-empty-state';
    empty.textContent = activeTemplateFilter === 'mine'
      ? 'No saved templates yet. Use “Save as Template” to add one.'
      : 'No templates in this section yet.';
    container.appendChild(empty);
    return;
  }

  const youtube = items.filter(item => item.template.category === 'youtube');
  const shorts = items.filter(item => item.template.category === 'shorts');
  const other = items.filter(item => item.template.category === 'other');
  renderTemplateSection(container, 'YouTube Thumbnails', '1920 × 1080', youtube);
  renderTemplateSection(container, 'Shorts', '1080 × 1920', shorts);
  if (other.length) renderTemplateSection(container, 'Other Sizes', 'Custom', other);
}

function closeTemplateContextMenu() {
  if (!templateContextMenu) return;
  templateContextMenu.remove();
  templateContextMenu = null;
}

function showTemplateContextMenu(clientX, clientY, tpl) {
  closeTemplateContextMenu();
  const menu = document.createElement('div');
  menu.className = 'template-context-menu';
  const actions = [
    ['use', 'Use Template'],
    ['update', 'Update from Current Canvas'],
    ['rename', 'Rename'],
    ['duplicate', 'Duplicate'],
    ['export', 'Export Template'],
    ['delete', 'Delete'],
  ];
  actions.forEach(([action, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (action === 'delete') button.className = 'danger';
    button.addEventListener('click', async event => {
      event.stopPropagation();
      closeTemplateContextMenu();
      if (action === 'use') await applyUserTemplate(tpl);
      else if (action === 'update') await updateUserTemplateFromCanvas(tpl);
      else if (action === 'rename') showRenameTemplateModal(tpl);
      else if (action === 'duplicate') await duplicateUserTemplate(tpl);
      else if (action === 'export') exportUserTemplate(tpl);
      else if (action === 'delete') await confirmDeleteUserTemplate(tpl);
    });
    menu.appendChild(button);
  });
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 8)) + 'px';
  templateContextMenu = menu;
}

function setTemplateCanvasDimensions(width, height) {
  CANVAS_W = width;
  CANVAS_H = height;
  canvas.setDimensions({ width, height });
  const background = canvas.getObjects().find(object => object.name === '__bg__');
  if (background) {
    background.set({ width, height });
    background.setCoords();
  }
  document.querySelector('.canvas-info span').textContent = width + ' × ' + height;
  document.getElementById('sizeThumbCheck').textContent = (width === 1920 && height === 1080) ? '✓' : '';
  document.getElementById('sizeShortsCheck').textContent = (width === 1080 && height === 1920) ? '✓' : '';
  scheduleRulerDraw();
}

function prepareToReplaceCanvas() {
  if (sliceActive) setTool('select');
  if (cropActive) exitStandardCrop();
  if (perspActive) exitPerspectiveCrop();
  if (paintBrushActive) finishPaintBrush();
  if (paintBucketActive) finishPaintBucket();
  if (bgRemovalActive) finishBgRemoval();
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  if (canvas.getObjects().filter(o => !isInternalEditorObject(o)).length > 0) {
    if (!confirm('This will replace your current canvas. Continue?')) return false;
  }
  exitGroupEditMode({ selectParent: false });
  return true;
}

function applyTemplate(tpl) {
  if (!prepareToReplaceCanvas()) return;
  const { width, height } = getTemplateDimensions(tpl);
  // Remove all except background
  const objects = canvas.getObjects().filter(o => !isInternalEditorObject(o));
  objects.forEach(o => canvas.remove(o));
  setTemplateCanvasDimensions(width, height);

  // Update background
  let bg = canvas.getObjects().find(o => o.name === '__bg__');
  if (!bg) {
    addBackgroundRect();
    bg = canvas.getObjects().find(o => o.name === '__bg__');
  }
  if (bg) {
    bg.set('fill', tpl.bg);
    bg.dirty = true;
    bg.setCoords();
  } else {
    canvas.backgroundColor = tpl.bg;
  }
  console.log('Template bg applied:', tpl.bg, 'bg found:', !!bg);

  // Add template objects
  tpl.objects.forEach(def => {
    try {
      let obj;
      if (def.type === 'rect') {
        obj = new Rect({
          left: def.left, top: def.top, width: def.width, height: def.height,
          fill: def.fill || 'transparent',
          stroke: def.stroke || null,
          strokeWidth: def.strokeWidth || 0,
          rx: def.rx || 0, ry: def.ry || 0,
          strokeUniform: true,
        });
      } else if (def.type === 'circle') {
        obj = new Circle({
          left: def.left, top: def.top, radius: def.radius,
          fill: def.fill || 'transparent',
          stroke: def.stroke || null,
          strokeWidth: def.strokeWidth || 0,
          strokeUniform: true,
          originX: 'center', originY: 'center',
        });
      } else if (def.type === 'text') {
        const textOpts = {
          left: def.left, top: def.top,
          width: def.width || 400,
          fontFamily: def.fontFamily || 'Impact, Haettenschweiler, sans-serif',
          fontSize: def.fontSize || 72,
          fontWeight: def.fontWeight || 'normal',
          fill: def.fill || '#FFFFFF',
          textAlign: def.textAlign || 'center',
          originX: 'center', originY: 'center',
        };
        if (def.stroke) textOpts.stroke = def.stroke;
        if (def.strokeWidth) textOpts.strokeWidth = def.strokeWidth;
        if (def.shadow) textOpts.shadow = new Shadow(def.shadow);
        obj = new Textbox(def.text || 'Your Text', textOpts);
      } else if (def.type === 'line') {
        obj = new Line([def.x1, def.y1, def.x2, def.y2], {
          stroke: def.stroke || '#ffffff',
          strokeWidth: def.strokeWidth || 1,
          strokeUniform: true,
        });
      }
      if (obj) {
        obj.set({ selectable: true, evented: true });
        canvas.add(obj);
      }
    } catch (err) {
      console.error('Template object error:', err, def);
    }
  });

  restoreProjectGuides({ horizontal: [], vertical: [] });
  projectId = null;
  canvas.requestRenderAll();
  resetHistory();
  saveHistory();
  updateLayersList();
  updateObjectCount();
  setTimeout(() => zoomToFit(), 50);
  showPerspToast(`${tpl.name} template opened as a new project`);
}

async function applyUserTemplate(tpl) {
  if (!prepareToReplaceCanvas()) return;
  try {
    setTemplateCanvasDimensions(tpl.width, tpl.height);
    restoringClippingState = true;
    await canvas.loadFromJSON(tpl.data);
    attachTextEditingHosts();
    restoreLockStates(null, tpl.lockedIndices || []);
    await restoreClippingMasksFromLinks();
    restoringClippingState = false;
    restoreProjectGuides(tpl.guides);
    normalizeLegacyTextboxes();
    projectId = null;
    canvas.renderAll();
    resetHistory();
    saveHistory();
    updateLayersList();
    updateObjectCount();
    setTimeout(() => zoomToFit(), 50);
    showPerspToast(`${tpl.name} opened as a new project`);
  } catch (error) {
    restoringClippingState = false;
    console.error('Unable to open saved template:', error);
    alert('This template could not be opened.');
  }
}

function createTemplatePreviewDataUrl() {
  const multiplier = Math.min(1, 320 / CANVAS_W, 320 / CANVAS_H);
  try {
    return canvas.toDataURL({ format: 'webp', quality: 0.72, multiplier, enableRetinaScaling: false });
  } catch (error) {
    console.warn('WebP template preview failed; using PNG.', error);
    return canvas.toDataURL({ format: 'png', multiplier, enableRetinaScaling: false });
  }
}

function getLockedCanvasIndices() {
  const lockedIndices = [];
  canvas.forEachObject((object, index) => {
    if (object._clatashaLocked) lockedIndices.push(index);
  });
  return lockedIndices;
}

async function createUserTemplateRecord(name, existing = null) {
  if (paintBrushActive) finishPaintBrush();
  if (sliceActive) setTool('select');
  if (cropActive) exitStandardCrop();
  if (perspActive) exitPerspectiveCrop();
  if (paintBucketActive) finishPaintBucket();
  if (bgRemovalActive) finishBgRemoval();
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  const now = Date.now();
  return {
    id: existing?.id || `tpl_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || 'My Template').trim().slice(0, 80) || 'My Template',
    width: CANVAS_W,
    height: CANVAS_H,
    category: getTemplateCategory(CANVAS_W, CANVAS_H),
    data: JSON.stringify(normalizeSerializedGroupInteractions(canvas.toJSON(CLATASHA_OBJECT_PROPERTIES))),
    lockedIndices: getLockedCanvasIndices(),
    guides: {
      horizontal: [...userGuides.horizontal],
      vertical: [...userGuides.vertical],
    },
    preview: createTemplatePreviewDataUrl(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

async function showSaveTemplateModal() {
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  const confirmBtn = document.getElementById('modalConfirm');
  const cancelBtn = document.getElementById('modalCancel');
  const preview = createTemplatePreviewDataUrl();
  const category = getTemplateCategory(CANVAS_W, CANVAS_H);
  title.textContent = 'Save as Template';
  body.innerHTML = `<div class="template-save-preview"><div class="template-save-preview-frame"><img src="${preview}" alt="Current canvas preview"></div><div class="template-save-details"><strong>${escapeHtml(getTemplateCategoryLabel(category, CANVAS_W, CANVAS_H))}</strong><span>The editable canvas and this lightweight preview will be saved locally.</span></div></div><input type="text" id="templateNameInput" maxlength="80" placeholder="Template name..." value="My Template">`;
  confirmBtn.style.display = '';
  confirmBtn.disabled = false;
  confirmBtn.textContent = 'Save Template';
  overlay.style.display = 'flex';
  const input = document.getElementById('templateNameInput');
  setTimeout(() => { input.focus(); input.select(); }, 50);
  cancelBtn.onclick = () => { overlay.style.display = 'none'; };
  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    try {
      const record = await createUserTemplateRecord(input.value);
      await putUserTemplate(record);
      overlay.style.display = 'none';
      await buildTemplates();
      showPerspToast(`${record.name} saved to My Templates`);
    } catch (error) {
      console.error('Unable to save template:', error);
      alert('The template could not be saved.');
      confirmBtn.disabled = false;
    }
  };
}

function showRenameTemplateModal(tpl) {
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  const confirmBtn = document.getElementById('modalConfirm');
  const cancelBtn = document.getElementById('modalCancel');
  title.textContent = 'Rename Template';
  body.innerHTML = `<input type="text" id="templateNameInput" maxlength="80" value="${escapeHtmlAttribute(tpl.name)}">`;
  confirmBtn.style.display = '';
  confirmBtn.disabled = false;
  confirmBtn.textContent = 'Rename';
  overlay.style.display = 'flex';
  const input = document.getElementById('templateNameInput');
  setTimeout(() => { input.focus(); input.select(); }, 50);
  cancelBtn.onclick = () => { overlay.style.display = 'none'; };
  confirmBtn.onclick = async () => {
    const name = input.value.trim();
    if (!name) return;
    await putUserTemplate({ ...tpl, name: name.slice(0, 80), updatedAt: Date.now() });
    overlay.style.display = 'none';
    await buildTemplates();
  };
}

async function updateUserTemplateFromCanvas(tpl) {
  if (!confirm(`Replace “${tpl.name}” with the current canvas?`)) return;
  try {
    const updated = await createUserTemplateRecord(tpl.name, tpl);
    await putUserTemplate(updated);
    await buildTemplates();
    showPerspToast(`${tpl.name} updated`);
  } catch (error) {
    console.error('Unable to update template:', error);
    alert('The template could not be updated.');
  }
}

async function duplicateUserTemplate(tpl) {
  const copy = {
    ...structuredClone(tpl),
    id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: `${tpl.name} Copy`.slice(0, 80),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await putUserTemplate(copy);
  await buildTemplates();
  showPerspToast(`${copy.name} created`);
}

function exportUserTemplate(tpl) {
  const payload = {
    app: 'Clatasha Studio',
    type: 'template',
    version: '1.0',
    template: tpl,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const link = document.createElement('a');
  link.download = `${tpl.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'template'}.clatasha-template`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

async function confirmDeleteUserTemplate(tpl) {
  if (!confirm(`Delete “${tpl.name}”? Its editable data and preview will both be removed.`)) return;
  await deleteUserTemplate(tpl.id);
  await buildTemplates();
  showPerspToast(`${tpl.name} deleted`);
}

// ===== FILTERS AND ADJUSTMENT PRESETS =====
function getDefaultAdjustmentValues() {
  return Object.fromEntries(FILTER_SLIDERS.map(def => [def.name, def.default]));
}

function normalizeAdjustmentValues(values = {}) {
  const normalized = getDefaultAdjustmentValues();
  FILTER_SLIDERS.forEach(def => {
    const candidate = Number(values?.[def.name]);
    if (!Number.isFinite(candidate)) return;
    normalized[def.name] = Math.max(def.min, Math.min(def.max, candidate));
  });
  return normalized;
}

function getPresetAdjustmentValues(preset) {
  return normalizeAdjustmentValues(preset?.values || {});
}

function inferAdjustmentValuesFromFilters(obj) {
  const values = getDefaultAdjustmentValues();
  (obj?.filters || []).forEach(filter => {
    const type = filter?.type;
    if (type === 'Brightness') values.brightness = Number(filter.brightness) || 0;
    else if (type === 'Contrast') values.contrast = Number(filter.contrast) || 0;
    else if (type === 'Saturation') values.saturation = Number(filter.saturation) || 0;
    else if (type === 'Blur') values.blur = Math.max(0, Math.min(1, (Number(filter.blur) || 0) / 0.5));
    else if (type === 'HueRotation') values.hue = Number(filter.rotation) || 0;
    else if (type === 'Noise') values.noise = Number(filter.noise) || 0;
    else if (type === 'Pixelate') values.pixelate = Number(filter.blocksize) || 1;
  });
  return normalizeAdjustmentValues(values);
}

function getImageAdjustmentValues(obj) {
  if (obj?._clatashaAdjustmentValues && typeof obj._clatashaAdjustmentValues === 'object') {
    return normalizeAdjustmentValues(obj._clatashaAdjustmentValues);
  }
  return inferAdjustmentValuesFromFilters(obj);
}

function createPresetToneFilters(preset) {
  const filterLibrary = fabric.filters || fabric;
  return (preset?.toneFilters || []).map(descriptor => {
    const FilterClass = filterLibrary[descriptor.type];
    return FilterClass ? new FilterClass(structuredClone(descriptor.options || {})) : null;
  }).filter(Boolean);
}

function createCustomAdjustmentFilters(values) {
  const filterLibrary = fabric.filters || fabric;
  const normalized = normalizeAdjustmentValues(values);
  const filters = [];
  if (normalized.brightness !== 0) filters.push(new filterLibrary.Brightness({ brightness: normalized.brightness }));
  if (normalized.contrast !== 0) filters.push(new filterLibrary.Contrast({ contrast: normalized.contrast }));
  if (normalized.saturation !== 0) filters.push(new filterLibrary.Saturation({ saturation: normalized.saturation }));
  if (normalized.blur > 0) filters.push(new filterLibrary.Blur({ blur: normalized.blur * 0.5 }));
  if (normalized.hue !== 0) filters.push(new filterLibrary.HueRotation({ rotation: normalized.hue }));
  if (normalized.noise > 0) filters.push(new filterLibrary.Noise({ noise: normalized.noise }));
  if (normalized.pixelate > 1) filters.push(new filterLibrary.Pixelate({ blocksize: normalized.pixelate }));
  return filters;
}

function buildAdjustmentFilterStack(presetId, values) {
  const preset = ADJUSTMENT_PRESET_BY_ID.get(presetId);
  return [...createPresetToneFilters(preset), ...createCustomAdjustmentFilters(values)];
}

function applyAdjustmentFilterStack(obj, filters) {
  if (!obj || obj.type !== 'image') return;
  obj.filters = filters;
  obj.applyFilters();
  clearImageOutlineCache(obj);
  obj.dirty = true;
  canvas.requestRenderAll();
}

function setAdjustmentSectionExpanded(button, content, expanded) {
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  content.hidden = !expanded;
  const chevron = button.querySelector('.adjustment-section-chevron');
  if (chevron) chevron.textContent = expanded ? '\u25BE' : '\u25B8';
}

function createAdjustmentSection(title, expanded) {
  const section = document.createElement('section');
  section.className = 'adjustment-section';

  const button = document.createElement('button');
  button.className = 'adjustment-section-toggle';
  button.type = 'button';
  button.innerHTML = `<span class="adjustment-section-chevron" aria-hidden="true"></span><span>${title}</span>`;

  const content = document.createElement('div');
  content.className = 'adjustment-section-content';
  const contentId = 'adjustmentSection' + title.replace(/[^a-z0-9]/gi, '');
  content.id = contentId;
  button.setAttribute('aria-controls', contentId);
  setAdjustmentSectionExpanded(button, content, expanded);
  button.addEventListener('click', () => {
    setAdjustmentSectionExpanded(button, content, button.getAttribute('aria-expanded') !== 'true');
  });

  section.append(button, content);
  return { section, button, content };
}

function buildFilters() {
  const container = document.getElementById('filtersContent');
  if (!container) return;
  container.replaceChildren();

  const presetsSection = createAdjustmentSection('Adjustment Presets', true);
  const presetGrid = document.createElement('div');
  presetGrid.className = 'adjustment-preset-grid';
  presetGrid.id = 'adjustmentPresetGrid';

  ADJUSTMENT_PRESETS.forEach(preset => {
    const tile = document.createElement('button');
    tile.className = 'adjustment-preset-tile';
    tile.type = 'button';
    tile.dataset.adjustmentPreset = preset.id;
    tile.dataset.requiresImage = '';
    tile.title = preset.name;
    tile.setAttribute('aria-label', 'Preview and apply ' + preset.name);
    tile.setAttribute('aria-pressed', 'false');

    const image = document.createElement('img');
    image.src = ADJUSTMENT_PRESET_PREVIEW_URL;
    image.alt = '';
    image.draggable = false;
    image.style.filter = preset.previewFilter;
    image.setAttribute('aria-hidden', 'true');

    const activeMark = document.createElement('span');
    activeMark.className = 'adjustment-preset-active-mark';
    activeMark.setAttribute('aria-hidden', 'true');
    tile.append(image, activeMark);

    tile.addEventListener('pointerenter', () => beginAdjustmentPresetPreview(preset.id));
    tile.addEventListener('pointerleave', endAdjustmentPresetPreview);
    tile.addEventListener('focus', () => beginAdjustmentPresetPreview(preset.id));
    tile.addEventListener('blur', endAdjustmentPresetPreview);
    tile.addEventListener('click', () => applyAdjustmentPreset(preset.id));
    presetGrid.appendChild(tile);
  });
  presetsSection.content.appendChild(presetGrid);

  const customSection = createAdjustmentSection('Custom Adjustments', false);
  customSection.content.classList.add('custom-adjustments-content');
  FILTER_SLIDERS.forEach(def => {
    const row = document.createElement('div');
    row.className = 'filter-row';
    row.innerHTML = `
      <label>${def.label}</label>
      <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${def.default}" data-filter="${def.name}" data-class="${def.filterClass}" data-requires-image>
      <span class="filter-val">${def.default}</span>
    `;
    const slider = row.querySelector('input');
    slider.addEventListener('input', event => {
      const value = parseFloat(event.target.value);
      event.target.nextElementSibling.textContent = value;
      applyFilter(def, value);
    });
    slider.addEventListener('change', () => saveHistory());
    customSection.content.appendChild(row);
  });

  const resetBtn = document.createElement('button');
  resetBtn.className = 'filter-reset';
  resetBtn.type = 'button';
  resetBtn.dataset.requiresImage = '';
  resetBtn.textContent = 'Reset All Adjustments';
  resetBtn.addEventListener('click', resetFilters);
  customSection.content.appendChild(resetBtn);

  container.append(presetsSection.section, customSection.section);
}

function beginAdjustmentPresetPreview(presetId) {
  const obj = canvas?.getActiveObject();
  const preset = ADJUSTMENT_PRESET_BY_ID.get(presetId);
  if (!obj || obj.type !== 'image' || !preset) return;
  if (adjustmentPresetPreview?.object === obj && adjustmentPresetPreview?.presetId === presetId) return;
  endAdjustmentPresetPreview();
  adjustmentPresetPreview = {
    object: obj,
    presetId,
    filters: [...(obj.filters || [])],
  };
  applyAdjustmentFilterStack(obj, buildAdjustmentFilterStack(preset.id, getPresetAdjustmentValues(preset)));
}

function endAdjustmentPresetPreview() {
  const preview = adjustmentPresetPreview;
  adjustmentPresetPreview = null;
  if (!preview?.object) return;
  applyAdjustmentFilterStack(preview.object, preview.filters);
}

function applyAdjustmentPreset(presetId) {
  const obj = canvas?.getActiveObject();
  const preset = ADJUSTMENT_PRESET_BY_ID.get(presetId);
  if (!obj || obj.type !== 'image' || !preset) return;

  adjustmentPresetPreview = null;
  const values = getPresetAdjustmentValues(preset);
  obj._clatashaAdjustmentPreset = preset.id;
  obj._clatashaAdjustmentValues = values;
  obj._clatashaAdjustmentPresetModified = false;
  applyAdjustmentFilterStack(obj, buildAdjustmentFilterStack(preset.id, values));
  updateFilterSliders(obj);
  saveHistory();
}

function applyFilter(filterDef, value) {
  const obj = canvas?.getActiveObject();
  if (!obj || obj.type !== 'image') return;

  endAdjustmentPresetPreview();
  const values = getImageAdjustmentValues(obj);
  values[filterDef.name] = value;
  obj._clatashaAdjustmentValues = normalizeAdjustmentValues(values);
  if (obj._clatashaAdjustmentPreset) obj._clatashaAdjustmentPresetModified = true;
  applyAdjustmentFilterStack(
    obj,
    buildAdjustmentFilterStack(obj._clatashaAdjustmentPreset, obj._clatashaAdjustmentValues),
  );
  syncAdjustmentPresetUI(obj);
}

function resetFilters() {
  const obj = canvas?.getActiveObject();
  if (!obj || obj.type !== 'image') return;
  endAdjustmentPresetPreview();
  delete obj._clatashaAdjustmentPreset;
  delete obj._clatashaAdjustmentValues;
  delete obj._clatashaAdjustmentPresetModified;
  applyAdjustmentFilterStack(obj, []);
  updateFilterSliders(obj);
  saveHistory();
}

function syncAdjustmentPresetUI(obj) {
  const presetId = obj?.type === 'image' ? obj._clatashaAdjustmentPreset : '';
  document.querySelectorAll('[data-adjustment-preset]').forEach(tile => {
    const active = tile.dataset.adjustmentPreset === presetId;
    tile.classList.toggle('active', active);
    tile.classList.toggle('modified', active && !!obj?._clatashaAdjustmentPresetModified);
    tile.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function updateFilterSliders(obj) {
  const values = obj?.type === 'image' ? getImageAdjustmentValues(obj) : getDefaultAdjustmentValues();
  document.querySelectorAll('#filtersContent input[data-filter]').forEach(slider => {
    const def = FILTER_SLIDERS.find(item => item.name === slider.dataset.filter);
    if (!def) return;
    const value = values[def.name];
    slider.value = value;
    slider.nextElementSibling.textContent = value;
  });
  syncAdjustmentPresetUI(obj);
}

// ===== BACKGROUND REMOVAL (COLOR-BASED) =====
let bgRemovalActive = false;
let bgRemovalTarget = null;
// Save original cursor settings so we can restore them
let _savedDefaultCursor = 'default';
let _savedHoverCursor = 'move';

function startBgRemoval(imgObj) {
  bgRemovalActive = true;
  bgRemovalTarget = imgObj;
  // Override Fabric.js cursors at the canvas level so crosshair shows even over objects
  _savedDefaultCursor = canvas.defaultCursor || 'default';
  _savedHoverCursor = canvas.hoverCursor || 'move';
  applyToolCursor('bgremove');
  // Also set on the upper canvas element directly (Fabric renders this on top)
  if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.cursor = toolCursorUrl('bgremove');
  // Disable object selection so Fabric doesn't change cursor on hover
  canvas.selection = false;
  canvas.skipTargetFind = true;
  // Highlight toolbar button
  const btn = document.querySelector('.tool-btn[data-tool="bgremove"]');
  if (btn) btn.classList.add('active');
}

function finishBgRemoval() {
  bgRemovalActive = false;
  bgRemovalTarget = null;
  // Restore Fabric.js cursors
  canvas.defaultCursor = _savedDefaultCursor;
  canvas.hoverCursor = _savedHoverCursor;
  applyToolCursor(currentTool === 'bgremove' ? 'select' : currentTool);
  canvas.selection = true;
  canvas.skipTargetFind = false;
  // Un-highlight toolbar button
  const btn = document.querySelector('.tool-btn[data-tool="bgremove"]');
  if (btn) btn.classList.remove('active');
  hideBgToleranceBar();
}

window.removeBgAtPoint = function(pointer) {
  if (!bgRemovalActive || !bgRemovalTarget) return false;
  const obj = bgRemovalTarget;

  // Get the image element from the fabric image
  const imgEl = obj.getElement();
  if (!imgEl) { finishBgRemoval(); return false; }

  // Create a temporary canvas to read pixel data
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = imgEl.naturalWidth || imgEl.width;
  tmpCanvas.height = imgEl.naturalHeight || imgEl.height;
  const ctx = tmpCanvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0);

  // Convert canvas pointer to image pixel coordinates.
  // getPointer returns scene coordinates; getBoundingRect returns viewport-absolute coords.
  // We convert the pointer to viewport-absolute to match bounds.
  const vpt = canvas.viewportTransform;
  const absPointerX = pointer.x * vpt[0] + vpt[4];
  const absPointerY = pointer.y * vpt[3] + vpt[5];
  const bounds = obj.getBoundingRect();
  const imgX = Math.floor((absPointerX - bounds.left) / (bounds.width) * tmpCanvas.width);
  const imgY = Math.floor((absPointerY - bounds.top) / (bounds.height) * tmpCanvas.height);

  // If clicked outside the image, just ignore (don't exit mode)
  if (imgX < 0 || imgY < 0 || imgX >= tmpCanvas.width || imgY >= tmpCanvas.height) {
    return false;
  }

  // Sample the clicked color
  const imageData = ctx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
  const pixels = imageData.data;
  const idx = (imgY * tmpCanvas.width + imgX) * 4;
  const sr = pixels[idx], sg = pixels[idx + 1], sb = pixels[idx + 2];

  // Get tolerance from toolbar slider (we'll add it near the canvas)
  const tolEl = document.getElementById('bgTolerance');
  const tolerance = tolEl ? parseInt(tolEl.value) : 30;

  // Remove similar colors globally
  const tolSq = tolerance * tolerance * 3;
  for (let i = 0; i < pixels.length; i += 4) {
    const dr = pixels[i] - sr;
    const dg = pixels[i + 1] - sg;
    const db = pixels[i + 2] - sb;
    if (dr * dr + dg * dg + db * db <= tolSq) {
      pixels[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Create new image from modified canvas
  const dataURL = tmpCanvas.toDataURL('image/png');
  const currentLeft = obj.left, currentTop = obj.top;
  const currentScaleX = obj.scaleX, currentScaleY = obj.scaleY;
  const currentAngle = obj.angle;
  const currentOriginX = obj.originX, currentOriginY = obj.originY;
  const currentName = obj.name;
  const currentSourceName = obj._clatashaSourceName;
  const currentLayerIndex = canvas.getObjects().indexOf(obj);
  const currentClipId = isClippedLayer(obj) ? obj._clatashaClipId : null;
  const currentClipBase = currentClipId ? getClippingBase(currentClipId) : null;
  const currentMaskType = getImageMaskType(obj);
  const currentMaskRadius = obj._clatashaMaskRadius ?? 18;

  FabricImage.fromURL(dataURL).then(async newImg => {
    newImg.set({
      left: currentLeft,
      top: currentTop,
      scaleX: currentScaleX,
      scaleY: currentScaleY,
      angle: currentAngle,
      originX: currentOriginX,
      originY: currentOriginY,
      name: currentName,
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
      strokeUniform: obj.strokeUniform,
      _clatashaSourceName: currentSourceName,
      _clatashaImageOutlineColor: obj._clatashaImageOutlineColor,
      _clatashaImageOutlineWidth: obj._clatashaImageOutlineWidth,
      _clatashaMaskType: obj._clatashaMaskType,
      _clatashaMaskRadius: obj._clatashaMaskRadius,
      _clatashaClipRole: currentClipId ? 'content' : undefined,
      _clatashaClipId: currentClipId || undefined,
    });
    restoringClippingState = true;
    canvas.remove(obj);
    canvas.insertAt(Math.max(1, currentLayerIndex), newImg);
    restoringClippingState = false;
    if (currentClipBase && canvas.getObjects().includes(currentClipBase)) {
      newImg.set('clipPath', await buildClippingPath(currentClipBase));
    } else {
      clearClippingMetadata(newImg, false);
      if (currentMaskType !== 'none') applyImageMask(newImg, currentMaskType, currentMaskRadius, false);
    }
    canvas.setActiveObject(newImg);
    // Keep BG removal mode active, update target to new image
    bgRemovalTarget = newImg;
    canvas.renderAll();
    saveHistory();
    // Re-apply the recognizable cursor after replacing the image.
    applyToolCursor('bgremove');
    canvas.selection = false;
    canvas.skipTargetFind = true;
  }).catch(error => {
    restoringClippingState = false;
    console.error('Background removal failed:', error);
    showPerspToast('Background removal failed. The original image was kept.');
  });

  return true;
};

// ===== BG REMOVAL TOLERANCE BAR =====
function showBgToleranceBar() {
  let bar = document.getElementById('bgToleranceBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'bgToleranceBar';
    bar.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:var(--bg-panel,\'#1e1e2e\');border:1px solid var(--border-color,\'#333\');border-radius:8px;padding:8px 16px;display:flex;align-items:center;gap:10px;z-index:100;font-size:12px;color:var(--text-primary,\'#eee\');box-shadow:0 4px 12px rgba(0,0,0,0.4)';
    bar.innerHTML = '<span style="white-space:nowrap">Tolerance:</span><input type="range" id="bgTolerance" min="5" max="80" value="30" style="width:120px;accent-color:var(--accent,#7C3AED)"><span id="bgToleranceVal" style="min-width:20px;text-align:center">30</span><span style="opacity:0.5;margin-left:4px">|</span><span style="opacity:0.5;font-size:10px">Click color to remove</span>';
    document.getElementById('canvasArea').appendChild(bar);
  }
  bar.style.display = 'flex';
  const slider = document.getElementById('bgTolerance');
  const valSpan = document.getElementById('bgToleranceVal');
  if (slider && valSpan) {
    slider.oninput = () => { valSpan.textContent = slider.value; };
  }
}

function hideBgToleranceBar() {
  const bar = document.getElementById('bgToleranceBar');
  if (bar) bar.style.display = 'none';
}

// ===== PAINT BUCKET (per-image, Photoshop-style connected fill) =====
let paintBucketActive = false;
let paintBucketTarget = null;
let paintBucketSavedCursor = null;

function startPaintBucket(imgObj) {
  paintBucketActive = true;
  paintBucketTarget = imgObj;
  paintBucketSavedCursor = {
    defaultCursor: canvas.defaultCursor || 'default',
    hoverCursor: canvas.hoverCursor || 'move',
    selection: canvas.selection,
    skipTargetFind: canvas.skipTargetFind,
  };
  applyToolCursor('bucket');
  canvas.selection = false;
  canvas.skipTargetFind = true;
  if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.cursor = toolCursorUrl('bucket');
  showPaintBucketBar();
}

function finishPaintBucket() {
  if (!paintBucketActive) return;
  paintBucketActive = false;
  paintBucketTarget = null;
  if (paintBucketSavedCursor) {
    canvas.defaultCursor = paintBucketSavedCursor.defaultCursor;
    canvas.hoverCursor = paintBucketSavedCursor.hoverCursor;
    canvas.selection = paintBucketSavedCursor.selection;
    canvas.skipTargetFind = paintBucketSavedCursor.skipTargetFind;
  } else {
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.selection = true;
    canvas.skipTargetFind = false;
  }
  paintBucketSavedCursor = null;
  applyToolCursor(currentTool === 'bucket' ? 'select' : currentTool);
  hidePaintBucketBar();
}

function showPaintBucketBar() {
  let bar = document.getElementById('paintBucketBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'paintBucketBar';
    bar.className = 'paint-bucket-bar';
    bar.innerHTML =
      '<span class="bucket-label">Paint Bucket</span>' +
      '<span>Tolerance</span>' +
      '<input type="range" id="paintBucketTolerance" min="0" max="255" value="32">' +
      '<span id="paintBucketToleranceValue" class="bucket-value">32</span>' +
      '<label class="bucket-check"><input type="checkbox" id="paintBucketContiguous" checked> Contiguous</label>' +
      '<span class="bucket-help">Click the selected image to fill</span>';
    document.getElementById('canvasArea').appendChild(bar);
    const slider = bar.querySelector('#paintBucketTolerance');
    slider.addEventListener('input', () => {
      bar.querySelector('#paintBucketToleranceValue').textContent = slider.value;
    });
  }
  bar.style.display = 'flex';
}

function hidePaintBucketBar() {
  const bar = document.getElementById('paintBucketBar');
  if (bar) bar.style.display = 'none';
}

function parseHexColor(hex) {
  const normalized = String(hex || '#000000').replace('#', '').trim();
  const value = normalized.length === 3
    ? normalized.split('').map(ch => ch + ch).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(value.slice(0, 2), 16) || 0,
    g: parseInt(value.slice(2, 4), 16) || 0,
    b: parseInt(value.slice(4, 6), 16) || 0,
    a: 255,
  };
}

function pixelMatchesBucket(data, offset, sample, toleranceSq) {
  const alpha = data[offset + 3];
  if (sample.a === 0) return alpha === 0;
  const dr = data[offset] - sample.r;
  const dg = data[offset + 1] - sample.g;
  const db = data[offset + 2] - sample.b;
  const da = alpha - sample.a;
  return dr * dr + dg * dg + db * db + da * da <= toleranceSq;
}

function writeBucketPixel(data, offset, fill) {
  data[offset] = fill.r;
  data[offset + 1] = fill.g;
  data[offset + 2] = fill.b;
  data[offset + 3] = fill.a;
}

function floodFillPixels(imageData, seedX, seedY, bounds, sample, fill, tolerance) {
  const { width, data } = imageData;
  const { minX, minY, maxX, maxY } = bounds;
  const toleranceSq = tolerance * tolerance * 4;
  const visited = new Uint8Array(width * imageData.height);
  const stack = [seedY * width + seedX];
  let changed = 0;

  const canFill = (x, y) => {
    if (x < minX || x >= maxX || y < minY || y >= maxY) return false;
    const p = y * width + x;
    return !visited[p] && pixelMatchesBucket(data, p * 4, sample, toleranceSq);
  };

  while (stack.length) {
    const packed = stack.pop();
    const y = Math.floor(packed / width);
    const seed = packed - y * width;
    if (!canFill(seed, y)) continue;

    let left = seed;
    while (left > minX && canFill(left - 1, y)) left--;
    let spanAbove = false;
    let spanBelow = false;

    for (let x = left; x < maxX && canFill(x, y); x++) {
      const p = y * width + x;
      visited[p] = 1;
      writeBucketPixel(data, p * 4, fill);
      changed++;

      if (y > minY) {
        if (canFill(x, y - 1)) {
          if (!spanAbove) stack.push((y - 1) * width + x);
          spanAbove = true;
        } else spanAbove = false;
      }
      if (y + 1 < maxY) {
        if (canFill(x, y + 1)) {
          if (!spanBelow) stack.push((y + 1) * width + x);
          spanBelow = true;
        } else spanBelow = false;
      }
    }
  }
  return changed;
}

function applyPaintBucketAtPoint(pointer) {
  const obj = paintBucketTarget;
  if (!paintBucketActive || !obj || obj.type !== 'image') return false;
  const source = obj._originalElement || obj.getElement();
  if (!source) return false;

  const sourceW = source.naturalWidth || source.videoWidth || source.width;
  const sourceH = source.naturalHeight || source.videoHeight || source.height;
  if (!sourceW || !sourceH) return false;

  let local;
  try {
    local = fabric.util.transformPoint(
      new fabric.Point(pointer.x, pointer.y),
      fabric.util.invertTransform(obj.calcTransformMatrix())
    );
  } catch (err) {
    console.warn('Paint bucket coordinate conversion failed', err);
    return false;
  }

  const cropX = Math.max(0, Math.floor(obj.cropX || 0));
  const cropY = Math.max(0, Math.floor(obj.cropY || 0));
  const visibleW = Math.max(1, Math.min(sourceW - cropX, Math.round(obj.width || sourceW)));
  const visibleH = Math.max(1, Math.min(sourceH - cropY, Math.round(obj.height || sourceH)));
  const imgX = Math.floor(cropX + local.x + visibleW / 2);
  const imgY = Math.floor(cropY + local.y + visibleH / 2);
  if (imgX < cropX || imgY < cropY || imgX >= cropX + visibleW || imgY >= cropY + visibleH) return false;

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = sourceW;
  tmpCanvas.height = sourceH;
  const ctx = tmpCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, sourceW, sourceH);
  const imageData = ctx.getImageData(0, 0, sourceW, sourceH);
  const offset = (imgY * sourceW + imgX) * 4;
  const sample = {
    r: imageData.data[offset],
    g: imageData.data[offset + 1],
    b: imageData.data[offset + 2],
    a: imageData.data[offset + 3],
  };
  const fill = parseHexColor(document.getElementById('fillColor').value);
  const tolerance = parseInt(document.getElementById('paintBucketTolerance')?.value || '32', 10);
  const contiguous = document.getElementById('paintBucketContiguous')?.checked !== false;
  const toleranceSq = tolerance * tolerance * 4;
  let changed = 0;

  if (contiguous) {
    changed = floodFillPixels(
      imageData,
      imgX,
      imgY,
      { minX: cropX, minY: cropY, maxX: cropX + visibleW, maxY: cropY + visibleH },
      sample,
      fill,
      tolerance
    );
  } else {
    for (let y = cropY; y < cropY + visibleH; y++) {
      for (let x = cropX; x < cropX + visibleW; x++) {
        const i = (y * sourceW + x) * 4;
        if (pixelMatchesBucket(imageData.data, i, sample, toleranceSq)) {
          writeBucketPixel(imageData.data, i, fill);
          changed++;
        }
      }
    }
  }

  if (!changed) return true;
  ctx.putImageData(imageData, 0, 0);

  const preservedFilters = Array.isArray(obj.filters) ? [...obj.filters] : [];
  const visibleWidth = obj.width;
  const visibleHeight = obj.height;
  obj.filters = [];
  obj.setElement(tmpCanvas, { width: visibleWidth, height: visibleHeight });
  obj.filters = preservedFilters;
  if (preservedFilters.length) obj.applyFilters();
  // A raster color edit becomes the new restoration baseline for future cutouts.
  delete obj._clatashaCutoutOriginalSrc;
  clearImageOutlineCache(obj);
  obj.dirty = true;
  obj.setCoords();
  canvas.requestRenderAll();
  saveHistory();
  return true;
}

// ===== BRUSH STUDIO (raster Paint Layers) =====
function getNextPaintLayerName() {
  const names = new Set(canvas.getObjects().map(obj => String(obj.name || '')));
  let index = 1;
  while (names.has('Paint Layer ' + index)) index++;
  return 'Paint Layer ' + index;
}

function createPaintLayer() {
  const pixelCanvas = document.createElement('canvas');
  pixelCanvas.width = CANVAS_W;
  pixelCanvas.height = CANVAS_H;
  const name = getNextPaintLayerName();
  const layer = new FabricImage(pixelCanvas, {
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
    width: CANVAS_W,
    height: CANVAS_H,
    name,
    _clatashaSourceName: name,
    _clatashaPaintLayer: true,
    objectCaching: false,
    perPixelTargetFind: true,
    imageSmoothing: true,
  });
  canvas.add(layer);
  canvas.bringObjectToFront(layer);
  canvas.setActiveObject(layer);
  layer.setCoords();
  canvas.requestRenderAll();
  saveHistory();
  updateLayersList();
  updateObjectCount();
  return layer;
}

function setPaintBrushInteractionEnabled(enabled) {
  if (enabled) {
    paintBrushSavedInteraction = {
      defaultCursor: canvas.defaultCursor || 'default',
      hoverCursor: canvas.hoverCursor || 'move',
      selection: canvas.selection,
      skipTargetFind: canvas.skipTargetFind,
    };
    canvas.defaultCursor = 'none';
    canvas.hoverCursor = 'none';
    canvas.selection = false;
    canvas.skipTargetFind = true;
    if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.cursor = 'none';
    document.getElementById('canvasArea').style.cursor = 'none';
    return;
  }

  if (paintBrushSavedInteraction) {
    canvas.defaultCursor = paintBrushSavedInteraction.defaultCursor;
    canvas.hoverCursor = paintBrushSavedInteraction.hoverCursor;
    canvas.selection = paintBrushSavedInteraction.selection;
    canvas.skipTargetFind = paintBrushSavedInteraction.skipTargetFind;
  } else {
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.selection = true;
    canvas.skipTargetFind = false;
  }
  paintBrushSavedInteraction = null;
  if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.cursor = '';
}

function preparePaintBrushTarget(layer) {
  if (!layer?._clatashaPaintLayer || layer.type !== 'image') return false;
  const source = layer._originalElement || layer.getElement();
  const sourceWidth = source?.naturalWidth || source?.videoWidth || source?.width || layer.width;
  const sourceHeight = source?.naturalHeight || source?.videoHeight || source?.height || layer.height;
  if (!source || !sourceWidth || !sourceHeight) return false;

  const working = createImagePixelCanvas(source, sourceWidth, sourceHeight);
  paintBrushTarget = layer;
  paintBrushWorkingCanvas = working.canvas;
  paintBrushWorkingContext = working.context;
  paintBrushTargetControlState = {
    hasControls: layer.hasControls,
    hasBorders: layer.hasBorders,
    objectCaching: layer.objectCaching,
  };
  layer.set({ hasControls: false, hasBorders: false, objectCaching: false, perPixelTargetFind: true });
  layer.setElement(paintBrushWorkingCanvas, { width: layer.width, height: layer.height });
  layer._clatashaPaintLayer = true;
  layer._clatashaSourceName = layer._clatashaSourceName || layer.name || 'Paint Layer';
  layer.dirty = true;
  layer.setCoords();
  canvas.setActiveObject(layer);
  canvas.requestRenderAll();
  updateBrushStudioTitle();
  return true;
}

function restorePaintBrushTargetControls() {
  if (!paintBrushTarget || !paintBrushTargetControlState) return;
  paintBrushTarget.set({
    hasControls: paintBrushTargetControlState.hasControls,
    hasBorders: paintBrushTargetControlState.hasBorders,
    objectCaching: paintBrushTargetControlState.objectCaching,
  });
  paintBrushTarget.dirty = true;
  paintBrushTarget.setCoords();
}

function startPaintBrush(forceNewLayer = false) {
  paintBrushActive = true;
  paintBrushDrawing = false;
  paintBrushChanged = false;
  paintBrushEraseMode = false;
  paintBrushLastPoint = null;
  paintBrushSmoothedPoint = null;
  setPaintBrushInteractionEnabled(true);
  showBrushStudioBar();

  const selected = canvas.getActiveObject();
  const layer = !forceNewLayer && selected?._clatashaPaintLayer && !selected._clatashaLocked
    ? selected
    : createPaintLayer();
  if (!preparePaintBrushTarget(layer)) {
    showPerspToast('A Paint Layer could not be prepared');
    finishPaintBrush();
    return;
  }

  if (canvas.upperCanvasEl && !canvas.upperCanvasEl._clatashaPaintBrushLeaveHandler) {
    canvas.upperCanvasEl.addEventListener('mouseleave', hidePaintBrushCursor);
    canvas.upperCanvasEl._clatashaPaintBrushLeaveHandler = true;
  }
  showPerspToast((forceNewLayer || layer !== selected ? layer.name + ' created. ' : '') + 'Paint directly on this layer.');
}

function finishPaintBrush() {
  if (!paintBrushActive) return;
  if (paintBrushDrawing) endPaintBrushStroke();
  const target = paintBrushTarget;
  restorePaintBrushTargetControls();
  paintBrushActive = false;
  paintBrushDrawing = false;
  paintBrushChanged = false;
  paintBrushLastPoint = null;
  paintBrushSmoothedPoint = null;
  paintBrushWorkingCanvas = null;
  paintBrushWorkingContext = null;
  paintBrushTarget = null;
  paintBrushTargetControlState = null;
  setPaintBrushInteractionEnabled(false);
  hideBrushStudioBar();
  hidePaintBrushCursor();
  currentTool = 'select';
  document.querySelectorAll('.tool-btn').forEach(button => button.classList.remove('active'));
  document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
  applyToolCursor('select');
  if (target) {
    canvas.setActiveObject(target);
    target.dirty = true;
    target.setCoords();
  }
  canvas.requestRenderAll();
  updateLayersList();
}

function createNewPaintLayerForBrush() {
  if (!paintBrushActive) return;
  if (paintBrushDrawing) endPaintBrushStroke();
  restorePaintBrushTargetControls();
  paintBrushTarget = null;
  paintBrushWorkingCanvas = null;
  paintBrushWorkingContext = null;
  paintBrushTargetControlState = null;
  const layer = createPaintLayer();
  if (preparePaintBrushTarget(layer)) showPerspToast(layer.name + ' created');
}

function clearCurrentPaintLayer() {
  if (!paintBrushActive || !paintBrushWorkingContext || !paintBrushWorkingCanvas || !paintBrushTarget) return;
  if (paintBrushDrawing) endPaintBrushStroke();
  paintBrushWorkingContext.clearRect(0, 0, paintBrushWorkingCanvas.width, paintBrushWorkingCanvas.height);
  paintBrushTarget.dirty = true;
  canvas.requestRenderAll();
  saveHistory();
  showPerspToast(paintBrushTarget.name + ' cleared. Undo is available.');
}

function getPaintBrushPoint(pointer, event) {
  const layer = paintBrushTarget;
  if (!layer || !paintBrushWorkingCanvas) return null;
  let local;
  try {
    local = fabric.util.transformPoint(
      new fabric.Point(pointer.x, pointer.y),
      fabric.util.invertTransform(layer.calcTransformMatrix())
    );
  } catch (_) {
    return null;
  }

  const sourceWidth = paintBrushWorkingCanvas.width;
  const sourceHeight = paintBrushWorkingCanvas.height;
  const visibleWidth = Math.max(1, Number(layer.width) || sourceWidth);
  const visibleHeight = Math.max(1, Number(layer.height) || sourceHeight);
  const x = (local.x + visibleWidth / 2) * sourceWidth / visibleWidth;
  const y = (local.y + visibleHeight / 2) * sourceHeight / visibleHeight;
  if (x < 0 || y < 0 || x >= sourceWidth || y >= sourceHeight) return null;

  const scaling = layer.getObjectScaling ? layer.getObjectScaling() : { x: layer.scaleX || 1, y: layer.scaleY || 1 };
  const sourceRatioX = sourceWidth / visibleWidth;
  const sourceRatioY = sourceHeight / visibleHeight;
  const pressure = event && Number(event.pressure) > 0 ? Math.max(0.15, Number(event.pressure)) : 1;
  return {
    x,
    y,
    radiusX: Math.max(0.5, paintBrushSettings.size * pressure * sourceRatioX / (2 * Math.max(0.001, Math.abs(scaling.x || 1)))),
    radiusY: Math.max(0.5, paintBrushSettings.size * pressure * sourceRatioY / (2 * Math.max(0.001, Math.abs(scaling.y || 1)))),
    pressure,
    angle: 0,
  };
}

function smoothPaintBrushPoint(rawPoint) {
  if (!rawPoint || !paintBrushSmoothedPoint) {
    paintBrushSmoothedPoint = rawPoint;
    return rawPoint;
  }
  const smoothing = Math.max(0, Math.min(100, paintBrushSettings.smoothing)) / 100;
  const response = Math.max(0.16, 1 - smoothing * 0.82);
  const previous = paintBrushSmoothedPoint;
  const next = {
    x: previous.x + (rawPoint.x - previous.x) * response,
    y: previous.y + (rawPoint.y - previous.y) * response,
    radiusX: previous.radiusX + (rawPoint.radiusX - previous.radiusX) * response,
    radiusY: previous.radiusY + (rawPoint.radiusY - previous.radiusY) * response,
    pressure: previous.pressure + (rawPoint.pressure - previous.pressure) * response,
    angle: Math.atan2(rawPoint.y - previous.y, rawPoint.x - previous.x),
  };
  paintBrushSmoothedPoint = next;
  return next;
}

function paintBrushColor(alpha) {
  const color = parseHexColor(paintBrushSettings.color);
  return 'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + Math.max(0, Math.min(1, alpha)) + ')';
}

function getPaintBrushComposite() {
  return paintBrushEraseMode ? 'destination-out' : (paintBrushSettings.composite || 'source-over');
}

function drawRoundPaintDab(point, alpha, hardness = paintBrushSettings.hardness) {
  const context = paintBrushWorkingContext;
  if (!context) return;
  context.save();
  context.globalCompositeOperation = getPaintBrushComposite();
  context.translate(point.x, point.y);
  context.scale(point.radiusX, point.radiusY);
  context.beginPath();
  context.arc(0, 0, 1, 0, Math.PI * 2);
  const hardEdge = Math.max(0, Math.min(1, hardness / 100));
  if (hardEdge >= 0.995) {
    context.fillStyle = paintBrushColor(alpha);
  } else {
    const gradient = context.createRadialGradient(0, 0, Math.min(0.98, hardEdge), 0, 0, 1);
    gradient.addColorStop(0, paintBrushColor(alpha));
    if (hardEdge > 0) gradient.addColorStop(hardEdge, paintBrushColor(alpha));
    gradient.addColorStop(1, paintBrushColor(0));
    context.fillStyle = gradient;
  }
  context.fill();
  context.restore();
}

function drawMarkerPaintDab(point, alpha) {
  const context = paintBrushWorkingContext;
  if (!context) return;
  context.save();
  context.globalCompositeOperation = getPaintBrushComposite();
  context.translate(point.x, point.y);
  context.rotate(point.angle || 0);
  context.beginPath();
  context.ellipse(0, 0, point.radiusX, Math.max(1, point.radiusY * 0.38), 0, 0, Math.PI * 2);
  context.fillStyle = paintBrushColor(alpha);
  context.fill();
  context.restore();
}

function drawSprayPaintDab(point, alpha) {
  const context = paintBrushWorkingContext;
  if (!context) return;
  const density = Math.max(8, Math.round(8 + (point.radiusX + point.radiusY) * paintBrushSettings.flow / 900));
  context.save();
  context.globalCompositeOperation = getPaintBrushComposite();
  context.fillStyle = paintBrushColor(Math.min(1, alpha * 1.8));
  for (let index = 0; index < density; index++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random());
    const x = point.x + Math.cos(angle) * point.radiusX * distance;
    const y = point.y + Math.sin(angle) * point.radiusY * distance;
    const radius = Math.max(0.45, Math.min(point.radiusX, point.radiusY) * (0.018 + Math.random() * 0.035));
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawTexturePaintDab(point, alpha) {
  const context = paintBrushWorkingContext;
  if (!context) return;
  const pieces = Math.max(7, Math.round(7 + paintBrushSettings.flow / 7));
  context.save();
  context.globalCompositeOperation = getPaintBrushComposite();
  context.fillStyle = paintBrushColor(Math.min(1, alpha * 1.35));
  for (let index = 0; index < pieces; index++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random());
    const x = point.x + Math.cos(angle) * point.radiusX * distance;
    const y = point.y + Math.sin(angle) * point.radiusY * distance;
    const width = Math.max(1, point.radiusX * (0.04 + Math.random() * 0.13));
    const height = Math.max(1, point.radiusY * (0.025 + Math.random() * 0.08));
    context.save();
    context.translate(x, y);
    context.rotate((point.angle || 0) + (Math.random() - 0.5) * 1.4);
    context.fillRect(-width / 2, -height / 2, width, height);
    context.restore();
  }
  context.restore();
}

function dabPaintBrush(point) {
  if (!point || !paintBrushWorkingContext) return;
  const opacity = paintBrushSettings.opacity / 100;
  const flow = paintBrushSettings.flow / 100;
  const alpha = Math.max(0.008, opacity * flow * point.pressure);
  if (paintBrushSettings.kind === 'spray') drawSprayPaintDab(point, alpha);
  else if (paintBrushSettings.kind === 'texture') drawTexturePaintDab(point, alpha);
  else if (paintBrushSettings.kind === 'marker') drawMarkerPaintDab(point, alpha);
  else if (paintBrushSettings.kind === 'glow') {
    drawRoundPaintDab(point, alpha * 0.48, 0);
    drawRoundPaintDab({ ...point, radiusX: point.radiusX * 0.34, radiusY: point.radiusY * 0.34 }, Math.min(1, alpha * 1.7), 28);
  } else drawRoundPaintDab(point, alpha);
  paintBrushChanged = true;
}

function renderPaintBrushStroke() {
  if (!paintBrushTarget) return;
  paintBrushTarget.dirty = true;
  clearImageOutlineCache(paintBrushTarget);
  canvas.requestRenderAll();
}

function paintBrushSegment(from, to) {
  if (!to) return;
  if (!from) {
    dabPaintBrush(to);
    renderPaintBrushStroke();
    return;
  }
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const diameter = Math.max(1, (to.radiusX + to.radiusY));
  const spacing = Math.max(0.75, diameter * paintBrushSettings.spacing / 100);
  const steps = Math.max(1, Math.ceil(distance / spacing));
  for (let step = 1; step <= steps; step++) {
    const amount = step / steps;
    dabPaintBrush({
      x: from.x + (to.x - from.x) * amount,
      y: from.y + (to.y - from.y) * amount,
      radiusX: from.radiusX + (to.radiusX - from.radiusX) * amount,
      radiusY: from.radiusY + (to.radiusY - from.radiusY) * amount,
      pressure: from.pressure + (to.pressure - from.pressure) * amount,
      angle: Math.atan2(to.y - from.y, to.x - from.x),
    });
  }
  renderPaintBrushStroke();
}

function beginPaintBrushStroke(pointer, event) {
  if (!paintBrushWorkingContext || !paintBrushTarget) return;
  const rawPoint = getPaintBrushPoint(pointer, event);
  if (!rawPoint) return;
  paintBrushDrawing = true;
  paintBrushChanged = false;
  paintBrushSmoothedPoint = null;
  const point = smoothPaintBrushPoint(rawPoint);
  paintBrushLastPoint = point;
  paintBrushSegment(null, point);
}

function continuePaintBrushStroke(pointer, event) {
  if (!paintBrushDrawing) return;
  const rawPoint = getPaintBrushPoint(pointer, event);
  if (!rawPoint) {
    paintBrushLastPoint = null;
    paintBrushSmoothedPoint = null;
    return;
  }
  const point = smoothPaintBrushPoint(rawPoint);
  paintBrushSegment(paintBrushLastPoint, point);
  paintBrushLastPoint = point;
}

function endPaintBrushStroke(pointer, event) {
  if (!paintBrushDrawing) return;
  if (pointer && event) {
    const rawPoint = getPaintBrushPoint(pointer, event);
    if (rawPoint) paintBrushSegment(paintBrushLastPoint, rawPoint);
  }
  paintBrushDrawing = false;
  paintBrushLastPoint = null;
  paintBrushSmoothedPoint = null;
  if (paintBrushChanged && paintBrushTarget) {
    paintBrushTarget.dirty = true;
    paintBrushTarget.setCoords();
    saveHistory();
  }
  paintBrushChanged = false;
}

function getPaintBrushCursor() {
  let cursor = document.getElementById('paintBrushCursor');
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.id = 'paintBrushCursor';
    cursor.className = 'paint-brush-cursor';
    document.body.appendChild(cursor);
  }
  return cursor;
}

function resizePaintBrushCursor() {
  const cursor = document.getElementById('paintBrushCursor');
  if (!cursor) return;
  const diameter = Math.max(3, paintBrushSettings.size * zoomLevel);
  cursor.style.width = diameter + 'px';
  cursor.style.height = diameter + 'px';
}

function updatePaintBrushCursor(event) {
  if (!paintBrushActive) return;
  const cursor = getPaintBrushCursor();
  resizePaintBrushCursor();
  cursor.style.left = event.clientX + 'px';
  cursor.style.top = event.clientY + 'px';
  cursor.style.display = 'block';
}

function hidePaintBrushCursor() {
  const cursor = document.getElementById('paintBrushCursor');
  if (cursor) cursor.style.display = 'none';
}

function updateBrushStudioTitle() {
  const title = document.querySelector('.brush-studio-title');
  if (title) title.textContent = paintBrushTarget ? 'Brush Studio · ' + paintBrushTarget.name : 'Brush Studio';
}

function updateBrushStudioUI() {
  const values = {
    brushSize: [paintBrushSettings.size, 'brushSizeValue', ''],
    brushHardness: [paintBrushSettings.hardness, 'brushHardnessValue', '%'],
    brushOpacity: [paintBrushSettings.opacity, 'brushOpacityValue', '%'],
    brushFlow: [paintBrushSettings.flow, 'brushFlowValue', '%'],
    brushSpacing: [paintBrushSettings.spacing, 'brushSpacingValue', '%'],
    brushSmoothing: [paintBrushSettings.smoothing, 'brushSmoothingValue', '%'],
  };
  Object.entries(values).forEach(([inputId, [value, outputId, suffix]]) => {
    const input = document.getElementById(inputId);
    const output = document.getElementById(outputId);
    if (input) input.value = String(value);
    if (output) output.textContent = value + suffix;
  });
  const color = document.getElementById('brushColor');
  const preview = document.getElementById('brushColorPreview');
  if (color) color.value = paintBrushSettings.color;
  if (preview) preview.style.background = paintBrushSettings.color;
  document.querySelectorAll('[data-brush-preset]').forEach(button => {
    button.classList.toggle('active', button.dataset.brushPreset === paintBrushPresetId);
  });
  document.getElementById('brushErase')?.classList.toggle('active', paintBrushEraseMode);
  resizePaintBrushCursor();
  updateBrushStudioTitle();
}

function applyPaintBrushPreset(presetId) {
  const preset = PAINT_BRUSH_PRESETS[presetId];
  if (!preset) return;
  const color = paintBrushSettings.color;
  paintBrushPresetId = presetId;
  paintBrushSettings = { ...preset, color };
  paintBrushEraseMode = false;
  updateBrushStudioUI();
  showPerspToast(preset.name + ' selected');
}

function showBrushStudioBar() {
  const bar = document.getElementById('brushStudioBar');
  if (bar) bar.style.display = 'block';
  updateBrushStudioUI();
}

function hideBrushStudioBar() {
  const bar = document.getElementById('brushStudioBar');
  if (bar) bar.style.display = 'none';
}

function setupBrushStudio() {
  document.querySelectorAll('[data-brush-preset]').forEach(button => {
    button.addEventListener('click', () => applyPaintBrushPreset(button.dataset.brushPreset));
  });
  const sliderSettings = {
    brushSize: ['size', 'brushSizeValue', ''],
    brushHardness: ['hardness', 'brushHardnessValue', '%'],
    brushOpacity: ['opacity', 'brushOpacityValue', '%'],
    brushFlow: ['flow', 'brushFlowValue', '%'],
    brushSpacing: ['spacing', 'brushSpacingValue', '%'],
    brushSmoothing: ['smoothing', 'brushSmoothingValue', '%'],
  };
  Object.entries(sliderSettings).forEach(([inputId, [setting, outputId, suffix]]) => {
    const input = document.getElementById(inputId);
    input.addEventListener('input', () => {
      paintBrushSettings[setting] = Number(input.value);
      document.getElementById(outputId).textContent = input.value + suffix;
      document.querySelectorAll('[data-brush-preset]').forEach(button => button.classList.remove('active'));
      paintBrushPresetId = '';
      resizePaintBrushCursor();
    });
  });
  const color = document.getElementById('brushColor');
  color.addEventListener('input', () => {
    paintBrushSettings.color = color.value;
    document.getElementById('brushColorPreview').style.background = color.value;
    const strokeInput = document.getElementById('strokeColor');
    const strokePreview = document.getElementById('strokePreview');
    if (strokeInput) strokeInput.value = color.value;
    if (strokePreview) strokePreview.style.background = color.value;
  });
  document.getElementById('brushNewLayer').addEventListener('click', createNewPaintLayerForBrush);
  document.getElementById('brushErase').addEventListener('click', () => {
    paintBrushEraseMode = !paintBrushEraseMode;
    updateBrushStudioUI();
    showPerspToast(paintBrushEraseMode ? 'Paint Layer eraser enabled' : 'Brush painting enabled');
  });
  document.getElementById('brushClearLayer').addEventListener('click', clearCurrentPaintLayer);
  document.getElementById('brushDone').addEventListener('click', () => setTool('select'));
}

// ===== CUTOUT BRUSH (per-image alpha erase / restore) =====
function createImagePixelCanvas(source, width, height) {
  const pixelCanvas = document.createElement('canvas');
  pixelCanvas.width = width;
  pixelCanvas.height = height;
  const context = pixelCanvas.getContext('2d', { willReadFrequently: true });
  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return { canvas: pixelCanvas, context };
}

function setCutoutInteractionEnabled(enabled) {
  if (enabled) {
    cutoutBrushSavedInteraction = {
      defaultCursor: canvas.defaultCursor || 'default',
      hoverCursor: canvas.hoverCursor || 'move',
      selection: canvas.selection,
      skipTargetFind: canvas.skipTargetFind,
    };
    canvas.defaultCursor = 'none';
    canvas.hoverCursor = 'none';
    canvas.selection = false;
    canvas.skipTargetFind = true;
    if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.cursor = 'none';
    document.getElementById('canvasArea').style.cursor = 'none';
    return;
  }

  if (cutoutBrushSavedInteraction) {
    canvas.defaultCursor = cutoutBrushSavedInteraction.defaultCursor;
    canvas.hoverCursor = cutoutBrushSavedInteraction.hoverCursor;
    canvas.selection = cutoutBrushSavedInteraction.selection;
    canvas.skipTargetFind = cutoutBrushSavedInteraction.skipTargetFind;
  } else {
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.selection = true;
    canvas.skipTargetFind = false;
  }
  cutoutBrushSavedInteraction = null;
  if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.cursor = '';
}

function updateCutoutModeButtons() {
  document.querySelectorAll('[data-cutout-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.cutoutMode === cutoutBrushMode);
  });
}

function showCutoutBrushBar() {
  let bar = document.getElementById('cutoutBrushBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'cutoutBrushBar';
    bar.className = 'cutout-brush-bar';
    bar.innerHTML =
      '<span class="cutout-label">Cutout Brush</span>' +
      '<div class="cutout-mode-switch"><button type="button" data-cutout-mode="erase">Erase</button><button type="button" data-cutout-mode="restore">Restore</button></div>' +
      '<span>Size</span><input type="range" id="cutoutBrushSize" min="5" max="300" value="' + cutoutBrushSize + '">' +
      '<span id="cutoutBrushSizeValue" class="cutout-value">' + cutoutBrushSize + '</span>' +
      '<span>Hardness</span><input type="range" id="cutoutBrushHardness" min="0" max="100" value="' + cutoutBrushHardness + '">' +
      '<span id="cutoutBrushHardnessValue" class="cutout-value">' + cutoutBrushHardness + '%</span>' +
      '<button type="button" class="cutout-action" id="cutoutReset">Reset</button>' +
      '<button type="button" class="cutout-action cutout-done" id="cutoutDone">Done</button>';
    document.getElementById('canvasArea').appendChild(bar);

    bar.querySelectorAll('[data-cutout-mode]').forEach(button => {
      button.addEventListener('click', () => {
        cutoutBrushMode = button.dataset.cutoutMode;
        updateCutoutModeButtons();
      });
    });
    bar.querySelector('#cutoutBrushSize').addEventListener('input', event => {
      cutoutBrushSize = parseInt(event.target.value, 10);
      bar.querySelector('#cutoutBrushSizeValue').textContent = cutoutBrushSize;
      resizeCutoutBrushCursor();
    });
    bar.querySelector('#cutoutBrushHardness').addEventListener('input', event => {
      cutoutBrushHardness = parseInt(event.target.value, 10);
      bar.querySelector('#cutoutBrushHardnessValue').textContent = cutoutBrushHardness + '%';
    });
    bar.querySelector('#cutoutReset').addEventListener('click', resetCutoutBrush);
    bar.querySelector('#cutoutDone').addEventListener('click', () => setTool('select'));
  }
  bar.style.display = 'flex';
  bar.querySelector('#cutoutBrushSize').value = cutoutBrushSize;
  bar.querySelector('#cutoutBrushHardness').value = cutoutBrushHardness;
  updateCutoutModeButtons();
}

function hideCutoutBrushBar() {
  const bar = document.getElementById('cutoutBrushBar');
  if (bar) bar.style.display = 'none';
}

function getCutoutBrushCursor() {
  let cursor = document.getElementById('cutoutBrushCursor');
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.id = 'cutoutBrushCursor';
    cursor.className = 'cutout-brush-cursor';
    document.body.appendChild(cursor);
  }
  return cursor;
}

function resizeCutoutBrushCursor() {
  const cursor = document.getElementById('cutoutBrushCursor');
  if (!cursor) return;
  const diameter = Math.max(5, cutoutBrushSize * zoomLevel);
  cursor.style.width = diameter + 'px';
  cursor.style.height = diameter + 'px';
}

function updateCutoutBrushCursor(event) {
  if (!cutoutBrushActive) return;
  const cursor = getCutoutBrushCursor();
  resizeCutoutBrushCursor();
  cursor.style.left = event.clientX + 'px';
  cursor.style.top = event.clientY + 'px';
  cursor.style.display = 'block';
  const restoring = cutoutBrushMode === 'restore' || event.altKey;
  cursor.classList.toggle('restore', restoring);
}

function hideCutoutBrushCursor() {
  const cursor = document.getElementById('cutoutBrushCursor');
  if (cursor) cursor.style.display = 'none';
}

async function startCutoutBrush(imgObj) {
  const token = ++cutoutBrushStartToken;
  cutoutBrushActive = true;
  cutoutBrushTarget = imgObj;
  cutoutBrushTargetControlState = {
    hasControls: imgObj.hasControls,
    hasBorders: imgObj.hasBorders,
  };
  imgObj.set({ hasControls: false, hasBorders: false });
  cutoutBrushDrawing = false;
  cutoutBrushChanged = false;
  cutoutBrushLastPoint = null;
  setCutoutInteractionEnabled(true);
  showCutoutBrushBar();
  showPerspToast('Preparing Cutout Brush...');

  try {
    const source = imgObj._originalElement || imgObj.getElement();
    const sourceWidth = source?.naturalWidth || source?.videoWidth || source?.width;
    const sourceHeight = source?.naturalHeight || source?.videoHeight || source?.height;
    if (!source || !sourceWidth || !sourceHeight) throw new Error('Image pixels are unavailable');

    const working = createImagePixelCanvas(source, sourceWidth, sourceHeight);
    let originalSource = working.canvas;
    let originalSrc = imgObj._clatashaCutoutOriginalSrc;
    if (originalSrc) {
      originalSource = await loadImage(originalSrc);
    } else {
      originalSrc = working.canvas.toDataURL('image/png');
    }

    if (token !== cutoutBrushStartToken || !cutoutBrushActive || cutoutBrushTarget !== imgObj) return;
    const original = createImagePixelCanvas(originalSource, sourceWidth, sourceHeight);
    cutoutBrushOriginalSrc = originalSrc;
    cutoutBrushWorkingCanvas = working.canvas;
    cutoutBrushWorkingContext = working.context;
    cutoutBrushWorkingData = working.context.getImageData(0, 0, sourceWidth, sourceHeight);
    cutoutBrushOriginalData = original.context.getImageData(0, 0, sourceWidth, sourceHeight);
    cutoutBrushPreservedFilters = Array.isArray(imgObj.filters) ? [...imgObj.filters] : [];

    const visibleWidth = imgObj.width;
    const visibleHeight = imgObj.height;
    imgObj.setElement(cutoutBrushWorkingCanvas, { width: visibleWidth, height: visibleHeight });
    imgObj.filters = cutoutBrushPreservedFilters;
    if (cutoutBrushPreservedFilters.length) imgObj.applyFilters();
    clearImageOutlineCache(imgObj);
    imgObj.dirty = true;
    imgObj.setCoords();
    canvas.requestRenderAll();
    showPerspToast('Brush to erase. Choose Restore or hold Alt to paint pixels back.');

    if (canvas.upperCanvasEl && !canvas.upperCanvasEl._clatashaCutoutLeaveHandler) {
      canvas.upperCanvasEl.addEventListener('mouseleave', hideCutoutBrushCursor);
      canvas.upperCanvasEl._clatashaCutoutLeaveHandler = true;
    }
  } catch (error) {
    console.warn('Cutout Brush failed to start', error);
    showPerspToast('The Cutout Brush could not read this image');
    finishCutoutBrush();
    if (currentTool === 'cutout') setTool('select');
  }
}

function getCutoutBrushPoint(pointer) {
  const obj = cutoutBrushTarget;
  if (!obj || !cutoutBrushWorkingCanvas) return null;
  let local;
  try {
    local = fabric.util.transformPoint(
      new fabric.Point(pointer.x, pointer.y),
      fabric.util.invertTransform(obj.calcTransformMatrix())
    );
  } catch (error) {
    return null;
  }

  const sourceWidth = cutoutBrushWorkingCanvas.width;
  const sourceHeight = cutoutBrushWorkingCanvas.height;
  const cropX = Math.max(0, Number(obj.cropX) || 0);
  const cropY = Math.max(0, Number(obj.cropY) || 0);
  const visibleWidth = Math.max(1, Math.min(sourceWidth - cropX, Number(obj.width) || sourceWidth));
  const visibleHeight = Math.max(1, Math.min(sourceHeight - cropY, Number(obj.height) || sourceHeight));
  const x = cropX + local.x + visibleWidth / 2;
  const y = cropY + local.y + visibleHeight / 2;
  if (x < cropX || y < cropY || x >= cropX + visibleWidth || y >= cropY + visibleHeight) return null;

  const scaling = obj.getObjectScaling ? obj.getObjectScaling() : { x: obj.scaleX || 1, y: obj.scaleY || 1 };
  const radiusX = Math.max(1, cutoutBrushSize / (2 * Math.max(0.001, Math.abs(scaling.x || 1))));
  const radiusY = Math.max(1, cutoutBrushSize / (2 * Math.max(0.001, Math.abs(scaling.y || 1))));
  return { x, y, radiusX, radiusY };
}

function mergePixelBounds(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function dabCutoutBrush(point, mode) {
  if (!point || !cutoutBrushWorkingData || !cutoutBrushOriginalData) return null;
  const width = cutoutBrushWorkingData.width;
  const height = cutoutBrushWorkingData.height;
  const data = cutoutBrushWorkingData.data;
  const original = cutoutBrushOriginalData.data;
  const minX = Math.max(0, Math.floor(point.x - point.radiusX));
  const maxX = Math.min(width - 1, Math.ceil(point.x + point.radiusX));
  const minY = Math.max(0, Math.floor(point.y - point.radiusY));
  const maxY = Math.min(height - 1, Math.ceil(point.y + point.radiusY));
  const hardEdge = Math.max(0, Math.min(1, cutoutBrushHardness / 100));
  let changed = false;

  for (let y = minY; y <= maxY; y++) {
    const dy = (y + 0.5 - point.y) / point.radiusY;
    for (let x = minX; x <= maxX; x++) {
      const dx = (x + 0.5 - point.x) / point.radiusX;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 1) continue;
      const strength = hardEdge >= 0.999 || distance <= hardEdge
        ? 1
        : 1 - (distance - hardEdge) / Math.max(0.001, 1 - hardEdge);
      if (strength <= 0) continue;

      const offset = (y * width + x) * 4;
      if (mode === 'restore') {
        for (let channel = 0; channel < 4; channel++) {
          const next = Math.round(data[offset + channel] + (original[offset + channel] - data[offset + channel]) * strength);
          if (next !== data[offset + channel]) {
            data[offset + channel] = next;
            changed = true;
          }
        }
      } else {
        const nextAlpha = Math.round(data[offset + 3] * (1 - strength));
        if (nextAlpha !== data[offset + 3]) {
          data[offset + 3] = nextAlpha;
          changed = true;
        }
      }
    }
  }

  if (!changed) return null;
  if (cutoutBrushTarget && !cutoutBrushTarget._clatashaCutoutOriginalSrc && cutoutBrushOriginalSrc) {
    cutoutBrushTarget._clatashaCutoutOriginalSrc = cutoutBrushOriginalSrc;
  }
  cutoutBrushChanged = true;
  return { minX, minY, maxX, maxY };
}

function renderCutoutBrushBounds(bounds) {
  if (!bounds || !cutoutBrushTarget || !cutoutBrushWorkingContext || !cutoutBrushWorkingData) return;
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  cutoutBrushWorkingContext.putImageData(
    cutoutBrushWorkingData,
    0,
    0,
    bounds.minX,
    bounds.minY,
    width,
    height
  );
  const currentFilters = Array.isArray(cutoutBrushTarget.filters) ? cutoutBrushTarget.filters : [];
  if (currentFilters.length) cutoutBrushTarget.applyFilters();
  clearImageOutlineCache(cutoutBrushTarget);
  cutoutBrushTarget.dirty = true;
  canvas.requestRenderAll();
}

function paintCutoutBrushSegment(from, to, mode) {
  if (!to) return;
  const start = from || to;
  const distance = Math.hypot(to.x - start.x, to.y - start.y);
  const spacing = Math.max(1, Math.min(to.radiusX, to.radiusY) * 0.28);
  const steps = Math.max(1, Math.ceil(distance / spacing));
  let bounds = null;
  for (let step = 1; step <= steps; step++) {
    const amount = step / steps;
    bounds = mergePixelBounds(bounds, dabCutoutBrush({
      x: start.x + (to.x - start.x) * amount,
      y: start.y + (to.y - start.y) * amount,
      radiusX: start.radiusX + (to.radiusX - start.radiusX) * amount,
      radiusY: start.radiusY + (to.radiusY - start.radiusY) * amount,
    }, mode));
  }
  renderCutoutBrushBounds(bounds);
}

function beginCutoutBrushStroke(pointer, temporaryRestore) {
  if (!cutoutBrushWorkingData) {
    showPerspToast('The Cutout Brush is still preparing');
    return;
  }
  const point = getCutoutBrushPoint(pointer);
  if (!point) return;
  cutoutBrushDrawing = true;
  cutoutBrushChanged = false;
  cutoutBrushLastPoint = point;
  const mode = temporaryRestore ? 'restore' : cutoutBrushMode;
  paintCutoutBrushSegment(null, point, mode);
}

function continueCutoutBrushStroke(pointer, temporaryRestore) {
  const point = getCutoutBrushPoint(pointer);
  if (!point) {
    cutoutBrushLastPoint = null;
    return;
  }
  const mode = temporaryRestore ? 'restore' : cutoutBrushMode;
  paintCutoutBrushSegment(cutoutBrushLastPoint, point, mode);
  cutoutBrushLastPoint = point;
}

function endCutoutBrushStroke() {
  if (!cutoutBrushDrawing) return;
  cutoutBrushDrawing = false;
  cutoutBrushLastPoint = null;
  if (cutoutBrushChanged) {
    if (cutoutBrushTarget) {
      cutoutBrushTarget.dirty = true;
      cutoutBrushTarget.setCoords();
    }
    saveHistory();
  }
  cutoutBrushChanged = false;
}

function resetCutoutBrush() {
  if (!cutoutBrushWorkingData || !cutoutBrushOriginalData || !cutoutBrushWorkingContext) return;
  cutoutBrushWorkingData.data.set(cutoutBrushOriginalData.data);
  cutoutBrushWorkingContext.putImageData(cutoutBrushWorkingData, 0, 0);
  if (cutoutBrushTarget) {
    delete cutoutBrushTarget._clatashaCutoutOriginalSrc;
    const currentFilters = Array.isArray(cutoutBrushTarget.filters) ? cutoutBrushTarget.filters : [];
    if (currentFilters.length) cutoutBrushTarget.applyFilters();
    clearImageOutlineCache(cutoutBrushTarget);
    cutoutBrushTarget.dirty = true;
    cutoutBrushTarget.setCoords();
  }
  canvas.requestRenderAll();
  saveHistory();
  showPerspToast('Cutout reset to the original image');
}

function finishCutoutBrush() {
  ++cutoutBrushStartToken;
  if (cutoutBrushDrawing) endCutoutBrushStroke();
  const target = cutoutBrushTarget;
  if (target && cutoutBrushTargetControlState) {
    target.set({
      hasControls: cutoutBrushTargetControlState.hasControls,
      hasBorders: cutoutBrushTargetControlState.hasBorders,
    });
  }
  cutoutBrushActive = false;
  cutoutBrushDrawing = false;
  cutoutBrushChanged = false;
  cutoutBrushLastPoint = null;
  cutoutBrushTarget = null;
  cutoutBrushWorkingCanvas = null;
  cutoutBrushWorkingContext = null;
  cutoutBrushWorkingData = null;
  cutoutBrushOriginalData = null;
  cutoutBrushOriginalSrc = null;
  cutoutBrushPreservedFilters = [];
  cutoutBrushTargetControlState = null;
  setCutoutInteractionEnabled(false);
  applyToolCursor('select');
  hideCutoutBrushBar();
  hideCutoutBrushCursor();
  if (currentTool === 'cutout') {
    currentTool = 'select';
    document.querySelectorAll('.tool-btn').forEach(button => button.classList.remove('active'));
    document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
  }
  if (target) {
    target.dirty = true;
    target.setCoords();
    canvas.requestRenderAll();
  }
}

// ===== SPOT HEALING BRUSH (automatic nearby texture matching) =====
function showHealingBrushBar() {
  let bar = document.getElementById('healingBrushBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'healingBrushBar';
    bar.className = 'healing-brush-bar';
    bar.innerHTML =
      '<span class="healing-label">Spot Healing</span>' +
      '<span>Size</span><input type="range" id="healingBrushSize" min="5" max="250" value="' + healingBrushSize + '">' +
      '<span id="healingBrushSizeValue" class="healing-value">' + healingBrushSize + '</span>' +
      '<span>Hardness</span><input type="range" id="healingBrushHardness" min="0" max="100" value="' + healingBrushHardness + '">' +
      '<span id="healingBrushHardnessValue" class="healing-value">' + healingBrushHardness + '%</span>' +
      '<span>Strength</span><input type="range" id="healingBrushStrength" min="10" max="100" value="' + healingBrushStrength + '">' +
      '<span id="healingBrushStrengthValue" class="healing-value">' + healingBrushStrength + '%</span>' +
      '<button type="button" class="healing-action healing-done" id="healingDone">Done</button>';
    document.getElementById('canvasArea').appendChild(bar);

    bar.querySelector('#healingBrushSize').addEventListener('input', event => {
      healingBrushSize = parseInt(event.target.value, 10);
      bar.querySelector('#healingBrushSizeValue').textContent = healingBrushSize;
      resizeHealingBrushCursor();
    });
    bar.querySelector('#healingBrushHardness').addEventListener('input', event => {
      healingBrushHardness = parseInt(event.target.value, 10);
      bar.querySelector('#healingBrushHardnessValue').textContent = healingBrushHardness + '%';
    });
    bar.querySelector('#healingBrushStrength').addEventListener('input', event => {
      healingBrushStrength = parseInt(event.target.value, 10);
      bar.querySelector('#healingBrushStrengthValue').textContent = healingBrushStrength + '%';
    });
    bar.querySelector('#healingDone').addEventListener('click', () => setTool('select'));
  }
  bar.style.display = 'flex';
  bar.querySelector('#healingBrushSize').value = healingBrushSize;
  bar.querySelector('#healingBrushHardness').value = healingBrushHardness;
  bar.querySelector('#healingBrushStrength').value = healingBrushStrength;
}

function hideHealingBrushBar() {
  const bar = document.getElementById('healingBrushBar');
  if (bar) bar.style.display = 'none';
}

function getHealingBrushCursor() {
  let cursor = document.getElementById('healingBrushCursor');
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.id = 'healingBrushCursor';
    cursor.className = 'healing-brush-cursor';
    document.body.appendChild(cursor);
  }
  return cursor;
}

function resizeHealingBrushCursor() {
  const cursor = document.getElementById('healingBrushCursor');
  if (!cursor) return;
  const diameter = Math.max(5, healingBrushSize * zoomLevel);
  cursor.style.width = diameter + 'px';
  cursor.style.height = diameter + 'px';
}

function updateHealingBrushCursor(event) {
  if (!healingBrushActive) return;
  const cursor = getHealingBrushCursor();
  resizeHealingBrushCursor();
  cursor.style.left = event.clientX + 'px';
  cursor.style.top = event.clientY + 'px';
  cursor.style.display = 'block';
}

function hideHealingBrushCursor() {
  const cursor = document.getElementById('healingBrushCursor');
  if (cursor) cursor.style.display = 'none';
}

function setHealingInteractionEnabled(enabled) {
  if (enabled) {
    healingBrushSavedInteraction = {
      defaultCursor: canvas.defaultCursor || 'default',
      hoverCursor: canvas.hoverCursor || 'move',
      selection: canvas.selection,
      skipTargetFind: canvas.skipTargetFind,
    };
    canvas.defaultCursor = 'none';
    canvas.hoverCursor = 'none';
    canvas.selection = false;
    canvas.skipTargetFind = true;
    if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.cursor = 'none';
    document.getElementById('canvasArea').style.cursor = 'none';
    return;
  }

  if (healingBrushSavedInteraction) {
    canvas.defaultCursor = healingBrushSavedInteraction.defaultCursor;
    canvas.hoverCursor = healingBrushSavedInteraction.hoverCursor;
    canvas.selection = healingBrushSavedInteraction.selection;
    canvas.skipTargetFind = healingBrushSavedInteraction.skipTargetFind;
  } else {
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.selection = true;
    canvas.skipTargetFind = false;
  }
  healingBrushSavedInteraction = null;
  if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.cursor = '';
}

function startHealingBrush(imgObj) {
  try {
    const source = imgObj._originalElement || imgObj.getElement();
    const sourceWidth = source?.naturalWidth || source?.videoWidth || source?.width;
    const sourceHeight = source?.naturalHeight || source?.videoHeight || source?.height;
    if (!source || !sourceWidth || !sourceHeight) throw new Error('Image pixels are unavailable');

    const working = createImagePixelCanvas(source, sourceWidth, sourceHeight);
    healingBrushActive = true;
    healingBrushTarget = imgObj;
    healingBrushDrawing = false;
    healingBrushChanged = false;
    healingBrushLastPoint = null;
    healingBrushWorkingCanvas = working.canvas;
    healingBrushWorkingContext = working.context;
    healingBrushWorkingData = working.context.getImageData(0, 0, sourceWidth, sourceHeight);
    healingBrushStrokeSourceData = null;
    healingBrushTargetControlState = {
      hasControls: imgObj.hasControls,
      hasBorders: imgObj.hasBorders,
    };
    imgObj.set({ hasControls: false, hasBorders: false });

    const preservedFilters = Array.isArray(imgObj.filters) ? [...imgObj.filters] : [];
    const visibleWidth = imgObj.width;
    const visibleHeight = imgObj.height;
    imgObj.setElement(healingBrushWorkingCanvas, { width: visibleWidth, height: visibleHeight });
    imgObj.filters = preservedFilters;
    if (preservedFilters.length) imgObj.applyFilters();
    clearImageOutlineCache(imgObj);
    imgObj.dirty = true;
    imgObj.setCoords();
    setHealingInteractionEnabled(true);
    showHealingBrushBar();
    canvas.requestRenderAll();
    showPerspToast('Paint over a small spot to heal it with nearby texture');

    if (canvas.upperCanvasEl && !canvas.upperCanvasEl._clatashaHealingLeaveHandler) {
      canvas.upperCanvasEl.addEventListener('mouseleave', hideHealingBrushCursor);
      canvas.upperCanvasEl._clatashaHealingLeaveHandler = true;
    }
  } catch (error) {
    console.warn('Spot Healing Brush failed to start', error);
    showPerspToast('The Spot Healing Brush could not read this image');
    finishHealingBrush();
  }
}

function getHealingBrushPoint(pointer) {
  const obj = healingBrushTarget;
  if (!obj || !healingBrushWorkingCanvas) return null;
  let local;
  try {
    local = fabric.util.transformPoint(
      new fabric.Point(pointer.x, pointer.y),
      fabric.util.invertTransform(obj.calcTransformMatrix())
    );
  } catch (error) {
    return null;
  }

  const sourceWidth = healingBrushWorkingCanvas.width;
  const sourceHeight = healingBrushWorkingCanvas.height;
  const cropX = Math.max(0, Number(obj.cropX) || 0);
  const cropY = Math.max(0, Number(obj.cropY) || 0);
  const visibleWidth = Math.max(1, Math.min(sourceWidth - cropX, Number(obj.width) || sourceWidth));
  const visibleHeight = Math.max(1, Math.min(sourceHeight - cropY, Number(obj.height) || sourceHeight));
  const x = cropX + local.x + visibleWidth / 2;
  const y = cropY + local.y + visibleHeight / 2;
  if (x < cropX || y < cropY || x >= cropX + visibleWidth || y >= cropY + visibleHeight) return null;

  const scaling = obj.getObjectScaling ? obj.getObjectScaling() : { x: obj.scaleX || 1, y: obj.scaleY || 1 };
  return {
    x,
    y,
    radiusX: Math.max(2, healingBrushSize / (2 * Math.max(0.001, Math.abs(scaling.x || 1)))),
    radiusY: Math.max(2, healingBrushSize / (2 * Math.max(0.001, Math.abs(scaling.y || 1)))),
    bounds: {
      minX: cropX,
      minY: cropY,
      maxX: cropX + visibleWidth - 1,
      maxY: cropY + visibleHeight - 1,
    },
  };
}

function getPixelOffset(width, x, y) {
  return (y * width + x) * 4;
}

function clampPixel(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function scoreHealingCandidate(point, offsetX, offsetY, sourceData) {
  const { width, data } = sourceData;
  let score = 0;
  let count = 0;
  const colorDelta = [0, 0, 0];
  const samples = 24;

  for (let index = 0; index < samples; index++) {
    const angle = index / samples * Math.PI * 2;
    const targetX = Math.round(point.x + Math.cos(angle) * point.radiusX * 0.88);
    const targetY = Math.round(point.y + Math.sin(angle) * point.radiusY * 0.88);
    const sourceX = Math.round(targetX + offsetX);
    const sourceY = Math.round(targetY + offsetY);
    if (targetX < point.bounds.minX || targetX > point.bounds.maxX ||
        targetY < point.bounds.minY || targetY > point.bounds.maxY ||
        sourceX < point.bounds.minX || sourceX > point.bounds.maxX ||
        sourceY < point.bounds.minY || sourceY > point.bounds.maxY) continue;

    const targetOffset = getPixelOffset(width, targetX, targetY);
    const sourceOffset = getPixelOffset(width, sourceX, sourceY);
    const dr = data[targetOffset] - data[sourceOffset];
    const dg = data[targetOffset + 1] - data[sourceOffset + 1];
    const db = data[targetOffset + 2] - data[sourceOffset + 2];
    const da = data[targetOffset + 3] - data[sourceOffset + 3];
    score += dr * dr + dg * dg + db * db + da * da * 0.25;
    colorDelta[0] += dr;
    colorDelta[1] += dg;
    colorDelta[2] += db;
    count++;
  }

  if (count < 8) return null;
  return {
    offsetX,
    offsetY,
    score: score / count,
    correction: colorDelta.map(value => value / count),
  };
}

function findBestHealingCandidate(point, sourceData) {
  let best = null;
  // Keep candidate patches outside the painted spot so the unwanted detail
  // cannot be sampled back into its own repair.
  const distanceFactors = [2.05, 2.8];
  const directions = 12;
  for (const distanceFactor of distanceFactors) {
    for (let index = 0; index < directions; index++) {
      const angle = index / directions * Math.PI * 2;
      const candidate = scoreHealingCandidate(
        point,
        Math.cos(angle) * point.radiusX * distanceFactor,
        Math.sin(angle) * point.radiusY * distanceFactor,
        sourceData
      );
      if (candidate && (!best || candidate.score < best.score)) best = candidate;
    }
  }
  return best;
}

function healImageSpot(point) {
  const sourceData = healingBrushStrokeSourceData || healingBrushWorkingData;
  if (!point || !sourceData || !healingBrushWorkingData) return null;
  const candidate = findBestHealingCandidate(point, sourceData);
  if (!candidate) return null;

  const width = healingBrushWorkingData.width;
  const target = healingBrushWorkingData.data;
  const source = sourceData.data;
  const minX = Math.max(point.bounds.minX, Math.floor(point.x - point.radiusX));
  const maxX = Math.min(point.bounds.maxX, Math.ceil(point.x + point.radiusX));
  const minY = Math.max(point.bounds.minY, Math.floor(point.y - point.radiusY));
  const maxY = Math.min(point.bounds.maxY, Math.ceil(point.y + point.radiusY));
  const hardEdge = Math.max(0, Math.min(1, healingBrushHardness / 100));
  const strength = Math.max(0.1, Math.min(1, healingBrushStrength / 100));
  let changed = false;

  for (let y = minY; y <= maxY; y++) {
    const dy = (y + 0.5 - point.y) / point.radiusY;
    for (let x = minX; x <= maxX; x++) {
      const dx = (x + 0.5 - point.x) / point.radiusX;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 1) continue;
      const feather = hardEdge >= 0.999 || distance <= hardEdge
        ? 1
        : 1 - (distance - hardEdge) / Math.max(0.001, 1 - hardEdge);
      const amount = feather * strength;
      if (amount <= 0) continue;

      const sourceX = clampPixel(x + candidate.offsetX, point.bounds.minX, point.bounds.maxX);
      const sourceY = clampPixel(y + candidate.offsetY, point.bounds.minY, point.bounds.maxY);
      const targetOffset = getPixelOffset(width, x, y);
      const sourceOffset = getPixelOffset(width, sourceX, sourceY);
      for (let channel = 0; channel < 3; channel++) {
        const corrected = Math.max(0, Math.min(255, source[sourceOffset + channel] + candidate.correction[channel]));
        const next = Math.round(target[targetOffset + channel] + (corrected - target[targetOffset + channel]) * amount);
        if (next !== target[targetOffset + channel]) {
          target[targetOffset + channel] = next;
          changed = true;
        }
      }
      const nextAlpha = Math.round(target[targetOffset + 3] + (source[sourceOffset + 3] - target[targetOffset + 3]) * amount);
      if (nextAlpha !== target[targetOffset + 3]) {
        target[targetOffset + 3] = nextAlpha;
        changed = true;
      }
    }
  }

  if (!changed) return null;
  // Healing changes the raster itself, so any older cutout restoration source
  // would now be stale. Undo still restores the pre-healing state.
  if (healingBrushTarget) delete healingBrushTarget._clatashaCutoutOriginalSrc;
  healingBrushChanged = true;
  return { minX, minY, maxX, maxY };
}

function renderHealingBrushBounds(bounds) {
  if (!bounds || !healingBrushTarget || !healingBrushWorkingContext || !healingBrushWorkingData) return;
  healingBrushWorkingContext.putImageData(
    healingBrushWorkingData,
    0,
    0,
    bounds.minX,
    bounds.minY,
    bounds.maxX - bounds.minX + 1,
    bounds.maxY - bounds.minY + 1
  );
  const filters = Array.isArray(healingBrushTarget.filters) ? healingBrushTarget.filters : [];
  if (filters.length) healingBrushTarget.applyFilters();
  clearImageOutlineCache(healingBrushTarget);
  healingBrushTarget.dirty = true;
  canvas.requestRenderAll();
}

function paintHealingBrushSegment(from, to) {
  if (!to) return;
  const start = from || to;
  const distance = Math.hypot(to.x - start.x, to.y - start.y);
  const spacing = Math.max(2, Math.min(to.radiusX, to.radiusY) * 0.42);
  const steps = Math.max(1, Math.ceil(distance / spacing));
  let bounds = null;
  for (let step = 1; step <= steps; step++) {
    const amount = step / steps;
    bounds = mergePixelBounds(bounds, healImageSpot({
      x: start.x + (to.x - start.x) * amount,
      y: start.y + (to.y - start.y) * amount,
      radiusX: start.radiusX + (to.radiusX - start.radiusX) * amount,
      radiusY: start.radiusY + (to.radiusY - start.radiusY) * amount,
      bounds: to.bounds,
    }));
  }
  renderHealingBrushBounds(bounds);
}

function beginHealingBrushStroke(pointer) {
  if (!healingBrushWorkingData) return;
  const point = getHealingBrushPoint(pointer);
  if (!point) return;
  healingBrushStrokeSourceData = new ImageData(
    new Uint8ClampedArray(healingBrushWorkingData.data),
    healingBrushWorkingData.width,
    healingBrushWorkingData.height
  );
  healingBrushDrawing = true;
  healingBrushChanged = false;
  healingBrushLastPoint = point;
  paintHealingBrushSegment(null, point);
}

function continueHealingBrushStroke(pointer) {
  const point = getHealingBrushPoint(pointer);
  if (!point) {
    healingBrushLastPoint = null;
    return;
  }
  paintHealingBrushSegment(healingBrushLastPoint, point);
  healingBrushLastPoint = point;
}

function endHealingBrushStroke() {
  if (!healingBrushDrawing) return;
  healingBrushDrawing = false;
  healingBrushLastPoint = null;
  healingBrushStrokeSourceData = null;
  if (healingBrushChanged) {
    healingBrushTarget?.setCoords();
    saveHistory();
  }
  healingBrushChanged = false;
}

function finishHealingBrush() {
  if (healingBrushDrawing) endHealingBrushStroke();
  const target = healingBrushTarget;
  if (target && healingBrushTargetControlState) {
    target.set({
      hasControls: healingBrushTargetControlState.hasControls,
      hasBorders: healingBrushTargetControlState.hasBorders,
    });
  }
  healingBrushActive = false;
  healingBrushTarget = null;
  healingBrushDrawing = false;
  healingBrushChanged = false;
  healingBrushLastPoint = null;
  healingBrushWorkingCanvas = null;
  healingBrushWorkingContext = null;
  healingBrushWorkingData = null;
  healingBrushStrokeSourceData = null;
  healingBrushTargetControlState = null;
  setHealingInteractionEnabled(false);
  hideHealingBrushBar();
  hideHealingBrushCursor();
  applyToolCursor('select');
  if (currentTool === 'healing') {
    currentTool = 'select';
    document.querySelectorAll('.tool-btn').forEach(button => button.classList.remove('active'));
    document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
  }
  if (target) {
    target.dirty = true;
    target.setCoords();
    canvas.requestRenderAll();
  }
}

// ===== CUSTOM CONTEXT MENU =====
let customTextPresets = []; // loaded from IndexedDB
let _copiedStyle = null; // for copy/paste style

function getCustomPresetsDB() {
  return getDB();
}

async function loadCustomPresets() {
  try {
    const db = await getCustomPresetsDB();
    const tx = db.transaction('customPresets', 'readonly');
    const req = tx.objectStore('customPresets').getAll();
    return new Promise((resolve) => {
      req.onsuccess = () => { customTextPresets = req.result || []; resolve(); };
      req.onerror = () => { customTextPresets = []; resolve(); };
    });
  } catch (e) { customTextPresets = []; }
}

async function saveCustomPreset(preset) {
  const db = await getCustomPresetsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customPresets', 'readwrite');
    tx.objectStore('customPresets').put(preset);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteCustomPreset(name) {
  const db = await getCustomPresetsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('customPresets', 'readwrite');
    tx.objectStore('customPresets').delete(name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let pendingImageReplacementTarget = null;
let contextSubmenuCloseTimer = 0;

function setupContextMenu() {
  const menu = document.getElementById('ctxMenu');
  const canvasArea = document.getElementById('canvasArea');

  canvasArea.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Editing brushes own the pointer while active.
    if (bgRemovalActive || cutoutBrushActive || healingBrushActive || paintBrushActive || sliceActive || currentTool === 'zoom') return;

    // Find what's under the cursor
    const pointer = canvas.getPointer(e);
    const target = canvas.findTarget(e);

    if (target && target.name !== '__bg__') {
      canvas.setActiveObject(target);
      canvas.requestRenderAll();
      showContextMenu(e.clientX, e.clientY, target);
    } else {
      // Right-click on empty canvas
      showContextMenu(e.clientX, e.clientY, null);
    }
  });

  // Hide on any left click or scroll
  document.addEventListener('mousedown', (e) => {
    const submenu = document.getElementById('ctxSubmenu');
    if (!menu.contains(e.target) && !submenu?.contains(e.target)) hideContextMenu();
  });
  document.addEventListener('wheel', () => hideContextMenu());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideContextMenu();
  });
}

function showContextMenu(x, y, target) {
  const menu = document.getElementById('ctxMenu');
  let items = [];

  if (target) {
    const type = target.type;
    const isText = type === 'textbox';
    const isImage = type === 'image' && !target._clatashaPaintLayer;
    const isMulti = isActiveSelectionObject(target);

    if (isMulti) {
      const multiObjects = target.getObjects ? target.getObjects() : [];
      if (getClippingPair(target.getObjects ? target.getObjects() : [])) {
        items.push({
          label: 'Create Clipping Mask',
          shortcut: 'Ctrl+Alt+G',
          action: () => createClippingMask(),
        });
      }
      if (!multiObjects.some(obj => isClippingBase(obj) || isClippedLayer(obj))) {
        items.push({
          label: 'Group Layers',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M13 7h4v4M7 13v4h4"/></svg>',
          shortcut: 'Ctrl+G',
          action: () => groupSelectedLayers(),
        });
      }
      items.push({ type: 'separator' });
    } else if (isUserGroup(target)) {
      items.push({
        label: 'Ungroup Layers',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M11 7h6v6M7 11v6h6"/></svg>',
        shortcut: 'Ctrl+Shift+G',
        action: () => ungroupSelectedLayers(),
      });
      items.push({ type: 'separator' });
    }

    const clippingTargets = isMulti && target.getObjects ? target.getObjects() : [target];
    if (clippingTargets.some(obj => isClippingBase(obj) || isClippedLayer(obj))) {
      items.push({
        label: 'Release Clipping Mask',
        action: () => releaseClippingMask(clippingTargets, true),
      });
      items.push({ type: 'separator' });
    }

    // --- Type-specific actions ---
    if (isText) {
      items.push({
        label: 'Save as Text Preset',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>',
        action: () => saveTextAsPreset(target),
      });
      items.push({ type: 'separator' });
      items.push({
        label: 'Copy Style',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
        shortcut: 'Ctrl+Shift+C',
        action: () => copyObjectStyle(target),
      });
      if (_copiedStyle) {
        items.push({
          label: 'Paste Style',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
          shortcut: 'Ctrl+Shift+V',
          action: () => pasteObjectStyle(target),
        });
      }
      items.push({ type: 'separator' });
    }

    if (isImage) {
      items.push({
        label: 'Fit to Canvas',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/><path d="M8 8l-5-5M16 8l5-5M16 16l5 5M8 16l-5 5"/></svg>',
        action: () => fitImageToCanvas(target),
      });
      items.push({
        label: 'Rotate',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
        submenu: [
          {
            label: 'Rotate Left 90°',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 109-9 9.8 9.8 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
            action: () => rotateImageQuarterTurn(target, -1),
          },
          {
            label: 'Rotate Right 90°',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-9-9 9.8 9.8 0 016.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
            action: () => rotateImageQuarterTurn(target, 1),
          },
        ],
      });
      items.push({ type: 'separator' });
      items.push({
        label: 'Replace Image...',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="14" height="14" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="M4 16l4-4 3 3 2-2 4 4"/><path d="M19 8v6M16 11l3 3 3-3"/></svg>',
        action: () => openReplaceImagePicker(target),
      });
      items.push({
        label: 'Remove Background...',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M9 9l6 6M15 9l-6 6" stroke-width="2.5"/></svg>',
        action: () => { startBgRemoval(target); showBgToleranceBar(); },
      });
      items.push({
        label: 'Cutout Brush...',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12.4 13.1l6.9-6.9a1.8 1.8 0 00-2.5-2.5l-6.9 6.9"/><path d="M9.9 10.6l3.5 3.5"/><path d="M10.2 13.2c-3.1-.2-5.4 1.6-5.8 4.2-.2 1.4-1 2.5-2.1 3.3 4.1.4 7.3-.5 8.8-2.6 1.1-1.5.8-3.3-.9-4.9z"/><path d="M2.5 3h2.5v2.5H2.5zM5 5.5h2.5V8H5z" fill="currentColor" stroke="none" opacity=".8"/><path d="M5 3h2.5v2.5H5zM2.5 5.5H5V8H2.5z" fill="currentColor" stroke="none" opacity=".2"/></svg>',
        shortcut: 'X',
        action: () => setTool('cutout'),
      });
      items.push({
        label: 'Spot Healing Brush...',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(-45 12 12)"><rect x="2.5" y="7.5" width="19" height="9" rx="4.5"/><rect x="8.5" y="9.5" width="7" height="5" rx="1" fill="currentColor" stroke="none" opacity=".24"/><circle cx="5.8" cy="10.5" r=".65" fill="currentColor" stroke="none"/><circle cx="5.8" cy="13.5" r=".65" fill="currentColor" stroke="none"/><circle cx="18.2" cy="10.5" r=".65" fill="currentColor" stroke="none"/><circle cx="18.2" cy="13.5" r=".65" fill="currentColor" stroke="none"/></g></svg>',
        shortcut: 'J',
        action: () => setTool('healing'),
      });
      items.push({ type: 'separator' });
    }

    // --- Universal object actions ---
    items.push({
      label: 'Bring to Front',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17,11 12,6 7,11"/><line x1="12" y1="6" x2="12" y2="18"/></svg>',
      action: () => bringSelectedToFront(),
    });
    items.push({
      label: 'Send to Back',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7,13 12,18 17,13"/><line x1="12" y1="18" x2="12" y2="6"/></svg>',
      action: () => sendSelectedToBack(),
    });
    items.push({ type: 'separator' });
    items.push({
      label: 'Duplicate',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
      shortcut: 'Ctrl+D',
      action: () => duplicateSelected(),
    });
    if (!isMulti) {
      items.push({ type: 'separator' });
      items.push({
        label: 'Flip Horizontal',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18"/><path d="M16 7l4 5-4 5"/><path d="M8 7L4 12l4 5"/></svg>',
        action: () => flipSelected('h'),
      });
      items.push({
        label: 'Flip Vertical',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18"/><path d="M7 8l5-4 5 4"/><path d="M7 16l5 4 5-4"/></svg>',
        action: () => flipSelected('v'),
      });
    }
    items.push({
      label: 'Delete',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
      shortcut: 'Del',
      danger: true,
      action: () => deleteSelected(),
    });
  } else {
    // Empty canvas right-click
    items.push({
      label: 'Select All',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
      shortcut: 'Ctrl+A',
      action: () => handleMenuAction('selectAll'),
    });
    items.push({ type: 'separator' });
    items.push({
      label: 'Paste Style',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
      shortcut: 'Ctrl+Shift+V',
      disabled: !_copiedStyle,
      action: () => {
        const obj = canvas.getActiveObject();
        if (obj && _copiedStyle) pasteObjectStyle(obj);
      },
    });
  }

  renderContextMenuItems(x, y, items);
}

function renderContextMenuItems(x, y, items) {
  const menu = document.getElementById('ctxMenu');
  hideContextSubmenu();

  // Build menu HTML
  menu.innerHTML = items.map((item, index) => {
    if (item.type === 'separator') return '<div class="ctx-separator"></div>';
    const hasSubmenu = Array.isArray(item.submenu) && item.submenu.length > 0;
    return '<button class="ctx-item' + (item.danger ? ' danger' : '') + (hasSubmenu ? ' has-submenu' : '') + '"' +
      (item.disabled ? ' disabled' : '') +
      ' data-ctx-index="' + index + '"' +
      (hasSubmenu ? ' aria-haspopup="menu" aria-expanded="false"' : '') + '>' +
      (item.icon || '') +
      '<span>' + item.label + '</span>' +
      (hasSubmenu ? '<span class="ctx-submenu-arrow" aria-hidden="true">›</span>' :
        (item.shortcut ? '<span class="ctx-shortcut">' + item.shortcut + '</span>' : '')) +
    '</button>';
  }).join('');

  // Attach click handlers
  menu.querySelectorAll('.ctx-item').forEach(btn => {
    const item = items[Number(btn.dataset.ctxIndex)];
    if (item && !item.disabled) {
      if (item.submenu) {
        btn.addEventListener('mouseenter', () => openContextSubmenu(btn, item.submenu));
        btn.addEventListener('mouseleave', scheduleContextSubmenuClose);
      } else {
        btn.addEventListener('mouseenter', hideContextSubmenu);
      }
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.submenu) {
          openContextSubmenu(btn, item.submenu);
          return;
        }
        hideContextMenu();
        item.action();
      });
    }
  });

  // Position (keep within viewport)
  menu.style.display = 'block';
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = x + mw > vw - 8 ? x - mw : x;
  const top = y + mh > vh - 8 ? y - mh : y;
  menu.style.left = Math.max(8, left) + 'px';
  menu.style.top = Math.max(8, top) + 'px';
}

function cancelContextSubmenuClose() {
  if (!contextSubmenuCloseTimer) return;
  clearTimeout(contextSubmenuCloseTimer);
  contextSubmenuCloseTimer = 0;
}

function scheduleContextSubmenuClose() {
  cancelContextSubmenuClose();
  contextSubmenuCloseTimer = setTimeout(hideContextSubmenu, 140);
}

function hideContextSubmenu() {
  cancelContextSubmenuClose();
  document.getElementById('ctxSubmenu')?.remove();
  document.querySelectorAll('#ctxMenu .ctx-item.has-submenu[aria-expanded="true"]').forEach(button => {
    button.setAttribute('aria-expanded', 'false');
  });
}

function openContextSubmenu(trigger, items) {
  if (!trigger || !Array.isArray(items) || !items.length) return;
  const alreadyOpen = trigger.getAttribute('aria-expanded') === 'true' && document.getElementById('ctxSubmenu');
  cancelContextSubmenuClose();
  if (alreadyOpen) return;
  hideContextSubmenu();

  const submenu = document.createElement('div');
  submenu.id = 'ctxSubmenu';
  submenu.className = 'ctx-menu ctx-submenu';
  submenu.setAttribute('role', 'menu');
  submenu.innerHTML = items.map((item, index) =>
    '<button class="ctx-item" type="button" role="menuitem" data-submenu-index="' + index + '">' +
      (item.icon || '') + '<span>' + item.label + '</span></button>'
  ).join('');
  document.body.appendChild(submenu);
  trigger.setAttribute('aria-expanded', 'true');

  submenu.addEventListener('mouseenter', cancelContextSubmenuClose);
  submenu.addEventListener('mouseleave', scheduleContextSubmenuClose);
  submenu.querySelectorAll('.ctx-item').forEach(button => {
    const item = items[Number(button.dataset.submenuIndex)];
    button.addEventListener('click', event => {
      event.stopPropagation();
      hideContextMenu();
      item.action();
    });
  });

  const triggerRect = trigger.getBoundingClientRect();
  const submenuRect = submenu.getBoundingClientRect();
  const gap = 5;
  const left = triggerRect.right + gap + submenuRect.width <= window.innerWidth - 8
    ? triggerRect.right + gap
    : triggerRect.left - submenuRect.width - gap;
  const top = Math.min(Math.max(8, triggerRect.top - 4), window.innerHeight - submenuRect.height - 8);
  submenu.style.left = Math.max(8, left) + 'px';
  submenu.style.top = Math.max(8, top) + 'px';
}

function hideContextMenu() {
  hideContextSubmenu();
  document.getElementById('ctxMenu').style.display = 'none';
}

function commitImageContextTransform(target) {
  target.dirty = true;
  target.setCoords();
  refreshContainingGroupLayouts(target);
  target.setCoords();
  syncEditedClippingBase(target);
  canvas.setActiveObject(target);
  liveUpdatePositionFields(target);
  updatePropertiesPanel(target);
  updateLayersList();
  canvas.requestRenderAll();
  scheduleWorkspaceTransformOverlay();
  saveHistory();
}

function fitImageToCanvas(target) {
  if (!target || target.type !== 'image' || target._clatashaPaintLayer || target._clatashaLocked) return;

  const previousScaleX = target.scaleX;
  const previousScaleY = target.scaleY;
  target.set({ scaleX: 1, scaleY: 1 });
  target.setCoords();
  const unitBounds = target.getBoundingRect();
  if (!Number.isFinite(unitBounds.width) || !Number.isFinite(unitBounds.height) || unitBounds.width <= 0 || unitBounds.height <= 0) {
    target.set({ scaleX: previousScaleX, scaleY: previousScaleY });
    target.setCoords();
    return;
  }

  const fitScale = Math.min(CANVAS_W / unitBounds.width, CANVAS_H / unitBounds.height);
  target.set({ scaleX: fitScale, scaleY: fitScale });
  target.setXY(new fabric.Point(CANVAS_W / 2, CANVAS_H / 2), 'center', 'center');
  commitImageContextTransform(target);
}

function rotateImageQuarterTurn(target, direction) {
  if (!target || target.type !== 'image' || target._clatashaPaintLayer || target._clatashaLocked) return;
  const center = target.getCenterPoint();
  const nextAngle = ((target.angle + (direction < 0 ? -90 : 90)) % 360 + 360) % 360;
  target.set('angle', Math.abs(nextAngle) < 0.0001 ? 0 : nextAngle);
  target.setXY(center, 'center', 'center');
  commitImageContextTransform(target);
}

function openReplaceImagePicker(target) {
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  if (!target || target.type !== 'image' || !canvas.getObjects().includes(target)) return;
  pendingImageReplacementTarget = target;
  const input = document.getElementById('replaceImageInput');
  input.value = '';
  input.click();
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Unable to read image file'));
    reader.readAsDataURL(file);
  });
}

function calculateImageImportScale(sourceWidth, sourceHeight) {
  const safeSourceWidth = Math.max(1, Math.abs(sourceWidth));
  const safeSourceHeight = Math.max(1, Math.abs(sourceHeight));
  const maxW = CANVAS_W * 0.8;
  const maxH = CANVAS_H * 0.8;
  return Math.min(maxW / safeSourceWidth, maxH / safeSourceHeight, 1);
}

async function replaceCanvasImage(target, file) {
  if (!target || target.type !== 'image' || !canvas.getObjects().includes(target)) return;
  if (file.type && !file.type.startsWith('image/')) {
    alert('Choose an image file to replace this layer.');
    return;
  }

  try {
    const dataURL = await readFileAsDataURL(file);
    const newImg = await FabricImage.fromURL(dataURL);

    // The original may have been removed while the new file was loading.
    const layerIndex = canvas.getObjects().indexOf(target);
    if (layerIndex < 0) return;

    const sourceWidth = Math.max(1, newImg.width || newImg.getElement()?.naturalWidth || 1);
    const sourceHeight = Math.max(1, newImg.height || newImg.getElement()?.naturalHeight || 1);
    const replacementScale = calculateImageImportScale(sourceWidth, sourceHeight);

    const maskType = getImageMaskType(target);
    const maskRadius = target._clatashaMaskRadius ?? 18;
    const preservedFilters = Array.isArray(target.filters) ? [...target.filters] : [];
    const clippingId = isClippedLayer(target) ? target._clatashaClipId : null;
    const clippingBase = clippingId ? getClippingBase(clippingId) : null;

    newImg.set({
      left: target.left,
      top: target.top,
      originX: target.originX,
      originY: target.originY,
      width: sourceWidth,
      height: sourceHeight,
      cropX: 0,
      cropY: 0,
      scaleX: replacementScale,
      scaleY: replacementScale,
      angle: target.angle,
      skewX: target.skewX,
      skewY: target.skewY,
      flipX: target.flipX,
      flipY: target.flipY,
      opacity: target.opacity,
      shadow: target.shadow,
      stroke: target.stroke,
      strokeWidth: target.strokeWidth,
      strokeUniform: target.strokeUniform,
      paintFirst: target.paintFirst,
      visible: target.visible,
      globalCompositeOperation: target.globalCompositeOperation,
      imageSmoothing: target.imageSmoothing,
      selectable: target.selectable,
      evented: target.evented,
      hasControls: target.hasControls,
      hasBorders: target.hasBorders,
      lockMovementX: target.lockMovementX,
      lockMovementY: target.lockMovementY,
      lockScalingX: target.lockScalingX,
      lockScalingY: target.lockScalingY,
      lockRotation: target.lockRotation,
      name: getFileStem(file.name) || target.name || 'Image',
      _clatashaSourceName: getFileStem(file.name) || target._clatashaSourceName || target.name || 'Image',
      _clatashaImageOutlineColor: target._clatashaImageOutlineColor,
      _clatashaImageOutlineWidth: target._clatashaImageOutlineWidth,
      _clatashaLocked: target._clatashaLocked,
      _clatashaMaskType: target._clatashaMaskType,
      _clatashaMaskRadius: target._clatashaMaskRadius,
      _clatashaClipRole: clippingId ? 'content' : undefined,
      _clatashaClipId: clippingId || undefined,
    });

    newImg.filters = preservedFilters;
    if (preservedFilters.length) newImg.applyFilters();

    restoringClippingState = true;
    canvas.remove(target);
    canvas.insertAt(layerIndex, newImg);
    restoringClippingState = false;
    if (clippingBase && canvas.getObjects().includes(clippingBase)) {
      newImg.set('clipPath', await buildClippingPath(clippingBase));
    } else {
      clearClippingMetadata(newImg, false);
      if (maskType !== 'none') applyImageMask(newImg, maskType, maskRadius, false);
    }
    canvas.setActiveObject(newImg);
    canvas.requestRenderAll();
    saveHistory();
    updateLayersList();
    updatePropertiesPanel(newImg);
  } catch (error) {
    restoringClippingState = false;
    console.error('Image replacement failed:', error);
    alert('The replacement image could not be loaded. The original image was kept.');
  }
}

// --- Context menu actions ---

async function saveTextAsPreset(obj) {
  const name = prompt('Preset name:');
  if (!name || !name.trim()) return;
  const presetName = name.trim();

  // Extract style properties
  const style = {
    fontFamily: obj.fontFamily || 'sans-serif',
    fontSize: obj.fontSize || 48,
    fontWeight: obj.fontWeight || 'normal',
    fontStyle: obj.fontStyle || 'normal',
    fill: obj.fill || '#FFFFFF',
    stroke: obj.stroke || '#000000',
    strokeWidth: obj.strokeWidth || 0,
    shadow: obj.shadow ? JSON.parse(JSON.stringify(obj.shadow)) : null,
    textAlign: obj.textAlign || 'left',
    charSpacing: obj.charSpacing || 0,
    lineHeight: obj.lineHeight || 1.2,
  };

  const preset = {
    name: presetName,
    preview: presetName.substring(0, 6).toUpperCase(),
    style: style,
    custom: true,
  };

  try {
    await saveCustomPreset(preset);
    customTextPresets.push(preset);
    buildTextPresets(); // Rebuild panel to show new preset
  } catch (err) {
    console.error('Failed to save preset:', err);
  }
}

function copyObjectStyle(obj) {
  const styleKeys = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fill', 'stroke', 'strokeWidth', 'shadow', 'textAlign', 'charSpacing', 'lineHeight', 'opacity'];
  _copiedStyle = {};
  styleKeys.forEach(k => {
    if (obj[k] !== undefined && obj[k] !== null) {
      _copiedStyle[k] = typeof obj[k] === 'object' ? JSON.parse(JSON.stringify(obj[k])) : obj[k];
    }
  });
}

function pasteObjectStyle(obj) {
  if (!_copiedStyle || obj.type !== 'textbox') return;
  obj.set(_copiedStyle);
  obj.setCoords();
  canvas.renderAll();
  saveHistory();
  updatePropertiesPanel(obj);
}

// ===== STICKERS =====
const STICKER_CATS = [
  { id: 'arrows', label: 'Arrows' },
  { id: 'badges', label: 'Badges' },
  { id: 'emoji', label: 'Emoji' },
  { id: 'highlight', label: 'Mark' },
  ...STICKER_ASSET_PACKS.map(pack => ({ id: pack.id, label: pack.label })),
];

const ASSET_STICKERS = STICKER_ASSET_PACKS.flatMap(pack => pack.items.map(item => ({
  id: item.id,
  title: item.title,
  cat: pack.id,
  preview: '<img class="sticker-asset-preview" src="' + item.asset + '" alt="">',
  build: () => buildVectorAssetSticker(item),
})));

// Each sticker: { id, cat, preview (HTML string for grid cell), build() -> FabricObject }
const STICKERS = [
  // ---- ARROWS (single Path — no Group alignment issues) ----
  {
    id: 'arrow-curved-right', cat: 'arrows',
    preview: '<svg viewBox="0 0 60 60" fill="#FF3B3B"><path d="M0,88 Q0,10 82,10 L82,0 L115,18 L82,36 L82,22 Q18,22 18,82Z"/></svg>',
    build: () => new Path('M 0,88 Q 0,10 82,10 L 82,0 L 115,18 L 82,36 L 82,22 Q 18,22 18,82 Z', {
      fill: '#FF3B3B', stroke: '#CC0000', strokeWidth: 2, strokeUniform: true,
    }),
  },
  {
    id: 'arrow-curved-left', cat: 'arrows',
    preview: '<svg viewBox="0 0 60 60" fill="#FF3B3B"><path d="M115,88 Q115,10 33,10 L33,0 L0,18 L33,36 L33,22 Q97,22 97,82Z"/></svg>',
    build: () => new Path('M 115,88 Q 115,10 33,10 L 33,0 L 0,18 L 33,36 L 33,22 Q 97,22 97,82 Z', {
      fill: '#FF3B3B', stroke: '#CC0000', strokeWidth: 2, strokeUniform: true,
    }),
  },
  {
    id: 'arrow-bold-right', cat: 'arrows',
    preview: '<svg viewBox="0 0 60 60" fill="#FF3B3B"><path d="M0,10 L65,10 L65,0 L110,25 L65,50 L65,40 L0,40Z"/></svg>',
    build: () => new Path('M 0,10 L 65,10 L 65,0 L 110,25 L 65,50 L 65,40 L 0,40 Z', {
      fill: '#FF3B3B', stroke: '#CC0000', strokeWidth: 2, strokeUniform: true,
    }),
  },
  {
    id: 'arrow-bold-down', cat: 'arrows',
    preview: '<svg viewBox="0 0 60 60" fill="#FF3B3B"><path d="M10,0 L30,0 L30,50 L40,50 L20,80 L0,50 L10,50Z"/></svg>',
    build: () => new Path('M 10,0 L 30,0 L 30,50 L 40,50 L 20,80 L 0,50 L 10,50 Z', {
      fill: '#FF3B3B', stroke: '#CC0000', strokeWidth: 2, strokeUniform: true,
    }),
  },
  {
    id: 'arrow-double-right', cat: 'arrows',
    preview: '<svg viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="5,19 12,12 5,5"/><polyline points="12,19 19,12 12,5"/></svg>',
    build: () => {
      const p = new Path('M 5 19L11.2929 12.7071C11.6834 12.3166 12.3166 12.3166 12.7071 12.7071L19 19 M 5 11L11.2929 4.70711C11.6834 4.31658 12.3166 4.31658 12.7071 4.70711L19 11', {
        fill: '', stroke: '#FFD700', strokeWidth: 2, strokeLineCap: 'round', strokeLineJoin: 'round',
      });
      p.set({ scaleX: 6, scaleY: 6 });
      return p;
    },
  },
  {
    id: 'arrow-pointing-finger', cat: 'arrows',
    preview: '<svg viewBox="0 0 424 424" fill="#333"><path d="M366,285 L346,265 C342,258 338,248 340,238 C344,224 348,212 350,196 L326,128 C318,106 300,92 282,92 L266,90 C258,90 248,84 242,76 L230,58 C224,52 214,48 206,48 C192,48 182,58 178,72 L172,96 C164,104 154,108 144,112 C130,118 118,130 114,146 C108,162 112,180 122,194 C116,198 108,206 104,216 C96,232 100,250 112,262 C106,266 98,274 94,282 C88,294 92,308 104,320 L188,404 C200,416 214,424 230,432 C248,442 264,456 280,472 L408,344Z"/></svg>',
    build: () => {
      const p = new Path('M366.282,285.164l-19.713-19.713c-2.251-2.251-3.805-5.08-4.494-8.181c-0.698-3.116-0.495-6.343,0.583-9.343 c1.381-3.828,2.808-9.375,4.241-16.48c2.341-11.62,1.443-23.667-2.598-34.837l-24.398-67.44 c-5.021-13.91-17.795-23.646-32.539-24.801l-15.95-1.258c-7.396-0.585-14.213-4.306-18.704-10.213 c-0.844-1.112-1.76-2.164-2.722-3.126c-11.779-11.778-30.959-11.763-42.756,0.034c-2.306,2.306-4.337,4.809-6.081,7.491 L113.718,9.864C107.356,3.503,98.898,0,89.9,0c-9,0.008-17.454,3.514-23.811,9.87C52.96,23,52.96,44.363,66.09,57.492 l75.968,75.967c-7.188,0.888-14.142,4.084-19.648,9.591c-11.384,11.385-12.898,28.96-4.54,41.991 c-7.536,0.708-14.877,3.941-20.635,9.699c-10.42,10.42-12.571,26.025-6.453,38.586c-6.523,0.618-12.847,3.334-17.833,8.167 c-5.886,5.704-9.131,13.362-9.139,21.564c0,8.026,3.124,15.567,8.8,21.242l84.079,84.079c9.275,9.276,19.812,17.173,31.318,23.475 c15.032,8.233,28.799,18.552,40.918,30.671c2.538,2.538,6.654,2.538,9.192,0l128.165-128.168 C368.82,291.818,368.82,287.702,366.282,285.164z', {
        fill: '#333333',
      });
      p.set({ scaleX: 0.35, scaleY: 0.35 });
      return p;
    },
  },
  {
    id: 'arrow-cursor', cat: 'arrows',
    preview: '<svg viewBox="0 0 24 24" fill="#ff0000"><path d="M3.52,4.46l.73,3.68a1,1,0,0,0,1.54.59L6.55,8,18.79,20.21a1,1,0,0,0,1.42,0,1,1,0,0,0,0-1.42L8,6.55l.76-.76a1,1,0,0,0-.59-1.54L4.46,3.52A.77.77,0,0,0,3.52,4.46Z"/></svg>',
    build: () => {
      const p = new Path('M3.52,4.46l.73,3.68a1,1,0,0,0,1.54.59L6.55,8,18.79,20.21a1,1,0,0,0,1.42,0,1,1,0,0,0,0-1.42L8,6.55l.76-.76a1,1,0,0,0-.59-1.54L4.46,3.52A.77.77,0,0,0,3.52,4.46Z', {
        fill: '#FF0000',
      });
      p.set({ scaleX: 7, scaleY: 7 });
      return p;
    },
  },

  {
    id: 'arrow-callout', cat: 'arrows',
    preview: '<svg viewBox="0 0 60 27"><path d="M1 1 L53 2 L59 14 L52 26 L2 26 Z" fill="#ff0000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    build: () => {
      const p = new Path('M10 10 L531 27 L591 139 L527 260 L24 260 Z', {
        fill: '#FF0000', stroke: '#FFFFFF', strokeWidth: 10, strokeLineJoin: 'round', strokeUniform: true,
      });
      const g = centerGroup([p]);
      g.set({ scaleX: 0.6, scaleY: 0.6 });
      return g;
    },
  },

  // ---- BADGES ----
  {
    id: 'badge-new', cat: 'badges',
    preview: '<svg viewBox="0 0 298 298" fill="#EB0000"><path d="M290.9,131.7 L275.3,115.2 C271.8,111.6 270.2,106.7 270.9,101.8 L273.9,79.3 C275.6,66.1 266.7,53.9 253.7,51.5 L231.4,47.4 C226.5,46.5 222.3,43.4 220,39.1 L209.2,19.1 C202.8,7.4 188.4,2.7 176.4,8.5 L155.9,18.3 C151.5,20.4 146.3,20.4 141.9,18.3 L121.4,8.5 C109.4,2.7 95,7.4 88.7,19.1 L77.8,39.1 C75.5,43.4 71.3,46.5 66.4,47.4 L44.1,51.5 C31,53.9 22.1,66.1 23.9,79.3 L26.9,101.8 C27.5,106.7 26,111.6 22.5,115.2 L6.9,131.7 C-2.3,141.3 -2.3,156.4 6.9,166.1 L22.5,182.5 C26,186.1 27.5,191 26.9,195.9 L23.9,218.4 C22.1,231.6 31,243.8 44.1,246.2 L66.4,250.3 C71.3,251.2 75.5,254.3 77.8,258.6 L88.7,278.6 C95,290.3 109.4,295 121.4,289.2 L141.9,279.4 C146.3,277.3 151.5,277.3 155.9,279.4 L176.4,289.2 C188.4,295 202.8,290.3 209.1,278.6 L220,258.6 C222.3,254.3 226.5,251.2 231.4,250.3 L253.7,246.2 C266.8,243.8 275.7,231.6 273.9,218.4 L270.9,195.9 C270.2,191 271.8,186.1 275.3,182.5 L290.9,166.1 C300.1,156.4 300.1,141.3 290.9,131.7Z"/><circle cx="149" cy="149" r="94" fill="white"/><text x="149" y="170" text-anchor="middle" fill="#EB0000" font-size="80" font-weight="bold" font-family="Impact,sans-serif">NEW</text></svg>',
    build: () => buildSealBadge('NEW', '#EB0000'),
  },
  {
    id: 'badge-free', cat: 'badges',
    preview: '<svg viewBox="0 0 298 298" fill="#16A34A"><path d="M290.9,131.7 L275.3,115.2 C271.8,111.6 270.2,106.7 270.9,101.8 L273.9,79.3 C275.6,66.1 266.7,53.9 253.7,51.5 L231.4,47.4 C226.5,46.5 222.3,43.4 220,39.1 L209.2,19.1 C202.8,7.4 188.4,2.7 176.4,8.5 L155.9,18.3 C151.5,20.4 146.3,20.4 141.9,18.3 L121.4,8.5 C109.4,2.7 95,7.4 88.7,19.1 L77.8,39.1 C75.5,43.4 71.3,46.5 66.4,47.4 L44.1,51.5 C31,53.9 22.1,66.1 23.9,79.3 L26.9,101.8 C27.5,106.7 26,111.6 22.5,115.2 L6.9,131.7 C-2.3,141.3 -2.3,156.4 6.9,166.1 L22.5,182.5 C26,186.1 27.5,191 26.9,195.9 L23.9,218.4 C22.1,231.6 31,243.8 44.1,246.2 L66.4,250.3 C71.3,251.2 75.5,254.3 77.8,258.6 L88.7,278.6 C95,290.3 109.4,295 121.4,289.2 L141.9,279.4 C146.3,277.3 151.5,277.3 155.9,279.4 L176.4,289.2 C188.4,295 202.8,290.3 209.1,278.6 L220,258.6 C222.3,254.3 226.5,251.2 231.4,250.3 L253.7,246.2 C266.8,243.8 275.7,231.6 273.9,218.4 L270.9,195.9 C270.2,191 271.8,186.1 275.3,182.5 L290.9,166.1 C300.1,156.4 300.1,141.3 290.9,131.7Z"/><circle cx="149" cy="149" r="94" fill="white"/><text x="149" y="170" text-anchor="middle" fill="#16A34A" font-size="70" font-weight="bold" font-family="Impact,sans-serif">FREE</text></svg>',
    build: () => buildSealBadge('FREE', '#16A34A'),
  },
  {
    id: 'badge-number1', cat: 'badges',
    preview: '<svg viewBox="0 0 400 400"><circle cx="200" cy="200" r="180" fill="#FFD700"/><text x="200" y="215" text-anchor="middle" dominant-baseline="central" fill="#000" font-size="160" font-weight="900" font-family="Impact,sans-serif">#1</text></svg>',
    build: () => buildNumber1Badge(),
  },
  {
    id: 'badge-vs', cat: 'badges',
    preview: '<svg viewBox="0 0 600 400"><circle cx="240" cy="200" r="120" fill="#38bdf8" opacity="0.7"/><circle cx="360" cy="200" r="120" fill="#f43f5e" opacity="0.7"/><text x="300" y="220" text-anchor="middle" fill="white" font-size="80" font-weight="900" font-family="Impact,sans-serif">VS</text></svg>',
    build: () => buildVsBadge(),
  },
  {
    id: 'badge-hot', cat: 'badges',
    preview: '<svg viewBox="0 0 500 500"><path d="M250,55 C272,55 287,70 307,77 C328,84 349,79 366,93 C383,107 387,129 400,146 C413,163 434,173 440,195 C446,217 435,238 435,260 C435,282 446,303 440,325 C434,347 413,357 400,374 C387,391 383,413 366,427 C349,441 328,436 307,443 C287,450 272,465 250,465 C228,465 213,450 193,443 C172,436 151,441 134,427 C117,413 113,391 100,374 C87,357 66,347 60,325 C54,303 65,282 65,260 C65,238 54,217 60,195 C66,173 87,163 100,146 C113,129 117,107 134,93 C151,79 172,84 193,77 C213,70 228,55 250,55Z" fill="#fff" stroke="#522b80" stroke-width="14" stroke-linejoin="round"/><text x="250" y="260" text-anchor="middle" dominant-baseline="central" fill="#d80032" font-size="100" font-weight="900" font-family="Impact,sans-serif" transform="rotate(-40 250 260)">HOT</text></svg>',
    build: () => buildHotBadge(),
  },
  {
    id: 'badge-ribbon', cat: 'badges',
    preview: '<svg viewBox="0 0 64 64"><path d="M29.1 12.9H19L12.9 19v10.1L43.8 64L64 43.8L29.1 12.9Z" fill="#f2b200"/><circle cx="22.7" cy="22.7" r="2.4" fill="#fff" opacity="0.6"/></svg>',
    build: () => buildTagBadge(),
  },
  {
    id: 'badge-live', cat: 'badges',
    preview: '<svg viewBox="0 0 500 250"><rect width="500" height="250" rx="55" fill="#FF1E27"/><circle cx="132" cy="125" r="15" fill="#fff"/><text x="340" y="140" font-size="50" font-weight="800" fill="#fff" font-family="sans-serif">LIVE</text></svg>',
    build: () => {
      const bg = new Rect({ width: 500, height: 250, rx: 55, fill: '#FF1E27' });
      const dot = new Circle({ radius: 23, fill: '#FFFFFF', left: 132 - 23, top: 125 - 23 });
      const w1L = new Path('M 103,89 A 50,50 0 0,0 103,161', { fill: '', stroke: '#FFFFFF', strokeWidth: 14, strokeLineCap: 'round' });
      const w1R = new Path('M 161,89 A 50,50 0 0,1 161,161', { fill: '', stroke: '#FFFFFF', strokeWidth: 14, strokeLineCap: 'round' });
      const w2L = new Path('M 80,68 A 82,82 0 0,0 80,182', { fill: '', stroke: '#FFFFFF', strokeWidth: 14, strokeLineCap: 'round' });
      const w2R = new Path('M 184,68 A 82,82 0 0,1 184,182', { fill: '', stroke: '#FFFFFF', strokeWidth: 14, strokeLineCap: 'round' });
      const txt = new Textbox('LIVE', {
        fontSize: 92, fontWeight: '800', fill: '#FFFFFF', fontFamily: 'Arial Black, sans-serif',
        width: 200, left: 350, top: 125, originX: 'center', originY: 'center',
        textAlign: 'center', editable: true, padding: 0,
      });
      const g = centerGroup([bg, dot, w1L, w1R, w2L, w2R, txt]);
      g.set({ scaleX: 0.7, scaleY: 0.7 });
      return g;
    },
  },
  {
    id: 'badge-subscribe', cat: 'badges',
    preview: '<svg viewBox="0 0 380 110"><rect width="380" height="110" rx="10" fill="#e62117"/><rect x="15" y="25" width="60" height="60" rx="5" fill="#fff"/><path d="M35 38v34l17-17z" fill="#e62117"/><text x="240" y="68" font-size="34" font-weight="700" fill="#fff" font-family="sans-serif" text-anchor="middle">SUBSCRIBE</text></svg>',
    build: () => {
      const bg = new Rect({ width: 370, height: 100, rx: 8, fill: '#E62117' });
      const playBg = new Rect({ width: 54, height: 44, rx: 4, fill: '#FFFFFF', left: 20, top: 28 });
      const playTri = new Path('M 0 0 L 0 24 L 12 12 Z', { fill: '#E62117', left: 40, top: 38 });
      const txt = new Textbox('SUBSCRIBE', {
        fontSize: 32, fontWeight: '700', fill: '#FFFFFF', fontFamily: 'Arial, sans-serif',
        width: 230, left: 100, top: 50, originX: 'left', originY: 'center',
        textAlign: 'left', editable: true, padding: 0,
      });
      const g = centerGroup([bg, playBg, playTri, txt]);
      g.set({ scaleX: 0.8, scaleY: 0.8 });
      return g;
    },
  },

  // ---- EMOJI ----
  { id: 'emoji-fire', cat: 'emoji', preview: '🔥', build: () => new Textbox('🔥', { fontSize: 140, width: 180, editable: false, textAlign: 'center' }) },
  { id: 'emoji-shocked', cat: 'emoji', preview: '😱', build: () => new Textbox('😱', { fontSize: 140, width: 180, editable: false, textAlign: 'center' }) },
  { id: 'emoji-skull', cat: 'emoji', preview: '💀', build: () => new Textbox('💀', { fontSize: 140, width: 180, editable: false, textAlign: 'center' }) },
  { id: 'emoji-money', cat: 'emoji', preview: '💰', build: () => new Textbox('💰', { fontSize: 140, width: 180, editable: false, textAlign: 'center' }) },
  { id: 'emoji-100', cat: 'emoji', preview: '💯', build: () => new Textbox('💯', { fontSize: 140, width: 180, editable: false, textAlign: 'center' }) },
  { id: 'emoji-lightning', cat: 'emoji', preview: '⚡', build: () => new Textbox('⚡', { fontSize: 140, width: 180, editable: false, textAlign: 'center' }) },
  { id: 'emoji-crown', cat: 'emoji', preview: '👑', build: () => new Textbox('👑', { fontSize: 140, width: 180, editable: false, textAlign: 'center' }) },
  { id: 'emoji-eyes', cat: 'emoji', preview: '👀', build: () => new Textbox('👀', { fontSize: 140, width: 180, editable: false, textAlign: 'center' }) },
  { id: 'emoji-boom', cat: 'emoji', preview: '💥', build: () => new Textbox('💥', { fontSize: 140, width: 180, editable: false, textAlign: 'center' }) },
  { id: 'emoji-thumbsup', cat: 'emoji', preview: '👍', build: () => new Textbox('👍', { fontSize: 140, width: 180, editable: false, textAlign: 'center' }) },
  { id: 'emoji-rocket', cat: 'emoji', preview: '🚀', build: () => new Textbox('🚀', { fontSize: 140, width: 180, editable: false, textAlign: 'center' }) },
  { id: 'emoji-star', cat: 'emoji', preview: '⭐', build: () => new Textbox('⭐', { fontSize: 140, width: 180, editable: false, textAlign: 'center' }) },
  {
    id: 'emoji-heart', cat: 'emoji',
    preview: '<svg viewBox="0 0 50 50"><path d="M24.85,10.126c2.018-4.783,6.628-8.125,11.99-8.125c7.223,0,12.425,6.179,13.079,13.543c0,0,0.353,1.828-0.424,5.119c-1.058,4.482-3.545,8.464-6.898,11.503L24.85,48L7.402,32.165c-3.353-3.038-5.84-7.021-6.898-11.503c-0.777-3.291-0.424-5.119-0.424-5.119C0.734,8.179,5.936,2,13.159,2C18.522,2,22.832,5.343,24.85,10.126z" fill="#C03A2B"/></svg>',
    build: () => {
      const heart = new Path('M24.85,10.126c2.018-4.783,6.628-8.125,11.99-8.125c7.223,0,12.425,6.179,13.079,13.543c0,0,0.353,1.828-0.424,5.119c-1.058,4.482-3.545,8.464-6.898,11.503L24.85,48L7.402,32.165c-3.353-3.038-5.84-7.021-6.898-11.503c-0.777-3.291-0.424-5.119-0.424-5.119C0.734,8.179,5.936,2,13.159,2C18.522,2,22.832,5.343,24.85,10.126z', {
        fill: '#C03A2B',
      });
      const shine = new Path('M6,18.078c-0.553,0-1-0.447-1-1c0-5.514,4.486-10,10-10c0.553,0,1,0.447,1,1s-0.447,1-1,1c-4.411,0-8,3.589-8,8C7,17.631,6.553,18.078,6,18.078z', {
        fill: '#ED7161',
      });
      const g = centerGroup([heart, shine]);
      g.set({ scaleX: 3.5, scaleY: 3.5 });
      return g;
    },
  },
  {
    id: 'emoji-gold-star', cat: 'emoji',
    preview: '<svg viewBox="0 0 48 48"><path d="M26.285,2.486l5.407,10.956c0.376,0.762,1.103,1.29,1.944,1.412l12.091,1.757c2.118,0.308,2.963,2.91,1.431,4.403l-8.749,8.528c-0.608,0.593-0.886,1.448-0.742,2.285l2.065,12.042c0.362,2.109-1.852,3.717-3.746,2.722l-10.814-5.685c-0.752-0.395-1.651-0.395-2.403,0l-10.814,5.685c-1.894,0.996-4.108-0.613-3.746-2.722l2.065-12.042c0.144-0.837-0.134-1.692-0.742-2.285l-8.749-8.528c-1.532-1.494-0.687-4.096,1.431-4.403l12.091-1.757c0.841-0.122,1.568-0.65,1.944-1.412l5.407-10.956C22.602,0.567,25.338,0.567,26.285,2.486z" fill="#ED8A19"/></svg>',
    build: () => {
      const star = new Path('M26.285,2.486l5.407,10.956c0.376,0.762,1.103,1.29,1.944,1.412l12.091,1.757c2.118,0.308,2.963,2.91,1.431,4.403l-8.749,8.528c-0.608,0.593-0.886,1.448-0.742,2.285l2.065,12.042c0.362,2.109-1.852,3.717-3.746,2.722l-10.814-5.685c-0.752-0.395-1.651-0.395-2.403,0l-10.814,5.685c-1.894,0.996-4.108-0.613-3.746-2.722l2.065-12.042c0.144-0.837-0.134-1.692-0.742-2.285l-8.749-8.528c-1.532-1.494-0.687-4.096,1.431-4.403l12.091-1.757c0.841-0.122,1.568-0.65,1.944-1.412l5.407-10.956C22.602,0.567,25.338,0.567,26.285,2.486z', {
        fill: '#ED8A19',
      });
      star.set({ scaleX: 3.5, scaleY: 3.5 });
      return star;
    },
  },

  // ---- HIGHLIGHT / MARK ----
  {
    id: 'mark-red-circle', cat: 'highlight',
    preview: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="24" fill="none" stroke="#FF3B3B" stroke-width="6"/></svg>',
    build: () => new Circle({ radius: 70, fill: 'transparent', stroke: '#FF3B3B', strokeWidth: 10, strokeUniform: true }),
  },
  {
    id: 'mark-yellow-underline', cat: 'highlight',
    preview: '<svg viewBox="0 0 60 60"><rect x="4" y="36" width="52" height="12" rx="4" fill="#FBBF24" opacity="0.85"/></svg>',
    build: () => new Rect({ width: 300, height: 30, fill: '#FBBF24', rx: 6, opacity: 0.9 }),
  },
  {
    id: 'mark-check-circle', cat: 'highlight',
    preview: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="24" fill="#22C55E" stroke="#16A34A" stroke-width="2"/><polyline points="18,30 26,38 42,22" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    build: () => {
      const bg = new Circle({ radius: 55, fill: '#22C55E', stroke: '#16A34A', strokeWidth: 4, strokeUniform: true });
      const check = new Path('M -20,2 L -6,16 L 22,-14', { fill: '', stroke: '#FFFFFF', strokeWidth: 10, strokeLineCap: 'round', strokeLineJoin: 'round', strokeUniform: true });
      return centerGroup([bg, check]);
    }
  },
  {
    id: 'mark-x-circle', cat: 'highlight',
    preview: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="24" fill="#EF4444" stroke="#DC2626" stroke-width="2"/><line x1="21" y1="21" x2="39" y2="39" stroke="white" stroke-width="4" stroke-linecap="round"/><line x1="39" y1="21" x2="21" y2="39" stroke="white" stroke-width="4" stroke-linecap="round"/></svg>',
    build: () => {
      const bg = new Circle({ radius: 55, fill: '#EF4444', stroke: '#DC2626', strokeWidth: 4, strokeUniform: true });
      const x1 = new Line([-18, -18, 18, 18], { stroke: '#FFFFFF', strokeWidth: 10, strokeLineCap: 'round', strokeUniform: true });
      const x2 = new Line([18, -18, -18, 18], { stroke: '#FFFFFF', strokeWidth: 10, strokeLineCap: 'round', strokeUniform: true });
      return centerGroup([bg, x1, x2]);
    }
  },
  {
    id: 'mark-warning', cat: 'highlight',
    preview: '<svg viewBox="0 0 128 128"><path d="M57.16 8.42l-52 104c-1.94 4.02-.26 8.85 3.75 10.79c1.08.52 2.25.8 3.45.81h104c4.46-.04 8.05-3.69 8.01-8.15a8.12 8.12 0 0 0-.81-3.45l-52-104a8.07 8.07 0 0 0-14.4 0z" fill="#f2a600"/><path d="M53.56 15.72l-48.8 97.4c-1.83 3.77-.25 8.31 3.52 10.14c.99.48 2.08.74 3.18.76h97.5a7.55 7.55 0 0 0 7.48-7.62 7.6 7.6 0 0 0-.78-3.28l-48.7-97.4a7.44 7.44 0 0 0-9.93-3.47 7.48 7.48 0 0 0-3.47 3.47z" fill="#ffcc32"/><rect x="58" y="34" width="12" height="56" rx="6" fill="#333"/><circle cx="64" cy="104" r="6" fill="#333"/></svg>',
    build: () => {
      // Outer triangle (dark amber border)
      const triOuter = new Path('M57.16 8.42l-52 104c-1.94 4.02-.26 8.85 3.75 10.79c1.08.52 2.25.8 3.45.81h104c4.46-.04 8.05-3.69 8.01-8.15a8.123 8.123 0 0 0-.81-3.45l-52-104a8.067 8.067 0 0 0-14.4 0z', {
        fill: '#f2a600', strokeUniform: true,
      });
      // Inner triangle (bright yellow)
      const triInner = new Path('M53.56 15.72l-48.8 97.4c-1.83 3.77-.25 8.31 3.52 10.14c.99.48 2.08.74 3.18.76h97.5a7.55 7.55 0 0 0 7.48-7.62a7.605 7.605 0 0 0-.78-3.28l-48.7-97.4a7.443 7.443 0 0 0-9.93-3.47a7.484 7.484 0 0 0-3.47 3.47z', {
        fill: '#ffcc32', strokeUniform: true,
      });
      // Exclamation bar (dark rounded rect at triangle center)
      const bar = new Rect({ width: 12, height: 56, fill: '#333333', rx: 6, left: 58, top: 34 });
      // Dot
      const dot = new Circle({ radius: 6, fill: '#333333', left: 58, top: 98 });
      const g = centerGroup([triOuter, triInner, bar, dot]);
      g.set({ scaleX: 1.5, scaleY: 1.5 });
      return g;
    }
  },
  {
    id: 'mark-spotlight', cat: 'highlight',
    preview: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" fill="rgba(255,255,0,0.2)" stroke="rgba(255,255,0,0.5)" stroke-width="3"/></svg>',
    build: () => new Circle({ radius: 80, fill: 'rgba(255,255,0,0.18)', stroke: 'rgba(255,255,0,0.45)', strokeWidth: 8, strokeUniform: true }),
  },
  {
    id: 'mark-box-dashed', cat: 'highlight',
    preview: '<svg viewBox="0 0 560 559"><path d="M27 96V11H112V32H48V96Z" fill="#fcff00"/><path d="M454 11H539V96H518V32H454Z" fill="#fcff00"/><path d="M27 438H48V502H112V523H27Z" fill="#fcff00"/><path d="M518 438H539V523H454V502H518Z" fill="#fcff00"/><rect x="134" y="11" width="180" height="21" fill="#fcff00"/><rect x="347" y="11" width="85" height="21" fill="#fcff00"/><rect x="134" y="502" width="180" height="21" fill="#fcff00"/><rect x="347" y="502" width="85" height="21" fill="#fcff00"/></svg>',
    build: () => {
      const y = '#fcff00';
      const corners = [
        new Path('M27 96 V11 H112 V32 H48 V96 Z', { fill: y }),
        new Path('M454 11 H539 V96 H518 V32 H454 Z', { fill: y }),
        new Path('M27 438 H48 V502 H112 V523 H27 Z', { fill: y }),
        new Path('M518 438 H539 V523 H454 V502 H518 Z', { fill: y }),
      ];
      const dashes = [
        new Rect({ width: 85, height: 21, fill: y, left: 134, top: 11 }),
        new Rect({ width: 86, height: 21, fill: y, left: 240, top: 11 }),
        new Rect({ width: 85, height: 21, fill: y, left: 347, top: 11 }),
        new Rect({ width: 85, height: 21, fill: y, left: 134, top: 502 }),
        new Rect({ width: 86, height: 21, fill: y, left: 240, top: 502 }),
        new Rect({ width: 85, height: 21, fill: y, left: 347, top: 502 }),
        new Rect({ width: 21, height: 85, fill: y, left: 27, top: 118 }),
        new Rect({ width: 21, height: 86, fill: y, left: 27, top: 224 }),
        new Rect({ width: 21, height: 85, fill: y, left: 27, top: 331 }),
        new Rect({ width: 21, height: 85, fill: y, left: 518, top: 118 }),
        new Rect({ width: 21, height: 86, fill: y, left: 518, top: 224 }),
        new Rect({ width: 21, height: 85, fill: y, left: 518, top: 331 }),
      ];
      const g = centerGroup([...corners, ...dashes]);
      g.set({ scaleX: 0.8, scaleY: 0.8 });
      return g;
    },
  },
  {
    id: 'mark-box-red', cat: 'highlight',
    preview: '<svg viewBox="0 0 400 400"><rect x="14" y="14" width="372" height="372" fill="none" stroke="#FF0000" stroke-width="28"/></svg>',
    build: () => {
      const r = new Rect({ width: 400, height: 400, fill: 'transparent', stroke: '#FF0000', strokeWidth: 28, strokeUniform: true });
      const g = centerGroup([r]);
      g.set({ scaleX: 0.7, scaleY: 0.7 });
      return g;
    },
  },
  {
    id: 'mark-magnify', cat: 'highlight',
    preview: '<svg viewBox="0 0 672 495"><circle cx="423" cy="247.5" r="195" fill="none" stroke="#ff0000" stroke-width="40"/><path d="M 0 491 L 196 151 L 389 491 Z" fill="#ff0000" opacity="0.7"/></svg>',
    build: () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="672" height="495" viewBox="0 0 672 495"><defs><linearGradient id="hg" x1="0%" y1="55%" x2="100%" y2="55%"><stop offset="0%" stop-color="#ff0000" stop-opacity="1"/><stop offset="42%" stop-color="#ff0000" stop-opacity="0.88"/><stop offset="72%" stop-color="#ff0000" stop-opacity="0.42"/><stop offset="100%" stop-color="#ff0000" stop-opacity="0"/></linearGradient><mask id="hm"><rect width="672" height="495" fill="white"/><circle cx="423" cy="247.5" r="191.5" fill="black"/></mask></defs><path d="M 0 491 L 196 151 L 389 491 Z" fill="url(#hg)" mask="url(#hm)"/><circle cx="423" cy="247.5" r="219.5" fill="none" stroke="#ffffff" stroke-width="56"/><circle cx="423" cy="247.5" r="219.5" fill="none" stroke="#ff0000" stroke-width="48"/></svg>`;
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      return FabricImage.fromURL(url).then(img => { img.set({ scaleX: 0.45, scaleY: 0.45 }); return img; });
    },
  },
  {
    id: 'mark-pin', cat: 'highlight',
    preview: '<svg viewBox="0 0 52 52"><path d="M38.853,5.324c-7.098-7.098-18.607-7.098-25.706,0C6.751,11.72,6.031,23.763,11.459,31L26,52l14.541-21C45.969,23.763,45.249,11.72,38.853,5.324z" fill="#1081E0"/></svg>',
    build: () => {
      const pin = new Path('M38.853,5.324c-7.098-7.098-18.607-7.098-25.706,0C6.751,11.72,6.031,23.763,11.459,31L26,52l14.541-21C45.969,23.763,45.249,11.72,38.853,5.324z', {
        fill: '#1081E0',
      });
      const hole = new Circle({ radius: 6, fill: '#FFFFFF', left: 26.177 - 6, top: 18 - 6 });
      const g = centerGroup([pin, hole]);
      g.set({ scaleX: 3.5, scaleY: 3.5 });
      return g;
    },
  },
  ...ASSET_STICKERS,
];

// Badge builder helpers — place children at (0,0), then centerGroup offsets them
function buildBurstPath(fillColor, strokeColor) {
  const pts = 12, outer = 60, inner = 32;
  const points = [];
  for (let i = 0; i < pts * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / pts) * i - Math.PI / 2;
    points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  let pathStr = 'M ' + points[0].x + ' ' + points[0].y;
  for (let i = 1; i < points.length; i++) pathStr += ' L ' + points[i].x + ' ' + points[i].y;
  pathStr += ' Z';
  return new Path(pathStr, {
    fill: fillColor, stroke: strokeColor, strokeWidth: 3, strokeUniform: true,
  });
}

function centerGroup(objects) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  objects.forEach(o => {
    const b = o.getBoundingRect();
    minX = Math.min(minX, b.left);
    minY = Math.min(minY, b.top);
    maxX = Math.max(maxX, b.left + b.width);
    maxY = Math.max(maxY, b.top + b.height);
  });
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  objects.forEach(o => {
    o.left -= cx;
    o.top -= cy;
    o.setCoords();
  });
  const g = new Group(objects);
  g.getObjects().forEach(o => { o.set({ selectable: false, evented: false }); });
  return g;
}

function buildSealBadge(text, sealColor) {
  // Outer seal shape from user SVG (viewBox 0 0 297.773 297.773)
  const sealPath = 'M290.903,131.693l-15.645-16.453c-3.406-3.582-5.008-8.513-4.357-13.413l2.986-22.505 c1.748-13.178-7.141-25.411-20.213-27.82l-22.328-4.115c-4.861-0.896-9.057-3.942-11.41-8.289l-10.811-19.963 c-6.332-11.688-20.715-16.36-32.705-10.626l-20.482,9.796c-4.459,2.133-9.645,2.133-14.104,0l-20.48-9.796 c-11.992-5.734-26.375-1.062-32.705,10.626L77.837,39.097c-2.354,4.347-6.549,7.393-11.41,8.289l-22.328,4.114 c-13.07,2.41-21.961,14.644-20.213,27.821l2.988,22.505c0.648,4.9-0.953,9.831-4.359,13.413L6.87,131.693 c-9.16,9.632-9.16,24.753,0,34.387l15.645,16.454c3.406,3.581,5.008,8.512,4.359,13.411l-2.988,22.507 c-1.748,13.178,7.142,25.41,20.213,27.82l22.33,4.115c4.859,0.896,9.055,3.942,11.408,8.289l10.812,19.962 c6.33,11.688,20.713,16.36,32.703,10.627l20.482-9.796c4.459-2.133,9.645-2.133,14.104,0l20.482,9.796 c11.99,5.733,26.373,1.061,32.705-10.627l10.811-19.962c2.354-4.347,6.549-7.394,11.41-8.289l22.33-4.115 c13.07-2.41,21.959-14.644,20.211-27.82l-2.986-22.507c-0.65-4.899,0.951-9.83,4.357-13.411l15.645-16.454 C300.063,156.446,300.063,141.325,290.903,131.693z';
  const seal = new Path(sealPath, { fill: sealColor, strokeUniform: true });
  const circlePath = 'M148.886,54.552c-52.016,0-94.333,42.318-94.333,94.334s42.317,94.333,94.333,94.333c52.016,0,94.334-42.317,94.334-94.333 S200.902,54.552,148.886,54.552z';
  const inner = new Path(circlePath, { fill: '#FFFFFF' });
  // Center shapes first, then add text at exact group center
  const g = centerGroup([seal, inner]);
  const fs = text.length <= 3 ? 80 : 55;
  const txt = new Textbox(text, {
    fontSize: fs, fontWeight: '900', fill: sealColor, fontFamily: 'Impact, sans-serif',
    width: 170, left: 0, top: 0, originX: 'center', originY: 'center',
    textAlign: 'center', editable: true, padding: 0,
  });
  g.add(txt);
  txt.set({ selectable: false, evented: false });
  return g;
}

// buildBurstPath kept for potential future use

function buildNumber1Badge() {
  const bg = new Circle({ radius: 180, fill: '#FFD700', left: 200 - 180, top: 200 - 180 });
  const g = centerGroup([bg]);
  const txt = new Textbox('#1', {
    fontSize: 140, fontWeight: '900', fill: '#000000', fontFamily: 'Impact, sans-serif',
    width: 160, left: 0, top: 0, originX: 'center', originY: 'center',
    textAlign: 'center', editable: true, padding: 0,
  });
  g.add(txt);
  txt.set({ selectable: false, evented: false });
  g.set({ scaleX: 0.42, scaleY: 0.42 });
  return g;
}

function buildVsBadge() {
  // From user SVG: viewBox 0 0 600 400, circles at (230,200) and (370,200) r=130
  const r = 130;
  const cL = new Circle({ radius: r, fill: '#38bdf8', left: 230 - r, top: 200 - r, opacity: 0.45 });
  const cR = new Circle({ radius: r, fill: '#f43f5e', left: 370 - r, top: 200 - r, opacity: 0.45 });
  const g = centerGroup([cL, cR]);
  const txt = new Textbox('VS', {
    fontSize: 52, fontWeight: '900', fill: '#FFFFFF', fontFamily: 'Impact, sans-serif',
    width: 80, left: 0, top: 0, originX: 'center', originY: 'center',
    textAlign: 'center', editable: true, padding: 0,
  });
  g.add(txt);
  txt.set({ selectable: false, evented: false });
  g.set({ scaleX: 0.9, scaleY: 0.9 });
  return g;
}

function buildHotBadge() {
  // From user SVG: viewBox 0 0 500 500, blob center ~(250,260)
  const blobPath = 'M 250,55 C 272,55 287,70 307,77 C 328,84 349,79 366,93 C 383,107 387,129 400,146 C 413,163 434,173 440,195 C 446,217 435,238 435,260 C 435,282 446,303 440,325 C 434,347 413,357 400,374 C 387,391 383,413 366,427 C 349,441 328,436 307,443 C 287,450 272,465 250,465 C 228,465 213,450 193,443 C 172,436 151,441 134,427 C 117,413 113,391 100,374 C 87,357 66,347 60,325 C 54,303 65,282 65,260 C 65,238 54,217 60,195 C 66,173 87,163 100,146 C 113,129 117,107 134,93 C 151,79 172,84 193,77 C 213,70 228,55 250,55 Z';
  const blob = new Path(blobPath, {
    fill: '#FFFFFF', stroke: '#522b80', strokeWidth: 28,
    strokeLineJoin: 'round', strokeLineCap: 'round', strokeUniform: true,
  });
  // Center the blob first, then add text at exact group center
  const g = centerGroup([blob]);
  const txt = new Textbox('HOT', {
    fontSize: 115, fontWeight: '900', fill: '#d80032', fontFamily: 'Impact, sans-serif',
    width: 200, left: 0, top: 0, originX: 'center', originY: 'center',
    textAlign: 'center', editable: true, padding: 0, angle: -40,
  });
  g.add(txt);
  txt.set({ selectable: false, evented: false });
  g.set({ scaleX: 0.35, scaleY: 0.35 });
  return g;
}

function buildTagBadge() {
  // From user SVG: viewBox 0 0 64 64 — yellow price-tag shape
  const tagPath = 'M29.1 12.9H19L12.9 19v10.1L43.8 64L64 43.8L29.1 12.9Z';
  const tag = new Path(tagPath, { fill: '#f2b200' });
  // Small white circle (hole) at ~22.7,22.7 r~2.4
  const hole = new Circle({ radius: 2.4, fill: '#FFFFFF', left: 22.7 - 2.4, top: 22.7 - 2.4, opacity: 0.6 });
  const g = centerGroup([tag, hole]);
  g.set({ scaleX: 2.5, scaleY: 2.5 });
  return g;
}

let stickerPopupOpen = false;
let activeStickerCat = 'arrows';

function setupStickers() {
  const btn = document.getElementById('stickerBtn');
  const popup = document.getElementById('stickerPopup');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (stickerPopupOpen) {
      closeStickerPopup();
    } else {
      openStickerPopup(btn);
    }
  });

  // Close on outside click
  document.addEventListener('mousedown', (e) => {
    if (stickerPopupOpen && !popup.contains(e.target) && e.target !== btn) {
      closeStickerPopup();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stickerPopupOpen) closeStickerPopup();
  });

  // Build tabs
  const tabsEl = document.getElementById('stickerTabs');
  STICKER_CATS.forEach((cat, i) => {
    const tab = document.createElement('button');
    tab.className = 'sticker-tab' + (i === 0 ? ' active' : '');
    tab.textContent = cat.label;
    tab.dataset.cat = cat.id;
    tab.addEventListener('click', () => {
      activeStickerCat = cat.id;
      tabsEl.querySelectorAll('.sticker-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderStickerGrid();
    });
    tabsEl.appendChild(tab);
  });

  renderStickerGrid();
}

function openStickerPopup(btn) {
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  const popup = document.getElementById('stickerPopup');
  stickerPopupOpen = true;
  btn.classList.add('active');

  // Position: to the right of the toolbar button
  const rect = btn.getBoundingClientRect();
  popup.style.left = (rect.right + 6) + 'px';
  popup.style.top = rect.top + 'px';

  // If it would overflow right, shift left
  popup.style.display = 'block';
  if (popup.offsetLeft + popup.offsetWidth > window.innerWidth - 10) {
    popup.style.left = (rect.left - popup.offsetWidth - 6) + 'px';
  }
  // If it would overflow bottom, shift up
  if (popup.offsetTop + popup.offsetHeight > window.innerHeight - 10) {
    popup.style.top = (window.innerHeight - popup.offsetHeight - 10) + 'px';
  }
}

function closeStickerPopup() {
  document.getElementById('stickerPopup').style.display = 'none';
  document.getElementById('stickerBtn').classList.remove('active');
  stickerPopupOpen = false;
}

function renderStickerGrid() {
  const grid = document.getElementById('stickerGrid');
  grid.innerHTML = '';
  const items = STICKERS.filter(s => s.cat === activeStickerCat);
  items.forEach(sticker => {
    const cell = document.createElement('div');
    cell.className = 'sticker-cell';
    cell.innerHTML = sticker.preview;
    cell.title = sticker.title || sticker.id.replace(/-/g, ' ');
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      addStickerToCanvas(sticker);
      closeStickerPopup();
    });
    grid.appendChild(cell);
  });
}

function discoverVectorAssetColors(obj) {
  const colors = [];
  const addColor = color => {
    if (typeof color !== 'string' || color === '' || color === 'none' || color === 'transparent' || color.startsWith('url(')) return;
    if (!colors.some(existing => colorsEqual(existing, color))) colors.push(color);
  };
  visitVectorAssetObjects(obj, child => {
    addColor(child.fill);
    addColor(child.stroke);
  });
  return colors.map((source, index) => ({
    label: getVectorColorLabel(source, index, colors.length),
    source,
    current: source,
  }));
}

function getVectorColorLabel(source, index, colorCount) {
  if (colorCount === 1) return 'Color';
  let hex = '';
  try { hex = new fabric.Color(source).toHex(); } catch (e) {}
  const knownLabels = {
    '191919': 'Dark',
    'FFFFFF': 'Light',
    'E83A2A': 'Red',
    'D32920': 'Dark Red',
    'E6E6E6': 'Gray',
  };
  return knownLabels[hex] || (index === 0 ? 'Primary' : `Color ${index + 1}`);
}

async function buildVectorAssetSticker(item) {
  const { objects, options } = await fabric.loadSVGFromURL(item.asset);
  const usableObjects = objects.filter(Boolean);
  if (!usableObjects.length) throw new Error(`No vector paths found in ${item.asset}`);

  const obj = fabric.util.groupSVGElements(usableObjects, options || {});
  const configuredColors = Array.isArray(item.colors) ? item.colors : [];
  const colorSlots = configuredColors.length
    ? configuredColors.map(slot => ({ ...slot, current: slot.current || slot.source }))
    : discoverVectorAssetColors(obj);

  obj.set({
    name: item.title,
    _clatashaVectorAsset: true,
    _clatashaVectorColors: colorSlots,
    _clatashaAssetId: item.id,
    fill: colorSlots[0]?.current || obj.fill,
  });

  const longestSide = Math.max(obj.getScaledWidth(), obj.getScaledHeight(), 1);
  const scaleFactor = (item.targetSize || 650) / longestSide;
  obj.set({
    scaleX: (obj.scaleX || 1) * scaleFactor,
    scaleY: (obj.scaleY || 1) * scaleFactor,
  });
  obj.setCoords();
  return obj;
}

async function addStickerToCanvas(stickerDef) {
  let obj;
  try {
    obj = await stickerDef.build();
  } catch (error) {
    console.error('Unable to add sticker:', error);
    alert('This sticker could not be loaded.');
    return;
  }
  // Place at canvas center
  obj.set({
    left: CANVAS_W / 2,
    top: CANVAS_H / 2,
    originX: 'center',
    originY: 'center',
  });
  // Ensure the object has a name for layers panel
  if (!obj.name) obj.set('name', stickerDef.id.replace(/-/g, ' '));
  // Make all sub-objects non-selectable if it's a group
  if (obj.type === 'group') {
    obj.getObjects().forEach(o => { o.set({ selectable: false, evented: false }); });
  }
  canvas.add(obj);
  canvas.setActiveObject(obj);
  setTool('select');
  saveHistory();
  updateLayersList();
}

// ===== BACKGROUND PANEL =====
function getLinearGradientCoords(width, height, angleDegrees) {
  const radians = (Number(angleDegrees) * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const halfLength = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  const cx = width / 2;
  const cy = height / 2;
  return {
    x1: cx - dx * halfLength,
    y1: cy - dy * halfLength,
    x2: cx + dx * halfLength,
    y2: cy + dy * halfLength,
  };
}

function setupBackgroundPanel() {
  const typeBtns = document.querySelectorAll('.bg-type-btn');
  const color2Label = document.getElementById('bgColor2Label');
  const angleLabel = document.getElementById('bgAngleLabel');
  const angleSlider = document.getElementById('bgAngle');
  const angleVal = document.getElementById('bgAngleVal');
  const applyBtn = document.getElementById('bgApplyBtn');
  const color1Input = document.getElementById('bgColor1');
  const color2Input = document.getElementById('bgColor2');
  let bgType = 'solid';

  function applyBackground(saveToHistory = false) {
    try {
      const c1 = color1Input.value;
      const c2 = color2Input.value;
      const angle = Number(angleSlider.value);
      let fill;
      if (bgType === 'solid') {
        fill = c1;
      } else if (bgType === 'linear') {
        fill = new fabric.Gradient({
          type: 'linear',
          gradientUnits: 'pixels',
          coords: getLinearGradientCoords(CANVAS_W, CANVAS_H, angle),
          colorStops: [
            { offset: 0, color: c1 },
            { offset: 1, color: c2 },
          ]
        });
      } else {
        const r = Math.hypot(CANVAS_W / 2, CANVAS_H / 2);
        fill = new fabric.Gradient({
          type: 'radial',
          gradientUnits: 'pixels',
          coords: {
            x1: CANVAS_W / 2, y1: CANVAS_H / 2, r1: 0,
            x2: CANVAS_W / 2, y2: CANVAS_H / 2, r2: r,
          },
          colorStops: [
            { offset: 0, color: c1 },
            { offset: 1, color: c2 },
          ]
        });
      }

      let bg = canvas.getObjects().find(o => o.name === '__bg__');
      if (!bg) {
        addBackgroundRect();
        bg = canvas.getObjects().find(o => o.name === '__bg__');
      }
      if (!bg) return;
      bg.set('fill', fill);
      bg.dirty = true;
      bg.setCoords();
      canvas.requestRenderAll();
      if (saveToHistory) saveHistory();
    } catch (err) {
      console.error('Background apply error:', err);
    }
  }

  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      bgType = btn.dataset.bgtype;
      const isGradient = bgType !== 'solid';
      color2Label.style.display = isGradient ? '' : 'none';
      angleLabel.style.display = bgType === 'linear' ? '' : 'none';
      applyBackground(true);
    });
  });

  angleSlider.addEventListener('input', () => {
    angleVal.textContent = angleSlider.value + '°';
    if (bgType === 'linear') applyBackground(false);
  });
  angleSlider.addEventListener('change', () => {
    if (bgType === 'linear') applyBackground(true);
  });

  [color1Input, color2Input].forEach((input) => {
    input.addEventListener('input', () => applyBackground(false));
    input.addEventListener('change', () => applyBackground(true));
  });

  applyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    applyBackground(true);
  });
}

// ===== DONATE POPUP =====
function setupDonatePopup() {
  const btn = document.getElementById('donateBtn');
  const popup = document.getElementById('donatePopup');
  const copyBtn = document.getElementById('copyBtcBtn');
  let donateOpen = false;

  function closeDonatePopup() {
    popup.style.display = 'none';
    btn.classList.remove('active');
    donateOpen = false;
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (donateOpen) {
      closeDonatePopup();
    } else {
      closeMenus();
      if (stickerPopupOpen) closeStickerPopup();
      popup.style.display = 'block';
      btn.classList.add('active');
      donateOpen = true;
    }
  });

  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const addr = document.getElementById('btcAddr').textContent;
    navigator.clipboard.writeText(addr).then(() => {
      copyBtn.classList.add('copied');
      setTimeout(() => copyBtn.classList.remove('copied'), 1500);
    });
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (donateOpen && !popup.contains(e.target) && e.target !== btn) {
      closeDonatePopup();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && donateOpen) closeDonatePopup();
  });
}

// ===== TOOLBAR =====
function setupToolbar() {
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });
  document.getElementById('videoFrameBtn')?.addEventListener('click', chooseVideoForFrameGrabber);
  setupShapeToolFlyout();
  setupTextToolFlyout();
  setupCropToolFlyout();
}

const SHAPE_SUBTOOLS = ['circle', 'triangle', 'polygon', 'line', 'arrow', 'bubble'];
const TEXT_SUBTOOLS = ['vertical-text'];
const CROP_SUBTOOLS = ['slice'];

function closeToolFlyouts(exceptId = '') {
  ['shapeToolFlyout', 'textToolFlyout', 'cropToolFlyout'].forEach(id => {
    if (id !== exceptId) document.getElementById(id)?.classList.remove('open');
  });
}

function closeShapeToolFlyout() {
  document.getElementById('shapeToolFlyout')?.classList.remove('open');
}

function openToolFlyout(flyout, anchor) {
  if (!flyout || !anchor) return;
  closeToolFlyouts(flyout.id);
  const rect = anchor.getBoundingClientRect();
  flyout.classList.add('open');
  const left = Math.min(window.innerWidth - flyout.offsetWidth - 8, rect.right + 6);
  const top = Math.min(window.innerHeight - flyout.offsetHeight - 8, Math.max(8, rect.top));
  flyout.style.left = left + 'px';
  flyout.style.top = top + 'px';
}

function openShapeToolFlyout(anchor) {
  const flyout = document.getElementById('shapeToolFlyout');
  if (!flyout) return;
  flyout.querySelectorAll('[data-shape-tool]').forEach(button => {
    button.classList.toggle('active', button.dataset.shapeTool === currentTool);
  });
  openToolFlyout(flyout, anchor);
}

function setupShapeToolFlyout() {
  const mainButton = document.getElementById('shapeMainTool');
  const flyout = document.getElementById('shapeToolFlyout');
  if (!mainButton || !flyout) return;

  mainButton.addEventListener('contextmenu', event => {
    event.preventDefault();
    event.stopPropagation();
    if (flyout.classList.contains('open')) closeShapeToolFlyout();
    else openShapeToolFlyout(mainButton);
  });

  flyout.querySelectorAll('[data-shape-tool]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const tool = button.dataset.shapeTool;
      closeShapeToolFlyout();
      setTool(tool);
    });
  });

  document.addEventListener('pointerdown', event => {
    if (!flyout.contains(event.target) && event.target !== mainButton) closeShapeToolFlyout();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeShapeToolFlyout();
  });
}

function setupTextToolFlyout() {
  const mainButton = document.getElementById('textMainTool');
  const flyout = document.getElementById('textToolFlyout');
  if (!mainButton || !flyout) return;

  mainButton.addEventListener('contextmenu', event => {
    event.preventDefault();
    event.stopPropagation();
    if (flyout.classList.contains('open')) flyout.classList.remove('open');
    else {
      flyout.querySelectorAll('[data-text-tool]').forEach(button => {
        button.classList.toggle('active', button.dataset.textTool === currentTool);
      });
      openToolFlyout(flyout, mainButton);
    }
  });

  flyout.querySelectorAll('[data-text-tool]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      flyout.classList.remove('open');
      setTool(button.dataset.textTool);
    });
  });

  document.addEventListener('pointerdown', event => {
    if (!flyout.contains(event.target) && event.target !== mainButton) flyout.classList.remove('open');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') flyout.classList.remove('open');
  });
}

function setupCropToolFlyout() {
  const mainButton = document.getElementById('cropBtn');
  const flyout = document.getElementById('cropToolFlyout');
  if (!mainButton || !flyout) return;

  mainButton.addEventListener('contextmenu', event => {
    event.preventDefault();
    event.stopPropagation();
    if (flyout.classList.contains('open')) flyout.classList.remove('open');
    else {
      const selectedTool = perspActive ? 'perspective' : sliceActive ? 'slice' : 'crop';
      flyout.querySelectorAll('[data-crop-tool]').forEach(button => {
        button.classList.toggle('active', button.dataset.cropTool === selectedTool);
      });
      openToolFlyout(flyout, mainButton);
    }
  });

  flyout.querySelectorAll('[data-crop-tool]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      flyout.classList.remove('open');
      const tool = button.dataset.cropTool;
      if ((sliceActive || currentTool === 'zoom') && tool !== 'slice') setTool('select');
      if (tool === 'crop') enterStandardCrop();
      else if (tool === 'perspective') enterPerspectiveCrop();
      else if (tool === 'slice') setTool('slice');
    });
  });

  document.addEventListener('pointerdown', event => {
    if (!flyout.contains(event.target) && event.target !== mainButton) flyout.classList.remove('open');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') flyout.classList.remove('open');
  });
}

function openImageImportPicker() {
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  const input = document.getElementById('fileInput');
  input.value = '';
  input.click();
}

// ===== LOCAL VIDEO FRAME GRABBER =====
function chooseVideoForFrameGrabber() {
  if (paintBrushActive) finishPaintBrush();
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  const input = document.getElementById('videoInput');
  input.value = '';
  input.click();
}

function isSupportedVideoFile(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  if (['video/mp4', 'video/webm', 'video/ogg', 'video/x-m4v'].includes(type)) return true;
  return /\.(mp4|webm|ogv|m4v)$/i.test(String(file.name || ''));
}

function formatVideoTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds - Math.floor(seconds)) * 1000);
  const base = String(minutes).padStart(hours ? 2 : 1, '0') + ':' + String(wholeSeconds).padStart(2, '0');
  return (hours ? String(hours).padStart(2, '0') + ':' : '') + base + '.' + String(milliseconds).padStart(3, '0');
}

function formatVideoFrameLayerTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return (hours ? String(hours).padStart(2, '0') + '-' : '') + String(minutes).padStart(2, '0') + '-' + String(secs).padStart(2, '0');
}

function setVideoFrameStatus(message) {
  const status = document.getElementById('videoFrameStatus');
  if (status) status.textContent = message;
}

function setVideoFrameBusy(busy, message = '') {
  videoFrameBusy = busy;
  const busyElement = document.getElementById('videoFrameBusy');
  const busyText = document.getElementById('videoFrameBusyText');
  if (busyElement) busyElement.hidden = !busy;
  if (busyText && message) busyText.textContent = message;
  refreshVideoFrameControls();
}

function refreshVideoFrameControls() {
  const enabled = videoFrameReady && !videoFrameBusy;
  document.querySelectorAll('[data-video-step], [data-video-frame-step]').forEach(button => {
    button.disabled = !enabled;
  });
  const playButton = document.getElementById('videoFramePlay');
  const timeline = document.getElementById('videoFrameTimeline');
  const findButton = document.getElementById('videoFrameFind');
  const addButton = document.getElementById('videoFrameAdd');
  if (playButton) playButton.disabled = !enabled;
  if (timeline) timeline.disabled = !enabled;
  if (findButton) findButton.disabled = !enabled;
  if (addButton) addButton.disabled = !enabled;
}

function updateVideoFrameTimeUI() {
  const video = document.getElementById('videoFramePreview');
  if (!video) return;
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  document.getElementById('videoFrameCurrentTime').textContent = formatVideoTime(currentTime);
  document.getElementById('videoFrameDuration').textContent = formatVideoTime(duration);
  const timeline = document.getElementById('videoFrameTimeline');
  if (timeline && !videoFrameBusy) timeline.value = duration > 0 ? String(Math.round(currentTime / duration * 1000)) : '0';
  document.querySelectorAll('.video-frame-thumb').forEach(button => {
    const thumbTime = Number(button.dataset.videoTime);
    button.classList.toggle('active', Number.isFinite(thumbTime) && Math.abs(thumbTime - currentTime) <= Math.max(0.04, duration / 500));
  });
}

function waitForVideoEvent(video, successEvent, failureEvents = ['error'], timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let timer = 0;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(successEvent, onSuccess);
      failureEvents.forEach(event => video.removeEventListener(event, onFailure));
    };
    const onSuccess = () => { cleanup(); resolve(); };
    const onFailure = () => { cleanup(); reject(new Error('Video could not be read')); };
    video.addEventListener(successEvent, onSuccess, { once: true });
    failureEvents.forEach(event => video.addEventListener(event, onFailure, { once: true }));
    timer = setTimeout(() => { cleanup(); reject(new Error('Video operation timed out')); }, timeoutMs);
  });
}

async function seekVideoFrame(time) {
  const video = document.getElementById('videoFramePreview');
  if (!videoFrameReady || !video || !Number.isFinite(video.duration)) return;
  const safeEnd = Math.max(0, video.duration - 0.001);
  const target = Math.max(0, Math.min(safeEnd, Number(time) || 0));
  if (Math.abs(video.currentTime - target) < 0.002) {
    updateVideoFrameTimeUI();
    return;
  }
  const waiting = waitForVideoEvent(video, 'seeked', ['error'], 12000);
  video.currentTime = target;
  await waiting;
  updateVideoFrameTimeUI();
}

function captureVideoFrameDataUrl(maxWidth, maxHeight, mimeType = 'image/jpeg', quality = 0.9) {
  const video = document.getElementById('videoFramePreview');
  if (!videoFrameReady || !video?.videoWidth || !video?.videoHeight) throw new Error('No video frame is ready');
  const scale = Math.min(1, maxWidth / video.videoWidth, maxHeight / video.videoHeight);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = width;
  frameCanvas.height = height;
  const context = frameCanvas.getContext('2d', { alpha: false });
  context.drawImage(video, 0, 0, width, height);
  return frameCanvas.toDataURL(mimeType, quality);
}

function createVideoFrameThumb(dataUrl, time, rank = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'video-frame-thumb';
  button.dataset.videoTime = String(time);
  button.title = 'Jump to ' + formatVideoTime(time);
  const image = document.createElement('img');
  image.src = dataUrl;
  image.alt = '';
  const timeLabel = document.createElement('span');
  timeLabel.textContent = formatVideoTime(time).replace(/\.\d{3}$/, '');
  button.appendChild(image);
  if (rank) {
    const rankLabel = document.createElement('span');
    rankLabel.className = 'video-frame-rank';
    rankLabel.textContent = rank;
    button.appendChild(rankLabel);
  }
  button.appendChild(timeLabel);
  button.addEventListener('click', async () => {
    if (videoFrameBusy) return;
    const video = document.getElementById('videoFramePreview');
    video.pause();
    await seekVideoFrame(time);
  });
  return button;
}

async function buildVideoFrameStrip(token) {
  const video = document.getElementById('videoFramePreview');
  const strip = document.getElementById('videoFrameStrip');
  if (!videoFrameReady || !video || !strip) return;
  const duration = video.duration;
  const originalTime = video.currentTime;
  strip.innerHTML = '';
  setVideoFrameBusy(true, 'Building timeline frames...');
  try {
    const count = 8;
    for (let index = 0; index < count; index++) {
      if (token !== videoFrameJobToken) return;
      const ratio = count === 1 ? 0 : index / (count - 1);
      const time = duration * (0.01 + ratio * 0.98);
      await seekVideoFrame(time);
      const preview = captureVideoFrameDataUrl(240, 135, 'image/jpeg', 0.72);
      strip.appendChild(createVideoFrameThumb(preview, time));
    }
    await seekVideoFrame(originalTime);
  } catch (error) {
    console.warn('Timeline preview generation failed:', error);
    strip.innerHTML = '<span class="video-frame-placeholder">Timeline previews could not be generated</span>';
  } finally {
    if (token === videoFrameJobToken) {
      setVideoFrameBusy(false);
      setVideoFrameStatus('Ready. Choose a frame or run Clear Frame Finder.');
      updateVideoFrameTimeUI();
    }
  }
}

function calculateFrameSharpness() {
  const video = document.getElementById('videoFramePreview');
  const scale = Math.min(1, 320 / video.videoWidth, 180 / video.videoHeight);
  const width = Math.max(3, Math.round(video.videoWidth * scale));
  const height = Math.max(3, Math.round(video.videoHeight * scale));
  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = width;
  analysisCanvas.height = height;
  const context = analysisCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
  context.drawImage(video, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const luminance = new Float32Array(width * height);
  let luminanceSum = 0;
  for (let index = 0, pixel = 0; index < luminance.length; index++, pixel += 4) {
    const value = pixels[pixel] * 0.2126 + pixels[pixel + 1] * 0.7152 + pixels[pixel + 2] * 0.0722;
    luminance[index] = value;
    luminanceSum += value;
  }
  let laplacianSum = 0;
  let laplacianSquareSum = 0;
  let sampleCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const laplacian = luminance[index - 1] + luminance[index + 1] + luminance[index - width] + luminance[index + width] - luminance[index] * 4;
      laplacianSum += laplacian;
      laplacianSquareSum += laplacian * laplacian;
      sampleCount++;
    }
  }
  const mean = laplacianSum / Math.max(1, sampleCount);
  const variance = laplacianSquareSum / Math.max(1, sampleCount) - mean * mean;
  const averageLuminance = luminanceSum / Math.max(1, luminance.length);
  const exposureScore = Math.max(0.28, 1 - Math.abs(averageLuminance - 128) / 160);
  return Math.max(0, variance) * exposureScore;
}

async function findClearVideoFrames() {
  const video = document.getElementById('videoFramePreview');
  const candidates = document.getElementById('videoFrameCandidates');
  if (!videoFrameReady || videoFrameBusy || !video || !candidates) return;
  const token = ++videoFrameJobToken;
  video.pause();
  document.getElementById('videoFramePlay').textContent = '▶ Play';
  const originalTime = video.currentTime;
  const duration = video.duration;
  const sampleCount = Math.max(18, Math.min(36, Math.round(duration / 4)));
  const results = [];
  candidates.innerHTML = '';
  setVideoFrameBusy(true, 'Checking frame 1 of ' + sampleCount + '...');
  setVideoFrameStatus('Checking sampled frames locally...');
  try {
    for (let index = 0; index < sampleCount; index++) {
      if (token !== videoFrameJobToken) return;
      document.getElementById('videoFrameBusyText').textContent = 'Checking frame ' + (index + 1) + ' of ' + sampleCount + '...';
      const time = duration * ((index + 0.5) / sampleCount);
      await seekVideoFrame(time);
      results.push({
        time,
        score: calculateFrameSharpness(),
        preview: captureVideoFrameDataUrl(320, 180, 'image/jpeg', 0.78),
      });
    }

    const minimumGap = Math.max(0.5, duration / sampleCount * 1.5);
    const selected = [];
    for (const result of results.sort((a, b) => b.score - a.score)) {
      if (selected.every(existing => Math.abs(existing.time - result.time) >= minimumGap)) selected.push(result);
      if (selected.length === 5) break;
    }
    for (const result of results) {
      if (selected.length === 5) break;
      if (!selected.includes(result)) selected.push(result);
    }
    selected.sort((a, b) => b.score - a.score);
    candidates.innerHTML = '';
    selected.forEach((result, index) => candidates.appendChild(createVideoFrameThumb(result.preview, result.time, '#' + (index + 1))));
    await seekVideoFrame(selected[0]?.time ?? originalTime);
    setVideoFrameStatus('Clear Frame Finder completed. Click a suggestion to use it.');
  } catch (error) {
    console.error('Clear Frame Finder failed:', error);
    candidates.innerHTML = '<span class="video-frame-placeholder">Clear Frame Finder could not scan this video</span>';
    setVideoFrameStatus('This video could not be scanned. You can still choose a frame manually.');
    try { await seekVideoFrame(originalTime); } catch (_) {}
  } finally {
    if (token === videoFrameJobToken) {
      setVideoFrameBusy(false);
      updateVideoFrameTimeUI();
    }
  }
}

function resetVideoFrameGrabberUI() {
  videoFrameReady = false;
  const stage = document.querySelector('.video-frame-stage');
  stage?.classList.remove('has-video');
  document.getElementById('videoFrameFileName').textContent = 'Choose a video to begin';
  document.getElementById('videoFrameCurrentTime').textContent = '00:00.000';
  document.getElementById('videoFrameDuration').textContent = '00:00.000';
  document.getElementById('videoFrameResolution').textContent = 'No video loaded';
  document.getElementById('videoFrameTimeline').value = '0';
  document.getElementById('videoFrameStrip').innerHTML = '<span class="video-frame-placeholder">Frames will appear here</span>';
  document.getElementById('videoFrameCandidates').innerHTML = '<span class="video-frame-placeholder">Your clearest frame suggestions will appear here</span>';
  document.getElementById('videoFramePlay').textContent = '▶ Play';
  setVideoFrameStatus('The video remains on your device.');
  refreshVideoFrameControls();
}

function closeVideoFrameGrabber() {
  videoFrameJobToken++;
  const video = document.getElementById('videoFramePreview');
  video.pause();
  video.removeAttribute('src');
  video.load();
  if (videoFrameObjectUrl) URL.revokeObjectURL(videoFrameObjectUrl);
  videoFrameObjectUrl = null;
  videoFrameSourceName = '';
  setVideoFrameBusy(false);
  resetVideoFrameGrabberUI();
  document.getElementById('videoFrameOverlay').style.display = 'none';
}

async function openVideoFrameGrabber(file) {
  if (!isSupportedVideoFile(file)) {
    showPerspToast('Choose an MP4 or WebM video');
    return;
  }
  const token = ++videoFrameJobToken;
  const overlay = document.getElementById('videoFrameOverlay');
  const video = document.getElementById('videoFramePreview');
  if (videoFrameObjectUrl) URL.revokeObjectURL(videoFrameObjectUrl);
  resetVideoFrameGrabberUI();
  overlay.style.display = 'flex';
  videoFrameSourceName = getFileStem(file.name) || 'Video';
  document.getElementById('videoFrameFileName').textContent = file.name;
  setVideoFrameBusy(true, 'Reading video...');
  setVideoFrameStatus('Opening video locally...');
  videoFrameObjectUrl = URL.createObjectURL(file);
  video.src = videoFrameObjectUrl;
  video.load();
  try {
    if (video.readyState < 1) await waitForVideoEvent(video, 'loadedmetadata', ['error'], 20000);
    if (token !== videoFrameJobToken) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) throw new Error('Invalid video metadata');
    videoFrameReady = true;
    document.querySelector('.video-frame-stage').classList.add('has-video');
    document.getElementById('videoFrameResolution').textContent = video.videoWidth + ' × ' + video.videoHeight;
    await seekVideoFrame(Math.min(0.01, video.duration / 2));
    setVideoFrameBusy(false);
    updateVideoFrameTimeUI();
    await buildVideoFrameStrip(token);
  } catch (error) {
    console.error('Video load failed:', error);
    setVideoFrameBusy(false);
    videoFrameReady = false;
    refreshVideoFrameControls();
    setVideoFrameStatus('Chrome could not decode this video. Try MP4 with H.264 or WebM.');
    showPerspToast('This video format or codec is not supported by Chrome');
  }
}

async function addCurrentVideoFrameToCanvas() {
  if (!videoFrameReady || videoFrameBusy) return;
  const video = document.getElementById('videoFramePreview');
  video.pause();
  const frameTime = video.currentTime;
  setVideoFrameBusy(true, 'Capturing full-size frame...');
  try {
    const dataUrl = captureVideoFrameDataUrl(3840, 2160, 'image/jpeg', 0.96);
    const layerName = videoFrameSourceName + ' ' + formatVideoFrameLayerTime(frameTime);
    await addImageDataUrlToCanvas(dataUrl, layerName, false);
    closeVideoFrameGrabber();
    showPerspToast(layerName + ' added as the top layer');
  } catch (error) {
    console.error('Video frame capture failed:', error);
    setVideoFrameBusy(false);
    setVideoFrameStatus('The current frame could not be captured.');
    showPerspToast('Could not add this video frame');
  }
}

function setupVideoFrameGrabber() {
  const overlay = document.getElementById('videoFrameOverlay');
  const video = document.getElementById('videoFramePreview');
  const timeline = document.getElementById('videoFrameTimeline');
  document.getElementById('videoFrameClose').addEventListener('click', closeVideoFrameGrabber);
  document.getElementById('videoFrameChoose').addEventListener('click', chooseVideoForFrameGrabber);
  document.getElementById('videoFrameFind').addEventListener('click', findClearVideoFrames);
  document.getElementById('videoFrameAdd').addEventListener('click', addCurrentVideoFrameToCanvas);
  overlay.addEventListener('click', event => { if (event.target === overlay) closeVideoFrameGrabber(); });
  video.addEventListener('timeupdate', updateVideoFrameTimeUI);
  video.addEventListener('seeked', updateVideoFrameTimeUI);
  video.addEventListener('ended', () => {
    document.getElementById('videoFramePlay').textContent = '▶ Play';
  });
  document.getElementById('videoFramePlay').addEventListener('click', async () => {
    if (!videoFrameReady || videoFrameBusy) return;
    if (video.paused) {
      if (video.currentTime >= video.duration - 0.05) video.currentTime = 0;
      try {
        await video.play();
        document.getElementById('videoFramePlay').textContent = '❚❚ Pause';
      } catch (_) {}
    } else {
      video.pause();
      document.getElementById('videoFramePlay').textContent = '▶ Play';
    }
  });
  timeline.addEventListener('input', () => {
    if (!videoFrameReady || videoFrameBusy) return;
    video.pause();
    document.getElementById('videoFramePlay').textContent = '▶ Play';
    video.currentTime = video.duration * Number(timeline.value) / 1000;
  });
  document.querySelectorAll('[data-video-step]').forEach(button => {
    button.addEventListener('click', () => {
      if (videoFrameBusy) return;
      video.pause();
      document.getElementById('videoFramePlay').textContent = '▶ Play';
      seekVideoFrame(video.currentTime + Number(button.dataset.videoStep));
    });
  });
  document.querySelectorAll('[data-video-frame-step]').forEach(button => {
    button.addEventListener('click', () => {
      if (videoFrameBusy) return;
      video.pause();
      document.getElementById('videoFramePlay').textContent = '▶ Play';
      seekVideoFrame(video.currentTime + Number(button.dataset.videoFrameStep) * VIDEO_FRAME_STEP_SECONDS);
    });
  });
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b]
    .map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function startEyedropper() {
  eyedropperActive = true;
  eyedropperSavedInteraction = {
    defaultCursor: canvas.defaultCursor || 'default',
    hoverCursor: canvas.hoverCursor || 'move',
    selection: canvas.selection,
    skipTargetFind: canvas.skipTargetFind,
  };
  applyToolCursor('eyedropper');
  canvas.selection = false;
  canvas.skipTargetFind = true;
  if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.cursor = toolCursorUrl('eyedropper');
  showPerspToast('Eyedropper: click for Fill, Shift-click for Stroke / Outline');
}

function finishEyedropper() {
  if (!eyedropperActive) return;
  eyedropperActive = false;
  if (eyedropperSavedInteraction) {
    canvas.defaultCursor = eyedropperSavedInteraction.defaultCursor;
    canvas.hoverCursor = eyedropperSavedInteraction.hoverCursor;
    canvas.selection = eyedropperSavedInteraction.selection;
    canvas.skipTargetFind = eyedropperSavedInteraction.skipTargetFind;
  } else {
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.selection = true;
    canvas.skipTargetFind = false;
  }
  eyedropperSavedInteraction = null;
  applyToolCursor(currentTool === 'eyedropper' ? 'select' : currentTool);
}

function setToolbarSampledColor(hex, useStroke) {
  const input = document.getElementById(useStroke ? 'strokeColor' : 'fillColor');
  const preview = document.getElementById(useStroke ? 'strokePreview' : 'fillPreview');
  if (input) input.value = hex;
  if (preview) preview.style.background = hex;
}

function applySampledColorToSelection(hex, useStroke) {
  const obj = canvas.getActiveObject();
  if (!obj || isInternalEditorObject(obj) || isActiveSelectionObject(obj) || isUserGroup(obj)) return false;

  if (useStroke) {
    if (obj.type === 'image') {
      setImageOutline(obj, hex, Math.max(4, getImageOutlineWidth(obj)));
    } else if (obj._clatashaVectorAsset) {
      return false;
    } else {
      obj.set({ stroke: hex, strokeWidth: Math.max(2, Number(obj.strokeWidth) || 0) });
      propagateToChildren(obj);
      obj.dirty = true;
      obj.setCoords();
    }
  } else if (obj._clatashaVectorAsset && Array.isArray(obj._clatashaVectorColors) && obj._clatashaVectorColors.length) {
    applyVectorAssetColor(obj, 0, hex);
  } else if (obj.type !== 'image') {
    obj.set('fill', hex);
    propagateToChildren(obj);
    obj.dirty = true;
    obj.setCoords();
  } else {
    return false;
  }

  canvas.requestRenderAll();
  saveHistory();
  updatePropertiesPanel(obj);
  updateToolbarPaintAvailability(obj);
  return true;
}

function sampleCanvasColor(event, useStroke = false) {
  const lowerCanvas = canvas.lowerCanvasEl || canvas.getElement?.();
  if (!lowerCanvas) return;
  const rect = lowerCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const x = Math.max(0, Math.min(lowerCanvas.width - 1,
    Math.floor((event.clientX - rect.left) * lowerCanvas.width / rect.width)));
  const y = Math.max(0, Math.min(lowerCanvas.height - 1,
    Math.floor((event.clientY - rect.top) * lowerCanvas.height / rect.height)));

  try {
    const pixel = lowerCanvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1).data;
    if (pixel[3] === 0) {
      showPerspToast('That canvas pixel is transparent');
      return;
    }
    const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
    setToolbarSampledColor(hex, useStroke);
    const applied = applySampledColorToSelection(hex, useStroke);
    const target = useStroke ? 'Stroke / Outline' : 'Fill';
    showPerspToast(target + ' sampled: ' + hex + (applied ? '' : ' (ready to use)'));
  } catch (error) {
    console.warn('Canvas eyedropper failed', error);
    showPerspToast('This canvas color could not be sampled');
  }
}

function setTool(tool) {
  closeToolFlyouts();
  if (sliceActive) {
    if (tool === 'slice') {
      exitSliceTool({ restoreSelection: true });
      tool = 'select';
    } else {
      exitSliceTool({ restoreSelection: true });
    }
  }
  if (currentTool === 'zoom' && tool !== 'zoom') deactivateZoomTool();
  if (cropActive) exitStandardCrop();
  if (perspActive) exitPerspectiveCrop();
  if (paintBrushActive && tool === 'draw') {
    finishPaintBrush();
    return;
  }
  if (paintBrushActive && tool !== 'draw') finishPaintBrush();
  if (eyedropperActive && tool !== 'eyedropper') finishEyedropper();
  if (cutoutBrushActive && tool !== 'cutout') finishCutoutBrush();
  if (healingBrushActive && tool !== 'healing') finishHealingBrush();

  // Importing is an immediate action, not a canvas-placement mode. Keep the
  // Select tool active while the browser picker is open and after it closes.
  if (tool === 'image') {
    if (bgRemovalActive) {
      finishBgRemoval();
      hideBgToleranceBar();
    }
    if (paintBucketActive) finishPaintBucket();
    currentTool = 'select';
    canvas.isDrawingMode = false;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
    applyToolCursor('select');
    openImageImportPicker();
    return;
  }

  currentTool = tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.tool-btn[data-tool="${tool}"]`) ||
    (SHAPE_SUBTOOLS.includes(tool) ? document.getElementById('shapeMainTool') : null) ||
    (TEXT_SUBTOOLS.includes(tool) ? document.getElementById('textMainTool') : null) ||
    (CROP_SUBTOOLS.includes(tool) ? document.getElementById('cropBtn') : null);
  if (btn) btn.classList.add('active');

  if (tool === 'zoom') {
    canvas.isDrawingMode = false;
    canvas.selection = false;
    canvas.skipTargetFind = true;
    applyToolCursor('zoom');
    return;
  }

  if (tool === 'slice') {
    const activeObj = canvas.getActiveObject();
    if (!startSliceTool(activeObj)) {
      currentTool = 'select';
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
      applyToolCursor('select');
    }
    return;
  }

  // Brush Studio paints many strokes into one editable raster Paint Layer.
  if (tool === 'draw') {
    if (bgRemovalActive) {
      finishBgRemoval();
      hideBgToleranceBar();
    }
    if (paintBucketActive) finishPaintBucket();
    if (eyedropperActive) finishEyedropper();
    canvas.isDrawingMode = false;
    startPaintBrush();
    return;
  }

  // Spot Healing Brush — automatically samples and blends nearby texture.
  if (tool === 'healing') {
    if (healingBrushActive) {
      finishHealingBrush();
      currentTool = 'select';
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
      applyToolCursor('select');
    } else {
      if (bgRemovalActive) {
        finishBgRemoval();
        hideBgToleranceBar();
      }
      if (paintBucketActive) finishPaintBucket();
      if (eyedropperActive) finishEyedropper();
      if (cutoutBrushActive) finishCutoutBrush();
      const activeObj = canvas.getActiveObject();
      if (activeObj && activeObj.type === 'image') {
        startHealingBrush(activeObj);
      } else {
        currentTool = 'select';
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
        applyToolCursor('select');
        showPerspToast('Select an image first to use the Spot Healing Brush');
      }
    }
    return;
  }

  // Cutout Brush — directly erases or restores alpha on one selected image.
  if (tool === 'cutout') {
    if (cutoutBrushActive) {
      finishCutoutBrush();
      currentTool = 'select';
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
      applyToolCursor('select');
    } else {
      if (bgRemovalActive) {
        finishBgRemoval();
        hideBgToleranceBar();
      }
      if (paintBucketActive) finishPaintBucket();
      if (eyedropperActive) finishEyedropper();
      const activeObj = canvas.getActiveObject();
      if (activeObj && activeObj.type === 'image') {
        startCutoutBrush(activeObj);
      } else {
        currentTool = 'select';
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
        applyToolCursor('select');
        showPerspToast('Select an image first to use the Cutout Brush');
      }
    }
    return;
  }

  // BG removal tool — toggle mode
  if (tool === 'bgremove') {
    if (paintBucketActive) finishPaintBucket();
    if (bgRemovalActive) {
      // Already active, toggle off
      finishBgRemoval();
      currentTool = 'select';
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      const selBtn = document.querySelector('.tool-btn[data-tool="select"]');
      if (selBtn) selBtn.classList.add('active');
    } else {
      // Check if an image is selected
      const activeObj = canvas.getActiveObject();
      if (activeObj && activeObj.type === 'image') {
        startBgRemoval(activeObj);
        showBgToleranceBar();
      } else {
        // No image selected — revert to select
        currentTool = 'select';
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        const selBtn = document.querySelector('.tool-btn[data-tool="select"]');
        if (selBtn) selBtn.classList.add('active');
        applyToolCursor('select');
        canvas.isDrawingMode = false;
      }
    }
    return; // Don't run the normal cursor/drawing logic below
  }

  // Paint bucket — edits the selected image layer and remains active for repeated fills.
  if (tool === 'bucket') {
    if (paintBucketActive) {
      finishPaintBucket();
      currentTool = 'select';
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
    } else {
      if (bgRemovalActive) finishBgRemoval();
      const activeObj = canvas.getActiveObject();
      if (activeObj && activeObj.type === 'image') {
        startPaintBucket(activeObj);
      } else {
        currentTool = 'select';
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
        showPerspToast('Select an image first to use the Paint Bucket');
      }
    }
    return;
  }

  // Canvas eyedropper — samples the final composited color and remains active.
  if (tool === 'eyedropper') {
    if (eyedropperActive) {
      finishEyedropper();
      currentTool = 'select';
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
      applyToolCursor('select');
    } else {
      if (bgRemovalActive) {
        finishBgRemoval();
        hideBgToleranceBar();
      }
      if (paintBucketActive) finishPaintBucket();
      startEyedropper();
    }
    return;
  }

  // If switching away from bgremove tool while it's active, finish it
  if (bgRemovalActive) {
    finishBgRemoval();
    hideBgToleranceBar();
  }

  if (paintBucketActive) finishPaintBucket();

  // Keep Fabric and the DOM canvas area on the same tool-specific cursor.
  applyToolCursor(tool);

  canvas.isDrawingMode = false;
}

// ===== NON-DESTRUCTIVE IMAGE MASKS =====
function getImageMaskType(obj) {
  if (!obj || obj.type !== 'image') return 'none';
  if (obj._clatashaMaskType) return obj._clatashaMaskType;
  if (obj.clipPath?.type === 'circle') return 'circle';
  if (obj.clipPath?.type === 'rect' && (obj.clipPath.rx || obj.clipPath.ry)) return 'rounded';
  return 'none';
}

function applyImageMask(obj, type, radiusPercent = 18, addToHistory = true) {
  if (!obj || obj.type !== 'image') return;
  const validType = ['none', 'circle', 'rounded'].includes(type) ? type : 'none';
  const safeRadius = Math.max(1, Math.min(50, Number(radiusPercent) || 18));
  let clipPath = null;

  if (validType === 'circle') {
    clipPath = new Circle({
      radius: Math.min(obj.width, obj.height) / 2,
      left: 0,
      top: 0,
      originX: 'center',
      originY: 'center',
      absolutePositioned: false,
    });
  } else if (validType === 'rounded') {
    const radius = Math.min(obj.width, obj.height) * safeRadius / 100;
    clipPath = new Rect({
      width: obj.width,
      height: obj.height,
      rx: radius,
      ry: radius,
      left: 0,
      top: 0,
      originX: 'center',
      originY: 'center',
      absolutePositioned: false,
    });
  }

  obj._clatashaMaskType = validType;
  obj._clatashaMaskRadius = safeRadius;
  obj.set('clipPath', clipPath);
  obj.dirty = true;
  obj.setCoords();
  canvas.requestRenderAll();
  if (addToHistory) saveHistory();
}

// ===== STANDARD NON-DESTRUCTIVE CROP =====
let cropActive = false;
let cropTargetImage = null;
let cropFrame = null;
let cropImageFrame = null;
let cropObjectStates = new Map();
let cropAfterRender = null;
let cropRatio = null;

function cropFrameSize() {
  if (!cropFrame) return { width: 0, height: 0 };
  return {
    width: Math.abs((cropFrame.width || 0) * (cropFrame.scaleX || 1)),
    height: Math.abs((cropFrame.height || 0) * (cropFrame.scaleY || 1)),
  };
}

function setCropFrameSceneSize(width, height, center = null) {
  if (!cropFrame) return;
  cropFrame.set({ width: Math.max(1, width), height: Math.max(1, height), scaleX: 1, scaleY: 1 });
  if (center) cropFrame.setPositionByOrigin(new fabric.Point(center.x, center.y), 'center', 'center');
  cropFrame.setCoords();
}

function clampCropFrameToImage() {
  if (!cropFrame || !cropImageFrame) return;
  const minSize = 12 / Math.max(zoomLevel, MIN_ZOOM);
  let { width, height } = cropFrameSize();
  const scaleDown = Math.min(1, cropImageFrame.width / Math.max(width, 1), cropImageFrame.height / Math.max(height, 1));
  width = Math.min(cropImageFrame.width, Math.max(minSize, width * scaleDown));
  height = Math.min(cropImageFrame.height, Math.max(minSize, height * scaleDown));
  const localCenter = scenePointToLocal(cropImageFrame, cropFrame.getCenterPoint());
  localCenter.x = Math.max(-cropImageFrame.hw + width / 2, Math.min(cropImageFrame.hw - width / 2, localCenter.x));
  localCenter.y = Math.max(-cropImageFrame.hh + height / 2, Math.min(cropImageFrame.hh - height / 2, localCenter.y));
  const sceneCenter = localPointToScene(cropImageFrame, localCenter.x, localCenter.y);
  setCropFrameSceneSize(width, height, sceneCenter);
  updateCropHint();
  canvas.requestRenderAll();
}

function getCropRatioValue(value) {
  if (value === 'original') return cropTargetImage ? cropTargetImage.width / cropTargetImage.height : null;
  if (value && value.includes(':')) {
    const [w, h] = value.split(':').map(Number);
    if (w > 0 && h > 0) return w / h;
  }
  return null;
}

function selectCropRatio(value) {
  if (!cropActive || !cropFrame || !cropTargetImage) return;
  cropRatio = getCropRatioValue(value);
  document.querySelectorAll('[data-crop-ratio]').forEach(btn => btn.classList.toggle('active', btn.dataset.cropRatio === value));
  cropFrame.lockUniScaling = cropRatio !== null;
  cropFrame.setControlsVisibility({ mt: cropRatio === null, mb: cropRatio === null, ml: cropRatio === null, mr: cropRatio === null });
  if (cropRatio !== null) {
    const sceneRatio = cropRatio * Math.abs((cropTargetImage.scaleX || 1) / (cropTargetImage.scaleY || 1));
    let width = cropImageFrame.width;
    let height = width / sceneRatio;
    if (height > cropImageFrame.height) { height = cropImageFrame.height; width = height * sceneRatio; }
    setCropFrameSceneSize(width, height, { x: cropImageFrame.cx, y: cropImageFrame.cy });
  }
  clampCropFrameToImage();
}

function updateCropHint() {
  const hint = document.getElementById('cropHint');
  if (!hint || !cropFrame || !cropTargetImage || !cropImageFrame) return;
  const size = cropFrameSize();
  const sourceW = Math.max(1, Math.round(cropTargetImage.width * size.width / cropImageFrame.width));
  const sourceH = Math.max(1, Math.round(cropTargetImage.height * size.height / cropImageFrame.height));
  hint.textContent = `Crop: ${sourceW} × ${sourceH} px`;
}

function drawCropOverlay() {
  if (!cropFrame || !cropImageFrame) return;
  const ctx = canvas.contextContainer;
  if (!ctx) return;
  const outer = [
    localPointToScene(cropImageFrame, -cropImageFrame.hw, -cropImageFrame.hh),
    localPointToScene(cropImageFrame, cropImageFrame.hw, -cropImageFrame.hh),
    localPointToScene(cropImageFrame, cropImageFrame.hw, cropImageFrame.hh),
    localPointToScene(cropImageFrame, -cropImageFrame.hw, cropImageFrame.hh),
  ];
  const inner = cropFrame.getCoords();
  const vpt = canvas.viewportTransform;
  ctx.save();
  ctx.setTransform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
  ctx.fillStyle = 'rgba(0,0,0,0.58)';
  ctx.beginPath();
  outer.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  inner.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 1 / Math.max(zoomLevel, MIN_ZOOM);
  for (let i = 1; i < 3; i++) {
    const t = i / 3;
    let a = lerp2(inner[0], inner[3], t), b = lerp2(inner[1], inner[2], t);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    a = lerp2(inner[0], inner[1], t); b = lerp2(inner[3], inner[2], t);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.restore();
}

function enterStandardCrop() {
  if (cropActive) { exitStandardCrop(); return; }
  const activeObj = canvas.getActiveObject();
  if (!activeObj || activeObj.type !== 'image') { showPerspToast('Select an image first to crop it'); return; }
  setTool('select');
  if (perspActive) exitPerspectiveCrop();
  if (bgRemovalActive) finishBgRemoval();
  if (paintBucketActive) finishPaintBucket();
  cropActive = true;
  cropTargetImage = activeObj;
  cropImageFrame = getPerspectiveImageFrame(activeObj);
  cropObjectStates = new Map();
  canvas.selection = false;
  canvas.discardActiveObject();
  canvas.forEachObject(obj => {
    cropObjectStates.set(obj, { selectable: obj.selectable, evented: obj.evented });
    obj.set({ selectable: false, evented: false });
  });
  cropFrame = new Rect({
    left: cropImageFrame.cx, top: cropImageFrame.cy,
    width: cropImageFrame.width, height: cropImageFrame.height,
    angle: activeObj.angle || 0, originX: 'center', originY: 'center',
    fill: 'rgba(124,58,237,0.025)', stroke: '#ffffff',
    strokeWidth: Math.max(0.75, 2 / Math.max(zoomLevel, MIN_ZOOM)), strokeUniform: true,
    transparentCorners: false, cornerColor: '#ffffff', cornerStrokeColor: '#7C3AED',
    borderColor: '#7C3AED', cornerSize: Math.max(8, 12 / Math.max(zoomLevel, MIN_ZOOM)),
    hasRotatingPoint: false, lockRotation: true, lockScalingFlip: true,
    name: '__crop__', excludeFromExport: true,
  });
  cropFrame.setControlsVisibility({ mtr: false });
  cropFrame.on('moving', clampCropFrameToImage);
  cropFrame.on('scaling', clampCropFrameToImage);
  canvas.add(cropFrame);
  canvas.setActiveObject(cropFrame);
  cropAfterRender = drawCropOverlay;
  canvas.on('after:render', cropAfterRender);
  document.getElementById('cropBtn').classList.add('active');
  document.getElementById('cropActions').style.display = 'flex';
  cropRatio = null;
  document.querySelectorAll('[data-crop-ratio]').forEach(btn => btn.classList.toggle('active', btn.dataset.cropRatio === 'free'));
  updateCropHint();
  applyToolCursor('crop');
  canvas.requestRenderAll();
}

function restoreCropObjectStates() {
  canvas.selection = true;
  canvas.forEachObject(obj => {
    const state = cropObjectStates.get(obj);
    if (state) obj.set({ selectable: state.selectable, evented: state.evented });
  });
  cropObjectStates.clear();
}

function resetStandardCrop() {
  if (!cropActive || !cropImageFrame) return;
  cropRatio = null;
  document.querySelectorAll('[data-crop-ratio]').forEach(btn => btn.classList.toggle('active', btn.dataset.cropRatio === 'free'));
  cropFrame.lockUniScaling = false;
  cropFrame.setControlsVisibility({ mt: true, mb: true, ml: true, mr: true });
  setCropFrameSceneSize(cropImageFrame.width, cropImageFrame.height, { x: cropImageFrame.cx, y: cropImageFrame.cy });
  updateCropHint();
  canvas.requestRenderAll();
}

function exitStandardCrop() {
  if (!cropActive) return;
  if (cropAfterRender) { canvas.off('after:render', cropAfterRender); cropAfterRender = null; }
  if (cropFrame) canvas.remove(cropFrame);
  restoreCropObjectStates();
  if (cropTargetImage && cropTargetImage.selectable !== false) canvas.setActiveObject(cropTargetImage);
  document.getElementById('cropBtn').classList.remove('active');
  document.getElementById('cropActions').style.display = 'none';
  cropActive = false;
  cropTargetImage = null;
  cropFrame = null;
  cropImageFrame = null;
  cropRatio = null;
  applyToolCursor(currentTool);
  canvas.requestRenderAll();
}

function applyStandardCrop() {
  if (!cropActive || !cropTargetImage || !cropFrame || !cropImageFrame) return;
  const obj = cropTargetImage;
  const frameSize = cropFrameSize();
  const localCenter = scenePointToLocal(cropImageFrame, cropFrame.getCenterPoint());
  const u0 = Math.max(0, Math.min(1, (localCenter.x - frameSize.width / 2 + cropImageFrame.hw) / cropImageFrame.width));
  const u1 = Math.max(0, Math.min(1, (localCenter.x + frameSize.width / 2 + cropImageFrame.hw) / cropImageFrame.width));
  const v0 = Math.max(0, Math.min(1, (localCenter.y - frameSize.height / 2 + cropImageFrame.hh) / cropImageFrame.height));
  const v1 = Math.max(0, Math.min(1, (localCenter.y + frameSize.height / 2 + cropImageFrame.hh) / cropImageFrame.height));
  const oldCropX = obj.cropX || 0, oldCropY = obj.cropY || 0;
  const oldWidth = obj.width, oldHeight = obj.height;
  const newWidth = Math.max(1, Math.round((u1 - u0) * oldWidth));
  const newHeight = Math.max(1, Math.round((v1 - v0) * oldHeight));
  const newCropX = Math.round(oldCropX + (obj.flipX ? 1 - u1 : u0) * oldWidth);
  const newCropY = Math.round(oldCropY + (obj.flipY ? 1 - v1 : v0) * oldHeight);
  const cropCenter = cropFrame.getCenterPoint();
  const maskType = getImageMaskType(obj);
  const maskRadius = obj._clatashaMaskRadius ?? 18;
  if (cropAfterRender) { canvas.off('after:render', cropAfterRender); cropAfterRender = null; }
  canvas.remove(cropFrame);
  restoreCropObjectStates();
  obj.set({ cropX: newCropX, cropY: newCropY, width: newWidth, height: newHeight });
  obj.setPositionByOrigin(new fabric.Point(cropCenter.x, cropCenter.y), 'center', 'center');
  if (!isClippedLayer(obj) && maskType !== 'none') applyImageMask(obj, maskType, maskRadius, false);
  clearImageOutlineCache(obj);
  obj.dirty = true;
  obj.setCoords();
  canvas.setActiveObject(obj);
  document.getElementById('cropBtn').classList.remove('active');
  document.getElementById('cropActions').style.display = 'none';
  cropActive = false;
  cropTargetImage = null;
  cropFrame = null;
  cropImageFrame = null;
  cropRatio = null;
  canvas.requestRenderAll();
  saveHistory();
  updateLayersList();
}

function setupStandardCrop() {
  document.getElementById('cropBtn').addEventListener('click', () => {
    if (sliceActive || currentTool === 'zoom') setTool('select');
    enterStandardCrop();
  });
  document.getElementById('cropReset').addEventListener('click', resetStandardCrop);
  document.getElementById('cropApply').addEventListener('click', applyStandardCrop);
  document.getElementById('cropCancel').addEventListener('click', exitStandardCrop);
  document.querySelectorAll('[data-crop-ratio]').forEach(btn => btn.addEventListener('click', () => selectCropRatio(btn.dataset.cropRatio)));
}

// ===== PERSPECTIVE CORRECTION (per-image) =====
let perspActive = false;
let perspCorners = null;
let perspOriginalCorners = null;
let perspTargetImage = null;
let perspImageFrame = null;
let perspObjectStates = new Map();
const perspHandles = [];
let perspAfterRender = null;
const PERSP_OVERLAY_GRID = 3;

function getPerspectiveImageFrame(obj) {
  const center = obj.getCenterPoint ? obj.getCenterPoint() : { x: obj.left, y: obj.top };
  const width = Math.abs(obj.width * (obj.scaleX || 1));
  const height = Math.abs(obj.height * (obj.scaleY || 1));
  const rad = (obj.angle || 0) * Math.PI / 180;
  return {
    cx: center.x,
    cy: center.y,
    width,
    height,
    hw: width / 2,
    hh: height / 2,
    cos: Math.cos(rad),
    sin: Math.sin(rad),
  };
}

function localPointToScene(frame, x, y) {
  return {
    x: x * frame.cos - y * frame.sin + frame.cx,
    y: x * frame.sin + y * frame.cos + frame.cy,
  };
}

function scenePointToLocal(frame, point) {
  const dx = point.x - frame.cx;
  const dy = point.y - frame.cy;
  return {
    x: dx * frame.cos + dy * frame.sin,
    y: -dx * frame.sin + dy * frame.cos,
  };
}

function clampPointToPerspectiveImage(point) {
  const local = scenePointToLocal(perspImageFrame, point);
  return localPointToScene(
    perspImageFrame,
    Math.max(-perspImageFrame.hw, Math.min(perspImageFrame.hw, local.x)),
    Math.max(-perspImageFrame.hh, Math.min(perspImageFrame.hh, local.y))
  );
}

function isValidPerspectiveQuad(points) {
  if (!points || points.length !== 4) return false;
  const minEdge = 12 / Math.max(zoomLevel, MIN_ZOOM);
  for (let i = 0; i < 4; i++) {
    const a = points[i], b = points[(i + 1) % 4];
    if (Math.hypot(b.x - a.x, b.y - a.y) < minEdge) return false;
  }
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 0.001) return false;
    const currentSign = Math.sign(cross);
    if (sign && currentSign !== sign) return false;
    sign = currentSign;
  }
  return true;
}

function showPerspToast(msg) {
  let t = document.getElementById('perspToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'perspToast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:rgba(124,58,237,0.95);color:#fff;padding:10px 22px;border-radius:8px;' +
      'font-size:13px;font-weight:600;z-index:9999;pointer-events:none;opacity:0;transition:opacity .25s;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2200);
}

function enterPerspectiveCrop() {
  if (perspActive) { exitPerspectiveCrop(); return; }
  if (cropActive) exitStandardCrop();
  if (paintBucketActive) finishPaintBucket();
  if (bgRemovalActive) finishBgRemoval();

  // Must have a selected image
  const activeObj = canvas.getActiveObject();
  if (!activeObj || activeObj.type !== 'image') {
    showPerspToast('Select an image first to use Perspective Correction');
    return;
  }
  setTool('select');

  perspActive = true;
  perspTargetImage = activeObj;

  const obj = activeObj;
  perspImageFrame = getPerspectiveImageFrame(obj);
  perspCorners = [
    localPointToScene(perspImageFrame, -perspImageFrame.hw, -perspImageFrame.hh),
    localPointToScene(perspImageFrame,  perspImageFrame.hw, -perspImageFrame.hh),
    localPointToScene(perspImageFrame,  perspImageFrame.hw,  perspImageFrame.hh),
    localPointToScene(perspImageFrame, -perspImageFrame.hw,  perspImageFrame.hh),
  ];
  perspOriginalCorners = perspCorners.map(c => ({ ...c }));

  // Disable normal interactions (but keep the target image rendered)
  canvas.selection = false;
  canvas.discardActiveObject();
  perspObjectStates = new Map();
  canvas.forEachObject(o => {
    perspObjectStates.set(o, { selectable: o.selectable, evented: o.evented });
    o.selectable = false;
    o.evented = false;
  });

  // Create 4 draggable corner handles as Fabric circles
  const hOpts = {
    radius: Math.max(2, 10 / Math.max(zoomLevel, MIN_ZOOM)), fill: '#fff', stroke: '#7C3AED', strokeWidth: Math.max(0.75, 3 / Math.max(zoomLevel, MIN_ZOOM)),
    originX: 'center', originY: 'center',
    hasControls: false, hasBorders: false,
    name: '__persp__',
    selectable: true, evented: true,
    excludeFromExport: true,
  };
  perspCorners.forEach((c, i) => {
    const h = new Circle({ ...hOpts, left: c.x, top: c.y });
    h.on('moving', () => {
      const previous = perspCorners[i];
      const clamped = clampPointToPerspectiveImage({ x: h.left, y: h.top });
      const candidate = perspCorners.map((point, pointIndex) => pointIndex === i ? clamped : point);
      if (isValidPerspectiveQuad(candidate)) {
        h.left = clamped.x;
        h.top = clamped.y;
        perspCorners[i] = clamped;
      } else {
        h.left = previous.x;
        h.top = previous.y;
      }
      updatePerspectiveHint();
      canvas.renderAll();
    });
    canvas.add(h);
    perspHandles.push(h);
  });

  // Draw overlay via after:render
  perspAfterRender = () => drawPerspOverlay();
  canvas.on('after:render', perspAfterRender);

  document.getElementById('perspectiveCropBtn').classList.add('active');
  document.getElementById('cropBtn').classList.add('active');
  document.getElementById('perspActions').style.display = 'flex';
  updatePerspectiveHint();
  applyToolCursor('perspective');
  canvas.renderAll();
}

function restorePerspectiveObjectStates(replacement = null, replacementState = null) {
  canvas.selection = true;
  canvas.forEachObject(o => {
    const state = perspObjectStates.get(o);
    if (state) o.set({ selectable: state.selectable, evented: state.evented });
  });
  if (replacement && replacementState) {
    replacement.set({ selectable: replacementState.selectable, evented: replacementState.evented });
  }
  perspObjectStates.clear();
}

function resetPerspectiveCorners() {
  if (!perspActive || !perspOriginalCorners) return;
  perspCorners = perspOriginalCorners.map(c => ({ ...c }));
  perspHandles.forEach((handle, index) => {
    handle.set({ left: perspCorners[index].x, top: perspCorners[index].y });
    handle.setCoords();
  });
  updatePerspectiveHint();
  canvas.requestRenderAll();
}

function updatePerspectiveHandleScale() {
  const radius = Math.max(2, 10 / Math.max(zoomLevel, MIN_ZOOM));
  const strokeWidth = Math.max(0.75, 3 / Math.max(zoomLevel, MIN_ZOOM));
  perspHandles.forEach(handle => {
    handle.set({ radius, strokeWidth });
    handle.setCoords();
  });
  canvas.requestRenderAll();
}

function updatePerspectiveHint() {
  const hint = document.getElementById('perspHint');
  if (!hint || !perspCorners) return;
  const c = perspCorners;
  const width = Math.round((Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y) + Math.hypot(c[2].x - c[3].x, c[2].y - c[3].y)) / 2);
  const height = Math.round((Math.hypot(c[3].x - c[0].x, c[3].y - c[0].y) + Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y)) / 2);
  hint.textContent = 'Selection: ' + width + ' × ' + height + ' px';
}

function exitPerspectiveCrop() {
  if (!perspActive) return;
  if (perspAfterRender) { canvas.off('after:render', perspAfterRender); perspAfterRender = null; }
  perspHandles.forEach(h => canvas.remove(h));
  perspHandles.length = 0;
  restorePerspectiveObjectStates();
  document.getElementById('perspectiveCropBtn').classList.remove('active');
  document.getElementById('cropBtn').classList.remove('active');
  document.getElementById('perspActions').style.display = 'none';
  perspActive = false;
  perspTargetImage = null;
  perspImageFrame = null;
  perspOriginalCorners = null;
  perspCorners = null;
  applyToolCursor(currentTool);
  canvas.renderAll();
}

function drawPerspOverlay() {
  const ctx = canvas.contextContainer;
  if (!ctx || !perspCorners || !perspOriginalCorners) return;
  const c = perspCorners;
  const outer = perspOriginalCorners;
  ctx.save();
  // Explicitly set viewport transform so we draw in scene coordinates,
  // matching the handle positions (Fabric objects use scene coords).
  const vpt = canvas.viewportTransform;
  ctx.setTransform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
  // Dim only the image area outside the selected quadrilateral.
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.moveTo(outer[0].x, outer[0].y);
  ctx.lineTo(outer[1].x, outer[1].y);
  ctx.lineTo(outer[2].x, outer[2].y);
  ctx.lineTo(outer[3].x, outer[3].y);
  ctx.closePath();
  ctx.moveTo(c[0].x, c[0].y);
  ctx.lineTo(c[1].x, c[1].y);
  ctx.lineTo(c[2].x, c[2].y);
  ctx.lineTo(c[3].x, c[3].y);
  ctx.closePath();
  ctx.fill('evenodd');
  // Grid lines within the quad
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1 / Math.max(zoomLevel, MIN_ZOOM);
  for (let i = 1; i < PERSP_OVERLAY_GRID; i++) {
    const t = i / PERSP_OVERLAY_GRID;
    let a = lerp2(c[0], c[3], t), bv = lerp2(c[1], c[2], t);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bv.x, bv.y); ctx.stroke();
    a = lerp2(c[0], c[1], t); bv = lerp2(c[3], c[2], t);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bv.x, bv.y); ctx.stroke();
  }
  // Quad border
  ctx.strokeStyle = '#7C3AED'; ctx.lineWidth = 2 / Math.max(zoomLevel, MIN_ZOOM);
  ctx.beginPath();
  ctx.moveTo(c[0].x, c[0].y);
  ctx.lineTo(c[1].x, c[1].y);
  ctx.lineTo(c[2].x, c[2].y);
  ctx.lineTo(c[3].x, c[3].y);
  ctx.closePath(); ctx.stroke();
  ctx.restore();
}

function lerp2(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }

async function applyPerspectiveCrop() {
  if (!perspTargetImage || !perspCorners) { exitPerspectiveCrop(); return; }

  // Snapshot corners before cleanup
  const corners = [...perspCorners];
  const targetImg = perspTargetImage;
  const targetIdx = canvas.getObjects().indexOf(targetImg);
  const targetInteractionState = perspObjectStates.get(targetImg) || { selectable: true, evented: true };
  const preservedFilters = Array.isArray(targetImg.filters) ? [...targetImg.filters] : [];
  const preservedMaskType = getImageMaskType(targetImg);
  const preservedMaskRadius = targetImg._clatashaMaskRadius ?? 18;
  const preservedClipId = isClippedLayer(targetImg) ? targetImg._clatashaClipId : null;
  const preservedClipBase = preservedClipId ? getClippingBase(preservedClipId) : null;
  let replacementImage = null;

  // Remove overlay listener FIRST so the clean render doesn't show overlay
  if (perspAfterRender) { canvas.off('after:render', perspAfterRender); perspAfterRender = null; }
  // Remove handle circles
  perspHandles.forEach(h => canvas.remove(h));
  perspHandles.length = 0;
  canvas.renderAll();

  try {
    // Use the original element so editable Fabric filters can be reapplied to the result.
    const srcImg = targetImg._originalElement || targetImg.getElement();
    const imgW = srcImg.naturalWidth || srcImg.width;
    const imgH = srcImg.naturalHeight || srcImg.height;

    // Map the displayed image frame back to its source pixels, including an
    // existing Fabric crop and horizontal/vertical flips.
    const frame = getPerspectiveImageFrame(targetImg);
    const sTL = localPointToScene(frame, -frame.hw, -frame.hh);
    const sTR = localPointToScene(frame,  frame.hw, -frame.hh);
    const sBL = localPointToScene(frame, -frame.hw,  frame.hh);
    const cropX = Math.max(0, targetImg.cropX || 0);
    const cropY = Math.max(0, targetImg.cropY || 0);
    const sourceW = Math.min(targetImg.width || imgW, imgW - cropX);
    const sourceH = Math.min(targetImg.height || imgH, imgH - cropY);
    const srcLeft = targetImg.flipX ? cropX + sourceW : cropX;
    const srcRight = targetImg.flipX ? cropX : cropX + sourceW;
    const srcTop = targetImg.flipY ? cropY + sourceH : cropY;
    const srcBottom = targetImg.flipY ? cropY : cropY + sourceH;
    const sceneToSrc = getAffine(
      sTL, sTR, sBL,
      { x: srcLeft, y: srcTop }, { x: srcRight, y: srcTop }, { x: srcLeft, y: srcBottom }
    );
    if (!sceneToSrc) { exitPerspectiveCrop(); return; }

    const imgCorners = corners.map(pt => ({
      x: Math.max(0, Math.min(imgW, sceneToSrc.a * pt.x + sceneToSrc.b * pt.y + sceneToSrc.c)),
      y: Math.max(0, Math.min(imgH, sceneToSrc.d * pt.x + sceneToSrc.e * pt.y + sceneToSrc.f)),
    }));

    // Calculate output dimensions from the quad edge lengths in source pixels
    const topW = Math.hypot(imgCorners[1].x - imgCorners[0].x, imgCorners[1].y - imgCorners[0].y);
    const bottomW = Math.hypot(imgCorners[2].x - imgCorners[3].x, imgCorners[2].y - imgCorners[3].y);
    const leftH = Math.hypot(imgCorners[3].x - imgCorners[0].x, imgCorners[3].y - imgCorners[0].y);
    const rightH = Math.hypot(imgCorners[2].x - imgCorners[1].x, imgCorners[2].y - imgCorners[1].y);
    const rawDstW = Math.round(Math.max(topW, bottomW));
    const rawDstH = Math.round(Math.max(leftH, rightH));

    if (rawDstW < 10 || rawDstH < 10) {
      showPerspToast('The selected area is too small');
      exitPerspectiveCrop();
      return;
    }

    // Avoid oversized temporary canvases while retaining enough detail for thumbnails.
    const outputScale = Math.min(1, 4096 / rawDstW, 4096 / rawDstH);
    const dstW = Math.max(10, Math.round(rawDstW * outputScale));
    const dstH = Math.max(10, Math.round(rawDstH * outputScale));

    // Perspective-correct the quad into a rectangle
    const dstCanvas = document.createElement('canvas');
    dstCanvas.width = dstW; dstCanvas.height = dstH;
    const ctx = dstCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const meshGrid = Math.max(32, Math.min(80, Math.ceil(Math.max(dstW, dstH) / 64)));

    for (let iy = 0; iy < meshGrid; iy++) {
      for (let ix = 0; ix < meshGrid; ix++) {
        const u0 = ix / meshGrid, u1 = (ix + 1) / meshGrid;
        const v0 = iy / meshGrid, v1 = (iy + 1) / meshGrid;
        const s00 = bilinear(imgCorners, u0, v0);
        const s10 = bilinear(imgCorners, u1, v0);
        const s11 = bilinear(imgCorners, u1, v1);
        const s01 = bilinear(imgCorners, u0, v1);
        const dx = u0 * dstW, dy = v0 * dstH, dw = dstW / meshGrid, dh = dstH / meshGrid;
        drawTri(ctx, srcImg, s00, s10, s01, { x: dx, y: dy }, { x: dx + dw, y: dy }, { x: dx, y: dy + dh });
        drawTri(ctx, srcImg, s10, s11, s01, { x: dx + dw, y: dy }, { x: dx + dw, y: dy + dh }, { x: dx, y: dy + dh });
      }
    }

    // Create new image from the corrected result
    const resultURL = dstCanvas.toDataURL('image/png');
    const newImgEl = await loadImage(resultURL);

    // Calculate visual center and size of the quad in canvas space
    const c = corners;
    const cx = (c[0].x + c[1].x + c[2].x + c[3].x) / 4;
    const cy = (c[0].y + c[1].y + c[2].y + c[3].y) / 4;
    const visW = (
      Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y) +
      Math.hypot(c[2].x - c[3].x, c[2].y - c[3].y)
    ) / 2;
    const visH = (
      Math.hypot(c[3].x - c[0].x, c[3].y - c[0].y) +
      Math.hypot(c[2].x - c[1].x, c[2].y - c[1].y)
    ) / 2;

    const newFabricImg = new FabricImage(newImgEl, {
      left: cx, top: cy,
      originX: 'center', originY: 'center',
      scaleX: visW / dstW,
      scaleY: visH / dstH,
      opacity: targetImg.opacity,
      shadow: targetImg.shadow,
      stroke: targetImg.stroke,
      strokeWidth: targetImg.strokeWidth,
      strokeUniform: targetImg.strokeUniform,
      visible: targetImg.visible,
      globalCompositeOperation: targetImg.globalCompositeOperation,
      imageSmoothing: targetImg.imageSmoothing,
      name: targetImg.name,
      _clatashaSourceName: targetImg._clatashaSourceName,
      _clatashaImageOutlineColor: targetImg._clatashaImageOutlineColor,
      _clatashaImageOutlineWidth: targetImg._clatashaImageOutlineWidth,
      _clatashaLocked: targetImg._clatashaLocked,
      _clatashaMaskType: targetImg._clatashaMaskType,
      _clatashaMaskRadius: targetImg._clatashaMaskRadius,
      _clatashaClipRole: preservedClipId ? 'content' : undefined,
      _clatashaClipId: preservedClipId || undefined,
    });
    newFabricImg.filters = preservedFilters;
    if (preservedFilters.length) newFabricImg.applyFilters();

    // Replace the old image on the canvas at the same z-index
    restoringClippingState = true;
    canvas.remove(targetImg);
    canvas.insertAt(targetIdx, newFabricImg);
    restoringClippingState = false;
    if (preservedClipBase && canvas.getObjects().includes(preservedClipBase)) {
      newFabricImg.set('clipPath', await buildClippingPath(preservedClipBase));
    } else if (preservedMaskType !== 'none') {
      clearClippingMetadata(newFabricImg, false);
      applyImageMask(newFabricImg, preservedMaskType, preservedMaskRadius, false);
    } else {
      clearClippingMetadata(newFabricImg, true);
    }
    if (targetInteractionState.selectable) canvas.setActiveObject(newFabricImg);
    else canvas.discardActiveObject();
    replacementImage = newFabricImg;
  } catch (err) {
    restoringClippingState = false;
    console.error('Perspective crop failed:', err);
    showPerspToast('Perspective correction failed. The original image was kept.');
  }

  // Restore each object's original interaction state, including locked layers.
  restorePerspectiveObjectStates(replacementImage, targetInteractionState);

  // Clean up UI
  document.getElementById('perspectiveCropBtn').classList.remove('active');
  document.getElementById('cropBtn').classList.remove('active');
  document.getElementById('perspActions').style.display = 'none';
  perspActive = false;
  perspTargetImage = null;
  perspImageFrame = null;
  perspOriginalCorners = null;
  perspCorners = null;

  canvas.renderAll();
  if (replacementImage) saveHistory();
  updateLayersList();
}

function bilinear(corners, u, v) {
  return lerp2(lerp2(corners[0], corners[1], u), lerp2(corners[3], corners[2], u), v);
}

function getAffine(s0, s1, s2, d0, d1, d2) {
  const det = (s0.x - s2.x) * (s1.y - s2.y) - (s1.x - s2.x) * (s0.y - s2.y);
  if (Math.abs(det) < 1e-10) return null;
  const a = ((d0.x - d2.x) * (s1.y - s2.y) - (d1.x - d2.x) * (s0.y - s2.y)) / det;
  const b = ((s0.x - s2.x) * (d1.x - d2.x) - (s1.x - s2.x) * (d0.x - d2.x)) / det;
  const c = d0.x - a * s0.x - b * s0.y;
  const d = ((d0.y - d2.y) * (s1.y - s2.y) - (d1.y - d2.y) * (s0.y - s2.y)) / det;
  const e = ((s0.x - s2.x) * (d1.y - d2.y) - (s1.x - s2.x) * (d0.y - d2.y)) / det;
  const f = d0.y - d * s0.x - e * s0.y;
  return { a, b, c, d, e, f };
}

function drawTri(ctx, img, s0, s1, s2, d0, d1, d2) {
  const t = getAffine(s0, s1, s2, d0, d1, d2);
  if (!t) return;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(d0.x, d0.y); ctx.lineTo(d1.x, d1.y); ctx.lineTo(d2.x, d2.y); ctx.closePath(); ctx.clip();
  ctx.setTransform(t.a, t.d, t.b, t.e, t.c, t.f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

function setupPerspectiveCrop() {
  document.getElementById('perspReset').addEventListener('click', () => resetPerspectiveCorners());
  document.getElementById('perspApply').addEventListener('click', () => applyPerspectiveCrop());
  document.getElementById('perspCancel').addEventListener('click', () => exitPerspectiveCrop());
}

// ===== IMAGE SLICE TOOL =====
function startSliceTool(target) {
  if (!target || target.type !== 'image' || target._clatashaPaintLayer) {
    showPerspToast('Select an image layer first to use Slice');
    return false;
  }
  if (target._clatashaLocked) {
    showPerspToast('Unlock the image layer before slicing it');
    return false;
  }
  if (target.group) {
    showPerspToast('Move the image out of its group before slicing it');
    return false;
  }
  if (isClippingBase(target) || isClippedLayer(target) || (target.clipPath && getImageMaskType(target) === 'none')) {
    showPerspToast('Release the clipping mask before slicing this image');
    return false;
  }

  sliceActive = true;
  sliceJobToken++;
  sliceBusy = false;
  sliceTargetImage = target;
  sliceStart = null;
  sliceEnd = null;
  sliceObjectStates = new Map();
  canvas.forEachObject(obj => {
    sliceObjectStates.set(obj, { selectable: obj.selectable, evented: obj.evented });
    obj.set({ selectable: false, evented: false });
  });
  canvas.discardActiveObject();
  canvas.selection = false;
  canvas.skipTargetFind = true;
  document.getElementById('cropBtn')?.classList.add('active');
  document.getElementById('sliceToolBtn')?.classList.add('active');
  document.getElementById('sliceActions').style.display = 'flex';
  applyToolCursor('slice');
  canvas.requestRenderAll();
  return true;
}

function removeSlicePreview() {
  if (!slicePreviewLine) return;
  canvas.remove(slicePreviewLine);
  slicePreviewLine = null;
  canvas.requestRenderAll();
}

function restoreSliceObjectStates() {
  canvas.forEachObject(obj => {
    const state = sliceObjectStates.get(obj);
    if (state) obj.set({ selectable: state.selectable, evented: state.evented });
  });
  sliceObjectStates.clear();
  canvas.selection = true;
  canvas.skipTargetFind = false;
}

function exitSliceTool(options = {}) {
  if (!sliceActive) return;
  sliceJobToken++;
  const target = sliceTargetImage;
  const targetState = sliceObjectStates.get(target);
  removeSlicePreview();
  restoreSliceObjectStates();
  sliceActive = false;
  sliceBusy = false;
  sliceTargetImage = null;
  sliceStart = null;
  sliceEnd = null;
  document.getElementById('cropBtn')?.classList.remove('active');
  document.getElementById('sliceToolBtn')?.classList.remove('active');
  document.getElementById('sliceActions').style.display = 'none';
  if (options.restoreSelection && target && canvas.getObjects().includes(target) && targetState?.selectable !== false) {
    canvas.setActiveObject(target);
  }
  canvas.requestRenderAll();
}

function beginSliceLine(pointer) {
  if (!sliceActive || sliceBusy) return;
  removeSlicePreview();
  sliceStart = { x: pointer.x, y: pointer.y };
  sliceEnd = { ...sliceStart };
  slicePreviewLine = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
    stroke: '#ffffff',
    strokeWidth: Math.max(1, 3 / Math.max(zoomLevel, MIN_ZOOM)),
    strokeUniform: true,
    shadow: new Shadow({ color: 'rgba(0,0,0,0.85)', blur: 2, offsetX: 1, offsetY: 1 }),
    selectable: false,
    evented: false,
    name: '__slicePreview__',
    excludeFromExport: true,
  });
  canvas.add(slicePreviewLine);
  canvas.requestRenderAll();
}

function normalizeAngleRadians(angle) {
  let value = angle;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

function getSnappedSlicePoint(start, pointer, event) {
  const dx = pointer.x - start.x;
  const dy = pointer.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) return { ...pointer };
  const angle = Math.atan2(dy, dx);
  const increment = event?.shiftKey ? Math.PI / 12 : Math.PI / 4;
  const snappedAngle = Math.round(angle / increment) * increment;
  const tolerance = event?.shiftKey ? Math.PI : 8 * Math.PI / 180;
  if (Math.abs(normalizeAngleRadians(angle - snappedAngle)) > tolerance) return { ...pointer };
  return {
    x: start.x + Math.cos(snappedAngle) * distance,
    y: start.y + Math.sin(snappedAngle) * distance,
  };
}

function updateSliceLine(pointer, event) {
  if (!sliceActive || sliceBusy || !sliceStart || !slicePreviewLine) return;
  sliceEnd = getSnappedSlicePoint(sliceStart, pointer, event);
  slicePreviewLine.set({ x1: sliceStart.x, y1: sliceStart.y, x2: sliceEnd.x, y2: sliceEnd.y });
  slicePreviewLine.setCoords();
  canvas.requestRenderAll();
}

function clipPolygonToLine(points, start, end, keepPositive) {
  const side = point => (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
  const inside = point => keepPositive ? side(point) >= -1e-7 : side(point) <= 1e-7;
  const result = [];
  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const currentInside = inside(current);
    const nextInside = inside(next);
    if (currentInside) result.push(current);
    if (currentInside !== nextInside) {
      const currentSide = side(current);
      const nextSide = side(next);
      const denominator = currentSide - nextSide;
      if (Math.abs(denominator) > 1e-9) {
        const amount = currentSide / denominator;
        result.push({
          x: current.x + (next.x - current.x) * amount,
          y: current.y + (next.y - current.y) * amount,
        });
      }
    }
  }
  return result;
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.y - next.x * points[index].y;
  }
  return Math.abs(area) / 2;
}

function getSliceBounds(points, width, height) {
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxX = Math.min(width, Math.ceil(Math.max(...xs)));
  const maxY = Math.min(height, Math.ceil(Math.max(...ys)));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function addRoundedRectanglePath(context, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
}

function buildSliceRaster(target, source, polygon, bounds, rasterWidth, rasterHeight) {
  const output = document.createElement('canvas');
  output.width = Math.max(1, bounds.width);
  output.height = Math.max(1, bounds.height);
  const context = output.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const cropX = Math.max(0, Number(target.cropX) || 0);
  const cropY = Math.max(0, Number(target.cropY) || 0);
  const sourceWidth = Math.max(1, Number(target.width) || source.naturalWidth || source.width || 1);
  const sourceHeight = Math.max(1, Number(target.height) || source.naturalHeight || source.height || 1);
  context.drawImage(
    source,
    cropX, cropY, sourceWidth, sourceHeight,
    -bounds.minX, -bounds.minY, rasterWidth, rasterHeight,
  );

  context.globalCompositeOperation = 'destination-in';
  context.beginPath();
  polygon.forEach((point, index) => {
    const x = point.x - bounds.minX;
    const y = point.y - bounds.minY;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.fillStyle = '#000';
  context.fill();

  const maskType = getImageMaskType(target);
  if (maskType === 'circle' || maskType === 'rounded') {
    context.beginPath();
    if (maskType === 'circle') {
      context.arc(
        rasterWidth / 2 - bounds.minX,
        rasterHeight / 2 - bounds.minY,
        Math.min(rasterWidth, rasterHeight) / 2,
        0,
        Math.PI * 2,
      );
    } else {
      const radius = Math.min(rasterWidth, rasterHeight) * (target._clatashaMaskRadius ?? 18) / 100;
      addRoundedRectanglePath(context, -bounds.minX, -bounds.minY, rasterWidth, rasterHeight, radius);
      context.closePath();
    }
    context.fill();
  }
  context.globalCompositeOperation = 'source-over';
  return output;
}

async function cloneSliceFilters(filters) {
  const sourceFilters = Array.isArray(filters) ? filters.filter(Boolean) : [];
  return Promise.all(sourceFilters.map(async filter => {
    const serialized = typeof filter.toObject === 'function' ? filter.toObject() : null;
    const FilterClass = filter.constructor;
    if (serialized && typeof FilterClass?.fromObject === 'function') {
      try {
        return await FilterClass.fromObject(serialized);
      } catch (_) {}
    }
    const clone = Object.create(Object.getPrototypeOf(filter));
    Object.entries(filter).forEach(([key, value]) => {
      if (Array.isArray(value)) clone[key] = [...value];
      else if (value && typeof value === 'object') {
        try { clone[key] = JSON.parse(JSON.stringify(value)); }
        catch (_) { clone[key] = value; }
      } else clone[key] = value;
    });
    return clone;
  }));
}

async function createSlicePiece(target, source, polygon, bounds, rasterWidth, rasterHeight, rasterScale, suffix) {
  const raster = buildSliceRaster(target, source, polygon, bounds, rasterWidth, rasterHeight);
  const element = await loadImage(raster.toDataURL('image/png'));
  const localCenter = new fabric.Point(
    (bounds.minX + bounds.maxX) / (2 * rasterScale) - (target.width || 0) / 2,
    (bounds.minY + bounds.maxY) / (2 * rasterScale) - (target.height || 0) / 2,
  );
  const sceneCenter = fabric.util.transformPoint(localCenter, target.calcTransformMatrix());
  const baseName = String(target._clatashaSourceName || target.name || 'Image').replace(/ Slice [AB]$/i, '');
  const piece = new FabricImage(element, {
    left: sceneCenter.x,
    top: sceneCenter.y,
    originX: 'center',
    originY: 'center',
    scaleX: (target.scaleX || 1) / rasterScale,
    scaleY: (target.scaleY || 1) / rasterScale,
    angle: target.angle || 0,
    skewX: target.skewX || 0,
    skewY: target.skewY || 0,
    flipX: !!target.flipX,
    flipY: !!target.flipY,
    opacity: target.opacity,
    shadow: target.shadow ? new Shadow(target.shadow.toObject ? target.shadow.toObject() : target.shadow) : null,
    stroke: target.stroke,
    strokeWidth: target.strokeWidth,
    strokeUniform: target.strokeUniform,
    visible: target.visible,
    globalCompositeOperation: target.globalCompositeOperation,
    imageSmoothing: target.imageSmoothing,
    name: baseName + ' Slice ' + suffix,
    _clatashaSourceName: baseName + ' Slice ' + suffix,
    _clatashaImageOutlineColor: target._clatashaImageOutlineColor,
    _clatashaImageOutlineWidth: target._clatashaImageOutlineWidth,
    _clatashaMaskType: 'none',
    _clatashaMaskRadius: target._clatashaMaskRadius,
    _clatashaSliceSource: baseName,
  });
  piece.filters = await cloneSliceFilters(target.filters);
  if (piece.filters.length) piece.applyFilters();
  piece.setCoords();
  return piece;
}

async function splitImageAlongLine(target, sceneStart, sceneEnd) {
  const width = Math.max(1, Number(target.width) || 1);
  const height = Math.max(1, Number(target.height) || 1);
  const inverse = fabric.util.invertTransform(target.calcTransformMatrix());
  const toImagePoint = point => {
    const local = fabric.util.transformPoint(new fabric.Point(point.x, point.y), inverse);
    return { x: local.x + width / 2, y: local.y + height / 2 };
  };
  const localStart = toImagePoint(sceneStart);
  const localEnd = toImagePoint(sceneEnd);
  const maximumRasterSide = 4096;
  const maximumRasterPixels = 12_000_000;
  const rasterScale = Math.min(
    1,
    maximumRasterSide / Math.max(width, height),
    Math.sqrt(maximumRasterPixels / Math.max(1, width * height)),
  );
  const rasterWidth = Math.max(1, Math.round(width * rasterScale));
  const rasterHeight = Math.max(1, Math.round(height * rasterScale));
  const start = { x: localStart.x * rasterScale, y: localStart.y * rasterScale };
  const end = { x: localEnd.x * rasterScale, y: localEnd.y * rasterScale };
  const rectangle = [
    { x: 0, y: 0 },
    { x: rasterWidth, y: 0 },
    { x: rasterWidth, y: rasterHeight },
    { x: 0, y: rasterHeight },
  ];
  const polygons = [
    clipPolygonToLine(rectangle, start, end, true),
    clipPolygonToLine(rectangle, start, end, false),
  ];
  if (polygons.some(points => points.length < 3 || polygonArea(points) < 4)) {
    showPerspToast('Draw the slice line across the image so it creates two pieces');
    return null;
  }
  const bounds = polygons.map(points => getSliceBounds(points, rasterWidth, rasterHeight));
  if (bounds.some(box => box.width < 1 || box.height < 1)) {
    showPerspToast('That slice is too close to the image edge');
    return null;
  }
  const source = target._originalElement || target.getElement();
  if (!source) throw new Error('The selected image source is unavailable');
  const pieces = await Promise.all([
    createSlicePiece(target, source, polygons[0], bounds[0], rasterWidth, rasterHeight, rasterScale, 'A'),
    createSlicePiece(target, source, polygons[1], bounds[1], rasterWidth, rasterHeight, rasterScale, 'B'),
  ]);
  return pieces;
}

async function finishSliceLine(pointer, event) {
  if (!sliceActive || sliceBusy || !sliceStart) return;
  updateSliceLine(pointer, event);
  if (!sliceEnd || Math.hypot(sliceEnd.x - sliceStart.x, sliceEnd.y - sliceStart.y) < 8 / Math.max(zoomLevel, MIN_ZOOM)) {
    removeSlicePreview();
    sliceStart = null;
    sliceEnd = null;
    showPerspToast('Drag a longer line across the image');
    return;
  }
  sliceBusy = true;
  const jobToken = ++sliceJobToken;
  const target = sliceTargetImage;
  const targetIndex = canvas.getObjects().indexOf(target);
  try {
    const pieces = await splitImageAlongLine(target, sliceStart, sliceEnd);
    if (jobToken !== sliceJobToken || !sliceActive || sliceTargetImage !== target) return;
    if (!pieces) {
      removeSlicePreview();
      sliceStart = null;
      sliceEnd = null;
      sliceBusy = false;
      return;
    }
    removeSlicePreview();
    restoreSliceObjectStates();
    restoringClippingState = true;
    canvas.remove(target);
    canvas.insertAt(Math.max(1, targetIndex), pieces[0]);
    canvas.insertAt(Math.max(2, targetIndex + 1), pieces[1]);
    restoringClippingState = false;
    sliceActive = false;
    sliceBusy = false;
    sliceTargetImage = null;
    sliceStart = null;
    sliceEnd = null;
    document.getElementById('sliceActions').style.display = 'none';
    document.getElementById('cropBtn')?.classList.remove('active');
    document.getElementById('sliceToolBtn')?.classList.remove('active');
    currentTool = 'select';
    document.querySelectorAll('.tool-btn').forEach(button => button.classList.remove('active'));
    document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
    canvas.setActiveObject(pieces[1]);
    applyToolCursor('select');
    canvas.requestRenderAll();
    saveHistory();
    updateLayersList();
    updatePropertiesPanel(pieces[1]);
    showPerspToast('Image sliced into two independent layers');
  } catch (error) {
    if (jobToken !== sliceJobToken) return;
    restoringClippingState = false;
    console.error('Image slice failed:', error);
    exitSliceTool({ restoreSelection: true });
    currentTool = 'select';
    document.querySelectorAll('.tool-btn').forEach(button => button.classList.remove('active'));
    document.querySelector('.tool-btn[data-tool="select"]')?.classList.add('active');
    applyToolCursor('select');
    showPerspToast('The image could not be sliced. The original image was kept.');
  }
}

function setupSliceTool() {
  document.getElementById('sliceCancel').addEventListener('click', () => setTool('select'));
}

// ===== COLOR PICKERS =====
function setupColorPickers() {
  document.getElementById('fillColor').addEventListener('input', (e) => {
    document.getElementById('fillPreview').style.background = e.target.value;
    const obj = canvas.getActiveObject();
    if (obj && obj.type !== 'image') {
      if (obj._clatashaVectorAsset) applyVectorAssetColor(obj, 0, e.target.value);
      else {
        obj.set('fill', e.target.value);
        canvas.renderAll();
      }
    }
  });
  document.getElementById('strokeColor').addEventListener('input', (e) => {
    document.getElementById('strokePreview').style.background = e.target.value;
    if (paintBrushActive) {
      paintBrushSettings.color = e.target.value;
      const brushColor = document.getElementById('brushColor');
      const brushPreview = document.getElementById('brushColorPreview');
      if (brushColor) brushColor.value = e.target.value;
      if (brushPreview) brushPreview.style.background = e.target.value;
      return;
    }
    const obj = canvas.getActiveObject();
    if (obj) {
      if (obj.type === 'image') setImageOutline(obj, e.target.value, getImageOutlineWidth(obj));
      else {
        obj.set('stroke', e.target.value);
        canvas.renderAll();
      }
    }
    if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = e.target.value;
    }
  });
  document.getElementById('fillColor').addEventListener('change', () => {
    const obj = canvas.getActiveObject();
    if (obj && obj.type !== 'image') saveHistory();
  });
  document.getElementById('strokeColor').addEventListener('change', () => {
    if (!paintBrushActive && canvas.getActiveObject()) saveHistory();
  });
}

// ===== ZOOM =====
function setupZoom() {
  document.getElementById('zoomIn').addEventListener('click', () => zoomTo(zoomLevel * 1.25));
  document.getElementById('zoomOut').addEventListener('click', () => zoomTo(zoomLevel / 1.25));
  document.getElementById('zoomFit').addEventListener('click', zoomToFit);

  // Prevent the panel from losing object context when clicking sliders/inputs.
  // When the user clicks inside the panel or toolbar, we set a flag so that
  // selection:cleared (if it fires) doesn't wipe the properties panel.
  const panel = document.querySelector('.panel');
  const toolbar = document.querySelector('.toolbar');
  const menubar = document.querySelector('.menubar');
  [panel, toolbar, menubar].forEach(el => {
    if (el) el.addEventListener('pointerdown', () => { panelInteracting = true; }, true);
  });
  // Clear the flag shortly after any pointerup — gives time for
  // selection:cleared to fire first.
  document.addEventListener('pointerup', () => {
    setTimeout(() => { panelInteracting = false; }, 50);
  }, true);
}

function beginZoomGesture(pointer, event) {
  zoomGestureActive = true;
  zoomGestureStart = { x: pointer.x, y: pointer.y };
  zoomGestureStartClient = { x: event.clientX, y: event.clientY };
  if (zoomGestureFrame) canvas.remove(zoomGestureFrame);
  zoomGestureFrame = new Rect({
    left: pointer.x,
    top: pointer.y,
    width: 0,
    height: 0,
    fill: 'rgba(124,58,237,0.08)',
    stroke: '#7C3AED',
    strokeWidth: Math.max(0.75, 2 / Math.max(zoomLevel, MIN_ZOOM)),
    strokeDashArray: [8 / Math.max(zoomLevel, MIN_ZOOM), 5 / Math.max(zoomLevel, MIN_ZOOM)],
    strokeUniform: true,
    selectable: false,
    evented: false,
    name: '__zoomMarquee__',
    excludeFromExport: true,
  });
  canvas.add(zoomGestureFrame);
  canvas.requestRenderAll();
}

function updateZoomGesture(pointer) {
  if (!zoomGestureActive || !zoomGestureStart || !zoomGestureFrame) return;
  zoomGestureFrame.set({
    left: Math.min(zoomGestureStart.x, pointer.x),
    top: Math.min(zoomGestureStart.y, pointer.y),
    width: Math.abs(pointer.x - zoomGestureStart.x),
    height: Math.abs(pointer.y - zoomGestureStart.y),
  });
  zoomGestureFrame.setCoords();
  canvas.requestRenderAll();
}

function zoomAtCanvasPoint(pointer, event, factor) {
  const area = document.getElementById('canvasArea');
  const rect = area.getBoundingClientRect();
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomLevel * factor));
  panOffsetX = event.clientX - rect.left - rect.width / 2 - nextZoom * (pointer.x - CANVAS_W / 2);
  panOffsetY = event.clientY - rect.top - rect.height / 2 - nextZoom * (pointer.y - CANVAS_H / 2);
  zoomTo(nextZoom);
}

function zoomToCanvasBounds(start, end) {
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width < 1 || height < 1) return;
  const area = document.getElementById('canvasArea');
  const padding = 80;
  const nextZoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.min((area.clientWidth - padding) / width, (area.clientHeight - padding) / height)),
  );
  const centerX = (start.x + end.x) / 2;
  const centerY = (start.y + end.y) / 2;
  panOffsetX = -nextZoom * (centerX - CANVAS_W / 2);
  panOffsetY = -nextZoom * (centerY - CANVAS_H / 2);
  zoomTo(nextZoom);
}

function finishZoomGesture(pointer, event) {
  if (!zoomGestureActive) return;
  const start = zoomGestureStart;
  const clientStart = zoomGestureStartClient;
  zoomGestureActive = false;
  zoomGestureStart = null;
  zoomGestureStartClient = null;
  if (zoomGestureFrame) {
    canvas.remove(zoomGestureFrame);
    zoomGestureFrame = null;
  }
  const dragged = clientStart && Math.hypot(event.clientX - clientStart.x, event.clientY - clientStart.y) >= 6;
  if (dragged && start) zoomToCanvasBounds(start, pointer);
  else zoomAtCanvasPoint(pointer, event, event.altKey ? 0.8 : 1.25);
  canvas.requestRenderAll();
}

function deactivateZoomTool() {
  zoomGestureActive = false;
  zoomGestureStart = null;
  zoomGestureStartClient = null;
  if (zoomGestureFrame) {
    canvas.remove(zoomGestureFrame);
    zoomGestureFrame = null;
  }
  canvas.selection = true;
  canvas.skipTargetFind = false;
  canvas.requestRenderAll();
}

function zoomTo(level) {
  zoomLevel = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
  applyCanvasTransform();
  refreshClatashaControlScale();
  if (cutoutBrushActive) resizeCutoutBrushCursor();
  if (healingBrushActive) resizeHealingBrushCursor();
  if (paintBrushActive) resizePaintBrushCursor();
  if (perspActive) updatePerspectiveHandleScale();
  if (cropActive && cropFrame) {
    cropFrame.set({
      cornerSize: Math.max(8, 12 / Math.max(zoomLevel, MIN_ZOOM)),
      strokeWidth: Math.max(0.75, 2 / Math.max(zoomLevel, MIN_ZOOM)),
    });
    cropFrame.setCoords();
    canvas.requestRenderAll();
  }
  document.getElementById('zoomLevel').textContent = Math.round(zoomLevel * 100) + '%';
}

function applyCanvasTransform() {
  const wrapper = document.getElementById('canvasWrapper');
  // The wrapper is absolutely positioned so its dimensions can never change
  // the flex workspace while text is being edited. Pan by moving its center;
  // zoom remains a visual transform around that stable center point.
  wrapper.style.left = `calc(50% + ${panOffsetX}px)`;
  wrapper.style.top = `calc(50% + ${panOffsetY}px)`;
  wrapper.style.transform = `translate(-50%, -50%) scale(${zoomLevel})`;
  scheduleRulerDraw();
  scheduleWorkspaceTransformOverlay();
}

function zoomToFit() {
  const area = document.getElementById('canvasArea');
  const padding = 60;
  const scaleX = (area.clientWidth - padding * 2) / CANVAS_W;
  const scaleY = (area.clientHeight - padding * 2) / CANVAS_H;
  panOffsetX = 0;
  panOffsetY = 0;
  zoomTo(Math.min(scaleX, scaleY));
}

// ===== MENUS =====
let activeMenu = null;
function setupMenu() {
  document.querySelectorAll('.menu-btn[data-menu]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menuId = btn.dataset.menu;
      if (activeMenu === menuId) {
        closeMenus(); return;
      }
      closeMenus();
      const menu = document.getElementById('menu-' + menuId);
      const rect = btn.getBoundingClientRect();
      menu.style.left = rect.left + 'px';
      menu.style.display = 'block';
      activeMenu = menuId;
      // Populate recent projects when File menu opens
      if (menuId === 'file') populateRecentMenu();
    });
  });

  document.addEventListener('click', () => closeMenus());

  document.querySelectorAll('.dropdown-menu button[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleMenuAction(btn.dataset.action);
      closeMenus();
    });
  });

  document.getElementById('exportBtn').addEventListener('click', showExportModal);

  // Top bar undo/redo buttons (these are NOT inside dropdown menus)
  document.getElementById('undoBtn').addEventListener('click', () => { undo(); });
  document.getElementById('redoBtn').addEventListener('click', () => { redo(); });
}

async function populateRecentMenu() {
  const container = document.getElementById('recentProjectsList');
  const separator = document.getElementById('recentSeparator');
  if (!container) return;

  try {
    const projects = await getAllProjects();
    const recent = projects.slice(0, 10);

    if (recent.length === 0) {
      container.innerHTML = '';
      if (separator) separator.style.display = 'none';
      return;
    }

    if (separator) separator.style.display = 'block';

    container.innerHTML = recent.map(p => {
      const timeStr = formatTimeAgo(p.updatedAt);
      const isCurrent = p.id === projectId;
      return '<button class="recent-item' + (isCurrent ? ' active' : '') + '" data-recent-id="' + p.id + '">' +
        '<span class="recent-name">' + escapeHtml(p.name) + '</span>' +
        '<span class="recent-time">' + timeStr + '</span>' +
      '</button>';
    }).join('');

    // Attach click handlers to recent items
    container.querySelectorAll('.recent-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.recentId;
        closeMenus();
        loadRecentProject(id);
      });
    });
  } catch (e) {
    container.innerHTML = '';
  }
}

function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  return new Date(timestamp).toLocaleDateString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeHtmlAttribute(str) {
  return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function loadRecentProject(id) {
  try {
    await loadProject(id);
  } catch (e) {
    console.error('Failed to load recent project:', e);
    // Project may have been deleted, refresh the menu next time
  }
}

function closeMenus() {
  document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
  closeWorkspaceThemeSubmenu();
  activeMenu = null;
}

// ===== HELP CENTER =====
function getExtensionVersion() {
  try {
    return globalThis.chrome?.runtime?.getManifest?.().version || '1.0.61';
  } catch (_) {
    return '1.0.60';
  }
}

function cloneToolbarGuideIcon(selector) {
  const sourceButton = document.querySelector(selector);
  const sourceIcon = sourceButton?.querySelector('.workspace-theme-icon-image') || sourceButton?.querySelector('svg');
  if (!sourceIcon) {
    const fallback = document.createElement('span');
    fallback.textContent = '?';
    fallback.setAttribute('aria-hidden', 'true');
    return fallback;
  }

  const icon = sourceIcon.cloneNode(true);
  icon.removeAttribute('id');
  icon.removeAttribute('title');
  icon.setAttribute('aria-hidden', 'true');
  icon.querySelectorAll?.('[id]').forEach(node => node.removeAttribute('id'));
  if (icon.tagName === 'IMG') {
    icon.alt = '';
    icon.draggable = false;
  }
  return icon;
}

function createHelpSearchItem(className, searchText) {
  const item = document.createElement('div');
  item.className = className + ' help-search-item';
  item.dataset.helpSearch = String(searchText || '').toLowerCase();
  return item;
}

function buildHelpGuide() {
  const toolSections = document.getElementById('helpToolSections');
  const featureGrid = document.getElementById('helpFeatureGrid');
  const shortcutGrid = document.getElementById('helpShortcutGrid');
  if (!toolSections || !featureGrid || !shortcutGrid) return;

  toolSections.replaceChildren();
  featureGrid.replaceChildren();
  shortcutGrid.replaceChildren();

  CLATASHA_TOOL_GUIDE.forEach(sectionData => {
    const section = document.createElement('section');
    section.className = 'help-guide-section help-tool-section';

    const heading = document.createElement('h4');
    heading.textContent = sectionData.title;
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'help-tool-grid';
    sectionData.tools.forEach(tool => {
      const card = createHelpSearchItem('help-tool-card', `${sectionData.title} ${tool.name} ${tool.shortcut} ${tool.description}`);

      const iconWrap = document.createElement('div');
      iconWrap.className = 'help-tool-icon';
      iconWrap.appendChild(cloneToolbarGuideIcon(tool.selector));

      const info = document.createElement('div');
      info.className = 'help-tool-info';
      const title = document.createElement('div');
      title.className = 'help-tool-title';
      const name = document.createElement('strong');
      name.textContent = tool.name;
      title.appendChild(name);
      if (tool.shortcut) {
        const shortcut = document.createElement('kbd');
        shortcut.textContent = tool.shortcut;
        title.appendChild(shortcut);
      }
      const description = document.createElement('p');
      description.textContent = tool.description;
      info.append(title, description);
      card.append(iconWrap, info);
      grid.appendChild(card);
    });
    section.appendChild(grid);
    toolSections.appendChild(section);
  });

  CLATASHA_FEATURE_GUIDE.forEach(feature => {
    const card = createHelpSearchItem('help-feature-card', `${feature.title} ${feature.description}`);
    const title = document.createElement('strong');
    title.textContent = feature.title;
    const description = document.createElement('p');
    description.textContent = feature.description;
    card.append(title, description);
    featureGrid.appendChild(card);
  });

  CLATASHA_SHORTCUTS.forEach(([keys, action]) => {
    const row = createHelpSearchItem('help-shortcut-row', `${keys} ${action}`);
    const label = document.createElement('span');
    label.textContent = action;
    const shortcut = document.createElement('kbd');
    shortcut.textContent = keys;
    row.append(label, shortcut);
    shortcutGrid.appendChild(row);
  });
}

function buildHelpUpdates() {
  const timeline = document.getElementById('helpUpdatesTimeline');
  if (!timeline) return;
  timeline.replaceChildren();

  CLATASHA_CHANGELOG.forEach((release, index) => {
    const card = document.createElement('article');
    card.className = 'help-update-card' + (index === 0 ? ' latest' : '');
    const heading = document.createElement('div');
    heading.className = 'help-update-heading';
    const title = document.createElement('h4');
    title.textContent = `Version ${release.version}`;
    const label = document.createElement('span');
    label.className = 'help-update-label';
    label.textContent = index === 0 ? `${release.label} · Latest` : release.label;
    heading.append(title, label);

    const list = document.createElement('ul');
    release.changes.forEach(change => {
      const item = document.createElement('li');
      item.textContent = change;
      list.appendChild(item);
    });
    card.append(heading, list);
    timeline.appendChild(card);
  });
}

function filterHelpGuide(value) {
  const query = String(value || '').trim().toLowerCase();
  let visibleCount = 0;
  document.querySelectorAll('#helpPageGuide .help-search-item').forEach(item => {
    const matches = !query || item.dataset.helpSearch.includes(query);
    item.classList.toggle('help-search-hidden', !matches);
    if (matches) visibleCount++;
  });

  document.querySelectorAll('#helpPageGuide .help-tool-section').forEach(section => {
    const hasVisibleTool = !!section.querySelector('.help-tool-card:not(.help-search-hidden)');
    section.classList.toggle('help-search-hidden', !hasVisibleTool);
  });

  const featureSection = document.getElementById('helpFeatureGrid')?.closest('.help-guide-section');
  const shortcutSection = document.getElementById('helpShortcutGrid')?.closest('.help-guide-section');
  featureSection?.classList.toggle('help-search-hidden', !featureSection.querySelector('.help-search-item:not(.help-search-hidden)'));
  shortcutSection?.classList.toggle('help-search-hidden', !shortcutSection.querySelector('.help-search-item:not(.help-search-hidden)'));

  const noResults = document.getElementById('helpNoResults');
  if (noResults) noResults.hidden = visibleCount !== 0;
}

function showHelpPage(page) {
  const validPages = new Set(['guide', 'updates', 'about']);
  activeHelpPage = validPages.has(page) ? page : 'guide';
  const titles = { guide: 'Clatasha Guide', updates: 'Updates', about: 'About Clatasha' };

  document.querySelectorAll('[data-help-page]').forEach(button => {
    const active = button.dataset.helpPage === activeHelpPage;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelectorAll('[data-help-page-content]').forEach(pageElement => {
    const active = pageElement.dataset.helpPageContent === activeHelpPage;
    pageElement.hidden = !active;
    pageElement.classList.toggle('active', active);
    if (active) pageElement.scrollTop = 0;
  });

  const title = document.getElementById('helpCenterTitle');
  if (title) title.textContent = titles[activeHelpPage];
}

function openHelpCenter(page = 'guide') {
  const overlay = document.getElementById('helpCenterOverlay');
  if (!overlay) return;
  pluginSystem?.closeAll();
  closeMenus();
  helpLastFocusedElement = document.activeElement;
  buildHelpGuide();
  filterHelpGuide(document.getElementById('helpGuideSearch')?.value);
  showHelpPage(page);
  overlay.style.display = 'flex';
  overlay.setAttribute('aria-hidden', 'false');
  helpCenterOpen = true;
  requestAnimationFrame(() => document.getElementById('helpCenterClose')?.focus());
}

function closeHelpCenter() {
  const overlay = document.getElementById('helpCenterOverlay');
  if (!overlay || !helpCenterOpen) return;
  overlay.style.display = 'none';
  overlay.setAttribute('aria-hidden', 'true');
  helpCenterOpen = false;
  const search = document.getElementById('helpGuideSearch');
  if (search) search.value = '';
  filterHelpGuide('');
  if (helpLastFocusedElement?.isConnected) helpLastFocusedElement.focus();
  helpLastFocusedElement = null;
}

function setupHelpCenter() {
  const overlay = document.getElementById('helpCenterOverlay');
  if (!overlay) return;

  const version = getExtensionVersion();
  const versionLabel = `Version ${version}`;
  document.getElementById('helpCurrentVersion').textContent = versionLabel;
  document.getElementById('helpAboutVersion').textContent = versionLabel;
  buildHelpGuide();
  buildHelpUpdates();

  document.querySelectorAll('[data-help-page]').forEach(button => {
    button.addEventListener('click', () => showHelpPage(button.dataset.helpPage));
  });
  document.getElementById('helpCenterClose').addEventListener('click', closeHelpCenter);
  document.getElementById('helpGuideSearch').addEventListener('input', event => filterHelpGuide(event.target.value));
  overlay.addEventListener('mousedown', event => {
    if (event.target === overlay) closeHelpCenter();
  });
  document.addEventListener('keydown', event => {
    if (!helpCenterOpen || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeHelpCenter();
  }, true);
}

function handleMenuAction(action) {
  const helpPages = { openGuide: 'guide', openUpdates: 'updates', openAbout: 'about' };
  if (helpPages[action]) {
    openHelpCenter(helpPages[action]);
    return;
  }
  if (paintBrushActive && [
    'duplicate', 'delete', 'group', 'ungroup', 'createClippingMask',
    'releaseClippingMask', 'selectAll', 'deselectAll'
  ].includes(action)) finishPaintBrush();
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  switch (action) {
    case 'newProject': newProject(); break;
    case 'saveProject': showSaveModal(); break;
    case 'saveAsTemplate': showSaveTemplateModal(); break;
    case 'loadProject': showLoadModal(); break;
    case 'importImage': openImageImportPicker(); break;
    case 'grabVideoFrame': chooseVideoForFrameGrabber(); break;
    case 'saveAsClatasha': saveAsClatasha(); break;
    case 'importClatasha': importClatasha(); break;
    case 'exportImage': showExportModal(); break;
    case 'clickCheck': toggleClickCheck(); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'duplicate': duplicateSelected(); break;
    case 'delete': deleteSelected(); break;
    case 'group': groupSelectedLayers(); break;
    case 'ungroup': ungroupSelectedLayers(); break;
    case 'createClippingMask': createClippingMask(); break;
    case 'releaseClippingMask': releaseClippingMask(canvas.getActiveObjects(), true); break;
    case 'selectAll': canvas.discardActiveObject(); const sel = new ActiveSelection(canvas.getObjects().filter(o => !isInternalEditorObject(o) && o.selectable), { canvas }); canvas.setActiveObject(sel); canvas.requestRenderAll(); break;
    case 'deselectAll': canvas.discardActiveObject(); canvas.requestRenderAll(); break;
    case 'zoomIn': zoomTo(zoomLevel * 1.25); break;
    case 'zoomOut': zoomTo(zoomLevel / 1.25); break;
    case 'zoomFit': zoomToFit(); break;
    case 'zoom100': zoomTo(1); break;
    case 'toggleRulers': toggleRulers(); break;
    case 'toggleGuides': toggleGuides(); break;
    case 'clearGuides': clearMovableGuides(); break;
    case 'toggleSnap': toggleSnap(); break;
    case 'size1920x1080': resizeCanvas(1920, 1080); break;
    case 'size1080x1920': resizeCanvas(1080, 1920); break;
  }
}

// ===== KEYBOARD SHORTCUTS =====
function setupKeyboard() {
  const commitKeyboardNudge = () => {
    if (!keyboardNudgePending) return;
    keyboardNudgePending = false;
    saveHistory();
    updateLayersList();
  };

  // Fabric consumes Escape on its hidden text input before bubbling reaches
  // the normal shortcut handler. Capture it first so grouped text can leave
  // text editing and return to its parent group in one predictable step.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !activeGroupEditRoot || helpCenterOpen || pluginSystem?.isModalOpen()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    commitKeyboardNudge();
    exitGroupEditMode({ selectParent: true });
  }, true);

  document.addEventListener('keydown', (e) => {
    if (helpCenterOpen || pluginSystem?.isModalOpen()) return;
    const videoFrameOverlay = document.getElementById('videoFrameOverlay');
    if (videoFrameOverlay && videoFrameOverlay.style.display !== 'none') {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeVideoFrameGrabber();
      }
      return;
    }
    // Ignore when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (paintBrushActive) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setTool('select');
      } else if (e.key === '[' || e.key === ']') {
        e.preventDefault();
        const direction = e.key === ']' ? 1 : -1;
        const amount = e.shiftKey ? 25 : 5;
        paintBrushSettings.size = Math.max(1, Math.min(400, paintBrushSettings.size + direction * amount));
        paintBrushPresetId = '';
        updateBrushStudioUI();
      }
      return;
    }
    if (sliceActive) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setTool('select');
      }
      return;
    }
    if (perspActive) {
      if (e.key === 'Escape') exitPerspectiveCrop();
      if (e.key === 'Enter') applyPerspectiveCrop();
      return;
    }
    if (cropActive) {
      if (e.key === 'Escape') exitStandardCrop();
      if (e.key === 'Enter') applyStandardCrop();
      return;
    }

    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    const arrowDelta = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[e.key];
    if (arrowDelta && !ctrl && !e.altKey) {
      const obj = canvas.getActiveObject();
      if (obj && obj.name !== '__bg__' && !obj._clatashaLocked) {
        const distance = shift ? 10 : 1;
        e.preventDefault();
        obj.set({
          left: (obj.left || 0) + arrowDelta[0] * distance,
          top: (obj.top || 0) + arrowDelta[1] * distance,
        });
        obj.setCoords();
        obj.dirty = true;
        syncClippingMasksForObject(obj);
        hideSnapLines();
        canvas.requestRenderAll();
        liveUpdatePositionFields(obj);
        keyboardNudgePending = true;
      }
      return;
    }

    if (ctrl && e.key === 'z' && !shift) { e.preventDefault(); undo(); }
    if (ctrl && e.key === 'z' && shift) { e.preventDefault(); redo(); }
    if (ctrl && e.key === 's' && !shift) { e.preventDefault(); showSaveModal(); }
    if (ctrl && e.key === 's' && shift) { e.preventDefault(); saveAsClatasha(); }
    if (ctrl && e.key === 'o') { e.preventDefault(); importClatasha(); }
    if (ctrl && e.shiftKey && e.key === 'C') { e.preventDefault(); const obj = canvas.getActiveObject(); if (obj) copyObjectStyle(obj); }
    if (ctrl && e.shiftKey && e.key === 'V') { e.preventDefault(); const obj = canvas.getActiveObject(); if (obj) pasteObjectStyle(obj); }
    if (ctrl && e.key === 'n') { e.preventDefault(); newProject(); }
    if (ctrl && e.key === 'd') { e.preventDefault(); duplicateSelected(); }
    if (ctrl && e.altKey && e.key.toLowerCase() === 'g') { e.preventDefault(); toggleClippingMask(); }
    if (ctrl && !e.altKey && !shift && e.key.toLowerCase() === 'g') { e.preventDefault(); groupSelectedLayers(); }
    if (ctrl && !e.altKey && shift && e.key.toLowerCase() === 'g') { e.preventDefault(); ungroupSelectedLayers(); }
    if (ctrl && e.key === 'a') { e.preventDefault(); handleMenuAction('selectAll'); }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); }
    if (e.key === 'Escape') {
      if (bgRemovalActive) { finishBgRemoval(); setTool('select'); }
      else if (paintBucketActive) { finishPaintBucket(); setTool('select'); }
      else if (eyedropperActive) { finishEyedropper(); setTool('select'); }
      else if (cutoutBrushActive) { finishCutoutBrush(); setTool('select'); }
      else if (healingBrushActive) { finishHealingBrush(); setTool('select'); }
      else if (currentTool === 'zoom') { setTool('select'); }
      else { canvas.discardActiveObject(); canvas.requestRenderAll(); }
    }
    if (e.key === 'v') setTool('select');
    if (e.key === 'h') setTool('hand');
    if (e.key === 'z' && !ctrl) setTool('zoom');
    if (e.key === 't') setTool('text');
    if (e.key === 'r') setTool('rect');
    if (e.key === 'e') setTool('circle');
    if (e.key === 'l') setTool('line');
    if (e.key === 'a' && !ctrl) setTool('arrow');
    if (e.key === 'b') setTool('bubble');
    if (e.key === 'g' && !ctrl) setTool('bgremove');
    if (e.key === 'k') setTool('bucket');
    if (e.key === 'y') setTool('eyedropper');
    if (e.key === 'x' && !ctrl) setTool('cutout');
    if (e.key === 'j' && !ctrl) setTool('healing');
    if (e.key === 's' && !ctrl) {
      e.preventDefault();
      const btn = document.getElementById('stickerBtn');
      if (stickerPopupOpen) closeStickerPopup(); else openStickerPopup(btn);
    }
    if (e.key === 'i' && !ctrl) setTool('image');
    if (e.key === 'd' && !ctrl) setTool('draw');
    if (e.key === 'p' && !ctrl) enterPerspectiveCrop();
    if (e.key === 'c' && !ctrl) enterStandardCrop();
  });

  document.addEventListener('keyup', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) commitKeyboardNudge();
  });
  window.addEventListener('blur', commitKeyboardNudge);
}

// ===== DRAG & DROP =====
function setupDragDrop() {
  const area = document.getElementById('canvasArea');
  const overlay = document.getElementById('dropOverlay');
  const hideDropOverlay = () => { overlay.style.display = 'none'; };
  const hasFiles = (transfer) => !!transfer && (
    Array.from(transfer.types || []).includes('Files') ||
    Array.from(transfer.items || []).some(item => item.kind === 'file') ||
    transfer.files?.length > 0
  );
  const couldNavigate = (transfer) => hasFiles(transfer) ||
    Array.from(transfer?.types || []).includes('text/uri-list');
  const isInWorkspace = (target) => target instanceof Node && area.contains(target);
  const isOverWorkspace = (e) => {
    const bounds = area.getBoundingClientRect();
    return e.clientX >= bounds.left && e.clientX < bounds.right &&
      e.clientY >= bounds.top && e.clientY < bounds.bottom;
  };

  // Capture external drags before a canvas child can swallow the event. Only
  // file drags show the overlay; URL drops are also guarded against navigation.
  const updateDropTarget = (e) => {
    if (!couldNavigate(e.dataTransfer)) return;
    e.preventDefault();
    const canDrop = hasFiles(e.dataTransfer) && isInWorkspace(e.target);
    e.dataTransfer.dropEffect = canDrop ? 'copy' : 'none';
    overlay.style.display = canDrop ? 'flex' : 'none';
  };
  document.addEventListener('dragenter', updateDropTarget, true);
  document.addEventListener('dragover', updateDropTarget, true);
  document.addEventListener('dragleave', (e) => {
    // Moving between Fabric canvases, rulers and transform handles is still
    // inside the same workspace. Some external drags omit relatedTarget.
    if (isInWorkspace(e.relatedTarget)) return;
    if (!e.relatedTarget && isOverWorkspace(e)) return;
    hideDropOverlay();
  }, true);
  document.addEventListener('drop', (e) => {
    hideDropOverlay();
    if (!couldNavigate(e.dataTransfer)) return;
    // Prevent Chrome opening the file even when released over a side panel.
    e.preventDefault();
    if (!isInWorkspace(e.target)) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) {
      showPerspToast('Drop a saved image file to add it to the canvas');
    } else if (/\.clatasha$/i.test(file.name)) {
      loadClatashaFromFile(file);
    } else if (isSupportedImageFile(file)) {
      loadImageFile(file);
    } else {
      showPerspToast('Choose an image or a .clatasha project file');
    }
  }, true);
  window.addEventListener('dragend', hideDropOverlay);
  window.addEventListener('blur', hideDropOverlay);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideDropOverlay();
  });

  document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadImageFile(file);
    e.target.value = '';
  });

  document.getElementById('videoInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) openVideoFrameGrabber(file);
    e.target.value = '';
  });

  const replaceInput = document.getElementById('replaceImageInput');
  replaceInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    const target = pendingImageReplacementTarget;
    pendingImageReplacementTarget = null;
    if (file && target) replaceCanvasImage(target, file);
    e.target.value = '';
  });
  replaceInput.addEventListener('cancel', () => {
    pendingImageReplacementTarget = null;
  });

  document.getElementById('clatashaInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadClatashaFromFile(file);
    e.target.value = '';
  });
}

function isSupportedImageFile(file) {
  if (!file) return false;
  if (String(file.type || '').startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(String(file.name || ''));
}

async function addImageDataUrlToCanvas(dataUrl, sourceName, showSuccessToast = true, metadata = {}) {
  const img = await FabricImage.fromURL(dataUrl);
  const scale = calculateImageImportScale(img.width, img.height);
  img.set({
    scaleX: scale,
    scaleY: scale,
    left: CANVAS_W / 2,
    top: CANVAS_H / 2,
    originX: 'center',
    originY: 'center',
    name: sourceName,
    _clatashaSourceName: sourceName,
    _clatashaPluginId: metadata.pluginId,
    _clatashaPluginVersion: metadata.pluginVersion,
  });
  canvas.add(img);
  canvas.bringObjectToFront(img);
  canvas.setActiveObject(img);
  img.setCoords();
  canvas.requestRenderAll();
  saveHistory();
  updateLayersList();
  updateObjectCount();
  if (showSuccessToast) showPerspToast(sourceName + ' added as the top layer');
  return img;
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('The plugin image could not be read.'));
    reader.readAsDataURL(blob);
  });
}

async function getSelectedImageForPlugin() {
  const activeObjects = canvas.getActiveObjects().filter(object => !isInternalEditorObject(object));
  if (activeObjects.length !== 1 || activeObjects[0].type !== 'image') return null;
  const image = activeObjects[0];
  try {
    return {
      dataUrl: image.toDataURL({ format: 'png', multiplier: 1, enableRetinaScaling: false }),
      name: image._clatashaSourceName || image.name || 'Selected Image',
      width: image.width || 0,
      height: image.height || 0,
    };
  } catch (error) {
    console.error('Unable to provide the selected image to a plugin:', error);
    return null;
  }
}

async function addPluginImageBlob(blob, options = {}) {
  if (!(blob instanceof Blob) || !String(blob.type || '').startsWith('image/')) {
    throw new Error('The plugin must provide a valid image.');
  }
  if (paintBrushActive) finishPaintBrush();
  if (sliceActive) setTool('select');
  if (cropActive) exitStandardCrop();
  if (perspActive) exitPerspectiveCrop();
  if (paintBucketActive) finishPaintBucket();
  if (bgRemovalActive) finishBgRemoval();
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  const name = String(options.name || 'Plugin Image').trim().slice(0, 100) || 'Plugin Image';
  const dataUrl = await readBlobAsDataUrl(blob);
  return addImageDataUrlToCanvas(dataUrl, name, false, {
    pluginId: options.pluginId,
    pluginVersion: options.pluginVersion,
  });
}

function loadImageFile(file) {
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  if (!isSupportedImageFile(file)) {
    showPerspToast('Choose a supported image file');
    return;
  }
  const sourceName = getFileStem(file.name) || 'Image';
  showPerspToast('Importing ' + sourceName + '...');
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      await addImageDataUrlToCanvas(e.target.result, sourceName);
    } catch (error) {
      console.error('Image import failed:', error);
      showPerspToast('This image could not be imported');
    }
  };
  reader.onerror = () => {
    console.error('Unable to read image file:', reader.error);
    showPerspToast('This image could not be read');
  };
  reader.readAsDataURL(file);
}

// ===== HISTORY (UNDO/REDO) =====
function getOrCreateHistoryAssetId(source) {
  let id = historyAssetIdsBySource.get(source);
  if (id) return id;
  id = 'history-image-' + nextHistoryAssetId++;
  historyAssetIdsBySource.set(source, id);
  historyAssets.set(id, { source, refs: 0, bytes: source.length * 2 });
  return id;
}

function compactHistoryImages(value, assetIds) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(item => compactHistoryImages(item, assetIds));
    return;
  }

  if (typeof value.src === 'string' && value.src.startsWith('data:image/')) {
    const assetId = getOrCreateHistoryAssetId(value.src);
    assetIds.add(assetId);
    value._clatashaHistoryAsset = assetId;
    delete value.src;
  }
  if (typeof value._clatashaCutoutOriginalSrc === 'string' && value._clatashaCutoutOriginalSrc.startsWith('data:image/')) {
    const assetId = getOrCreateHistoryAssetId(value._clatashaCutoutOriginalSrc);
    assetIds.add(assetId);
    value._clatashaCutoutOriginalHistoryAsset = assetId;
    delete value._clatashaCutoutOriginalSrc;
  }
  Object.values(value).forEach(item => compactHistoryImages(item, assetIds));
}

function expandHistoryImages(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(expandHistoryImages);
    return;
  }

  if (value._clatashaHistoryAsset) {
    const asset = historyAssets.get(value._clatashaHistoryAsset);
    if (!asset) throw new Error('An image required by this undo state is no longer available.');
    value.src = asset.source;
    delete value._clatashaHistoryAsset;
  }
  if (value._clatashaCutoutOriginalHistoryAsset) {
    const asset = historyAssets.get(value._clatashaCutoutOriginalHistoryAsset);
    if (!asset) throw new Error('The original image required by this cutout state is no longer available.');
    value._clatashaCutoutOriginalSrc = asset.source;
    delete value._clatashaCutoutOriginalHistoryAsset;
  }
  Object.values(value).forEach(expandHistoryImages);
}

function retainHistorySnapshot(snapshot) {
  snapshot.assetIds.forEach((id) => {
    const asset = historyAssets.get(id);
    if (asset) asset.refs++;
  });
}

function releaseHistorySnapshot(snapshot) {
  if (!snapshot || !snapshot.assetIds) return;
  snapshot.assetIds.forEach((id) => {
    const asset = historyAssets.get(id);
    if (asset) asset.refs = Math.max(0, asset.refs - 1);
  });
}

function pruneUnusedHistoryAssets() {
  historyAssets.forEach((asset, id) => {
    if (asset.refs > 0) return;
    historyAssets.delete(id);
    if (historyAssetIdsBySource.get(asset.source) === id) {
      historyAssetIdsBySource.delete(asset.source);
    }
  });
}

function getEstimatedHistoryBytes() {
  const snapshotBytes = history.reduce((sum, snapshot) => sum + (snapshot.bytes || 0), 0);
  const assetBytes = [...historyAssets.values()].reduce((sum, asset) => sum + (asset.refs > 0 ? asset.bytes : 0), 0);
  return snapshotBytes + assetBytes;
}

function trimHistoryToLimits() {
  while (history.length > 2 && (history.length > MAX_HISTORY || getEstimatedHistoryBytes() > MAX_HISTORY_MEMORY_BYTES)) {
    const removed = history.shift();
    releaseHistorySnapshot(removed);
    historyIndex--;
  }
  historyIndex = Math.max(0, historyIndex);
  pruneUnusedHistoryAssets();
}

function resetHistory() {
  history.forEach(releaseHistorySnapshot);
  history = [];
  historyIndex = -1;
  pruneUnusedHistoryAssets();
}

function createHistorySnapshot() {
  const selected = canvas.getActiveObject();
  if (selected) refreshContainingGroupLayouts(selected);
  const serialized = normalizeSerializedGroupInteractions(canvas.toJSON(CLATASHA_OBJECT_PROPERTIES));
  const assetIds = new Set();
  compactHistoryImages(serialized, assetIds);
  const json = JSON.stringify(serialized);
  return {
    json,
    assetIds: [...assetIds],
    bytes: json.length * 2,
  };
}

function saveHistory() {
  const snapshot = createHistorySnapshot();
  // Controls with a live preview can finish on the same state more than once.
  // Do not waste undo slots on identical snapshots.
  if (historyIndex >= 0 && history[historyIndex].json === snapshot.json) {
    pruneUnusedHistoryAssets();
    updateHistoryButtons();
    return;
  }
  // Trim future states
  history.slice(historyIndex + 1).forEach(releaseHistorySnapshot);
  history = history.slice(0, historyIndex + 1);
  // Save current state
  history.push(snapshot);
  retainHistorySnapshot(snapshot);
  historyIndex = history.length - 1;
  trimHistoryToLimits();
  updateHistoryButtons();
  scheduleClickCheckRefresh();
}

function undo() {
  endAdjustmentPresetPreview();
  if (paintBrushActive) finishPaintBrush();
  if (sliceActive) setTool('select');
  if (perspActive) exitPerspectiveCrop();
  if (cropActive) exitStandardCrop();
  if (paintBucketActive) finishPaintBucket();
  if (bgRemovalActive) finishBgRemoval();
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  if (historyIndex <= 0) return;
  historyIndex--;
  loadHistoryState(history[historyIndex]);
}

function redo() {
  endAdjustmentPresetPreview();
  if (paintBrushActive) finishPaintBrush();
  if (sliceActive) setTool('select');
  if (perspActive) exitPerspectiveCrop();
  if (cropActive) exitStandardCrop();
  if (paintBucketActive) finishPaintBucket();
  if (bgRemovalActive) finishBgRemoval();
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  loadHistoryState(history[historyIndex]);
}

function loadHistoryState(snapshot) {
  try {
    exitGroupEditMode({ selectParent: false });
    const parsed = JSON.parse(snapshot.json);
    expandHistoryImages(parsed);
    const json = JSON.stringify(parsed);
    restoringClippingState = true;
    canvas.loadFromJSON(json).then(async () => {
      attachTextEditingHosts();
      restoreLockStates(json);
      await restoreClippingMasksFromLinks();
      restoringClippingState = false;
      canvas.renderAll();
      updateHistoryButtons();
      updateLayersList();
      updateObjectCount();
      scheduleClickCheckRefresh();
    }).catch((error) => {
      restoringClippingState = false;
      console.error('Unable to restore undo state:', error);
    });
  } catch (error) {
    console.error('Unable to prepare undo state:', error);
  }
}

function updateHistoryButtons() {
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const menuUndo = document.getElementById('menuUndo');
  const menuRedo = document.getElementById('menuRedo');
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  undoBtn.disabled = !canUndo;
  redoBtn.disabled = !canRedo;
  if (menuUndo) menuUndo.disabled = !canUndo;
  if (menuRedo) menuRedo.disabled = !canRedo;
}

// ===== LAYERS =====
// Layer rows include top-level canvas objects and expandable group children.
// Fabric groups remain atomic on the canvas so expanding the Layers panel can
// never change child coordinates or effects.
let _layerEntries = [];
let _layerSelectionAnchor = null;

function getFileStem(fileName) {
  const baseName = String(fileName || '').split(/[\\/]/).pop().trim();
  if (!baseName) return '';
  return baseName.replace(/\.[^.]+$/, '').trim().substring(0, 40);
}

function getLayerPresentation(obj) {
  const isCurved = !!obj._clatashaCurve;
  const icon = isUserGroup(obj) ? 'GRP' :
    obj._clatashaArrow ? '→' :
    obj._clatashaPaintLayer ? 'BR' :
    isCurved ? '~T' :
    obj.type === 'textbox' ? 'T' :
    obj.type === 'image' ? 'IMG' :
    obj.type === 'circle' ? 'O' :
    obj.type === 'polygon' ? 'POLY' :
    obj.type === 'line' ? '/' :
    obj.type === 'path' ? '~' :
    obj.type === 'triangle' ? '^' : '#';

  let name;
  if (isUserGroup(obj)) name = obj.name || 'Group';
  else if (isCurved) name = obj._clatashaText || 'Curved Text';
  else if (obj.type === 'textbox') name = obj.text || 'Text';
  else if (obj.type === 'image') name = obj._clatashaSourceName || obj.name || 'Image';
  else if (obj.name && !String(obj.name).startsWith('__')) name = obj.name;
  else name = obj.type.charAt(0).toUpperCase() + obj.type.slice(1);

  return { icon, name: String(name).substring(0, 40) };
}

function getLayerEntryFromItem(item) {
  if (!item) return null;
  return _layerEntries[Number.parseInt(item.dataset.layerEntry, 10)] || null;
}

function getRootLayerEntries() {
  return _layerEntries.filter(entry => entry.canvasRoot);
}

function countDesignLayers(objects) {
  return objects.reduce((count, obj) => {
    if (isUserGroup(obj) && obj.getObjects) return count + countDesignLayers(obj.getObjects());
    return count + 1;
  }, 0);
}

function beginInlineLayerRename(obj, item) {
  const nameEl = item?.querySelector('.layer-name');
  if (!obj || !nameEl || nameEl.querySelector('input')) return;

  const currentName = getLayerPresentation(obj).name;
  const input = document.createElement('input');
  input.className = 'layer-name-input';
  input.type = 'text';
  input.maxLength = 40;
  input.value = currentName;
  nameEl.textContent = '';
  nameEl.appendChild(input);
  input.focus();
  input.select();

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    const cleanName = input.value.trim().substring(0, 40);
    if (commit && cleanName && cleanName !== currentName) {
      obj.name = cleanName;
      if (obj.type === 'image') obj._clatashaSourceName = cleanName;
      if (obj.group) obj.group.dirty = true;
      saveHistory();
    }
    updateLayersList();
  };

  input.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
}

function beginInlineLayerRenameForObject(obj) {
  const entryIndex = _layerEntries.findIndex(entry => entry.obj === obj);
  if (entryIndex < 0) return;
  const item = document.querySelector('#layersList .layer-item[data-layer-entry="' + entryIndex + '"]');
  if (item) beginInlineLayerRename(obj, item);
}

function setLayerObjectsLocked(objects, shouldLock) {
  const unique = [...new Set(objects)].filter(Boolean);
  if (!unique.length) return;
  const active = canvas.getActiveObject();
  if (shouldLock && isActiveSelectionObject(active)) {
    active.removeAll();
    canvas.discardActiveObject();
    unique.forEach(obj => obj.setCoords());
  }
  unique.forEach(obj => {
    if (shouldLock) {
      obj._clatashaLocked = true;
      obj.set({ selectable: false, evented: false, lockMovementX: true, lockMovementY: true, hasControls: false });
    } else {
      delete obj._clatashaLocked;
      obj.set({ selectable: true, evented: true, lockMovementX: false, lockMovementY: false, hasControls: true });
    }
    obj.setCoords();
  });
  if (shouldLock) canvas.discardActiveObject();
  canvas.requestRenderAll();
  updateLayersList();
  saveHistory();
}

function setLayerObjectsVisible(objects, shouldShow) {
  const unique = [...new Set(objects)].filter(Boolean);
  if (!unique.length) return;
  unique.forEach(obj => {
    obj.set('visible', shouldShow);
    if (obj.group) obj.group.dirty = true;
  });
  canvas.requestRenderAll();
  updateLayersList();
  saveHistory();
}

function moveSelectedLayersOneStep(direction) {
  const selected = new Set(canvas.getActiveObjects().filter(obj => !isInternalEditorObject(obj)));
  if (!selected.size) return;

  if (direction > 0) {
    const ordered = canvas.getObjects().filter(obj => selected.has(obj)).reverse();
    ordered.forEach(obj => {
      const objects = canvas.getObjects();
      const index = objects.indexOf(obj);
      if (index >= 1 && index < objects.length - 1 && !selected.has(objects[index + 1])) {
        canvas.moveObjectTo(obj, index + 1);
      }
    });
  } else {
    const ordered = canvas.getObjects().filter(obj => selected.has(obj));
    ordered.forEach(obj => {
      const objects = canvas.getObjects();
      const index = objects.indexOf(obj);
      if (index > 1 && !selected.has(objects[index - 1])) {
        canvas.moveObjectTo(obj, index - 1);
      }
    });
  }

  canvas.requestRenderAll();
  updateLayersList();
  saveHistory();
}

function moveSelectionIntoGroup(targetGroup) {
  if (!isUserGroup(targetGroup) || targetGroup._clatashaLocked) return;
  const active = canvas.getActiveObject();
  let selected = canvas.getActiveObjects().filter(obj => !isInternalEditorObject(obj) && obj !== targetGroup);
  if (!selected.length || selected.some(isUserGroup)) {
    showPerspToast('Select individual layers before moving them into a group');
    return;
  }
  if (selected.some(obj => isClippingBase(obj) || isClippedLayer(obj)) || isClippingBase(targetGroup) || isClippedLayer(targetGroup)) {
    showPerspToast('Release clipping masks before moving these layers into a group');
    return;
  }

  const originalOrder = canvas.getObjects().slice();
  selected = selected.sort((a, b) => originalOrder.indexOf(a) - originalOrder.indexOf(b));
  const targetIndex = originalOrder.indexOf(targetGroup);
  const removedBeforeTarget = selected.filter(obj => originalOrder.indexOf(obj) < targetIndex).length;

  if (isActiveSelectionObject(active)) {
    active.removeAll();
    canvas.discardActiveObject();
    selected.forEach(obj => obj.setCoords());
  }

  const existingChildren = targetGroup.removeAll();
  canvas.remove(targetGroup);
  selected.forEach(obj => canvas.remove(obj));

  const replacement = new Group([...existingChildren, ...selected], {
    name: targetGroup.name || getNextGroupName(),
    subTargetCheck: true,
    interactive: false,
  });
  replacement._clatashaUserGroup = true;
  replacement._clatashaGroupExpanded = targetGroup._clatashaGroupExpanded !== false;
  const insertIndex = Math.max(1, Math.min(targetIndex - removedBeforeTarget, canvas.getObjects().length));
  canvas.insertAt(insertIndex, replacement);
  canvas.setActiveObject(replacement);
  replacement.setCoords();
  canvas.requestRenderAll();
  updateLayersList();
  updatePropertiesPanel(replacement);
  updateGroupingMenuState(replacement);
  saveHistory();
}

function chooseGroupForSelection() {
  const selected = new Set(canvas.getActiveObjects());
  const groups = canvas.getObjects().filter(obj => isUserGroup(obj) && !obj._clatashaLocked && !selected.has(obj));
  if (!groups.length) {
    showPerspToast('Create another group first');
    return;
  }
  const choices = groups.map((group, index) => (index + 1) + '. ' + (group.name || 'Group')).join('\n');
  const answer = prompt('Move selected layers into which group?\n\n' + choices, '1');
  if (answer === null) return;
  const index = Number.parseInt(answer, 10) - 1;
  if (!groups[index]) {
    showPerspToast('Choose a group number from the list');
    return;
  }
  moveSelectionIntoGroup(groups[index]);
}

function showLayerContextMenu(x, y, entry) {
  const target = entry.rootObject;
  const activeObjects = canvas.getActiveObjects().filter(obj => !isInternalEditorObject(obj));
  const targetIsSelected = activeObjects.includes(target);
  const selectedObjects = targetIsSelected ? activeObjects : [target];
  const isChild = !entry.canvasRoot;
  const renameLabel = isUserGroup(entry.obj) ? 'Rename Group' : 'Rename Layer';
  const items = [{
    label: renameLabel,
    action: () => beginInlineLayerRenameForObject(entry.obj),
  }];

  if (isChild) {
    items.push({
      label: entry.obj.visible === false ? 'Show Layer' : 'Hide Layer',
      action: () => setLayerObjectsVisible([entry.obj], entry.obj.visible === false),
    });
    items.push({ type: 'separator' });
    items.push({
      label: 'Select Parent Group',
      action: () => {
        canvas.setActiveObject(target);
        canvas.requestRenderAll();
        updateLayersList();
      },
    });
    renderContextMenuItems(x, y, items);
    return;
  }

  if (!targetIsSelected && target._clatashaLocked) {
    items.push({ type: 'separator' });
    items.push({ label: 'Unlock', action: () => setLayerObjectsLocked([target], false) });
    items.push({
      label: target.visible === false ? 'Show' : 'Hide',
      action: () => setLayerObjectsVisible([target], target.visible === false),
    });
    renderContextMenuItems(x, y, items);
    return;
  }

  if (selectedObjects.length > 1) {
    if (getClippingPair(selectedObjects)) {
      items.push({
        label: 'Create Clipping Mask',
        shortcut: 'Ctrl+Alt+G',
        action: () => createClippingMask(),
      });
    }
    if (!selectedObjects.some(obj => isClippingBase(obj) || isClippedLayer(obj))) {
      items.push({
        label: 'Group Selected Layers',
        shortcut: 'Ctrl+G',
        action: () => groupSelectedLayers(),
      });
    }
  }
  if (isUserGroup(target)) {
    items.push({
      label: 'Ungroup Layers',
      shortcut: 'Ctrl+Shift+G',
      action: () => ungroupSelectedLayers(),
    });
  }
  if (selectedObjects.some(obj => isClippingBase(obj) || isClippedLayer(obj))) {
    items.push({
      label: 'Release Clipping Mask',
      action: () => releaseClippingMask(selectedObjects, true),
    });
  }

  const movableIntoGroup = selectedObjects.length > 0 && selectedObjects.every(obj => !isUserGroup(obj)) &&
    canvas.getObjects().some(obj => isUserGroup(obj) && !obj._clatashaLocked && !selectedObjects.includes(obj));
  if (movableIntoGroup) {
    items.push({
      label: 'Move Into Group...',
      action: () => chooseGroupForSelection(),
    });
  }

  items.push({ type: 'separator' });
  items.push({ label: 'Bring Forward', action: () => moveSelectedLayersOneStep(1) });
  items.push({ label: 'Send Backward', action: () => moveSelectedLayersOneStep(-1) });
  items.push({ label: 'Bring to Front', action: () => bringSelectedToFront() });
  items.push({ label: 'Send to Back', action: () => sendSelectedToBack() });
  items.push({ type: 'separator' });
  items.push({ label: 'Duplicate', shortcut: 'Ctrl+D', action: () => duplicateSelected() });

  const shouldUnlock = selectedObjects.every(obj => obj._clatashaLocked);
  items.push({
    label: shouldUnlock ? 'Unlock' : 'Lock',
    action: () => setLayerObjectsLocked(selectedObjects, !shouldUnlock),
  });
  const shouldShow = selectedObjects.every(obj => obj.visible === false);
  items.push({
    label: shouldShow ? 'Show' : 'Hide',
    action: () => setLayerObjectsVisible(selectedObjects, shouldShow),
  });
  items.push({ type: 'separator' });
  items.push({ label: 'Delete', shortcut: 'Del', danger: true, action: () => deleteSelected() });
  renderContextMenuItems(x, y, items);
}

function setupLayersDelegation() {
  const list = document.getElementById('layersList');

  function selectLayerObject(obj, options = {}) {
    const { toggle = false, range = false } = options;
    const current = canvas.getActiveObject();
    if (!toggle && !range) {
      canvas.setActiveObject(obj);
      _layerSelectionAnchor = obj;
      canvas.requestRenderAll();
      updateLayersList();
      return;
    }

    let selected = [];
    if (isActiveSelectionObject(current)) {
      selected = current.getObjects().slice();
      current.removeAll();
      canvas.discardActiveObject();
      selected.forEach(item => item.setCoords());
    } else if (current && current.name !== '__bg__') {
      selected = [current];
      canvas.discardActiveObject();
    }

    if (range) {
      const roots = getRootLayerEntries().map(entry => entry.obj);
      const anchor = roots.includes(_layerSelectionAnchor) ? _layerSelectionAnchor : obj;
      const start = roots.indexOf(anchor);
      const end = roots.indexOf(obj);
      const first = Math.min(start, end);
      const last = Math.max(start, end);
      selected = roots.slice(first, last + 1).filter(item => !item._clatashaLocked && item.selectable !== false);
    } else {
      const existingIndex = selected.indexOf(obj);
      if (existingIndex >= 0) selected.splice(existingIndex, 1);
      else selected.push(obj);
      _layerSelectionAnchor = obj;
    }

    if (selected.length > 1) canvas.setActiveObject(new ActiveSelection(selected, { canvas }));
    else if (selected.length === 1) canvas.setActiveObject(selected[0]);
    canvas.requestRenderAll();
    updateLayersList();
  }

  list.addEventListener('dblclick', (e) => {
    const nameEl = e.target.closest('.layer-name');
    const item = e.target.closest('.layer-item');
    if (!nameEl || !item) return;
    e.preventDefault();
    e.stopPropagation();
    const entry = getLayerEntryFromItem(item);
    if (entry) beginInlineLayerRename(entry.obj, item);
  });

  list.addEventListener('contextmenu', e => {
    const item = e.target.closest('.layer-item');
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    const entry = getLayerEntryFromItem(item);
    if (!entry) return;
    const target = entry.rootObject;
    const activeObjects = canvas.getActiveObjects();
    if (!activeObjects.includes(target) && !target._clatashaLocked) {
      selectLayerObject(target);
    }
    showLayerContextMenu(e.clientX, e.clientY, entry);
  });

  // --- Click delegation (select, vis, lock) ---
  list.addEventListener('click', (e) => {
    if (_layerDrag.suppressClick) {
      _layerDrag.suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (_layerDrag.active) return;
    if (cutoutBrushActive) finishCutoutBrush();
    if (healingBrushActive) finishHealingBrush();
    const grip = e.target.closest('[data-grip]');
    const visBtn = e.target.closest('.layer-vis-btn');
    const lockBtn = e.target.closest('[data-lock]');
    const groupToggle = e.target.closest('[data-group-toggle]');
    const item = e.target.closest('.layer-item');
    if (!item) return;
    const entry = getLayerEntryFromItem(item);
    if (!entry) return;
    if (groupToggle) {
      e.stopPropagation();
      entry.obj._clatashaGroupExpanded = entry.obj._clatashaGroupExpanded === false;
      updateLayersList();
      return;
    }
    if (!visBtn && !lockBtn && !grip) {
      const obj = entry.obj;
      if (!obj || obj._clatashaLocked || entry.rootObject?._clatashaLocked) return;
      if (!entry.canvasRoot) {
        selectChildInsideGroup(obj);
      } else {
        exitGroupEditMode({ selectParent: false });
        selectLayerObject(obj, { range: e.shiftKey, toggle: !e.shiftKey && (e.ctrlKey || e.metaKey) });
      }
      return;
    }
    const obj = entry.obj;
    if (!obj) return;
    if (visBtn) {
      e.stopPropagation();
      toggleLayerVisibility(obj);
    } else if (lockBtn) {
      e.stopPropagation();
      toggleLayerLock(obj);
    }
  });

  // --- Drag reorder ---
  const _layerDrag = {
    active: false,
    idx: -1,
    obj: null,
    clone: null,
    startY: 0,
    threshold: 5,
    started: false,
    aboveCount: 0,
    suppressClick: false,
  };

  list.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const dragSurface = e.target.closest('[data-grip], [data-layer-drag-surface]');
    if (!dragSurface) return;
    if (cutoutBrushActive) finishCutoutBrush();
    if (healingBrushActive) finishHealingBrush();
    const item = dragSurface.closest('.layer-item');
    if (!item) return;
    const entry = getLayerEntryFromItem(item);
    if (!entry || !entry.canvasRoot || isClippedLayer(entry.obj)) return;
    const rootEntries = getRootLayerEntries();
    const idx = rootEntries.indexOf(entry);
    const obj = entry.obj;
    if (!obj || obj._clatashaLocked) return;
    e.preventDefault();
    _layerDrag.active = true;
    _layerDrag.idx = idx;
    _layerDrag.obj = obj;
    _layerDrag.startY = e.clientY;
    _layerDrag.started = false;
    _layerDrag.clone = null;
    _layerDrag.aboveCount = idx;
  });

  document.addEventListener('mousemove', (e) => {
    if (!_layerDrag.active) return;

    if (!_layerDrag.started) {
      if (Math.abs(e.clientY - _layerDrag.startY) < _layerDrag.threshold) return;
      _layerDrag.started = true;
      const items = list.querySelectorAll('.layer-item[data-root-layer="1"]');
      if (items[_layerDrag.idx]) items[_layerDrag.idx].classList.add('dragging');
      const obj = _layerDrag.obj;
      const { icon, name } = getLayerPresentation(obj);
      const clone = document.createElement('div');
      clone.className = 'layer-drag-clone';
      clone.innerHTML = '<span class="layer-icon">' + escapeHtml(icon) + '</span><span class="layer-name">' + escapeHtml(name) + '</span>';
      document.body.appendChild(clone);
      _layerDrag.clone = clone;
    }

    _layerDrag.clone.style.left = (e.clientX + 12) + 'px';
    _layerDrag.clone.style.top = (e.clientY - 14) + 'px';

    // Count how many non-dragging items have their midpoint above the cursor
    const items = list.querySelectorAll('.layer-item[data-root-layer="1"]');
    let aboveCount = 0;
    let indicatorItem = null;
    let indicatorPos = ''; // 'above' or 'below'

    for (let i = 0; i < items.length; i++) {
      if (items[i].classList.contains('dragging')) continue;
      const rect = items[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY >= midY) {
        aboveCount++;
      } else {
        indicatorItem = items[i];
        indicatorPos = 'above';
        break;
      }
    }
    // If cursor is below all items
    if (!indicatorItem) {
      for (let i = items.length - 1; i >= 0; i--) {
        if (!items[i].classList.contains('dragging')) {
          indicatorItem = items[i];
          indicatorPos = 'below';
          break;
        }
      }
    }

    _layerDrag.aboveCount = aboveCount;

    // No change?
    if (aboveCount === _layerDrag.idx) {
      items.forEach(it => { it.classList.remove('drop-above', 'drop-below'); });
      return;
    }

    // Show indicator
    items.forEach(it => { it.classList.remove('drop-above', 'drop-below'); });
    if (indicatorItem) {
      indicatorItem.classList.add(indicatorPos === 'above' ? 'drop-above' : 'drop-below');
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (!_layerDrag.active) return;
    _layerDrag.active = false;
    const completedDrag = _layerDrag.started;

    if (_layerDrag.clone) {
      _layerDrag.clone.remove();
      _layerDrag.clone = null;
    }
    const items = list.querySelectorAll('.layer-item[data-root-layer="1"]');
    items.forEach(it => { it.classList.remove('dragging', 'drop-above', 'drop-below'); });

    // Reorder if position changed
    const targetListPos = _layerDrag.aboveCount;
    if (_layerDrag.started && targetListPos !== _layerDrag.idx) {
      const obj = _layerDrag.obj;
      const totalCanvas = canvas.getObjects().length;
      const targetCanvasIdx = Math.max(1, totalCanvas - 1 - targetListPos);
      canvas.moveObjectTo(obj, targetCanvasIdx);
      canvas.renderAll();
      saveHistory();
      updateLayersList();
    }

    _layerDrag.idx = -1;
    _layerDrag.obj = null;
    _layerDrag.started = false;
    _layerDrag.aboveCount = 0;
    if (completedDrag) {
      _layerDrag.suppressClick = true;
      setTimeout(() => { _layerDrag.suppressClick = false; }, 0);
    }
  });
}

function updateLayersList() {
  const list = document.getElementById('layersList');
  const previousScrollTop = list.scrollTop;
  const objects = canvas.getObjects().filter(o => !isInternalEditorObject(o));
  document.getElementById('layerCount').textContent = countDesignLayers(objects);

  _layerEntries = [];
  const appendEntry = (obj, depth, rootObject, canvasRoot) => {
    _layerEntries.push({ obj, depth, rootObject, canvasRoot });
    if (isUserGroup(obj) && obj.getObjects && obj._clatashaGroupExpanded !== false) {
      [...obj.getObjects()].reverse().forEach(child => appendEntry(child, depth + 1, rootObject, false));
    }
  };
  [...objects].reverse().forEach(obj => appendEntry(obj, isClippedLayer(obj) ? 1 : 0, obj, true));
  const activeObjects = new Set(canvas.getActiveObjects ? canvas.getActiveObjects() : []);
  const activeEntryIndexes = [];

  let html = '';
  _layerEntries.forEach((entry, i) => {
    const obj = entry.obj;
    const isLocked = !!obj._clatashaLocked;
    const isHidden = obj.visible === false;
    const isActive = activeObjects.has(entry.obj) || activeObjects.has(entry.rootObject);
    if (isActive) activeEntryIndexes.push(i);
    const isGroup = isUserGroup(obj);
    const isExpanded = obj._clatashaGroupExpanded !== false;
    const { icon, name } = getLayerPresentation(obj);
    const isClipped = isClippedLayer(obj) && entry.canvasRoot;
    const clippingBase = isClipped ? getClippingBase(obj) : null;
    const clippingTitle = clippingBase ? 'Clipped to ' + getLayerPresentation(clippingBase).name : 'Clipped layer';
    html += '<div class="layer-item' + (isActive ? ' active' : '') + (isHidden ? ' layer-hidden' : '') + (entry.depth ? ' layer-child' : '') + (isClipped ? ' layer-clipped' : '') + (entry.canvasRoot && !isClipped && !isLocked ? ' layer-draggable' : '') + '" data-layer-entry="' + i + '" data-root-layer="' + (entry.canvasRoot ? '1' : '0') + '" style="--layer-depth:' + entry.depth + '">' +
      (entry.canvasRoot && !isClipped ? '<span class="layer-grip" data-grip="1">&#8942;&#8942;</span>' : '<span class="layer-grip-placeholder"></span>') +
      '<button class="layer-action-btn layer-vis-btn" title="' + (isHidden ? 'Show' : 'Hide') + '">' + (isHidden ? '&#9675;' : '&#9679;') + '</button>' +
      (isGroup ? '<button class="layer-group-toggle" data-group-toggle="1" title="' + (isExpanded ? 'Collapse group' : 'Expand group') + '">' + (isExpanded ? '&#9662;' : '&#9656;') + '</button>' : isClipped ? '<span class="layer-clip-indicator" title="' + escapeHtmlAttribute(clippingTitle) + '">&#8627;</span>' : '<span class="layer-group-spacer"></span>') +
      '<span class="layer-icon" data-layer-drag-surface="1">' + escapeHtml(icon) + '</span>' +
      '<span class="layer-name" data-layer-drag-surface="1" title="' + escapeHtmlAttribute(name) + '">' + escapeHtml(name) + '</span>' +
      '<div class="layer-actions">' +
        '<button class="layer-action-btn ' + (isLocked ? 'layer-locked' : '') + '" title="' + (isLocked ? 'Unlock' : 'Lock') + '" data-lock="1">' + (isLocked ? '&#128274;' : '&#128275;') + '</button>' +
      '</div></div>';
  });
  list.innerHTML = html;
  list.scrollTop = previousScrollTop;

  const selectionKey = activeEntryIndexes.join(',');
  const selectionChanged = selectionKey !== lastLayerSelectionKey;
  lastLayerSelectionKey = selectionKey;
  if (selectionChanged && selectionKey && isRightPanelTabActive('layers')) {
    requestAnimationFrame(() => {
      const activeItem = list.querySelector('.layer-item.active');
      if (!activeItem) return;
      const listRect = list.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();
      if (itemRect.top < listRect.top) list.scrollTop -= listRect.top - itemRect.top;
      else if (itemRect.bottom > listRect.bottom) list.scrollTop += itemRect.bottom - listRect.bottom;
      rightPanelScrollPositions.layers = list.scrollTop;
    });
  } else {
    rightPanelScrollPositions.layers = list.scrollTop;
  }
  syncLayerAppearanceControls();
}

function toggleLayerLock(obj) {
  if (obj._clatashaLocked) {
    delete obj._clatashaLocked;
    obj.set({
      selectable: true,
      evented: true,
      lockMovementX: false,
      lockMovementY: false,
      hasControls: true,
    });
  } else {
    obj._clatashaLocked = true;
    if (canvas.getActiveObject() === obj) canvas.discardActiveObject();
    obj.set({
      selectable: false,
      evented: false,
      lockMovementX: true,
      lockMovementY: true,
      hasControls: false,
    });
  }
  canvas.renderAll();
  updateLayersList();
  saveHistory();
}

function restoreLockStates(rawJson, lockedIndicesArr) {
  // Restore locks from either:
  // 1. lockedIndicesArr — array of indices saved separately in project metadata
  // 2. rawJson — parse Fabric JSON to find _clatashaLocked (fallback)
  // 3. obj._clatashaLocked — if Fabric happened to preserve it
  const lockedSet = new Set(lockedIndicesArr || []);
  if (!lockedSet.size && rawJson) {
    try {
      const parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
      if (parsed && parsed.objects) {
        parsed.objects.forEach((o, i) => { if (o._clatashaLocked) lockedSet.add(i); });
      }
    } catch (e) {}
  }
  canvas.forEachObject((obj, i) => {
    if (obj._clatashaLocked || lockedSet.has(i)) {
      obj._clatashaLocked = true;
      obj.set({
        selectable: false,
        evented: false,
        lockMovementX: true,
        lockMovementY: true,
        hasControls: false,
      });
    }
  });
}

function flipSelected(direction) {
  const active = canvas.getActiveObject();
  if (!active || active.name === '__bg__') return;
  if (direction === 'h') {
    active.set('flipX', !active.flipX);
  } else {
    active.set('flipY', !active.flipY);
  }
  active.setCoords();
  syncEditedClippingBase(active);
  canvas.renderAll();
  saveHistory();
}

function toggleLayerVisibility(obj) {
  obj.set('visible', !obj.visible);
  if (obj.group) obj.group.dirty = true;
  canvas.renderAll();
  updateLayersList();
  saveHistory();
}

function updateObjectCount() {
  const count = canvas.getObjects().filter(o => !isInternalEditorObject(o)).length;
  document.getElementById('objectCount').textContent = count + ' object' + (count !== 1 ? 's' : '');
}

// ===== OBJECT ACTIONS =====
function getNextGroupName() {
  const used = new Set(canvas.getObjects()
    .filter(isUserGroup)
    .map(obj => String(obj.name || '')));
  let number = 1;
  while (used.has('Group ' + number)) number++;
  return 'Group ' + number;
}

function groupSelectedLayers() {
  const active = canvas.getActiveObject();
  if (!isActiveSelectionObject(active) || !active.getObjects || active.getObjects().length < 2) return;

  const canvasOrder = canvas.getObjects();
  const objects = active.getObjects().slice()
    .filter(obj => !isInternalEditorObject(obj))
    .sort((a, b) => canvasOrder.indexOf(a) - canvasOrder.indexOf(b));
  if (objects.length < 2) return;
  if (objects.some(obj => isClippingBase(obj) || isClippedLayer(obj))) {
    showPerspToast('Release clipping masks before grouping these layers');
    return;
  }

  const selectedIndices = objects.map(obj => canvasOrder.indexOf(obj)).filter(index => index >= 0);
  const highestIndex = Math.max(...selectedIndices);
  const insertIndex = highestIndex - selectedIndices.filter(index => index < highestIndex).length;

  // ActiveSelection stores child coordinates relative to itself. removeAll()
  // restores each layer's canvas coordinates before the permanent Group is made.
  active.removeAll();
  canvas.discardActiveObject();
  objects.forEach(obj => canvas.remove(obj));

  const group = new Group(objects, {
    name: getNextGroupName(),
    subTargetCheck: true,
    interactive: false,
  });
  group._clatashaUserGroup = true;
  group._clatashaGroupExpanded = true;
  canvas.insertAt(Math.max(1, Math.min(insertIndex, canvas.getObjects().length)), group);
  canvas.setActiveObject(group);
  group.setCoords();
  canvas.requestRenderAll();
  saveHistory();
  updateLayersList();
  updatePropertiesPanel(group);
  updateGroupingMenuState(group);
}

function ungroupSelectedLayers() {
  const group = canvas.getActiveObject();
  if (!isUserGroup(group) || !group.getObjects || group.getObjects().length === 0) return;
  if (isClippingBase(group) || isClippedLayer(group)) {
    showPerspToast('Release the clipping mask before ungrouping this layer');
    return;
  }

  const groupIndex = canvas.getObjects().indexOf(group);
  const children = group.removeAll();
  canvas.discardActiveObject();
  canvas.remove(group);

  children.forEach((child, index) => {
    if (child._clatashaLocked) {
      child.set({ selectable: false, evented: false, lockMovementX: true, lockMovementY: true, hasControls: false });
    } else {
      child.set({ selectable: true, evented: true, lockMovementX: false, lockMovementY: false, hasControls: true });
    }
    child.setCoords();
    canvas.insertAt(Math.max(1, groupIndex + index), child);
  });

  const selectableChildren = children.filter(child => !child._clatashaLocked);
  if (selectableChildren.length > 1) {
    canvas.setActiveObject(new ActiveSelection(selectableChildren, { canvas }));
  } else if (selectableChildren.length === 1) {
    canvas.setActiveObject(selectableChildren[0]);
  }
  canvas.requestRenderAll();
  saveHistory();
  updateLayersList();
  updateGroupingMenuState(canvas.getActiveObject());
}

function getUnionBounds(boundsList) {
  const left = Math.min(...boundsList.map(bounds => bounds.left));
  const top = Math.min(...boundsList.map(bounds => bounds.top));
  const right = Math.max(...boundsList.map(bounds => bounds.right));
  const bottom = Math.max(...boundsList.map(bounds => bounds.bottom));
  return {
    left, top, right, bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function moveObjectBy(obj, dx, dy) {
  obj.set({ left: (obj.left || 0) + dx, top: (obj.top || 0) + dy });
  obj.dirty = true;
  obj.setCoords();
}

function restoreActiveSelection(objects) {
  if (objects.length > 1) canvas.setActiveObject(new ActiveSelection(objects, { canvas }));
  else if (objects.length === 1) canvas.setActiveObject(objects[0]);
  canvas.requestRenderAll();
  updateLayersList();
  const selected = canvas.getActiveObject();
  if (selected) updatePropertiesPanel(selected);
  updateGroupingMenuState(selected);
}

function arrangeSelectedLayers(action) {
  const active = canvas.getActiveObject();
  if (!isActiveSelectionObject(active) || !active.getObjects) return;
  const supported = new Set([
    'left', 'centerX', 'right', 'top', 'centerY', 'bottom',
    'distributeCenterX', 'distributeCenterY', 'distributeGapX', 'distributeGapY',
  ]);
  if (!supported.has(action)) return;

  const objects = active.getObjects().slice();
  if (objects.length < 2 || (action.startsWith('distribute') && objects.length < 3)) return;

  active.removeAll();
  canvas.discardActiveObject();
  objects.forEach(obj => obj.setCoords());

  const entries = objects.map(obj => ({ obj, bounds: getObjectBounds(obj) }));
  const selectionBounds = getUnionBounds(entries.map(entry => entry.bounds));
  const referenceBounds = arrangeReference === 'canvas'
    ? { left: 0, top: 0, right: CANVAS_W, bottom: CANVAS_H, width: CANVAS_W, height: CANVAS_H, centerX: CANVAS_W / 2, centerY: CANVAS_H / 2 }
    : selectionBounds;

  if (['left', 'centerX', 'right', 'top', 'centerY', 'bottom'].includes(action)) {
    entries.forEach(({ obj, bounds }) => {
      let dx = 0;
      let dy = 0;
      if (action === 'left') dx = referenceBounds.left - bounds.left;
      if (action === 'centerX') dx = referenceBounds.centerX - bounds.centerX;
      if (action === 'right') dx = referenceBounds.right - bounds.right;
      if (action === 'top') dy = referenceBounds.top - bounds.top;
      if (action === 'centerY') dy = referenceBounds.centerY - bounds.centerY;
      if (action === 'bottom') dy = referenceBounds.bottom - bounds.bottom;
      moveObjectBy(obj, dx, dy);
    });
  } else {
    const horizontal = action.endsWith('X');
    const byCenter = action.includes('Center');
    const ordered = entries.slice().sort((a, b) => horizontal
      ? a.bounds.centerX - b.bounds.centerX
      : a.bounds.centerY - b.bounds.centerY);

    if (byCenter) {
      const first = ordered[0].bounds;
      const last = ordered[ordered.length - 1].bounds;
      const start = arrangeReference === 'canvas'
        ? (horizontal ? first.width / 2 : first.height / 2)
        : (horizontal ? first.centerX : first.centerY);
      const end = arrangeReference === 'canvas'
        ? (horizontal ? CANVAS_W - last.width / 2 : CANVAS_H - last.height / 2)
        : (horizontal ? last.centerX : last.centerY);
      const step = (end - start) / (ordered.length - 1);
      ordered.forEach((entry, index) => {
        const current = horizontal ? entry.bounds.centerX : entry.bounds.centerY;
        const delta = start + step * index - current;
        moveObjectBy(entry.obj, horizontal ? delta : 0, horizontal ? 0 : delta);
      });
    } else {
      const totalSize = ordered.reduce((sum, entry) => sum + (horizontal ? entry.bounds.width : entry.bounds.height), 0);
      const start = arrangeReference === 'canvas'
        ? 0
        : (horizontal ? selectionBounds.left : selectionBounds.top);
      const span = arrangeReference === 'canvas'
        ? (horizontal ? CANVAS_W : CANVAS_H)
        : (horizontal ? selectionBounds.width : selectionBounds.height);
      const gap = (span - totalSize) / (ordered.length - 1);
      let cursor = start;
      ordered.forEach((entry) => {
        const current = horizontal ? entry.bounds.left : entry.bounds.top;
        const delta = cursor - current;
        moveObjectBy(entry.obj, horizontal ? delta : 0, horizontal ? 0 : delta);
        cursor += (horizontal ? entry.bounds.width : entry.bounds.height) + gap;
      });
    }
  }

  objects.forEach(obj => syncClippingMasksForObject(obj));
  restoreActiveSelection(objects);
  saveHistory();
}

function bringSelectedToFront() {
  const objects = canvas.getActiveObjects().filter(obj => !isInternalEditorObject(obj));
  if (!objects.length) return;
  const order = canvas.getObjects();
  objects.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  objects.forEach(obj => canvas.bringObjectToFront(obj));
  canvas.requestRenderAll();
  saveHistory();
  updateLayersList();
}

function sendSelectedToBack() {
  const objects = canvas.getActiveObjects().filter(obj => !isInternalEditorObject(obj));
  if (!objects.length) return;
  const order = canvas.getObjects();
  objects.sort((a, b) => order.indexOf(b) - order.indexOf(a));
  objects.forEach(obj => canvas.moveObjectTo(obj, 1));
  canvas.requestRenderAll();
  saveHistory();
  updateLayersList();
}

function deleteSelected() {
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  const active = canvas.getActiveObjects();
  if (active.length === 0) return;

  // A selected child belongs to its Fabric group rather than the canvas root.
  // Remove it through the parent collection so Delete works in group-edit mode.
  if (active.length === 1 && getUserGroupAncestors(active[0]).length) {
    const child = active[0];
    const parent = child.group;
    exitGroupEditMode({ selectParent: false });
    parent.remove(child);
    canvas.discardActiveObject();

    if (parent.getObjects().length === 0) {
      const grandparent = parent.group;
      if (isUserGroup(grandparent)) grandparent.remove(parent);
      else canvas.remove(parent);
      if (grandparent && grandparent.canvas === canvas && !grandparent._clatashaLocked) canvas.setActiveObject(grandparent);
    } else if (parent.canvas === canvas && !parent._clatashaLocked) {
      canvas.setActiveObject(parent);
    }

    canvas.requestRenderAll();
    saveHistory();
    updateLayersList();
    updateObjectCount();
    return;
  }

  active.forEach(obj => { if (!isInternalEditorObject(obj)) canvas.remove(obj); });
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  saveHistory();
}

async function duplicateSelected() {
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  const active = canvas.getActiveObject();
  if (!active || active.name === '__bg__') return;
  if (getUserGroupAncestors(active).length) {
    showPerspToast('Select the parent group or ungroup before duplicating this layer');
    return;
  }
  let sources;
  if (isActiveSelectionObject(active)) {
    sources = active.getObjects().slice();
    active.removeAll();
    canvas.discardActiveObject();
    sources.forEach(obj => obj.setCoords());
  } else {
    sources = [active];
  }

  const sourceOrder = canvas.getObjects();
  sources.sort((a, b) => sourceOrder.indexOf(a) - sourceOrder.indexOf(b));

  const clones = await Promise.all(sources.map(source => source.clone()));
  const cloneBySource = new Map(sources.map((source, index) => [source, clones[index]]));
  const duplicatedClipIds = new Map();

  sources.filter(isClippingBase).forEach(sourceBase => {
    const linkedSources = sources.filter(source => isClippedLayer(source) && source._clatashaClipId === sourceBase._clatashaClipId);
    const baseClone = cloneBySource.get(sourceBase);
    if (linkedSources.length) {
      const newId = getNextClippingId();
      duplicatedClipIds.set(sourceBase._clatashaClipId, newId);
      baseClone._clatashaClipRole = 'base';
      baseClone._clatashaClipId = newId;
    } else {
      clearClippingMetadata(baseClone, false);
    }
  });

  sources.filter(isClippedLayer).forEach(sourceContent => {
    const clonedContent = cloneBySource.get(sourceContent);
    const newId = duplicatedClipIds.get(sourceContent._clatashaClipId);
    if (newId) {
      clonedContent._clatashaClipRole = 'content';
      clonedContent._clatashaClipId = newId;
    }
  });

  clones.forEach(cloned => {
    cloned.set({ left: (cloned.left || 0) + 20, top: (cloned.top || 0) + 20 });
    cloned.setCoords();
    canvas.add(cloned);
  });

  for (const source of sources.filter(isClippedLayer)) {
    const clonedContent = cloneBySource.get(source);
    const newId = duplicatedClipIds.get(source._clatashaClipId);
    const base = newId
      ? clones.find(clone => isClippingBase(clone) && clone._clatashaClipId === newId)
      : getClippingBase(source);
    if (base) clonedContent.set('clipPath', await buildClippingPath(base));
    else clearClippingMetadata(clonedContent, true);
  }
  if (clones.length > 1) canvas.setActiveObject(new ActiveSelection(clones, { canvas }));
  else canvas.setActiveObject(clones[0]);
  canvas.requestRenderAll();
  saveHistory();
  updateLayersList();
}

function newProject() {
  if (paintBrushActive) finishPaintBrush();
  if (sliceActive) setTool('select');
  if (cropActive) exitStandardCrop();
  if (perspActive) exitPerspectiveCrop();
  if (paintBucketActive) finishPaintBucket();
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  if (canvas.getObjects().filter(o => !isInternalEditorObject(o)).length > 0) {
    if (!confirm('Start a new project? Unsaved changes will be lost.')) return;
  }
  const objects = canvas.getObjects().filter(o => !isInternalEditorObject(o));
  objects.forEach(o => canvas.remove(o));
  const bg = canvas.getObjects().find(o => o.name === '__bg__');
  if (bg) bg.set('fill', '#FFFFFF');
  restoreProjectGuides(null);
  canvas.renderAll();
  resetHistory();
  saveHistory();
  updateLayersList();
  projectId = null;
}

// ===== CLATASHA CLICK CHECK =====
let clickCheckOpen = false;
let clickCheckPreviewSize = 'mobile';
let clickCheckTheme = 'dark';
let clickCheckRefreshTimer = null;
const clickCheckFilters = { blur: false, grayscale: false };
const clickCheckVariants = { A: null, B: null, C: null };

function getClickCheckCanvasObjects() {
  return canvas.getObjects().filter(obj => !isInternalEditorObject(obj));
}

function getClickCheckRootObject(obj) {
  let root = obj;
  while (root?.group && !isActiveSelectionObject(root.group)) root = root.group;
  return root;
}

function collectClickCheckTextEntries(objects, output = []) {
  objects.forEach(obj => {
    const type = String(obj.type || '').toLowerCase();
    if (obj.visible === false) return;
    if (obj._clatashaCurve !== undefined && obj._clatashaText) {
      output.push({
        obj,
        text: String(obj._clatashaText),
        bounds: getObjectBounds(obj),
        fill: obj._clatashaStyle?.fill,
        strokeWidth: Number(obj._clatashaStyle?.strokeWidth) || 0,
        shadow: obj._clatashaStyle?.shadow,
      });
      return;
    }
    if (type === 'textbox' || type === 'text' || type === 'i-text') {
      output.push({ obj, text: String(obj.text || ''), bounds: getObjectBounds(obj), fill: obj.fill, strokeWidth: Number(obj.strokeWidth) || 0, shadow: obj.shadow });
      return;
    }
    if (obj.getObjects && (isUserGroup(obj) || type === 'group')) {
      collectClickCheckTextEntries(obj.getObjects(), output);
    }
  });
  return output;
}

function getClickCheckImageSourceMetrics(obj) {
  const element = obj?.getElement?.();
  if (!element) return null;
  const elementWidth = Number(element.naturalWidth || element.videoWidth || element.width) || 0;
  const elementHeight = Number(element.naturalHeight || element.videoHeight || element.height) || 0;
  const filterScaleX = Math.max(0.0001, Number(obj._filterScalingX) || 1);
  const filterScaleY = Math.max(0.0001, Number(obj._filterScalingY) || 1);
  const cropX = Math.max(0, Number(obj.cropX) || 0) * filterScaleX;
  const cropY = Math.max(0, Number(obj.cropY) || 0) * filterScaleY;
  const logicalWidth = Math.max(1, Number(obj.width) || elementWidth / filterScaleX || 1);
  const logicalHeight = Math.max(1, Number(obj.height) || elementHeight / filterScaleY || 1);
  const sourceWidth = Math.max(0, Math.min(logicalWidth * filterScaleX, elementWidth - cropX));
  const sourceHeight = Math.max(0, Math.min(logicalHeight * filterScaleY, elementHeight - cropY));
  return { element, elementWidth, elementHeight, cropX, cropY, sourceWidth, sourceHeight, logicalWidth, logicalHeight };
}

function getClickCheckImageAlphaCoverage(source) {
  if (!source || source.sourceWidth <= 0 || source.sourceHeight <= 0) return null;
  try {
    const sampleSize = 72;
    const sample = document.createElement('canvas');
    sample.width = sampleSize;
    sample.height = sampleSize;
    const context = sample.getContext('2d', { willReadFrequently: true });
    context.clearRect(0, 0, sampleSize, sampleSize);
    context.drawImage(
      source.element,
      source.cropX, source.cropY, source.sourceWidth, source.sourceHeight,
      0, 0, sampleSize, sampleSize,
    );
    const data = context.getImageData(0, 0, sampleSize, sampleSize).data;
    let visible = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 16) visible++;
    }
    return visible / (sampleSize * sampleSize);
  } catch (_) {
    return null;
  }
}

function collectClickCheckImageEntries(objects, output = []) {
  objects.forEach(obj => {
    if (obj.visible === false || Number(obj.opacity) === 0) return;
    const type = String(obj.type || '').toLowerCase();
    if (type === 'image') {
      const source = getClickCheckImageSourceMetrics(obj);
      if (!source) return;
      const scaling = obj.getObjectScaling?.() || { x: Number(obj.scaleX) || 1, y: Number(obj.scaleY) || 1 };
      const scaleX = Math.abs(Number(scaling.x) || 1);
      const scaleY = Math.abs(Number(scaling.y) || 1);
      const displayedWidth = source.logicalWidth * scaleX;
      const displayedHeight = source.logicalHeight * scaleY;
      const availableWidth = Math.max(1, source.sourceWidth);
      const availableHeight = Math.max(1, source.sourceHeight);
      const upscaleFactor = Math.max(displayedWidth / availableWidth, displayedHeight / availableHeight);
      const stretchFactor = Math.max(scaleX / Math.max(scaleY, 0.0001), scaleY / Math.max(scaleX, 0.0001));
      const bounds = getObjectBounds(obj);
      const boundsWidth = Math.max(0, bounds.right - bounds.left);
      const boundsHeight = Math.max(0, bounds.bottom - bounds.top);
      const intersectionWidth = Math.max(0, Math.min(bounds.right, CANVAS_W) - Math.max(bounds.left, 0));
      const intersectionHeight = Math.max(0, Math.min(bounds.bottom, CANVAS_H) - Math.max(bounds.top, 0));
      const boundsArea = boundsWidth * boundsHeight;
      output.push({
        upscaleFactor,
        stretchFactor,
        displayAreaRatio: displayedWidth * displayedHeight / Math.max(1, CANVAS_W * CANVAS_H),
        visibleCanvasRatio: boundsArea > 0 ? intersectionWidth * intersectionHeight / boundsArea : 0,
        alphaCoverage: getClickCheckImageAlphaCoverage(source),
      });
      return;
    }
    if (obj.getObjects && (isUserGroup(obj) || type === 'group')) {
      collectClickCheckImageEntries(obj.getObjects(), output);
    }
  });
  return output;
}

function getClickCheckRenderedPixelMetrics() {
  const scale = Math.min(1, 240 / Math.max(1, CANVAS_W, CANVAS_H));
  const rendered = canvas.toCanvasElement(scale);
  const context = rendered.getContext('2d', { willReadFrequently: true });
  return summarizeClickCheckPixels(context.getImageData(0, 0, rendered.width, rendered.height));
}

function clickCheckBoundsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function parseClickCheckColor(value) {
  if (typeof value !== 'string') return null;
  const color = value.trim();
  let match = color.match(/^#([0-9a-f]{3})$/i);
  if (match) {
    const chars = match[1];
    return [0, 1, 2].map(index => Number.parseInt(chars[index] + chars[index], 16));
  }
  match = color.match(/^#([0-9a-f]{6})$/i);
  if (match) return [0, 2, 4].map(index => Number.parseInt(match[1].slice(index, index + 2), 16));
  match = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (match) return [Number(match[1]), Number(match[2]), Number(match[3])];
  return null;
}

function getClickCheckLuminance(rgb) {
  const values = rgb.map(value => {
    const channel = Math.max(0, Math.min(255, value)) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function getClickCheckContrast(colorA, colorB) {
  const rgbA = parseClickCheckColor(colorA);
  const rgbB = parseClickCheckColor(colorB);
  if (!rgbA || !rgbB) return null;
  const lumA = getClickCheckLuminance(rgbA);
  const lumB = getClickCheckLuminance(rgbB);
  return (Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05);
}

function getClickCheckBackgroundForText(entry, canvasObjects) {
  const root = getClickCheckRootObject(entry.obj);
  const rootIndex = canvasObjects.indexOf(root);
  if (rootIndex < 0) return null;
  for (let index = rootIndex - 1; index >= 0; index--) {
    const candidate = canvasObjects[index];
    if (candidate.visible === false) continue;
    if (!clickCheckBoundsOverlap(entry.bounds, getObjectBounds(candidate))) continue;
    return typeof candidate.fill === 'string' ? candidate.fill : null;
  }
  const background = canvas.getObjects().find(obj => obj.name === '__bg__');
  return typeof background?.fill === 'string' ? background.fill : null;
}

function analyzeClickCheck() {
  const objects = getClickCheckCanvasObjects();
  const texts = collectClickCheckTextEntries(objects);
  const images = collectClickCheckImageEntries(objects);
  const issues = [];
  let score = 100;
  const addIssue = (message, penalty, category = 'Design') => {
    issues.push({ message, category });
    score -= penalty;
  };

  if (!objects.length) addIssue('The canvas is empty. Add a subject or message before testing.', 35, 'Canvas');

  const wordCount = texts.reduce((sum, entry) => sum + entry.text.trim().split(/\s+/).filter(Boolean).length, 0);
  if (wordCount > 12) addIssue('The thumbnail contains ' + wordCount + ' words. Shorter text is usually easier to scan.', 10, 'Text');
  if (texts.length > 4) addIssue('There are ' + texts.length + ' separate text elements competing for attention.', 8, 'Text');

  const mobileScale = 168 / Math.max(1, CANVAS_W);
  const smallTexts = texts.filter(entry => entry.bounds.height * mobileScale < 8);
  if (smallTexts.length) addIssue(smallTexts.length + ' text layer' + (smallTexts.length === 1 ? ' may' : 's may') + ' be difficult to read on mobile.', Math.min(22, 10 + smallTexts.length * 3), 'Text');

  const edgeX = CANVAS_W * 0.025;
  const edgeY = CANVAS_H * 0.025;
  const edgeTexts = texts.filter(entry => entry.bounds.left < edgeX || entry.bounds.top < edgeY || entry.bounds.right > CANVAS_W - edgeX || entry.bounds.bottom > CANVAS_H - edgeY);
  if (edgeTexts.length) addIssue('Text is close to the canvas edge and may feel cramped in feeds.', 8, 'Text');

  const durationZone = { left: CANVAS_W * 0.77, top: CANVAS_H * 0.82, right: CANVAS_W, bottom: CANVAS_H };
  const durationHits = texts.filter(entry => clickCheckBoundsOverlap(entry.bounds, durationZone));
  if (durationHits.length) addIssue('The YouTube duration badge may cover part of your text.', 12, 'Text');

  let lowContrastCount = 0;
  texts.forEach(entry => {
    if (entry.strokeWidth >= 2 || entry.shadow) return;
    const backgroundColor = getClickCheckBackgroundForText(entry, objects);
    const contrast = getClickCheckContrast(entry.fill, backgroundColor);
    if (contrast !== null && contrast < 2.6) lowContrastCount++;
  });
  if (lowContrastCount) addIssue(lowContrastCount + ' text layer' + (lowContrastCount === 1 ? ' has' : 's have') + ' weak contrast against the layer beneath it.', Math.min(18, 9 + lowContrastCount * 3), 'Text');

  const visibleLayerCount = countDesignLayers(objects);
  if (visibleLayerCount > 18) addIssue('The design has ' + visibleLayerCount + ' visible layers. Check that the main subject still stands out.', 7, 'Layers');

  getClickCheckImageLayerWarnings(images).forEach(issue => addIssue(issue.message, issue.penalty, issue.category));
  if (images.length) {
    try {
      const pixelMetrics = getClickCheckRenderedPixelMetrics();
      getClickCheckCanvasWarnings(pixelMetrics, true).forEach(issue => addIssue(issue.message, issue.penalty, issue.category));
    } catch (error) {
      console.warn('Click Check image analysis skipped:', error);
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { score, issues, imageCount: images.length, textCount: texts.length };
}

function updateClickCheckResults() {
  const result = analyzeClickCheck();
  const score = document.getElementById('clickCheckScore');
  const label = document.getElementById('clickCheckScoreLabel');
  const issues = document.getElementById('clickCheckIssues');
  const scanSummary = document.getElementById('clickCheckScanSummary');
  if (!score || !label || !issues || !scanSummary) return;

  score.textContent = result.score;
  score.style.setProperty('--score-color', result.score >= 85 ? 'var(--success)' : result.score >= 70 ? 'var(--warning)' : 'var(--danger)');
  label.textContent = result.score >= 85 ? 'Strong at small sizes' : result.score >= 70 ? 'Review the suggestions' : 'Needs another pass';
  const imageSummary = result.imageCount
    ? result.imageCount + ' image layer' + (result.imageCount === 1 ? '' : 's') + ' scanned'
    : 'No image layers found';
  const textSummary = result.textCount
    ? result.textCount + ' text layer' + (result.textCount === 1 ? '' : 's') + ' scanned'
    : 'no editable text layers found';
  scanSummary.textContent = imageSummary + ' · ' + textSummary + '.';
  issues.innerHTML = result.issues.length
    ? result.issues.map(issue => '<div class="click-check-issue warning"><span>!</span><span class="click-check-issue-copy"><strong>' + escapeHtml(issue.category) + '</strong><span>' + escapeHtml(issue.message) + '</span></span></div>').join('')
    : '<div class="click-check-issue good"><span>&#10003;</span><span>No obvious text or image problems were found.</span></div>';
}

function renderClickCheckCanvas(multiplier = null) {
  const scale = multiplier ?? Math.min(1, 480 / Math.max(1, CANVAS_W));
  return canvas.toDataURL({ format: 'png', multiplier: scale, enableRetinaScaling: false });
}

function updateClickCheckPreview() {
  if (!clickCheckOpen) return;
  try {
    const preview = document.getElementById('clickCheckPreviewImage');
    preview.src = renderClickCheckCanvas();
    updateClickCheckResults();
  } catch (error) {
    console.error('Click Check preview failed:', error);
    showPerspToast('Click Check could not preview this canvas');
  }
}

function scheduleClickCheckRefresh() {
  if (!clickCheckOpen) return;
  clearTimeout(clickCheckRefreshTimer);
  clickCheckRefreshTimer = setTimeout(updateClickCheckPreview, 120);
}

function setClickCheckOpen(shouldOpen) {
  clickCheckOpen = !!shouldOpen;
  const drawer = document.getElementById('clickCheckDrawer');
  const button = document.getElementById('clickCheckBtn');
  drawer.classList.toggle('open', clickCheckOpen);
  drawer.setAttribute('aria-hidden', clickCheckOpen ? 'false' : 'true');
  button.classList.toggle('active', clickCheckOpen);
  if (clickCheckOpen) updateClickCheckPreview();
}

function toggleClickCheck() {
  setClickCheckOpen(!clickCheckOpen);
}

function applyClickCheckPreviewMode() {
  const preview = document.getElementById('youtubePreview');
  preview.classList.toggle('mobile', clickCheckPreviewSize === 'mobile');
  preview.classList.toggle('desktop', clickCheckPreviewSize === 'desktop');
  preview.classList.toggle('dark', clickCheckTheme === 'dark');
  preview.classList.toggle('light', clickCheckTheme === 'light');
  document.querySelectorAll('[data-check-size]').forEach(button => button.classList.toggle('active', button.dataset.checkSize === clickCheckPreviewSize));
  document.querySelectorAll('[data-check-theme]').forEach(button => button.classList.toggle('active', button.dataset.checkTheme === clickCheckTheme));
}

function updateClickCheckFilterClasses() {
  const image = document.getElementById('clickCheckPreviewImage');
  image.classList.toggle('test-blur', clickCheckFilters.blur);
  image.classList.toggle('test-grayscale', clickCheckFilters.grayscale);
  document.querySelectorAll('[data-check-filter]').forEach(button => button.classList.toggle('active', !!clickCheckFilters[button.dataset.checkFilter]));
}

function updateClickCheckVariantUI(letter) {
  const button = document.querySelector('[data-check-variant="' + letter + '"]');
  const variant = clickCheckVariants[letter];
  if (!button) return;
  button.classList.toggle('captured', !!variant);
  button.title = variant ? 'Replace variation ' + letter : 'Capture current canvas as variation ' + letter;
  button.innerHTML = '<span class="variant-letter">' + letter + '</span>' +
    (variant ? '<img src="' + variant.preview + '" alt="Variation ' + letter + '">' : '<span class="variant-preview">Capture</span>');
  document.getElementById('clickCheckExportAll').disabled = !Object.values(clickCheckVariants).some(Boolean);
}

function captureClickCheckVariant(letter) {
  try {
    clickCheckVariants[letter] = {
      full: renderClickCheckCanvas(1),
      preview: renderClickCheckCanvas(),
      width: CANVAS_W,
      height: CANVAS_H,
      capturedAt: Date.now(),
    };
    updateClickCheckVariantUI(letter);
    showPerspToast('Variation ' + letter + ' captured');
  } catch (error) {
    console.error('Unable to capture Click Check variation:', error);
    showPerspToast('Variation could not be captured');
  }
}

function downloadClickCheckDataURL(dataURL, fileName) {
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function exportClickCheckVariants() {
  const captured = Object.entries(clickCheckVariants).filter(([, variant]) => !!variant);
  if (!captured.length) return;
  captured.forEach(([letter, variant], index) => {
    setTimeout(() => {
      downloadClickCheckDataURL(variant.full, 'clatasha-variation-' + letter.toLowerCase() + '-' + variant.width + 'x' + variant.height + '.png');
    }, index * 180);
  });
  showPerspToast(captured.length + ' variation' + (captured.length === 1 ? '' : 's') + ' ready to download');
}

function setupClickCheck() {
  document.getElementById('clickCheckBtn').addEventListener('click', toggleClickCheck);
  document.getElementById('clickCheckClose').addEventListener('click', () => setClickCheckOpen(false));
  document.getElementById('clickCheckRefresh').addEventListener('click', updateClickCheckPreview);
  document.querySelectorAll('[data-check-size]').forEach(button => button.addEventListener('click', () => {
    clickCheckPreviewSize = button.dataset.checkSize;
    applyClickCheckPreviewMode();
  }));
  document.querySelectorAll('[data-check-theme]').forEach(button => button.addEventListener('click', () => {
    clickCheckTheme = button.dataset.checkTheme;
    applyClickCheckPreviewMode();
  }));
  document.querySelectorAll('[data-check-filter]').forEach(button => button.addEventListener('click', () => {
    const filter = button.dataset.checkFilter;
    clickCheckFilters[filter] = !clickCheckFilters[filter];
    updateClickCheckFilterClasses();
  }));
  document.getElementById('clickCheckDuration').addEventListener('input', event => {
    const value = event.target.value.replace(/[^0-9:]/g, '').slice(0, 8) || '0:00';
    document.getElementById('clickCheckDurationBadge').textContent = value;
  });
  document.querySelectorAll('[data-check-variant]').forEach(button => button.addEventListener('click', () => captureClickCheckVariant(button.dataset.checkVariant)));
  document.getElementById('clickCheckExportAll').addEventListener('click', exportClickCheckVariants);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && clickCheckOpen) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setClickCheckOpen(false);
    }
  });
  applyClickCheckPreviewMode();
  updateClickCheckFilterClasses();
}

// ===== IMAGE EXPORT =====
let selectedExportFormat = 'png';
let transparentExportPreference = false;

function showExportModal() {
  if (paintBrushActive) finishPaintBrush();
  if (cutoutBrushActive) {
    finishCutoutBrush();
    setTool('select');
  }
  if (healingBrushActive) {
    finishHealingBrush();
    setTool('select');
  }
  closeMenus();
  document.getElementById('exportDimensions').textContent = `${CANVAS_W} × ${CANVAS_H} pixels`;
  document.getElementById('exportModalOverlay').style.display = 'flex';
  updateExportOptionsUI();
}

function closeExportModal() {
  document.getElementById('exportModalOverlay').style.display = 'none';
}

function updateExportOptionsUI() {
  const isPng = selectedExportFormat === 'png';
  const isJpeg = selectedExportFormat === 'jpeg';
  const quality = document.getElementById('exportQuality');
  const qualityValue = document.getElementById('exportQualityValue');
  const qualityNote = document.getElementById('exportQualityNote');
  const transparent = document.getElementById('exportTransparent');
  const transparentRow = document.getElementById('exportTransparentRow');
  const transparentNote = transparentRow.querySelector('small');

  document.querySelectorAll('[data-export-format]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.exportFormat === selectedExportFormat);
  });

  quality.disabled = isPng;
  qualityValue.textContent = isPng ? 'Lossless' : `${quality.value}%`;
  qualityNote.textContent = isPng
    ? 'PNG uses lossless quality.'
    : 'Higher quality creates a larger file.';

  if (isJpeg) {
    transparent.checked = false;
    transparent.disabled = true;
    transparentRow.classList.add('disabled');
    transparentNote.textContent = 'JPG does not support transparent backgrounds';
  } else {
    transparent.disabled = false;
    transparent.checked = transparentExportPreference;
    transparentRow.classList.remove('disabled');
    transparentNote.textContent = 'Hide the canvas background in the exported file';
  }

  const label = selectedExportFormat === 'jpeg' ? 'JPG' : selectedExportFormat.toUpperCase();
  document.getElementById('exportConfirm').textContent = `Export ${label}`;
}

function setupExportOptions() {
  const overlay = document.getElementById('exportModalOverlay');
  const quality = document.getElementById('exportQuality');
  const transparent = document.getElementById('exportTransparent');

  document.querySelectorAll('[data-export-format]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (selectedExportFormat !== 'jpeg') transparentExportPreference = transparent.checked;
      selectedExportFormat = btn.dataset.exportFormat;
      updateExportOptionsUI();
    });
  });
  quality.addEventListener('input', () => {
    if (selectedExportFormat !== 'png') {
      document.getElementById('exportQualityValue').textContent = `${quality.value}%`;
    }
  });
  transparent.addEventListener('change', () => {
    if (selectedExportFormat !== 'jpeg') transparentExportPreference = transparent.checked;
  });
  document.getElementById('exportModalClose').addEventListener('click', closeExportModal);
  document.getElementById('exportCancel').addEventListener('click', closeExportModal);
  document.getElementById('exportConfirm').addEventListener('click', exportImageWithOptions);
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) closeExportModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.style.display !== 'none') {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeExportModal();
    }
  });
  updateExportOptionsUI();
}

function exportImageWithOptions() {
  if (sliceActive) setTool('select');
  if (cropActive) exitStandardCrop();
  if (perspActive) exitPerspectiveCrop();
  if (paintBucketActive) finishPaintBucket();
  if (bgRemovalActive) finishBgRemoval();

  const format = selectedExportFormat;
  const extension = format === 'jpeg' ? 'jpg' : format;
  const quality = format === 'png'
    ? 1
    : Math.max(0.1, Math.min(1, Number(document.getElementById('exportQuality').value) / 100));
  const useTransparency = format !== 'jpeg' && document.getElementById('exportTransparent').checked;
  const background = canvas.getObjects().find(obj => obj.name === '__bg__');
  const previousBackgroundVisibility = background ? background.visible : null;
  const previousCanvasBackground = canvas.backgroundColor;
  const previousSelection = canvas.getActiveObject();
  let dataURL;

  try {
    canvas.discardActiveObject();
    if (useTransparency) {
      if (background) background.set('visible', false);
      canvas.backgroundColor = 'rgba(0,0,0,0)';
    }
    canvas.renderAll();
    dataURL = canvas.toDataURL({ format, quality, multiplier: 1 });
  } catch (error) {
    console.error('Image export failed:', error);
    showPerspToast('The image could not be exported');
    return;
  } finally {
    if (background && previousBackgroundVisibility !== null) background.set('visible', previousBackgroundVisibility);
    canvas.backgroundColor = previousCanvasBackground;
    if (previousSelection && previousSelection.canvas === canvas && previousSelection.selectable !== false) {
      if (getUserGroupAncestors(previousSelection).length) selectChildInsideGroup(previousSelection);
      else canvas.setActiveObject(previousSelection);
    }
    canvas.renderAll();
  }

  const link = document.createElement('a');
  link.download = `clatasha-${CANVAS_W}x${CANVAS_H}-${Date.now()}.${extension}`;
  link.href = dataURL;
  document.body.appendChild(link);
  link.click();
  link.remove();
  closeExportModal();
}

// ===== .CLATASHA FILE FORMAT =====
function saveAsClatasha() {
  if (paintBrushActive) finishPaintBrush();
  if (sliceActive) setTool('select');
  if (cropActive) exitStandardCrop();
  if (perspActive) exitPerspectiveCrop();
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  // Deselect to avoid saving selection state
  canvas.discardActiveObject();
  canvas.requestRenderAll();

  // Serialize canvas objects (include custom props)
  const canvasJSON = normalizeSerializedGroupInteractions(canvas.toJSON(CLATASHA_OBJECT_PROPERTIES));

  // Build the .clatasha file structure
  const clatashaData = {
    version: '1.2',
    app: 'Clatasha Studio',
    createdAt: new Date().toISOString(),
    canvas: {
      width: CANVAS_W,
      height: CANVAS_H,
    },
    customFontsUsed: customFonts.map(f => f.name),
    guides: {
      horizontal: [...userGuides.horizontal],
      vertical: [...userGuides.vertical],
    },
    // Store the full Fabric.js serialization so loadFromJSON restores it directly
    fabricCanvas: canvasJSON,
  };

  // Convert to JSON string and create blob (no pretty-print to save space with embedded images)
  const jsonStr = JSON.stringify(clatashaData);
  const blob = new Blob([jsonStr], { type: 'application/json' });

  // Trigger download
  const link = document.createElement('a');
  link.download = 'project.clatasha';
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function importClatasha() {
  if (paintBrushActive) finishPaintBrush();
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  document.getElementById('clatashaInput').click();
}

async function loadClatashaFromFile(file) {
  if (paintBrushActive) finishPaintBrush();
  if (sliceActive) setTool('select');
  if (cropActive) exitStandardCrop();
  if (perspActive) exitPerspectiveCrop();
  if (paintBucketActive) finishPaintBucket();
  if (bgRemovalActive) finishBgRemoval();
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  try {
    exitGroupEditMode({ selectParent: false });
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate file format
    if (!data.version || !data.canvas || !data.fabricCanvas) {
      alert('Invalid .clatasha file.');
      return;
    }

    // Check if canvas has content
    const hasContent = canvas.getObjects().filter(o => !isInternalEditorObject(o)).length > 0;
    if (hasContent) {
      if (!confirm('Importing will replace your current project. Continue?')) return;
    }

    // Restore canvas dimensions first
    const newW = data.canvas.width || 1920;
    const newH = data.canvas.height || 1080;
    if (newW !== CANVAS_W || newH !== CANVAS_H) {
      // Resize the physical canvas and bg rect (skip resizeCanvas's history save)
      const bg = canvas.getObjects().find(o => o.name === '__bg__');
      if (bg) { bg.set({ width: newW, height: newH }); bg.setCoords(); }
      canvas.setDimensions({ width: newW, height: newH });
      CANVAS_W = newW;
      CANVAS_H = newH;
      document.querySelector('.canvas-info span').textContent = newW + ' \u00D7 ' + newH;
      document.getElementById('sizeThumbCheck').textContent = (newW === 1920 && newH === 1080) ? '\u2713' : '';
      document.getElementById('sizeShortsCheck').textContent = (newW === 1080 && newH === 1920) ? '\u2713' : '';
    }

    // loadFromJSON replaces ALL canvas objects, restoring the full saved state
    // Collect locked indices from fabricCanvas JSON before Fabric processes it
    let importLockedIdx = [];
    try {
      const fc = typeof data.fabricCanvas === 'string' ? JSON.parse(data.fabricCanvas) : data.fabricCanvas;
      if (fc && fc.objects) {
        fc.objects.forEach((o, i) => { if (o._clatashaLocked) importLockedIdx.push(i); });
      }
    } catch(e) {}
    restoringClippingState = true;
    await canvas.loadFromJSON(data.fabricCanvas);
    attachTextEditingHosts();
    restoreLockStates(null, importLockedIdx);
    await restoreClippingMasksFromLinks();
    restoringClippingState = false;
    restoreProjectGuides(data.guides);
    normalizeLegacyTextboxes();
    canvas.renderAll();

    // Reset history and UI
    resetHistory();
    saveHistory();
    updateLayersList();
    updateObjectCount();
    setTimeout(() => zoomToFit(), 50);

    // Auto-save to IndexedDB so it appears in Recent Projects
    const importName = file.name.replace(/\.clatasha$/, '') || 'Imported Project';
 const savedId = await saveProject(importName);
    projectId = savedId;

    // Notify about custom fonts if any were used
    if (data.customFontsUsed && data.customFontsUsed.length > 0) {
      const missing = data.customFontsUsed.filter(name =>
        !customFonts.some(f => f.name === name)
      );
      if (missing.length > 0) {
        alert('This project uses custom font(s):\n' + missing.join(', ') +
          '\n\nPlease upload these fonts to restore the exact appearance.');
      }
    }

  } catch (e) {
    restoringClippingState = false;
    console.error('Failed to load .clatasha file:', e);
    alert('Failed to load project file. The file may be corrupted.');
  }
}

// ===== CANVAS SIZE =====
function resizeCanvas(newW, newH) {
  if (paintBrushActive) finishPaintBrush();
  if (newW === CANVAS_W && newH === CANVAS_H) return;

  // Resize background rect
  const bg = canvas.getObjects().find(o => o.name === '__bg__');
  if (bg) {
    bg.set({ width: newW, height: newH });
    bg.setCoords();
  }

  // Resize canvas
  canvas.setDimensions({ width: newW, height: newH });
  CANVAS_W = newW;
  CANVAS_H = newH;
  restoreProjectGuides(userGuides);

  // Update canvas info display
  document.querySelector('.canvas-info span').textContent = newW + ' \u00D7 ' + newH;

  // Update menu checks
  document.getElementById('sizeThumbCheck').textContent = (newW === 1920 && newH === 1080) ? '\u2713' : '';
  document.getElementById('sizeShortsCheck').textContent = (newW === 1080 && newH === 1920) ? '\u2713' : '';

  canvas.renderAll();
  scheduleRulerDraw();
  setTimeout(() => zoomToFit(), 50);
  saveHistory();
}

// ===== INDEXEDDB (SAVE/LOAD) =====
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ClatashaStudio', 2);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('projects')) {
        const store = db.createObjectStore('projects', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('templates')) {
        const store = db.createObjectStore('templates', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
        store.createIndex('category', 'category');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putUserTemplate(template) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('templates', 'readwrite');
    tx.objectStore('templates').put(template);
    tx.oncomplete = () => resolve(template);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllUserTemplates() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('templates', 'readonly');
    const req = tx.objectStore('templates').getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.updatedAt - a.updatedAt));
    req.onerror = () => reject(req.error);
  });
}

async function deleteUserTemplate(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('templates', 'readwrite');
    tx.objectStore('templates').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function saveProject(name) {
  if (paintBrushActive) finishPaintBrush();
  if (sliceActive) setTool('select');
  if (cropActive) exitStandardCrop();
  if (perspActive) exitPerspectiveCrop();
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  const db = await openDB();
  const json = JSON.stringify(normalizeSerializedGroupInteractions(canvas.toJSON(CLATASHA_OBJECT_PROPERTIES)));
  // Collect locked object indices SEPARATELY from Fabric serialization
  // (Fabric.js may drop _clatashaLocked during toJSON/loadFromJSON)
  const lockedIdx = [];
  canvas.forEachObject((obj, i) => { if (obj._clatashaLocked) lockedIdx.push(i); });
  const id = projectId || ('proj_' + Date.now());
  const project = {
    id,
    name: name || 'Untitled',
    data: json,
    lockedIndices: lockedIdx,
    guides: {
      horizontal: [...userGuides.horizontal],
      vertical: [...userGuides.vertical],
    },
    updatedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put(project);
    tx.oncomplete = () => { projectId = id; resolve(id); };
    tx.onerror = () => reject(tx.error);
  });
}

async function loadProject(id) {
  if (paintBrushActive) finishPaintBrush();
  if (sliceActive) setTool('select');
  if (cropActive) exitStandardCrop();
  if (perspActive) exitPerspectiveCrop();
  if (paintBucketActive) finishPaintBucket();
  if (bgRemovalActive) finishBgRemoval();
  if (cutoutBrushActive) finishCutoutBrush();
  if (healingBrushActive) finishHealingBrush();
  exitGroupEditMode({ selectParent: false });
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readonly');
    const req = tx.objectStore('projects').get(id);
    req.onsuccess = () => {
      if (!req.result) { reject('Project not found'); return; }
      projectId = id;
      const lockedIdx = req.result.lockedIndices || [];
      restoringClippingState = true;
      canvas.loadFromJSON(req.result.data).then(async () => {
        attachTextEditingHosts();
        restoreLockStates(null, lockedIdx);
        await restoreClippingMasksFromLinks();
        restoringClippingState = false;
        restoreProjectGuides(req.result.guides);
        normalizeLegacyTextboxes();
        canvas.renderAll();
        resetHistory();
        saveHistory();
        updateLayersList();
        updateObjectCount();
        resolve(req.result);
      }).catch(error => {
        restoringClippingState = false;
        reject(error);
      });
    };
    req.onerror = () => reject(req.error);
  });
}

async function getAllProjects() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readonly');
    const req = tx.objectStore('projects').getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.updatedAt - a.updatedAt));
    req.onerror = () => reject(req.error);
  });
}

async function deleteProject(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ===== MODALS =====
function showSaveModal() {
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  const confirmBtn = document.getElementById('modalConfirm');

  title.textContent = 'Save Project';
  body.innerHTML = '<input type="text" id="projectNameInput" placeholder="Project name..." autofocus>';;
  confirmBtn.textContent = 'Save';

  const input = document.getElementById('projectNameInput');
  if (projectId) {
    // Get current name
    getAllProjects().then(projects => {
      const current = projects.find(p => p.id === projectId);
      if (current) input.value = current.name;
    });
  }

  overlay.style.display = 'flex';
  setTimeout(() => input.focus(), 100);

  confirmBtn.onclick = async () => {
    const name = input.value.trim() || 'Untitled';
    await saveProject(name);
    overlay.style.display = 'none';
  };
}

async function showLoadModal() {
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  const confirmBtn = document.getElementById('modalConfirm');

  title.textContent = 'Open Project';
  confirmBtn.style.display = 'none';

  const projects = await getAllProjects();
  if (projects.length === 0) {
    body.innerHTML = '<div class="empty-state">No saved projects yet</div>';
  } else {
    body.innerHTML = '<div class="saved-list">' + projects.map(p => {
      const date = new Date(p.updatedAt).toLocaleDateString() + ' ' + new Date(p.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `<div class="saved-item" data-id="${p.id}"><div><div class="saved-name">${p.name}</div><div class="saved-date">${date}</div></div><button class="saved-delete" data-del="${p.id}">&times;</button></div>`;
    }).join('') + '</div>';

    body.querySelectorAll('.saved-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        if (e.target.closest('.saved-delete')) return;
        const id = item.dataset.id;
        await loadProject(id);
        overlay.style.display = 'none';
      });
    });

    body.querySelectorAll('.saved-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteProject(btn.dataset.del);
        showLoadModal(); // Refresh
      });
    });
  }

  overlay.style.display = 'flex';
  confirmBtn.onclick = () => { overlay.style.display = 'none'; confirmBtn.style.display = ''; };
  document.getElementById('modalCancel').onclick = () => { overlay.style.display = 'none'; confirmBtn.style.display = ''; };
}

// ===== MOUSE UP GLOBAL (for panning) =====
document.addEventListener('mouseup', () => {
  resetSnapDragState();
  hideSnapLines();
  if (isPanning) {
    isPanning = false;
    canvas.selection = true;
  }
});

// ===== RULERS & GUIDES =====
const RULER_SIZE = 22;
const GUIDE_PREFS_KEY = 'clatashaGuidePreferences';
const SNAP_PREFERENCE_VERSION = 2;
let rulerDrawFrame = 0;
let activeGuideDrag = null;

function setupRulersAndGuides() {
  loadGuidePreferences();

  const horizontalRuler = document.getElementById('rulerHorizontal');
  const verticalRuler = document.getElementById('rulerVertical');
  horizontalRuler.addEventListener('pointerdown', (e) => startGuideFromRuler(e, 'horizontal'));
  verticalRuler.addEventListener('pointerdown', (e) => startGuideFromRuler(e, 'vertical'));

  const guideTip = document.createElement('div');
  guideTip.id = 'guidePositionTip';
  guideTip.className = 'guide-position-tip';
  document.body.appendChild(guideTip);

  window.addEventListener('resize', scheduleRulerDraw);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(scheduleRulerDraw);
    observer.observe(document.getElementById('canvasArea'));
  }
  document.getElementById('canvasWrapper').addEventListener('transitionend', scheduleRulerDraw);

  updateRulerVisibility();
  drawCenterGuides();
  renderMovableGuides();
  updateViewMenuChecks();
  scheduleRulerDraw();
}

function loadGuidePreferences() {
  try {
    const prefs = JSON.parse(localStorage.getItem(GUIDE_PREFS_KEY) || '{}');
    if (typeof prefs.showRulers === 'boolean') showRulers = prefs.showRulers;
    if (typeof prefs.showGuides === 'boolean') showGuides = prefs.showGuides;
    // Version 2 changes snapping to opt-in. Older saved preferences came from
    // builds where snapping started enabled, so migrate them to the new default.
    if (prefs.snapPreferenceVersion === SNAP_PREFERENCE_VERSION) {
      snapEnabled = prefs.snapEnabled === true;
    } else {
      snapEnabled = false;
      saveGuidePreferences();
    }
  } catch (e) {}
}

function saveGuidePreferences() {
  try {
    localStorage.setItem(GUIDE_PREFS_KEY, JSON.stringify({
      showRulers,
      showGuides,
      snapEnabled,
      snapPreferenceVersion: SNAP_PREFERENCE_VERSION,
    }));
  } catch (e) {}
}

function startGuideFromRuler(e, orientation) {
  if (!showRulers || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();

  const list = userGuides[orientation];
  const position = Math.round(getGuidePositionFromPointer(e, orientation));
  list.push(position);
  renderMovableGuides();
  const guide = document.querySelector(`.user-guide[data-orientation="${orientation}"][data-index="${list.length - 1}"]`);
  beginGuideDrag(e, orientation, list.length - 1, guide, true);
}

function getGuidePositionFromPointer(e, orientation) {
  const rect = document.getElementById('canvasWrapper').getBoundingClientRect();
  if (orientation === 'vertical') {
    return (e.clientX - rect.left) * CANVAS_W / Math.max(rect.width, 1);
  }
  return (e.clientY - rect.top) * CANVAS_H / Math.max(rect.height, 1);
}

function beginGuideDrag(e, orientation, index, guide, isNewGuide = false) {
  if (e.button !== 0 || !guide) return;
  e.preventDefault();
  e.stopPropagation();
  activeGuideDrag = { orientation, index, guide, isNewGuide };
  guide.classList.add('is-dragging');
  document.addEventListener('pointermove', moveActiveGuide, true);
  document.addEventListener('pointerup', finishActiveGuide, true);
  moveActiveGuide(e);
}

function moveActiveGuide(e) {
  if (!activeGuideDrag) return;
  const { orientation, index, guide } = activeGuideDrag;
  const position = Math.round(getGuidePositionFromPointer(e, orientation));
  userGuides[orientation][index] = position;
  if (orientation === 'vertical') guide.style.left = position + 'px';
  else guide.style.top = position + 'px';
  showGuidePositionTip(e, orientation, position);
}

function finishActiveGuide(e) {
  if (!activeGuideDrag) return;
  const { orientation, index, guide } = activeGuideDrag;
  const limit = orientation === 'vertical' ? CANVAS_W : CANVAS_H;
  const position = userGuides[orientation][index];

  guide.classList.remove('is-dragging');
  if (position < 0 || position > limit) {
    userGuides[orientation].splice(index, 1);
  } else {
    userGuides[orientation][index] = Math.round(Math.max(0, Math.min(limit, position)));
  }

  activeGuideDrag = null;
  document.removeEventListener('pointermove', moveActiveGuide, true);
  document.removeEventListener('pointerup', finishActiveGuide, true);
  hideGuidePositionTip();
  renderMovableGuides();
  updateViewMenuChecks();
}

function showGuidePositionTip(e, orientation, position) {
  const tip = document.getElementById('guidePositionTip');
  if (!tip) return;
  tip.textContent = (orientation === 'vertical' ? 'X ' : 'Y ') + position + ' px';
  tip.style.left = Math.min(window.innerWidth - 72, e.clientX + 12) + 'px';
  tip.style.top = Math.min(window.innerHeight - 28, e.clientY + 12) + 'px';
  tip.style.display = 'block';
}

function hideGuidePositionTip() {
  const tip = document.getElementById('guidePositionTip');
  if (tip) tip.style.display = 'none';
}

function renderMovableGuides() {
  document.querySelectorAll('.user-guide').forEach(el => el.remove());
  if (!showGuides) return;
  const wrapper = document.getElementById('canvasWrapper');

  ['horizontal', 'vertical'].forEach(orientation => {
    userGuides[orientation].forEach((position, index) => {
      const guide = document.createElement('div');
      guide.className = 'user-guide user-guide-' + (orientation === 'vertical' ? 'v' : 'h');
      guide.dataset.orientation = orientation;
      guide.dataset.index = index;
      guide.title = (orientation === 'vertical' ? 'X: ' : 'Y: ') + Math.round(position) + ' px · Double-click to remove';
      if (orientation === 'vertical') guide.style.left = position + 'px';
      else guide.style.top = position + 'px';
      guide.addEventListener('pointerdown', e => beginGuideDrag(e, orientation, index, guide));
      guide.addEventListener('dblclick', e => {
        e.preventDefault();
        e.stopPropagation();
        removeMovableGuide(orientation, index);
      });
      guide.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        removeMovableGuide(orientation, index);
      });
      wrapper.appendChild(guide);
    });
  });
}

function removeMovableGuide(orientation, index) {
  userGuides[orientation].splice(index, 1);
  renderMovableGuides();
  updateViewMenuChecks();
}

function clearMovableGuides() {
  userGuides = { horizontal: [], vertical: [] };
  renderMovableGuides();
  updateViewMenuChecks();
}

function restoreProjectGuides(guides) {
  const horizontal = Array.isArray(guides?.horizontal) ? guides.horizontal : [];
  const vertical = Array.isArray(guides?.vertical) ? guides.vertical : [];
  userGuides = {
    horizontal: horizontal.filter(Number.isFinite).map(v => Math.round(Math.max(0, Math.min(CANVAS_H, v)))),
    vertical: vertical.filter(Number.isFinite).map(v => Math.round(Math.max(0, Math.min(CANVAS_W, v)))),
  };
  renderMovableGuides();
}

function drawCenterGuides() {
  // Remove old guides
  document.querySelectorAll('.center-guide').forEach(el => el.remove());
  if (!showGuides) return;
  const wrapper = document.getElementById('canvasWrapper');
  const guideH = document.createElement('div');
  guideH.className = 'center-guide center-guide-h';
  wrapper.appendChild(guideH);
  const guideV = document.createElement('div');
  guideV.className = 'center-guide center-guide-v';
  wrapper.appendChild(guideV);
}

function toggleRulers() {
  showRulers = !showRulers;
  updateRulerVisibility();
  updateViewMenuChecks();
  saveGuidePreferences();
}

function toggleGuides() {
  showGuides = !showGuides;
  drawCenterGuides();
  renderMovableGuides();
  updateViewMenuChecks();
  saveGuidePreferences();
}

function toggleSnap() {
  snapEnabled = !snapEnabled;
  resetSnapDragState();
  hideSnapLines();
  updateViewMenuChecks();
  saveGuidePreferences();
}

function updateRulerVisibility() {
  const display = showRulers ? 'block' : 'none';
  document.getElementById('rulerHorizontal').style.display = display;
  document.getElementById('rulerVertical').style.display = display;
  document.getElementById('rulerCorner').style.display = display;
  if (showRulers) scheduleRulerDraw();
}

function updateViewMenuChecks() {
  const rulersCheck = document.getElementById('rulersShortcut');
  if (rulersCheck) rulersCheck.innerHTML = showRulers ? '&#10003;' : '';
  document.getElementById('guidesShortcut').innerHTML = showGuides ? '&#10003;' : '';
  document.getElementById('snapShortcut').innerHTML = snapEnabled ? '&#10003;' : '';
  const clearButton = document.getElementById('menuClearGuides');
  if (clearButton) clearButton.disabled = userGuides.horizontal.length + userGuides.vertical.length === 0;
}

function scheduleRulerDraw() {
  if (!showRulers || rulerDrawFrame) return;
  rulerDrawFrame = requestAnimationFrame(() => {
    rulerDrawFrame = 0;
    drawRulers();
  });
}

function chooseRulerStep(scale) {
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000];
  return steps.find(step => step * scale >= 70) || 5000;
}

function prepareRulerCanvas(element) {
  const width = Math.max(1, element.clientWidth);
  const height = Math.max(1, element.clientHeight);
  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (element.width !== pixelWidth || element.height !== pixelHeight) {
    element.width = pixelWidth;
    element.height = pixelHeight;
  }
  const ctx = element.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(17, 17, 17, 0.97)';
  ctx.fillRect(0, 0, width, height);
  return { ctx, width, height };
}

function drawRulers() {
  if (!showRulers) return;
  const wrapperRect = document.getElementById('canvasWrapper').getBoundingClientRect();
  if (!wrapperRect.width || !wrapperRect.height) return;

  const horizontal = document.getElementById('rulerHorizontal');
  const vertical = document.getElementById('rulerVertical');
  const hRect = horizontal.getBoundingClientRect();
  const vRect = vertical.getBoundingClientRect();
  const h = prepareRulerCanvas(horizontal);
  const v = prepareRulerCanvas(vertical);
  const scaleX = wrapperRect.width / CANVAS_W;
  const scaleY = wrapperRect.height / CANVAS_H;
  const majorStep = chooseRulerStep(Math.min(scaleX, scaleY));
  const minorStep = majorStep / 5;

  h.ctx.strokeStyle = '#777777';
  h.ctx.fillStyle = '#b5b5b5';
  h.ctx.lineWidth = 1;
  h.ctx.font = '9px Segoe UI, sans-serif';
  h.ctx.textAlign = 'left';
  h.ctx.textBaseline = 'top';
  const visibleXStart = Math.max(0, (hRect.left - wrapperRect.left) / scaleX);
  const visibleXEnd = Math.min(CANVAS_W, (hRect.right - wrapperRect.left) / scaleX);
  for (let value = Math.floor(visibleXStart / minorStep) * minorStep; value <= visibleXEnd; value += minorStep) {
    if (value < 0) continue;
    const x = wrapperRect.left - hRect.left + value * scaleX;
    const isMajor = Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.001;
    h.ctx.beginPath();
    h.ctx.moveTo(Math.round(x) + 0.5, h.height);
    h.ctx.lineTo(Math.round(x) + 0.5, h.height - (isMajor ? 9 : 5));
    h.ctx.stroke();
    if (isMajor) h.ctx.fillText(String(Math.round(value)), x + 3, 2);
  }

  v.ctx.strokeStyle = '#777777';
  v.ctx.fillStyle = '#b5b5b5';
  v.ctx.lineWidth = 1;
  v.ctx.font = '9px Segoe UI, sans-serif';
  v.ctx.textAlign = 'left';
  v.ctx.textBaseline = 'top';
  const visibleYStart = Math.max(0, (vRect.top - wrapperRect.top) / scaleY);
  const visibleYEnd = Math.min(CANVAS_H, (vRect.bottom - wrapperRect.top) / scaleY);
  for (let value = Math.floor(visibleYStart / minorStep) * minorStep; value <= visibleYEnd; value += minorStep) {
    if (value < 0) continue;
    const y = wrapperRect.top - vRect.top + value * scaleY;
    const isMajor = Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.001;
    v.ctx.beginPath();
    v.ctx.moveTo(v.width, Math.round(y) + 0.5);
    v.ctx.lineTo(v.width - (isMajor ? 9 : 5), Math.round(y) + 0.5);
    v.ctx.stroke();
    if (isMajor) {
      v.ctx.save();
      v.ctx.translate(2, y + 3);
      v.ctx.rotate(-Math.PI / 2);
      v.ctx.fillText(String(Math.round(value)), 0, 0);
      v.ctx.restore();
    }
  }
}

// ===== FRIEND EASTER EGG =====
// A fresh timer is created for every editor page session. It is deliberately
// not persisted, so closing and reopening the editor always starts a new wait.
function getFriendEasterEggDelay() {
  return Math.round(
    EASTER_EGG_MIN_DELAY
    + Math.random() * (EASTER_EGG_MAX_DELAY - EASTER_EGG_MIN_DELAY)
  );
}

function setupFriendEasterEgg() {
  positionFriendEasterEgg();
  window.addEventListener('resize', positionFriendEasterEgg);

  easterEggTimer = setTimeout(requestScheduledFriendEasterEgg, getFriendEasterEggDelay());

  // Private preview shortcut. Previewing does not consume the scheduled event.
  document.addEventListener('keydown', (e) => {
    const tagName = e.target?.tagName;
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      playFriendEasterEgg(true);
    }
  });
}

function requestScheduledFriendEasterEgg() {
  easterEggTimer = null;
  if (easterEggPlayedThisSession) return;

  if (document.visibilityState === 'visible') {
    playFriendEasterEgg(false);
    return;
  }

  // If the timer finishes in a background tab, wait until the editor is visible.
  easterEggVisibilityHandler = () => {
    if (document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', easterEggVisibilityHandler);
    easterEggVisibilityHandler = null;
    playFriendEasterEgg(false);
  };
  document.addEventListener('visibilitychange', easterEggVisibilityHandler);
}

function positionFriendEasterEgg() {
  const friends = document.getElementById('easterFriends');
  const canvasArea = document.getElementById('canvasArea');
  if (!friends || !canvasArea) return;

  const areaRect = canvasArea.getBoundingClientRect();
  const desiredLeft = areaRect.left + areaRect.width * 0.72;
  const safeLeft = Math.max(
    areaRect.left + 90,
    Math.min(window.innerWidth - 104, desiredLeft)
  );
  friends.style.left = `${Math.round(safeLeft)}px`;
}

function clearFriendEasterEggSequenceTimers() {
  easterEggSequenceTimers.forEach(timer => clearTimeout(timer));
  easterEggSequenceTimers = [];
  if (easterEggAnimationFrame) {
    cancelAnimationFrame(easterEggAnimationFrame);
    easterEggAnimationFrame = 0;
  }
}

function queueFriendEasterEggStep(callback, delay) {
  const timer = setTimeout(callback, delay);
  easterEggSequenceTimers.push(timer);
}

function resetFriendEasterEggVisuals() {
  const stage = document.getElementById('friendEasterEgg');
  const friends = document.getElementById('easterFriends');
  const car = document.getElementById('easterCar');
  if (!stage || !friends || !car) return;

  stage.classList.remove('is-active');
  friends.classList.remove('is-ducking');
  car.classList.remove('is-driving');
  stage.removeAttribute('data-playing');
}

function watchFriendEasterEggCarApproach() {
  const stage = document.getElementById('friendEasterEgg');
  const friends = document.getElementById('easterFriends');
  const car = document.getElementById('easterCar');
  if (!stage || !friends || !car) return;

  const checkPosition = () => {
    if (stage.dataset.playing !== 'true' || friends.classList.contains('is-ducking')) {
      easterEggAnimationFrame = 0;
      return;
    }

    const carRect = car.getBoundingClientRect();
    const friendsRect = friends.getBoundingClientRect();
    if (carRect.right >= friendsRect.left - 8) {
      friends.classList.add('is-ducking');
      easterEggAnimationFrame = 0;
      return;
    }

    easterEggAnimationFrame = requestAnimationFrame(checkPosition);
  };

  easterEggAnimationFrame = requestAnimationFrame(checkPosition);
}

function playFriendEasterEgg(isPreview = false) {
  const stage = document.getElementById('friendEasterEgg');
  const friends = document.getElementById('easterFriends');
  const car = document.getElementById('easterCar');
  if (!stage || !friends || !car) return;
  if (stage.dataset.playing === 'true') {
    // A manual preview can overlap the natural timer by chance. Retry afterward
    // so the preview never consumes the once-per-session scheduled appearance.
    if (!isPreview && !easterEggPlayedThisSession) {
      easterEggTimer = setTimeout(
        requestScheduledFriendEasterEgg,
        EASTER_EGG_CAR_DELAY + EASTER_EGG_CAR_DURATION + 500
      );
    }
    return;
  }
  if (!isPreview && easterEggPlayedThisSession) return;

  if (!isPreview) easterEggPlayedThisSession = true;
  clearFriendEasterEggSequenceTimers();
  resetFriendEasterEggVisuals();
  positionFriendEasterEgg();

  // Force a style flush so the animation can replay when using the preview shortcut.
  void stage.offsetWidth;
  stage.dataset.playing = 'true';
  stage.classList.add('is-active');
  car.style.setProperty('--easter-drive-duration', `${EASTER_EGG_CAR_DURATION}ms`);

  queueFriendEasterEggStep(
    () => {
      car.classList.add('is-driving');
      watchFriendEasterEggCarApproach();
    },
    EASTER_EGG_CAR_DELAY
  );
  queueFriendEasterEggStep(
    () => {
      clearFriendEasterEggSequenceTimers();
      resetFriendEasterEggVisuals();
    },
    EASTER_EGG_CAR_DELAY + EASTER_EGG_CAR_DURATION + 350
  );
}

// ===== BOOT =====
init();
