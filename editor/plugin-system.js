import {
  CLATASHA_PLUGIN_API_VERSION,
  createPluginApi,
  validatePluginManifest,
} from '../plugins/plugin-api.js';
import {
  manifest as imageMergerManifest,
  createPlugin as createImageMergerPlugin,
} from '../plugins/image-merger/plugin.js';
import {
  manifest as imageCipherManifest,
  createPlugin as createImageCipherPlugin,
} from '../plugins/image-cipher/plugin.js';
import {
  manifest as imageToSvgManifest,
  createPlugin as createImageToSvgPlugin,
} from '../plugins/image-to-svg/plugin.js';
import { validateExternalPluginPackage } from './plugin-package.js';
import {
  deleteInstalledPluginPackage,
  listInstalledPluginPackages,
  saveInstalledPluginPackage,
} from './plugin-package-store.js';
import { createSandboxPluginRuntime } from './sandbox-plugin-runtime.js';

const PLUGIN_STATE_KEY = 'clatasha.pluginState.v1';
const PLUGIN_STORAGE_PREFIX = 'clatasha.pluginStorage.v1.';

const PERMISSION_LABELS = Object.freeze({
  'files.localImages': 'Choose local images',
  'canvas.readDocument': 'Read canvas size',
  'canvas.readSelection': 'Read selected image',
  'canvas.addImage': 'Add an image layer',
  'plugin.storage': 'Save plugin settings',
});

const BUNDLED_PLUGINS = Object.freeze([
  Object.freeze({
    source: 'bundled',
    manifest: imageMergerManifest,
    create: createImageMergerPlugin,
    basePath: '../plugins/image-merger/',
  }),
  Object.freeze({
    source: 'bundled',
    manifest: imageCipherManifest,
    create: createImageCipherPlugin,
    basePath: '../plugins/image-cipher/',
  }),
  Object.freeze({
    source: 'bundled',
    manifest: imageToSvgManifest,
    create: createImageToSvgPlugin,
    basePath: '../plugins/image-to-svg/',
  }),
]);

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = String(value ?? '');
  return node.innerHTML;
}

function readJsonStorage(key, fallbackValue) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value === null ? fallbackValue : value;
  } catch (_) {
    return fallbackValue;
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function fileDataUrl(file) {
  if (!file) return '';
  const bytes = file.kind === 'text'
    ? new TextEncoder().encode(String(file.data || ''))
    : new Uint8Array(file.data);
  return `data:${file.mime || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`;
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isStoredRecordUsable(record) {
  const manifest = record?.manifest;
  if (!record || record.id !== manifest?.id || validatePluginManifest(manifest).length) return false;
  if (manifest.runtime !== 'sandbox' || !record.files || typeof record.files !== 'object') return false;
  return [manifest.entry, manifest.ui?.html, manifest.ui?.css, manifest.icon]
    .every(path => typeof path === 'string' && record.files[path]);
}

function localDefinition(record) {
  return {
    source: 'local',
    manifest: record.manifest,
    record,
    iconUrl: fileDataUrl(record.files[record.manifest.icon]),
    create: () => createSandboxPluginRuntime(record),
  };
}

function definitionIcon(definition) {
  return definition.iconUrl || definition.basePath + definition.manifest.icon;
}

export function createPluginSystem(host) {
  const registry = new Map();
  const initialState = readJsonStorage(PLUGIN_STATE_KEY, {});
  const state = initialState && typeof initialState === 'object' ? initialState : {};
  let activeRuntime = null;
  let lastFocusedElement = null;
  let installReviewResolver = null;

  BUNDLED_PLUGINS.forEach(definition => {
    const errors = validatePluginManifest(definition.manifest);
    if (errors.length) {
      console.error(`Plugin manifest rejected for ${definition.manifest?.id || 'unknown plugin'}:`, errors);
      return;
    }
    registry.set(definition.manifest.id, definition);
    if (!state[definition.manifest.id]) state[definition.manifest.id] = { installed: true, enabled: true };
  });

  function pluginState(id) {
    return state[id] || { installed: false, enabled: false };
  }

  function saveState() {
    writeJsonStorage(PLUGIN_STATE_KEY, state);
    renderPluginMenu();
    renderManager();
  }

  function hideMenus() {
    document.querySelectorAll('.dropdown-menu').forEach(menu => { menu.style.display = 'none'; });
    document.querySelectorAll('.menu-btn').forEach(button => button.classList.remove('active'));
    host.closeMenus?.();
  }

  function showOverlay(overlay) {
    if (!overlay) return;
    lastFocusedElement = document.activeElement;
    hideMenus();
    host.beforeOpenModal?.();
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => overlay.querySelector('[data-plugin-autofocus], button')?.focus());
  }

  function hideOverlay(overlay) {
    if (!overlay || overlay.style.display === 'none') return;
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
    if (lastFocusedElement?.isConnected) lastFocusedElement.focus();
    lastFocusedElement = null;
  }

  async function setPluginInstalled(id, installed) {
    const definition = registry.get(id);
    if (!definition) return;
    if (installed) {
      state[id] = { installed: true, enabled: true };
      saveState();
      host.notify(`${definition.manifest.name} installed`);
      return;
    }
    if (activeRuntime?.id === id) closeRuntime();
    if (definition.source === 'local') {
      await deleteInstalledPluginPackage(id);
      localStorage.removeItem(PLUGIN_STORAGE_PREFIX + id);
      registry.delete(id);
      delete state[id];
    } else {
      state[id] = { installed: false, enabled: false };
    }
    saveState();
    host.notify(`${definition.manifest.name} removed`);
  }

  function setPluginEnabled(id, enabled) {
    const current = pluginState(id);
    if (!current.installed) return;
    state[id] = { installed: true, enabled: Boolean(enabled) };
    if (!enabled && activeRuntime?.id === id) closeRuntime();
    saveState();
  }

  function renderPluginMenu() {
    const container = document.getElementById('pluginMenuItems');
    const empty = document.getElementById('pluginMenuEmpty');
    if (!container) return;
    container.replaceChildren();
    const enabled = [...registry.values()].filter(definition => {
      const current = pluginState(definition.manifest.id);
      return current.installed && current.enabled;
    });
    enabled.forEach(definition => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'plugin-menu-entry';
      button.dataset.pluginId = definition.manifest.id;
      button.innerHTML = `<img src="${escapeHtml(definitionIcon(definition))}" alt=""><span>${escapeHtml(definition.manifest.menuLabel)}</span><small>Open</small>`;
      button.addEventListener('click', event => {
        event.stopPropagation();
        openPlugin(definition.manifest.id);
      });
      container.appendChild(button);
    });
    if (empty) empty.hidden = enabled.length !== 0;
  }

  function pluginCard(definition, installed) {
    const { manifest } = definition;
    const current = pluginState(manifest.id);
    const permissions = manifest.permissions
      .map(permission => `<span>${escapeHtml(PERMISSION_LABELS[permission] || permission)}</span>`)
      .join('');
    const sourceLabel = definition.source === 'local' ? 'Local package' : 'Bundled';
    return `
      <article class="plugin-card" data-plugin-card="${escapeHtml(manifest.id)}">
        <img class="plugin-card-icon" src="${escapeHtml(definitionIcon(definition))}" alt="">
        <div class="plugin-card-main">
          <div class="plugin-card-title-row">
            <div><strong>${escapeHtml(manifest.name)}</strong><span>v${escapeHtml(manifest.version)} · ${escapeHtml(manifest.developer)}</span></div>
            <span class="plugin-type-badge">${sourceLabel}</span>
          </div>
          <p>${escapeHtml(manifest.description)}</p>
          <div class="plugin-permissions" aria-label="Permissions">${permissions}</div>
        </div>
        <div class="plugin-card-actions">
          ${installed ? `
            <label class="plugin-enable-control"><input type="checkbox" data-plugin-toggle="${escapeHtml(manifest.id)}" ${current.enabled ? 'checked' : ''}><span></span><b>${current.enabled ? 'Enabled' : 'Disabled'}</b></label>
            <button type="button" class="plugin-card-open" data-plugin-open="${escapeHtml(manifest.id)}" ${current.enabled ? '' : 'disabled'}>Open</button>
            <button type="button" class="plugin-card-remove" data-plugin-remove="${escapeHtml(manifest.id)}">Remove</button>
          ` : `<button type="button" class="plugin-card-install" data-plugin-install="${escapeHtml(manifest.id)}">Install</button>`}
        </div>
      </article>`;
  }

  function renderManager() {
    const installedList = document.getElementById('pluginInstalledList');
    const availableList = document.getElementById('pluginAvailableList');
    if (!installedList || !availableList) return;
    const definitions = [...registry.values()];
    const installed = definitions.filter(definition => pluginState(definition.manifest.id).installed);
    const available = definitions.filter(definition => definition.source === 'bundled' && !pluginState(definition.manifest.id).installed);
    installedList.innerHTML = installed.length
      ? installed.map(definition => pluginCard(definition, true)).join('')
      : '<div class="plugin-empty-state"><strong>No plugins installed</strong><span>Choose Install Plugin to add a local .clatasha-plugin package.</span></div>';
    availableList.innerHTML = available.length
      ? available.map(definition => pluginCard(definition, false)).join('')
      : '<div class="plugin-empty-state compact"><span>All bundled plugins are installed.</span></div>';

    installedList.querySelectorAll('[data-plugin-toggle]').forEach(input => {
      input.addEventListener('change', () => setPluginEnabled(input.dataset.pluginToggle, input.checked));
    });
    installedList.querySelectorAll('[data-plugin-open]').forEach(button => {
      button.addEventListener('click', () => openPlugin(button.dataset.pluginOpen));
    });
    installedList.querySelectorAll('[data-plugin-remove]').forEach(button => {
      button.addEventListener('click', async () => {
        const definition = registry.get(button.dataset.pluginRemove);
        if (!definition) return;
        const detail = definition.source === 'local'
          ? 'Its installed files and saved plugin settings will be deleted. You can reinstall the package later.'
          : 'You can install it again from Bundled Plugins.';
        if (!confirm(`Remove ${definition.manifest.name}? ${detail}`)) return;
        try { await setPluginInstalled(definition.manifest.id, false); }
        catch (error) { host.notify(error.message || 'The plugin could not be removed.'); }
      });
    });
    availableList.querySelectorAll('[data-plugin-install]').forEach(button => {
      button.addEventListener('click', () => setPluginInstalled(button.dataset.pluginInstall, true));
    });
  }

  function openManager(showAvailable = false) {
    closeRuntime();
    closeInstallReview(false);
    hideOverlay(document.getElementById('pluginDeveloperOverlay'));
    renderManager();
    const overlay = document.getElementById('pluginManagerOverlay');
    showOverlay(overlay);
    if (showAvailable) requestAnimationFrame(() => document.getElementById('pluginAvailableSection')?.scrollIntoView({ block: 'nearest' }));
  }

  function closeManager() {
    hideOverlay(document.getElementById('pluginManagerOverlay'));
  }

  function openDeveloperDocs() {
    closeRuntime();
    closeInstallReview(false);
    closeManager();
    const version = document.getElementById('pluginApiVersion');
    if (version) version.textContent = `Plugin API v${CLATASHA_PLUGIN_API_VERSION}`;
    showOverlay(document.getElementById('pluginDeveloperOverlay'));
  }

  function closeDeveloperDocs() {
    hideOverlay(document.getElementById('pluginDeveloperOverlay'));
  }

  function openInstallPicker() {
    hideMenus();
    const input = document.getElementById('pluginInstallInput');
    if (!input) return;
    input.value = '';
    input.click();
  }

  function closeInstallReview(approved = false) {
    hideOverlay(document.getElementById('pluginInstallReviewOverlay'));
    const resolve = installReviewResolver;
    installReviewResolver = null;
    resolve?.(Boolean(approved));
  }

  function reviewInstall(record, updating) {
    const { manifest } = record;
    document.getElementById('pluginInstallReviewIcon').src = fileDataUrl(record.files[manifest.icon]);
    document.getElementById('pluginInstallReviewName').textContent = manifest.name;
    document.getElementById('pluginInstallReviewMeta').textContent = `v${manifest.version} · ${manifest.developer}`;
    document.getElementById('pluginInstallReviewDescription').textContent = manifest.description || 'No description provided.';
    document.getElementById('pluginInstallReviewFile').textContent = record.sourceFileName;
    document.getElementById('pluginInstallReviewSize').textContent = `${formatBytes(record.packageSize)} package · ${formatBytes(record.unpackedSize)} unpacked`;
    const permissions = document.getElementById('pluginInstallReviewPermissions');
    permissions.replaceChildren();
    manifest.permissions.forEach(permission => {
      const item = document.createElement('li');
      item.innerHTML = `<span aria-hidden="true">✓</span><div><strong>${escapeHtml(PERMISSION_LABELS[permission] || permission)}</strong><small>${escapeHtml(permission)}</small></div>`;
      permissions.appendChild(item);
    });
    if (!manifest.permissions.length) permissions.innerHTML = '<li class="plugin-review-no-permissions">This plugin does not request protected editor access.</li>';
    document.getElementById('pluginInstallConfirm').textContent = updating ? 'Update Plugin' : 'Install Plugin';
    showOverlay(document.getElementById('pluginInstallReviewOverlay'));
    return new Promise(resolve => { installReviewResolver = resolve; });
  }

  async function installPluginFile(file) {
    try {
      host.notify('Checking plugin package...');
      const record = await validateExternalPluginPackage(file);
      const existing = registry.get(record.id);
      if (existing?.source === 'bundled') throw new Error('This plugin ID belongs to a bundled Clatasha plugin.');
      const approved = await reviewInstall(record, Boolean(existing));
      if (!approved) return;
      if (activeRuntime?.id === record.id) closeRuntime();
      await saveInstalledPluginPackage(record);
      registry.set(record.id, localDefinition(record));
      state[record.id] = { installed: true, enabled: existing ? pluginState(record.id).enabled : true };
      saveState();
      openManager(false);
      host.notify(`${record.manifest.name} ${existing ? 'updated' : 'installed'}`);
    } catch (error) {
      console.error('Plugin installation failed:', error);
      host.notify(error.message || 'The plugin package could not be installed.');
    }
  }

  async function openPlugin(id) {
    const definition = registry.get(id);
    const current = pluginState(id);
    if (!definition || !current.installed || !current.enabled) {
      host.notify('Enable this plugin in Manage Plugins first');
      return;
    }
    closeManager();
    closeDeveloperDocs();
    closeInstallReview(false);
    if (activeRuntime) closeRuntime();
    const overlay = document.getElementById('pluginRuntimeOverlay');
    const mount = document.getElementById('pluginRuntimeMount');
    const title = document.getElementById('pluginRuntimeTitle');
    const detail = document.getElementById('pluginRuntimeDetail');
    const icon = document.getElementById('pluginRuntimeIcon');
    if (!overlay || !mount) return;
    title.textContent = definition.manifest.name;
    detail.textContent = `${definition.manifest.developer} · v${definition.manifest.version}`;
    icon.src = definitionIcon(definition);
    mount.innerHTML = '<div class="plugin-runtime-loading"><span></span>Loading plugin...</div>';
    showOverlay(overlay);

    const instance = definition.create();
    const pluginApi = createPluginApi(definition.manifest, {
      getTheme: host.getTheme,
      getDocumentSize: host.getDocumentSize,
      getSelectedImage: host.getSelectedImage,
      addImageBlob: host.addImageBlob,
      notify: host.notify,
      closePlugin: closeRuntime,
      storageGet(pluginId, key, fallbackValue) {
        const store = readJsonStorage(PLUGIN_STORAGE_PREFIX + pluginId, {});
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallbackValue;
      },
      storageSet(pluginId, key, value) {
        const storageKey = PLUGIN_STORAGE_PREFIX + pluginId;
        const store = readJsonStorage(storageKey, {});
        store[key] = value;
        writeJsonStorage(storageKey, store);
        return true;
      },
      storageRemove(pluginId, key) {
        const storageKey = PLUGIN_STORAGE_PREFIX + pluginId;
        const store = readJsonStorage(storageKey, {});
        delete store[key];
        writeJsonStorage(storageKey, store);
        return true;
      },
    });
    activeRuntime = { id, instance };
    try {
      await instance.mount({ container: mount, pluginApi, theme: host.getTheme() });
    } catch (error) {
      console.error(`Unable to open ${definition.manifest.name}:`, error);
      try { instance.destroy?.(); } catch (_) {}
      activeRuntime = null;
      mount.innerHTML = `<div class="plugin-runtime-error"><strong>The plugin could not open.</strong><span>${escapeHtml(error.message || 'Unknown plugin error')}</span></div>`;
    }
  }

  function closeRuntime() {
    const overlay = document.getElementById('pluginRuntimeOverlay');
    const mount = document.getElementById('pluginRuntimeMount');
    if (activeRuntime) {
      try { activeRuntime.instance.destroy?.(); } catch (error) { console.error('Plugin cleanup failed:', error); }
      activeRuntime = null;
    }
    if (mount) mount.replaceChildren();
    hideOverlay(overlay);
  }

  function setTheme(theme) {
    activeRuntime?.instance.setTheme?.(theme);
  }

  function isModalOpen() {
    return ['pluginRuntimeOverlay', 'pluginManagerOverlay', 'pluginDeveloperOverlay', 'pluginInstallReviewOverlay'].some(id => {
      const overlay = document.getElementById(id);
      return overlay && overlay.style.display !== 'none';
    });
  }

  function closeAll() {
    closeRuntime();
    closeManager();
    closeDeveloperDocs();
    closeInstallReview(false);
  }

  function bindOverlay(overlayId, closeButtonId, close) {
    const overlay = document.getElementById(overlayId);
    document.getElementById(closeButtonId)?.addEventListener('click', close);
    overlay?.addEventListener('mousedown', event => {
      if (event.target === overlay) close();
    });
    overlay?.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
      event.stopPropagation();
    });
  }

  async function initialize() {
    try {
      const packages = await listInstalledPluginPackages();
      for (const record of packages) {
        if (!isStoredRecordUsable(record) || registry.has(record.id)) {
          console.warn(`Skipped invalid or conflicting installed plugin: ${record?.id || 'unknown'}`);
          if (record?.id) await deleteInstalledPluginPackage(record.id);
          if (record?.id && !registry.has(record.id)) delete state[record.id];
          continue;
        }
        registry.set(record.id, localDefinition(record));
        state[record.id] = { installed: true, enabled: state[record.id]?.enabled !== false };
      }
    } catch (error) {
      console.error('Installed plugins could not be loaded:', error);
      host.notify('Installed plugins could not be loaded from local storage.');
    }
    writeJsonStorage(PLUGIN_STATE_KEY, state);
    renderPluginMenu();
    renderManager();
    document.getElementById('menuManagePlugins')?.addEventListener('click', () => openManager(false));
    document.getElementById('menuInstallPlugin')?.addEventListener('click', openInstallPicker);
    document.getElementById('menuPluginDeveloper')?.addEventListener('click', openDeveloperDocs);
    document.getElementById('pluginManagerDocsShortcut')?.addEventListener('click', openDeveloperDocs);
    document.getElementById('pluginManagerInstallShortcut')?.addEventListener('click', openInstallPicker);
    document.getElementById('pluginInstallInput')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) installPluginFile(file);
    });
    document.getElementById('pluginInstallCancel')?.addEventListener('click', () => closeInstallReview(false));
    document.getElementById('pluginInstallConfirm')?.addEventListener('click', () => closeInstallReview(true));
    bindOverlay('pluginManagerOverlay', 'pluginManagerClose', closeManager);
    bindOverlay('pluginDeveloperOverlay', 'pluginDeveloperClose', closeDeveloperDocs);
    bindOverlay('pluginRuntimeOverlay', 'pluginRuntimeClose', closeRuntime);
    bindOverlay('pluginInstallReviewOverlay', 'pluginInstallReviewClose', () => closeInstallReview(false));
  }

  return Object.freeze({
    initialize,
    openPlugin,
    openManager,
    closeAll,
    isModalOpen,
    setTheme,
  });
}
