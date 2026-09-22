import { validatePluginManifest } from '../plugins/plugin-api.js';

const MAX_PACKAGE_BYTES = 15 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 30 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_CODE_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 100;

const ALLOWED_EXTENSIONS = new Set([
  'json', 'js', 'html', 'css', 'svg', 'png', 'jpg', 'jpeg', 'webp', 'gif',
  'woff', 'woff2', 'ttf', 'otf', 'txt',
]);

const TEXT_EXTENSIONS = new Set(['json', 'js', 'html', 'css', 'svg', 'txt']);

const MIME_TYPES = Object.freeze({
  json: 'application/json',
  js: 'text/javascript',
  html: 'text/html',
  css: 'text/css',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  txt: 'text/plain',
});

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xEDB88320 : 0);
  crcTable[i] = value >>> 0;
}

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function cleanArchivePath(name) {
  const normalized = String(name || '').replaceAll('\\', '/');
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) {
    throw new Error('The plugin contains an invalid file path.');
  }
  const parts = normalized.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) {
    if (normalized.endsWith('/') && parts.at(-1) === '') return normalized;
    throw new Error(`Unsafe plugin path: ${normalized}`);
  }
  return normalized;
}

function findEndOfCentralDirectory(bytes) {
  const minimum = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= minimum; offset--) {
    if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4B && bytes[offset + 2] === 0x05 && bytes[offset + 3] === 0x06) return offset;
  }
  return -1;
}

async function inflateRaw(compressed) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This version of Chrome cannot unpack compressed plugin files.');
  }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZipEntries(file) {
  if (!(file instanceof Blob)) throw new Error('Choose a valid .clatasha-plugin file.');
  if (file.size <= 0 || file.size > MAX_PACKAGE_BYTES) throw new Error('Plugin packages must be between 1 byte and 15 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) throw new Error('This file is not a valid plugin package.');

  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDisk = view.getUint16(eocdOffset + 6, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  if (diskNumber !== 0 || centralDisk !== 0) throw new Error('Multi-volume plugin packages are not supported.');
  if (entryCount === 0 || entryCount > MAX_FILES) throw new Error(`A plugin package may contain at most ${MAX_FILES} files.`);
  if (centralOffset + centralSize > eocdOffset) throw new Error('The plugin directory is damaged.');

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries = new Map();
  let cursor = centralOffset;
  let unpackedTotal = 0;

  for (let index = 0; index < entryCount; index++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014B50) {
      throw new Error('The plugin directory contains an invalid entry.');
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if ([compressedSize, uncompressedSize, localOffset].includes(0xFFFFFFFF)) throw new Error('ZIP64 plugin packages are not supported.');
    if (flags & 0x1) throw new Error('Encrypted plugin packages are not supported.');
    if (![0, 8].includes(method)) throw new Error('A plugin file uses an unsupported compression method.');
    if (uncompressedSize > MAX_FILE_BYTES) throw new Error('A plugin file exceeds the 10 MB limit.');
    unpackedTotal += uncompressedSize;
    if (unpackedTotal > MAX_UNPACKED_BYTES) throw new Error('The unpacked plugin exceeds the 30 MB limit.');

    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.length) throw new Error('The plugin contains a damaged filename.');
    let path;
    try { path = cleanArchivePath(decoder.decode(bytes.subarray(nameStart, nameEnd))); }
    catch (error) { throw new Error(error.message || 'The plugin contains an unreadable filename.'); }
    cursor = nameEnd + extraLength + commentLength;
    if (path.endsWith('/') || path.startsWith('__MACOSX/') || path.endsWith('/.DS_Store') || path === '.DS_Store') continue;
    if (entries.has(path)) throw new Error(`Duplicate plugin file: ${path}`);

    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034B50) {
      throw new Error(`The plugin file ${path} has an invalid local record.`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error(`The plugin file ${path} is incomplete.`);
    const compressed = bytes.slice(dataStart, dataEnd);
    const content = method === 0 ? compressed : await inflateRaw(compressed);
    if (content.byteLength !== uncompressedSize) throw new Error(`The plugin file ${path} has the wrong size.`);
    if (crc32(content) !== expectedCrc) throw new Error(`The plugin file ${path} failed its integrity check.`);
    entries.set(path, content);
  }

  return { entries, packageSize: file.size, unpackedSize: unpackedTotal };
}

function safeRelativePath(value, label) {
  const path = cleanArchivePath(value);
  if (path.endsWith('/')) throw new Error(`${label} must point to a file.`);
  return path;
}

function getExtension(path) {
  const match = String(path).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function decodeText(entries, path) {
  const bytes = entries.get(path);
  if (!bytes) throw new Error(`Required plugin file is missing: ${path}`);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (_) { throw new Error(`Plugin file must be valid UTF-8 text: ${path}`); }
}

function validateCode(source, manifest) {
  const forbidden = [
    [/https?:\/\//i, 'External URLs are not allowed in plugin code.'],
    [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\s*\(/, 'Network APIs are not allowed in installed plugins.'],
    [/navigator\s*\.\s*sendBeacon\s*\(/, 'Network APIs are not allowed in installed plugins.'],
    [/\bimport\s*(?:\(|[\s{*])/, 'Installed plugins cannot import additional JavaScript.'],
    [/\bexport\s+(?:default|const|let|var|function|class|\{)/, 'Installed plugin entry files use ClatashaPlugin.register(), not ES module exports.'],
    [/\b(?:eval|Function)\s*\(/, 'Plugins cannot evaluate additional code.'],
  ];
  for (const [pattern, message] of forbidden) if (pattern.test(source)) throw new Error(message);
  if (!/ClatashaPlugin\s*\.\s*register\s*\(/.test(source)) {
    throw new Error(`${manifest.entry} must call ClatashaPlugin.register().`);
  }
}

function validateHtml(source) {
  if (/<\s*script\b/i.test(source)) throw new Error('Plugin HTML cannot contain script tags.');
  if (/<\s*(?:iframe|object|embed|base|meta|link|style)\b/i.test(source)) throw new Error('Plugin HTML contains a prohibited embedded element.');
  if (/\son[a-z]+\s*=/i.test(source)) throw new Error('Plugin HTML cannot contain inline event handlers.');
  if (/javascript\s*:/i.test(source)) throw new Error('Plugin HTML cannot contain javascript URLs.');
  if (/https?:\/\//i.test(source)) throw new Error('Plugin HTML cannot load external resources.');
}

function validateCss(source) {
  if (/@import\b/i.test(source)) throw new Error('Plugin CSS cannot import external styles.');
  if (/https?:\/\//i.test(source)) throw new Error('Plugin CSS cannot load external resources.');
  if (/expression\s*\(/i.test(source)) throw new Error('Plugin CSS contains a prohibited expression.');
}

export async function validateExternalPluginPackage(file) {
  if (!/\.clatasha-plugin$/i.test(String(file?.name || ''))) {
    throw new Error('Choose a file ending in .clatasha-plugin.');
  }
  const archive = await readZipEntries(file);
  const manifestText = decodeText(archive.entries, 'plugin.json');
  let rawManifest;
  try { rawManifest = JSON.parse(manifestText); }
  catch (_) { throw new Error('plugin.json is not valid JSON.'); }

  const errors = validatePluginManifest(rawManifest);
  if (errors.length) throw new Error(errors.join(' '));
  if (rawManifest.runtime !== 'sandbox') throw new Error('Installed plugins must declare "runtime": "sandbox".');
  const entry = safeRelativePath(rawManifest.entry || '', 'entry');
  const htmlPath = safeRelativePath(rawManifest.ui?.html || 'plugin.html', 'ui.html');
  const cssPath = safeRelativePath(rawManifest.ui?.css || 'plugin.css', 'ui.css');
  const iconPath = safeRelativePath(rawManifest.icon || 'icon.svg', 'icon');
  if (getExtension(entry) !== 'js') throw new Error('The plugin entry must be a JavaScript file.');
  if (getExtension(htmlPath) !== 'html') throw new Error('ui.html must be an HTML file.');
  if (getExtension(cssPath) !== 'css') throw new Error('ui.css must be a CSS file.');
  if (!['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif'].includes(getExtension(iconPath))) {
    throw new Error('The plugin icon must be SVG, PNG, JPG, WebP, or GIF.');
  }

  for (const [path, bytes] of archive.entries) {
    const extension = getExtension(path);
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error(`Unsupported plugin file type: ${path}`);
    if (['js', 'html', 'css'].includes(extension) && bytes.byteLength > MAX_CODE_BYTES) {
      throw new Error(`Plugin code file exceeds the 2 MB limit: ${path}`);
    }
    if (extension === 'js' && path !== entry) throw new Error(`Only the declared entry JavaScript file is allowed: ${path}`);
  }

  const entrySource = decodeText(archive.entries, entry);
  const htmlSource = decodeText(archive.entries, htmlPath);
  const cssSource = decodeText(archive.entries, cssPath);
  if (!archive.entries.has(iconPath)) throw new Error(`Plugin icon is missing: ${iconPath}`);
  if (archive.entries.get(iconPath).byteLength > 1024 * 1024) throw new Error('The plugin icon exceeds the 1 MB limit.');
  validateCode(entrySource, rawManifest);
  validateHtml(htmlSource);
  validateCss(cssSource);

  const files = {};
  for (const [path, bytes] of archive.entries) {
    const extension = getExtension(path);
    files[path] = {
      path,
      mime: MIME_TYPES[extension] || 'application/octet-stream',
      kind: TEXT_EXTENSIONS.has(extension) ? 'text' : 'binary',
      data: TEXT_EXTENSIONS.has(extension) ? new TextDecoder().decode(bytes) : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  }

  const manifest = {
    id: rawManifest.id,
    name: rawManifest.name.trim(),
    version: String(rawManifest.version),
    developer: String(rawManifest.developer || 'Unknown developer').slice(0, 80),
    description: String(rawManifest.description || '').slice(0, 240),
    apiVersion: rawManifest.apiVersion,
    type: rawManifest.type,
    runtime: 'sandbox',
    entry,
    ui: { html: htmlPath, css: cssPath },
    menuLabel: rawManifest.menuLabel.trim(),
    icon: iconPath,
    permissions: [...rawManifest.permissions],
  };

  return {
    id: manifest.id,
    manifest,
    files,
    sourceFileName: file.name,
    packageSize: archive.packageSize,
    unpackedSize: archive.unpackedSize,
    installedAt: Date.now(),
  };
}
