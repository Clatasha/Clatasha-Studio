export const CLATASHA_PLUGIN_API_VERSION = 1;

export const CLATASHA_PLUGIN_PERMISSIONS = Object.freeze([
  'files.localImages',
  'canvas.readDocument',
  'canvas.readSelection',
  'canvas.addImage',
  'plugin.storage',
]);

const ALLOWED_PERMISSIONS = new Set(CLATASHA_PLUGIN_PERMISSIONS);

export function validatePluginManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return ['Manifest must be an object.'];
  if (typeof manifest.id !== 'string' || manifest.id.length > 128 || !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(manifest.id)) {
    errors.push('id must use reverse-domain style lowercase characters.');
  }
  if (typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.name.length > 80) errors.push('name must be between 1 and 80 characters.');
  if (!/^\d+\.\d+\.\d+$/.test(String(manifest.version || ''))) {
    errors.push('version must use semantic versioning, such as 1.0.0.');
  }
  if (manifest.apiVersion !== CLATASHA_PLUGIN_API_VERSION) {
    errors.push(`apiVersion must be ${CLATASHA_PLUGIN_API_VERSION}.`);
  }
  if (manifest.type !== 'tool') errors.push('type must be tool for Plugin API v1.');
  if (typeof manifest.menuLabel !== 'string' || !manifest.menuLabel.trim() || manifest.menuLabel.length > 45) errors.push('menuLabel must be between 1 and 45 characters.');
  if (!Array.isArray(manifest.permissions)) errors.push('permissions must be an array.');
  else {
    manifest.permissions.forEach(permission => {
      if (!ALLOWED_PERMISSIONS.has(permission)) errors.push(`Unknown permission: ${permission}`);
    });
    if (new Set(manifest.permissions).size !== manifest.permissions.length) errors.push('permissions cannot contain duplicates.');
  }
  return errors;
}

function requirePermission(manifest, permission) {
  if (!manifest.permissions.includes(permission)) {
    throw new Error(`${manifest.name} does not have the ${permission} permission.`);
  }
}

export function createPluginApi(manifest, host) {
  const api = {
    version: CLATASHA_PLUGIN_API_VERSION,
    plugin: Object.freeze({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
    }),
    theme: Object.freeze({
      get: () => host.getTheme(),
    }),
    files: Object.freeze({
      acceptsImage(file) {
        requirePermission(manifest, 'files.localImages');
        return Boolean(file) && (
          String(file.type || '').startsWith('image/') ||
          /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(String(file.name || ''))
        );
      },
    }),
    canvas: Object.freeze({
      getDocumentSize() {
        requirePermission(manifest, 'canvas.readDocument');
        return host.getDocumentSize();
      },
      getSelectedImage() {
        requirePermission(manifest, 'canvas.readSelection');
        return host.getSelectedImage();
      },
      addImageBlob(blob, options = {}) {
        requirePermission(manifest, 'canvas.addImage');
        return host.addImageBlob(blob, {
          ...options,
          pluginId: manifest.id,
          pluginVersion: manifest.version,
        });
      },
    }),
    storage: Object.freeze({
      get(key, fallbackValue = null) {
        requirePermission(manifest, 'plugin.storage');
        return host.storageGet(manifest.id, key, fallbackValue);
      },
      set(key, value) {
        requirePermission(manifest, 'plugin.storage');
        return host.storageSet(manifest.id, key, value);
      },
      remove(key) {
        requirePermission(manifest, 'plugin.storage');
        return host.storageRemove(manifest.id, key);
      },
    }),
    ui: Object.freeze({
      close: () => host.closePlugin(),
      notify: message => host.notify(String(message || '')),
    }),
  };

  return Object.freeze(api);
}
