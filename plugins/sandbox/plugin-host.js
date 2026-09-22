(() => {
  'use strict';

  const root = document.getElementById('pluginRoot');
  const status = document.getElementById('sandboxStatus');
  const pending = new Map();
  const assetUrls = new Map();
  let port = null;
  let requestId = 0;
  let pluginInstance = null;
  let currentTheme = 'default';

  function showError(error) {
    status.hidden = false;
    status.classList.add('error');
    status.textContent = error?.message || String(error || 'The plugin stopped unexpectedly.');
    try { port?.postMessage({ type: 'plugin-error', error: status.textContent }); } catch (_) {}
  }

  function request(method, args = []) {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      pending.set(id, { resolve, reject });
      port.postMessage({ type: 'request', id, method, args });
    });
  }

  function acceptsImage(file) {
    return Boolean(file) && (String(file.type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(String(file.name || '')));
  }

  function replaceAssetReferences(source) {
    return String(source || '').replace(/clatasha-asset:\/\/([^\s"'()<>]+)/gi, (_match, encodedPath) => {
      let path = encodedPath;
      try { path = decodeURIComponent(encodedPath); } catch (_) {}
      return assetUrls.get(path) || '';
    });
  }

  function makeAssetUrls(assets) {
    for (const asset of assets || []) {
      const blob = new Blob([asset.data], { type: asset.mime || 'application/octet-stream' });
      assetUrls.set(asset.path, URL.createObjectURL(blob));
    }
  }

  function revokeAssetUrls() {
    assetUrls.forEach(url => URL.revokeObjectURL(url));
    assetUrls.clear();
  }

  function createApi(manifest) {
    const hasPermission = permission => manifest.permissions.includes(permission);
    const requirePermission = permission => {
      if (!hasPermission(permission)) throw new Error(`${manifest.name} does not have the ${permission} permission.`);
    };
    return Object.freeze({
      version: 1,
      plugin: Object.freeze({ id: manifest.id, name: manifest.name, version: manifest.version }),
      theme: Object.freeze({ get: () => currentTheme }),
      files: Object.freeze({
        acceptsImage(file) {
          requirePermission('files.localImages');
          return acceptsImage(file);
        },
      }),
      assets: Object.freeze({ getUrl: path => assetUrls.get(String(path || '')) || null }),
      canvas: Object.freeze({
        getDocumentSize: () => request('canvas.getDocumentSize'),
        getSelectedImage: () => request('canvas.getSelectedImage'),
        addImageBlob: (blob, options = {}) => request('canvas.addImageBlob', [blob, options]),
      }),
      storage: Object.freeze({
        get: (key, fallbackValue = null) => request('storage.get', [key, fallbackValue]),
        set: (key, value) => request('storage.set', [key, value]),
        remove: key => request('storage.remove', [key]),
      }),
      ui: Object.freeze({
        notify: message => request('ui.notify', [String(message || '')]),
        close: () => request('ui.close'),
      }),
    });
  }

  async function initializePlugin(payload, theme) {
    currentTheme = theme === 'bowetech' ? 'bowetech' : 'default';
    document.body.dataset.theme = currentTheme;
    makeAssetUrls(payload.assets);
    const style = document.createElement('style');
    style.textContent = replaceAssetReferences(payload.css);
    root.replaceChildren(style);
    const content = document.createElement('div');
    content.id = 'pluginContent';
    content.style.width = '100%';
    content.style.height = '100%';
    content.innerHTML = replaceAssetReferences(payload.html);
    root.appendChild(content);

    let registered = null;
    const registration = Object.freeze({
      register(instance) {
        if (registered) throw new Error('A plugin can register only once.');
        if (!instance || typeof instance.mount !== 'function') throw new Error('The plugin must register a mount() function.');
        registered = instance;
      },
    });
    const execute = new Function('ClatashaPlugin', `"use strict";\n${payload.script}\n//# sourceURL=clatasha-plugin://${payload.manifest.id}/${payload.manifest.entry}`);
    execute(registration);
    if (!registered) throw new Error('The plugin did not register itself.');
    pluginInstance = registered;
    await pluginInstance.mount({ root: content, api: createApi(payload.manifest), manifest: Object.freeze(payload.manifest), theme: currentTheme });
    status.hidden = true;
    port.postMessage({ type: 'plugin-ready' });
  }

  async function destroyPlugin() {
    try { await pluginInstance?.destroy?.(); } catch (_) {}
    pluginInstance = null;
    pending.forEach(({ reject }) => reject(new Error('Plugin closed.')));
    pending.clear();
    revokeAssetUrls();
    root.replaceChildren();
  }

  function receivePortMessage(event) {
    const message = event.data || {};
    if (message.type === 'response') {
      const operation = pending.get(message.id);
      if (!operation) return;
      pending.delete(message.id);
      if (message.ok) operation.resolve(message.value);
      else operation.reject(new Error(message.error || 'Plugin request failed.'));
      return;
    }
    if (message.type === 'initialize') {
      initializePlugin(message.payload, message.theme).catch(showError);
      return;
    }
    if (message.type === 'theme') {
      currentTheme = message.theme === 'bowetech' ? 'bowetech' : 'default';
      document.body.dataset.theme = currentTheme;
      try { pluginInstance?.setTheme?.(currentTheme); } catch (error) { showError(error); }
      return;
    }
    if (message.type === 'destroy') destroyPlugin();
  }

  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.data?.type !== 'clatasha-plugin-connect' || !event.ports?.[0] || port) return;
    port = event.ports[0];
    port.addEventListener('message', receivePortMessage);
    port.start();
    port.postMessage({ type: 'sandbox-ready' });
  });
})();
