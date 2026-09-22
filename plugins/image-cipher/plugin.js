export const manifest = Object.freeze({
  id: 'clatasha.image-cipher',
  name: 'Clatasha Image Cipher',
  version: '1.0.0',
  developer: 'Clatasha',
  description: 'Encrypt a private message and conceal it inside a lossless PNG image.',
  apiVersion: 1,
  type: 'tool',
  entry: 'plugin.js',
  menuLabel: 'Image Cipher',
  icon: 'icon.svg',
  permissions: [
    'files.localImages',
    'canvas.readSelection',
    'canvas.addImage',
  ],
});

const MAGIC = new Uint8Array([67, 76, 84, 67, 73, 80, 72, 49]); // CLTCIPH1
const FORMAT_VERSION = 1;
const HEADER_BYTES = 46;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const PBKDF2_ITERATIONS = 310000;
const MAX_MESSAGE_BYTES = 256 * 1024;
const MAX_IMAGE_PIXELS = 32 * 1024 * 1024;
const AAD = new Uint8Array([...MAGIC, FORMAT_VERSION]);

/* EXTERNAL_ASSET_LOADER_START */
let assetTextPromise = null;
function getAssetText() {
  if (!assetTextPromise) {
    assetTextPromise = Promise.all([
      fetch(new URL('./plugin.html', import.meta.url)).then(response => {
        if (!response.ok) throw new Error('Image Cipher interface could not be loaded.');
        return response.text();
      }),
      fetch(new URL('./plugin.css', import.meta.url)).then(response => {
        if (!response.ok) throw new Error('Image Cipher styles could not be loaded.');
        return response.text();
      }),
    ]);
  }
  return assetTextPromise;
}
/* EXTERNAL_ASSET_LOADER_END */

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeBaseName(name) {
  const value = String(name || 'image').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
  return value || 'image';
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('The encoded PNG could not be created.'));
    }, 'image/png');
  });
}

function createImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The image could not be decoded.'));
    image.src = url;
  });
}

function countOpaquePixels(imageData) {
  let count = 0;
  for (let offset = 3; offset < imageData.data.length; offset += 4) {
    if (imageData.data[offset] === 255) count++;
  }
  return count;
}

function payloadCapacity(imageData) {
  return Math.floor(countOpaquePixels(imageData) * 3 / 8);
}

function embedBytes(imageData, bytes) {
  const capacity = payloadCapacity(imageData);
  if (bytes.length > capacity) throw new Error('This message is too large for the chosen image.');
  let bitIndex = 0;
  const bitLength = bytes.length * 8;
  for (let pixel = 0; pixel < imageData.data.length && bitIndex < bitLength; pixel += 4) {
    if (imageData.data[pixel + 3] !== 255) continue;
    for (let channel = 0; channel < 3 && bitIndex < bitLength; channel++, bitIndex++) {
      const bit = (bytes[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1;
      imageData.data[pixel + channel] = (imageData.data[pixel + channel] & 0xFE) | bit;
    }
  }
  if (bitIndex !== bitLength) throw new Error('The message could not be placed into this image.');
}

function extractBytes(imageData, byteLength) {
  const capacity = payloadCapacity(imageData);
  if (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > capacity) {
    throw new Error('The concealed data length is invalid.');
  }
  const bytes = new Uint8Array(byteLength);
  const bitLength = byteLength * 8;
  let bitIndex = 0;
  for (let pixel = 0; pixel < imageData.data.length && bitIndex < bitLength; pixel += 4) {
    if (imageData.data[pixel + 3] !== 255) continue;
    for (let channel = 0; channel < 3 && bitIndex < bitLength; channel++, bitIndex++) {
      bytes[bitIndex >>> 3] |= (imageData.data[pixel + channel] & 1) << (7 - (bitIndex & 7));
    }
  }
  if (bitIndex !== bitLength) throw new Error('The concealed data is incomplete.');
  return bytes;
}

function sameBytes(first, second) {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index++) difference |= first[index] ^ second[index];
  return difference === 0;
}

function readHeader(header) {
  if (header.length < HEADER_BYTES || !sameBytes(header.subarray(0, MAGIC.length), MAGIC)) {
    throw new Error('No Image Cipher message was found in this image.');
  }
  if (header[8] !== FORMAT_VERSION) throw new Error('This image uses an unsupported Image Cipher format.');
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const iterations = view.getUint32(10, false);
  const cipherLength = view.getUint32(42, false);
  if (iterations < 100000 || iterations > 2000000 || cipherLength < AUTH_TAG_BYTES || cipherLength > MAX_MESSAGE_BYTES + AUTH_TAG_BYTES) {
    throw new Error('The concealed Image Cipher data is damaged.');
  }
  return { iterations, cipherLength };
}

async function deriveKey(password, salt, iterations) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure encryption is not available in this browser context.');
  const passwordBytes = new TextEncoder().encode(String(password).normalize('NFKC'));
  const baseKey = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptMessage(message, password) {
  const plainBytes = new TextEncoder().encode(message);
  if (!plainBytes.length) throw new Error('Type a message to conceal.');
  if (plainBytes.length > MAX_MESSAGE_BYTES) throw new Error(`Messages may not exceed ${formatBytes(MAX_MESSAGE_BYTES)}.`);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const cipherBytes = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 },
    key,
    plainBytes,
  ));
  const payload = new Uint8Array(HEADER_BYTES + cipherBytes.length);
  payload.set(MAGIC, 0);
  payload[8] = FORMAT_VERSION;
  payload[9] = 0;
  const view = new DataView(payload.buffer);
  view.setUint32(10, PBKDF2_ITERATIONS, false);
  payload.set(salt, 14);
  payload.set(iv, 30);
  view.setUint32(42, cipherBytes.length, false);
  payload.set(cipherBytes, HEADER_BYTES);
  return payload;
}

async function decryptMessage(imageData, password) {
  if (payloadCapacity(imageData) < HEADER_BYTES) throw new Error('No Image Cipher message was found in this image.');
  const header = extractBytes(imageData, HEADER_BYTES);
  const { iterations, cipherLength } = readHeader(header);
  const totalLength = HEADER_BYTES + cipherLength;
  if (totalLength > payloadCapacity(imageData)) throw new Error('The concealed Image Cipher data is incomplete.');
  const payload = extractBytes(imageData, totalLength);
  const salt = payload.slice(14, 30);
  const iv = payload.slice(30, 42);
  const ciphertext = payload.slice(HEADER_BYTES);
  const key = await deriveKey(password, salt, iterations);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 },
      key,
      ciphertext,
    );
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch (_) {
    throw new Error('The password is incorrect, or the image data has been changed.');
  }
}

async function imageDataFromUrl(url) {
  const image = await createImageElement(url);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('The image has invalid dimensions.');
  if (width * height > MAX_IMAGE_PIXELS) throw new Error('This image is too large. Use an image under 32 megapixels.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  let imageData;
  try { imageData = context.getImageData(0, 0, width, height); }
  catch (_) { throw new Error('The image pixels could not be read.'); }
  return { image, imageData, width, height };
}

export function createPlugin() {
  let api = null;
  let uiRoot = null;
  let shadowHost = null;
  let controller = null;
  let refs = null;
  let hideSource = null;
  let revealSource = null;
  let encodedOutput = null;
  let destroyed = false;
  let busy = false;

  function query(id) {
    return uiRoot.getElementById ? uiRoot.getElementById(id) : uiRoot.querySelector(`#${id}`);
  }

  function setStatus(kind, text, state = '') {
    const element = kind === 'hide' ? refs.hideStatus : refs.revealStatus;
    element.textContent = text;
    element.classList.remove('success', 'error');
    if (state) element.classList.add(state);
  }

  function releaseSource(source) {
    if (source?.revoke && source.url) URL.revokeObjectURL(source.url);
  }

  function clearEncodedOutput() {
    if (encodedOutput?.url) URL.revokeObjectURL(encodedOutput.url);
    encodedOutput = null;
    if (refs) refs.addEncoded.disabled = true;
  }

  function getMessageBytes() {
    return new TextEncoder().encode(refs.secretMessage.value).length;
  }

  function getMessageCapacity() {
    if (!hideSource) return 0;
    return Math.max(0, hideSource.capacity - HEADER_BYTES - AUTH_TAG_BYTES);
  }

  function updateCapacity() {
    const used = getMessageBytes();
    refs.messageCount.textContent = `${formatBytes(used)}`;
    if (!hideSource) {
      refs.capacityText.textContent = 'Choose an image';
      refs.capacityBar.style.width = '0%';
      refs.capacityBox.classList.remove('over');
      return;
    }
    const available = getMessageCapacity();
    const ratio = available ? Math.min(1, used / available) : (used ? 1 : 0);
    refs.capacityText.textContent = `${formatBytes(used)} of ${formatBytes(available)}`;
    refs.capacityBar.style.width = `${Math.max(used ? 1 : 0, ratio * 100)}%`;
    refs.capacityBox.classList.toggle('over', used > available || used > MAX_MESSAGE_BYTES);
  }

  function updateReadyState() {
    const messageBytes = getMessageBytes();
    const password = refs.hidePassword.value;
    const ready = Boolean(
      hideSource && messageBytes > 0 && messageBytes <= getMessageCapacity() && messageBytes <= MAX_MESSAGE_BYTES &&
      password.length >= 8 && password === refs.confirmPassword.value && !busy
    );
    refs.hideDownload.disabled = !ready;
    refs.revealButton.disabled = !(revealSource && refs.revealPassword.value && !busy);
  }

  function invalidateOutput() {
    clearEncodedOutput();
    updateCapacity();
    updateReadyState();
  }

  function showSource(kind, source) {
    const isHide = kind === 'hide';
    const preview = isHide ? refs.hidePreview : refs.revealPreview;
    const empty = isHide ? refs.hideEmpty : refs.revealEmpty;
    const meta = isHide ? refs.hideImageMeta : refs.revealImageMeta;
    const name = isHide ? refs.hideImageName : refs.revealImageName;
    const size = isHide ? refs.hideImageSize : refs.revealImageSize;
    const dropzone = isHide ? refs.hideDropzone : refs.revealDropzone;
    const replace = isHide ? refs.replaceHideImage : refs.replaceRevealImage;
    preview.src = source.url;
    preview.hidden = false;
    empty.hidden = true;
    meta.hidden = false;
    name.textContent = source.name;
    size.textContent = `${source.width} × ${source.height}`;
    dropzone.classList.add('has-image');
    replace.disabled = false;
  }

  async function makeSource(url, name, revoke) {
    const decoded = await imageDataFromUrl(url);
    const capacity = payloadCapacity(decoded.imageData);
    return { ...decoded, url, name: name || 'Image', revoke, capacity };
  }

  async function setHideSourceFromUrl(url, name, revoke = false) {
    try {
      setStatus('hide', 'Reading image pixels…');
      const next = await makeSource(url, name, revoke);
      releaseSource(hideSource);
      hideSource = next;
      clearEncodedOutput();
      showSource('hide', hideSource);
      updateCapacity();
      updateReadyState();
      if (getMessageCapacity() > 0) setStatus('hide', `Ready · ${formatBytes(getMessageCapacity())} message capacity`, 'success');
      else setStatus('hide', 'This image has too few fully opaque pixels to carry a message.', 'error');
    } catch (error) {
      if (revoke) URL.revokeObjectURL(url);
      setStatus('hide', error.message || 'The image could not be loaded.', 'error');
    }
  }

  async function setRevealSourceFromUrl(url, name, revoke = false) {
    try {
      setStatus('reveal', 'Reading encoded PNG…');
      const next = await makeSource(url, name, revoke);
      releaseSource(revealSource);
      revealSource = next;
      showSource('reveal', revealSource);
      refs.revealedArea.hidden = true;
      refs.revealedMessage.value = '';
      updateReadyState();
      setStatus('reveal', 'Image loaded · enter its password', 'success');
    } catch (error) {
      if (revoke) URL.revokeObjectURL(url);
      setStatus('reveal', error.message || 'The image could not be loaded.', 'error');
    }
  }

  async function setHideSourceFromFile(file) {
    if (!api.files.acceptsImage(file)) {
      setStatus('hide', 'Choose a supported image file.', 'error');
      return;
    }
    const url = URL.createObjectURL(file);
    await setHideSourceFromUrl(url, file.name, true);
  }

  async function setRevealSourceFromFile(file) {
    if (!api.files.acceptsImage(file) || !/\.png$/i.test(file.name || '') && file.type !== 'image/png') {
      setStatus('reveal', 'Choose the original PNG created by Image Cipher.', 'error');
      return;
    }
    const url = URL.createObjectURL(file);
    await setRevealSourceFromUrl(url, file.name, true);
  }

  async function useSelectedImage() {
    try {
      setStatus('hide', 'Reading selected Clatasha image…');
      const selected = await api.canvas.getSelectedImage();
      if (!selected?.dataUrl) throw new Error('Select one image layer in Clatasha first.');
      await setHideSourceFromUrl(selected.dataUrl, selected.name || 'Selected Clatasha image');
    } catch (error) {
      setStatus('hide', error.message || 'The selected image could not be used.', 'error');
    }
  }

  async function createEncodedPng() {
    const message = refs.secretMessage.value;
    const password = refs.hidePassword.value;
    if (!hideSource) throw new Error('Choose an image first.');
    if (!message) throw new Error('Type a message to conceal.');
    if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
    if (password !== refs.confirmPassword.value) throw new Error('The two passwords do not match.');
    const messageBytes = new TextEncoder().encode(message).length;
    if (messageBytes > getMessageCapacity()) throw new Error('This message is too large for the chosen image.');

    const payload = await encryptMessage(message, password);
    const copiedData = new Uint8ClampedArray(hideSource.imageData.data);
    const encodedData = new ImageData(copiedData, hideSource.width, hideSource.height);
    embedBytes(encodedData, payload);

    const canvas = document.createElement('canvas');
    canvas.width = hideSource.width;
    canvas.height = hideSource.height;
    canvas.getContext('2d').putImageData(encodedData, 0, 0);
    const blob = await canvasToBlob(canvas);

    const verifyUrl = URL.createObjectURL(blob);
    try {
      const verification = await imageDataFromUrl(verifyUrl);
      const extracted = extractBytes(verification.imageData, payload.length);
      if (!sameBytes(payload, extracted)) throw new Error('The PNG integrity check failed. Try another image.');
    } finally {
      URL.revokeObjectURL(verifyUrl);
    }
    return blob;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function hideAndDownload() {
    if (busy) return;
    busy = true;
    clearEncodedOutput();
    updateReadyState();
    try {
      setStatus('hide', 'Encrypting and checking the PNG…');
      const blob = await createEncodedPng();
      if (destroyed) return;
      encodedOutput = {
        blob,
        url: URL.createObjectURL(blob),
        name: `${safeBaseName(hideSource.name)}-cipher.png`,
      };
      downloadBlob(blob, encodedOutput.name);
      refs.addEncoded.disabled = false;
      setStatus('hide', 'Encrypted PNG downloaded · keep this original file', 'success');
    } catch (error) {
      setStatus('hide', error.message || 'The message could not be concealed.', 'error');
    } finally {
      busy = false;
      updateReadyState();
    }
  }

  async function addEncodedToCanvas() {
    if (!encodedOutput || busy) return;
    busy = true;
    refs.addEncoded.disabled = true;
    updateReadyState();
    try {
      setStatus('hide', 'Adding the encrypted PNG to Clatasha…');
      await api.canvas.addImageBlob(encodedOutput.blob, { name: 'Image Cipher Result' });
      setStatus('hide', 'Added as Image Cipher Result · keep the downloaded PNG', 'success');
      api.ui.notify('Image Cipher Result added as the top layer');
    } catch (error) {
      setStatus('hide', error.message || 'The image could not be added.', 'error');
    } finally {
      busy = false;
      refs.addEncoded.disabled = !encodedOutput;
      updateReadyState();
    }
  }

  async function revealMessage() {
    if (!revealSource || busy) return;
    busy = true;
    updateReadyState();
    refs.revealedArea.hidden = true;
    refs.revealedMessage.value = '';
    try {
      setStatus('reveal', 'Checking and decrypting the concealed message…');
      const message = await decryptMessage(revealSource.imageData, refs.revealPassword.value);
      if (destroyed) return;
      refs.revealedMessage.value = message;
      refs.revealedArea.hidden = false;
      setStatus('reveal', `Message decrypted · ${formatBytes(new TextEncoder().encode(message).length)}`, 'success');
    } catch (error) {
      setStatus('reveal', error.message || 'The message could not be revealed.', 'error');
    } finally {
      busy = false;
      updateReadyState();
    }
  }

  async function copyRevealedMessage() {
    const text = refs.revealedMessage.value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      refs.revealedMessage.focus();
      refs.revealedMessage.select();
      document.execCommand('copy');
    }
    refs.copyMessage.textContent = 'Copied';
    setTimeout(() => { if (refs) refs.copyMessage.textContent = 'Copy'; }, 1300);
  }

  function changeMode(mode) {
    const hide = mode === 'hide';
    refs.hidePanel.hidden = !hide;
    refs.revealPanel.hidden = hide;
    refs.hideTab.classList.toggle('active', hide);
    refs.revealTab.classList.toggle('active', !hide);
    refs.hideTab.setAttribute('aria-selected', String(hide));
    refs.revealTab.setAttribute('aria-selected', String(!hide));
  }

  function chooseFile(input) {
    input.value = '';
    input.click();
  }

  function bindDropzone(dropzone, input, acceptFile) {
    const signal = controller.signal;
    dropzone.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      chooseFile(input);
    }, { signal });
    dropzone.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        chooseFile(input);
      }
    }, { signal });
    dropzone.addEventListener('dragover', event => {
      event.preventDefault();
      dropzone.classList.add('drag-over');
    }, { signal });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'), { signal });
    dropzone.addEventListener('drop', event => {
      event.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = event.dataTransfer?.files?.[0];
      if (file) acceptFile(file);
    }, { signal });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) acceptFile(file);
    }, { signal });
  }

  function bindEvents() {
    const signal = controller.signal;
    refs.hideTab.addEventListener('click', () => changeMode('hide'), { signal });
    refs.revealTab.addEventListener('click', () => changeMode('reveal'), { signal });
    bindDropzone(refs.hideDropzone, refs.hideFile, setHideSourceFromFile);
    bindDropzone(refs.revealDropzone, refs.revealFile, setRevealSourceFromFile);
    refs.useSelected.addEventListener('click', useSelectedImage, { signal });
    refs.replaceHideImage.addEventListener('click', () => chooseFile(refs.hideFile), { signal });
    refs.replaceRevealImage.addEventListener('click', () => chooseFile(refs.revealFile), { signal });
    refs.secretMessage.addEventListener('input', invalidateOutput, { signal });
    refs.hidePassword.addEventListener('input', invalidateOutput, { signal });
    refs.confirmPassword.addEventListener('input', invalidateOutput, { signal });
    refs.revealPassword.addEventListener('input', updateReadyState, { signal });
    refs.hidePassword.addEventListener('keydown', event => { if (event.key === 'Enter' && !refs.hideDownload.disabled) hideAndDownload(); }, { signal });
    refs.confirmPassword.addEventListener('keydown', event => { if (event.key === 'Enter' && !refs.hideDownload.disabled) hideAndDownload(); }, { signal });
    refs.revealPassword.addEventListener('keydown', event => { if (event.key === 'Enter' && !refs.revealButton.disabled) revealMessage(); }, { signal });
    refs.hideDownload.addEventListener('click', hideAndDownload, { signal });
    refs.addEncoded.addEventListener('click', addEncodedToCanvas, { signal });
    refs.revealButton.addEventListener('click', revealMessage, { signal });
    refs.copyMessage.addEventListener('click', copyRevealedMessage, { signal });
    uiRoot.querySelectorAll('[data-toggle-password]').forEach(button => {
      button.addEventListener('click', () => {
        const input = query(button.dataset.togglePassword);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.textContent = show ? 'Hide' : 'Show';
        button.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} password`);
      }, { signal });
    });
  }

  function collectRefs() {
    refs = {
      hideTab: query('hideTab'), revealTab: query('revealTab'), hidePanel: query('hidePanel'), revealPanel: query('revealPanel'),
      hideDropzone: query('hideDropzone'), hideFile: query('hideFile'), hidePreview: query('hidePreview'), hideEmpty: query('hideEmpty'), hideImageMeta: query('hideImageMeta'), hideImageName: query('hideImageName'), hideImageSize: query('hideImageSize'),
      revealDropzone: query('revealDropzone'), revealFile: query('revealFile'), revealPreview: query('revealPreview'), revealEmpty: query('revealEmpty'), revealImageMeta: query('revealImageMeta'), revealImageName: query('revealImageName'), revealImageSize: query('revealImageSize'),
      useSelected: query('useSelected'), replaceHideImage: query('replaceHideImage'), replaceRevealImage: query('replaceRevealImage'),
      secretMessage: query('secretMessage'), messageCount: query('messageCount'), hidePassword: query('hidePassword'), confirmPassword: query('confirmPassword'),
      capacityBox: uiRoot.querySelector('.ic-capacity'), capacityText: query('capacityText'), capacityBar: query('capacityBar'),
      hideStatus: query('hideStatus'), hideDownload: query('hideDownload'), addEncoded: query('addEncoded'),
      revealPassword: query('revealPassword'), revealButton: query('revealButton'), revealStatus: query('revealStatus'),
      revealedArea: query('revealedArea'), revealedMessage: query('revealedMessage'), copyMessage: query('copyMessage'),
    };
  }

  return {
    async mount(options) {
      destroyed = false;
      controller = new AbortController();
      api = options.pluginApi || options.api;
      if (options.container) {
        const [html, css] = await getAssetText();
        if (destroyed) return;
        shadowHost = document.createElement('div');
        shadowHost.style.width = '100%';
        shadowHost.style.height = '100%';
        shadowHost.dataset.theme = options.theme;
        uiRoot = shadowHost.attachShadow({ mode: 'open' });
        uiRoot.innerHTML = `<style>${css}</style>${html}`;
        options.container.replaceChildren(shadowHost);
      } else {
        uiRoot = options.root;
      }
      collectRefs();
      bindEvents();
      updateCapacity();
      updateReadyState();
    },
    setTheme(theme) {
      if (shadowHost) shadowHost.dataset.theme = theme;
      else if (typeof document !== 'undefined') document.body.dataset.theme = theme;
    },
    destroy() {
      destroyed = true;
      controller?.abort();
      releaseSource(hideSource);
      releaseSource(revealSource);
      clearEncodedOutput();
      if (refs) {
        refs.hidePassword.value = '';
        refs.confirmPassword.value = '';
        refs.revealPassword.value = '';
        refs.secretMessage.value = '';
        refs.revealedMessage.value = '';
      }
      hideSource = null;
      revealSource = null;
      refs = null;
      uiRoot = null;
      shadowHost?.remove();
      shadowHost = null;
      api = null;
    },
  };
}
