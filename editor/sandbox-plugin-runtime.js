function getTextFile(record, path) {
  const file = record.files?.[path];
  if (!file || file.kind !== 'text') throw new Error(`Plugin file is unavailable: ${path}`);
  return file.data;
}

const MAX_PLUGIN_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_PLUGIN_SETTING_BYTES = 1024 * 1024;

function validateStorageKey(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 120) {
    throw new Error('Plugin storage keys must be between 1 and 120 characters.');
  }
  return value;
}

function validateStorageValue(value) {
  let json;
  try { json = JSON.stringify(value); }
  catch (_) { throw new Error('Plugin settings must be JSON-compatible.'); }
  if (json === undefined) throw new Error('Plugin settings cannot be undefined.');
  if (new Blob([json]).size > MAX_PLUGIN_SETTING_BYTES) throw new Error('A plugin setting exceeds the 1 MB limit.');
  return value;
}

function buildPayload(record) {
  const manifest = record.manifest;
  const reserved = new Set(['plugin.json', manifest.entry, manifest.ui.html, manifest.ui.css]);
  const assets = Object.values(record.files || {})
    .filter(file => !reserved.has(file.path))
    .map(file => ({ path: file.path, mime: file.mime, kind: file.kind, data: file.data }));
  return {
    manifest,
    script: getTextFile(record, manifest.entry),
    html: getTextFile(record, manifest.ui.html),
    css: getTextFile(record, manifest.ui.css),
    assets,
  };
}

export function createSandboxPluginRuntime(record) {
  let frame = null;
  let port = null;
  let pluginApi = null;
  let destroyed = false;
  let readyReject = null;

  async function handleRequest(message) {
    const { id, method, args = [] } = message;
    const respond = (ok, value) => {
      try { port?.postMessage(ok ? { type: 'response', id, ok, value } : { type: 'response', id, ok, error: String(value || 'Plugin request failed') }); }
      catch (_) {}
    };
    try {
      let value;
      switch (method) {
        case 'canvas.getDocumentSize': value = pluginApi.canvas.getDocumentSize(); break;
        case 'canvas.getSelectedImage': value = await pluginApi.canvas.getSelectedImage(); break;
        case 'canvas.addImageBlob':
          if (!(args[0] instanceof Blob) || args[0].size <= 0) throw new Error('The plugin did not provide a valid image.');
          if (args[0].size > MAX_PLUGIN_IMAGE_BYTES) throw new Error('Plugin images may not exceed 50 MB.');
          await pluginApi.canvas.addImageBlob(args[0], args[1] || {});
          value = { added: true };
          break;
        case 'storage.get': value = pluginApi.storage.get(validateStorageKey(args[0]), args[1]); break;
        case 'storage.set': value = pluginApi.storage.set(validateStorageKey(args[0]), validateStorageValue(args[1])); break;
        case 'storage.remove': value = pluginApi.storage.remove(validateStorageKey(args[0])); break;
        case 'ui.notify': pluginApi.ui.notify(args[0]); value = true; break;
        case 'ui.close':
          value = true;
          respond(true, value);
          setTimeout(() => pluginApi.ui.close(), 0);
          return;
        default: throw new Error(`Unsupported Plugin API request: ${method}`);
      }
      respond(true, value);
    } catch (error) {
      respond(false, error.message || error);
    }
  }

  return {
    async mount({ container, pluginApi: api, theme }) {
      destroyed = false;
      pluginApi = api;
      frame = document.createElement('iframe');
      frame.className = 'sandbox-plugin-frame';
      frame.title = `${record.manifest.name} plugin`;
      frame.setAttribute('sandbox', 'allow-scripts allow-modals allow-downloads');
      frame.src = '../plugins/sandbox/plugin-host.html';
      container.replaceChildren(frame);

      const channel = new MessageChannel();
      port = channel.port1;
      port.start();
      const ready = new Promise((resolve, reject) => {
        readyReject = reject;
        const timer = setTimeout(() => reject(new Error('The plugin sandbox did not respond.')), 6000);
        port.addEventListener('message', event => {
          const message = event.data || {};
          if (message.type === 'sandbox-ready') {
            clearTimeout(timer);
            readyReject = null;
            resolve();
          } else if (message.type === 'request') {
            handleRequest(message);
          } else if (message.type === 'plugin-error') {
            pluginApi.ui.notify(`${record.manifest.name}: ${message.error || 'Plugin error'}`);
          }
        });
      });

      await new Promise((resolve, reject) => {
        frame.addEventListener('load', resolve, { once: true });
        frame.addEventListener('error', () => reject(new Error('The plugin sandbox could not load.')), { once: true });
      });
      if (destroyed) return;
      frame.contentWindow.postMessage({ type: 'clatasha-plugin-connect' }, '*', [channel.port2]);
      await ready;
      if (destroyed) return;
      port.postMessage({ type: 'initialize', payload: buildPayload(record), theme });
    },
    setTheme(theme) {
      port?.postMessage({ type: 'theme', theme });
    },
    destroy() {
      destroyed = true;
      try { port?.postMessage({ type: 'destroy' }); } catch (_) {}
      readyReject?.(new Error('Plugin closed.'));
      readyReject = null;
      setTimeout(() => port?.close(), 0);
      port = null;
      pluginApi = null;
      frame?.remove();
      frame = null;
    },
  };
}
