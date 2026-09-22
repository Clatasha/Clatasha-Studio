export const manifest = Object.freeze({
  id: 'clatasha.image-to-svg', name: 'Clatasha Image to SVG', version: '1.2.0',
  developer: 'Clatasha', description: 'Trace a local image into vector paths and download a scalable SVG.',
  apiVersion: 1, type: 'tool', entry: 'plugin.js', menuLabel: 'Image to SVG', icon: 'icon.svg',
  permissions: ['files.localImages', 'canvas.readSelection', 'canvas.addImage'],
});

/* EXTERNAL_ASSET_LOADER_START */
let assetsPromise = null;
function getAssetText() {
  if (!assetsPromise) assetsPromise = Promise.all(['plugin.html', 'plugin.css'].map(name =>
    fetch(new URL('./' + name, import.meta.url)).then(response => {
      if (!response.ok) throw new Error('Image to SVG interface could not be loaded.');
      return response.text();
    })
  ));
  return assetsPromise;
}
/* EXTERNAL_ASSET_LOADER_END */

export { traceImageData } from './trace-core.js';
import { createTraceRunner } from './trace-runner.js';
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));
function cancelledError() { const error = new Error('Conversion cancelled'); error.name = 'AbortError'; return error; }

function decodeImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('This image could not be decoded.'));
    image.src = url;
  });
}

function fileStem(name) {
  return String(name || 'image').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'image';
}

function formatBytes(value) { return value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(1)} MB`; }

export function createPlugin() {
  let root, refs, api, host, controller, source = null, result = null;
  let revision = 0, destroyed = false, busy = false;
  const tracer = createTraceRunner();
  let pan = null, skipClickUntil = 0;
  const status = (text, state = '') => {
    if (!refs) return;
    refs.Status.textContent = text;
    refs.Status.classList.toggle('error', state === 'error');
    refs.Status.classList.toggle('success', state === 'success');
  };
  function ready() {
    if (!refs) return;
    refs.Convert.disabled = busy || !source;
    refs.Download.disabled = refs.Add.disabled = busy || !result;
    refs.Choose.disabled = refs.Selected.disabled = busy;
    root.querySelectorAll('select, input[type="range"], input[type="checkbox"]').forEach(control => { if (control !== refs.Zoom) control.disabled = busy; });
    refs.Dropzone.setAttribute('aria-disabled', String(busy));
  }
  function setBusy(value, cancellable = false) {
    busy = value;
    if (refs) refs.Cancel.hidden = !value || !cancellable;
    ready();
  }
  function clearResult() {
    if (result?.url) URL.revokeObjectURL(result.url);
    result = null;
    if (refs) {
      refs.ResultPreview.hidden = true;
      refs.ResultPreview.removeAttribute('src');
      refs.ResultEmpty.hidden = false;
      refs.Stats.textContent = 'Vector paths, without an embedded image';
      refs.ResultSize.textContent = 'SVG';
    }
    ready();
  }
  function releaseSource(value) { if (value?.revoke) URL.revokeObjectURL(value.url); }
  function checkJob(job) { if (destroyed || job !== revision) throw cancelledError(); }

  async function readSource(url, name, revoke = false) {
    const job = ++revision;
    setBusy(true); clearResult(); status('Reading image…');
    try {
      const image = await decodeImage(url);
      checkJob(job);
      const width = image.naturalWidth, height = image.naturalHeight;
      if (!width || !height || width * height > 32 * 1024 * 1024) throw new Error('Choose an image with no more than 32 million pixels.');
      releaseSource(source);
      source = { image, url, name, revoke, width, height };
      refs.SourcePreview.src = url;
      refs.SourcePreview.hidden = false;
      refs.SourceEmpty.hidden = true;
      refs.SourceSize.textContent = `${width} × ${height}`;
      refs.SourceName.textContent = name;
      updateZoom();
      status(/\.gif$/i.test(name) ? 'Image ready. The SVG will trace one GIF frame.' : 'Image ready. Choose your settings and convert.');
    } catch (error) {
      if (revoke) URL.revokeObjectURL(url);
      if (error.name !== 'AbortError' && !destroyed) status(error.message, 'error');
    } finally { if (job === revision && !destroyed) setBusy(false); }
  }

  async function chooseFile(file) {
    if (busy || !file) return;
    if (!api.files.acceptsImage(file)) return status('Choose a supported raster image.', 'error');
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) return status('This file is already SVG. Choose a raster image to trace.', 'error');
    if (file.size > 50 * 1024 * 1024) return status('Choose an image smaller than 50 MB.', 'error');
    await readSource(URL.createObjectURL(file), file.name, true);
  }

  async function useSelected() {
    if (busy) return;
    const job = ++revision;
    setBusy(true); status('Reading selected image…');
    try {
      const selected = await api.canvas.getSelectedImage();
      checkJob(job);
      if (!selected?.dataUrl) throw new Error('Select one image layer in Clatasha first.');
      await readSource(selected.dataUrl, selected.name || 'Selected image');
    } catch (error) { if (!destroyed && error.name !== 'AbortError') status(error.message, 'error'); }
    finally { if (!destroyed && revision === job) setBusy(false); }
  }

  function options() {
    return {
      mode: refs.Mode.value, colors: Number(refs.Colors.value), threshold: Number(refs.Threshold.value),
      smoothing: Number(refs.Smooth.value), minArea: Number(refs.Speckles.value), removeWhite: refs.RemoveWhite.checked,
      outputWidth: source.width, outputHeight: source.height,
      quality: refs.Quality.value, preset: refs.Preset.value,
    };
  }

  async function convert() {
    if (!source || busy) return;
    const job = ++revision;
    clearResult(); setBusy(true, true); status('Preparing image…');
    try {
      await nextTask(); checkJob(job);
      const maxSide = Number(refs.Detail.value);
      const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
      const raster = document.createElement('canvas');
      raster.width = Math.max(1, Math.round(source.width * scale));
      raster.height = Math.max(1, Math.round(source.height * scale));
      const context = raster.getContext('2d', { willReadFrequently: true });
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(source.image, 0, 0, raster.width, raster.height);
      const pixels = context.getImageData(0, 0, raster.width, raster.height);
      const traced = await tracer.run({ width: pixels.width, height: pixels.height, data: pixels.data }, options(),
        (stage, percent) => { if (!destroyed && job === revision) status(`${stage} · ${Math.round(percent)}%`); });
      checkJob(job);
      const blob = new Blob([traced.svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      try { await decodeImage(url); checkJob(job); }
      catch (error) { URL.revokeObjectURL(url); throw error; }
      result = { ...traced, blob, url };
      refs.ResultPreview.src = url;
      refs.ResultPreview.hidden = false;
      refs.ResultEmpty.hidden = true;
      refs.ResultSize.textContent = formatBytes(blob.size);
      refs.Stats.textContent = `${traced.colors} colors · ${traced.contours.toLocaleString()} vector contours\nTraced at ${traced.traceWidth} × ${traced.traceHeight} · Output ${traced.width} × ${traced.height}`;
      updateZoom();
      status('SVG ready. Compare the preview, then download.', 'success');
    } catch (error) { if (!destroyed && error.name !== 'AbortError') status(error.message || 'Conversion failed.', 'error'); }
    finally { if (!destroyed && revision === job) setBusy(false); }
  }

  function cancel() {
    if (!busy) return;
    revision++; tracer.cancel(); setBusy(false); status('Conversion cancelled. Adjust settings or try again.');
  }

  function download() {
    if (!result || busy) return;
    const link = document.createElement('a');
    link.href = result.url;
    link.download = fileStem(source.name) + '-vector.svg';
    link.click();
    status('SVG downloaded.', 'success');
  }

  async function addToCanvas() {
    if (!result || busy) return;
    const job = ++revision, generated = result, name = fileStem(source.name) + ' SVG';
    setBusy(true); status('Adding SVG to the canvas…');
    try {
      await api.canvas.addImageBlob(generated.blob, { name });
      checkJob(job); status('SVG added as a new image layer.', 'success');
    } catch (error) { if (!destroyed && error.name !== 'AbortError') status(error.message || 'The SVG could not be added.', 'error'); }
    finally { if (!destroyed && revision === job) setBusy(false); }
  }

  function updateSettings() {
    refs.ColorsField.hidden = refs.Mode.value === 'mono';
    refs.ThresholdField.hidden = refs.Mode.value !== 'mono';
    refs.SmoothValue.textContent = refs.Smooth.value;
    refs.ThresholdValue.textContent = refs.Threshold.value;
    clearResult();
    if (source) status('Settings changed. Convert again to preview the result.');
  }

  function applyPreset() {
    const kind = refs.Preset.value, quality = refs.Quality.value;
    const high = quality === 'high', compact = quality === 'compact';
    refs.Mode.value = 'color';
    refs.Colors.value = String(kind === 'logo' ? (high ? 32 : compact ? 8 : 16) : kind === 'photo' ? (high ? 256 : compact ? 64 : 128) : (high ? 128 : compact ? 32 : 64));
    refs.Detail.value = high ? '2048' : compact ? '1024' : '1536';
    refs.Smooth.value = kind === 'logo' ? '0.4' : kind === 'photo' ? '0.3' : '0.6';
    refs.Speckles.value = kind === 'logo' ? '2' : high ? '0' : '2';
    updateSettings();
  }

  function updateZoom() {
    const scale = Number(refs.Zoom.value) / 100;
    for (const [pane, image] of [[refs.Dropzone, refs.SourcePreview], [refs.ResultPane, refs.ResultPreview]]) {
      pane.classList.toggle('zoomed', !!scale && !!source);
      image.style.width = scale && source ? source.width * scale + 'px' : '';
      image.style.height = scale && source ? source.height * scale + 'px' : '';
      pane.scrollLeft = pane.scrollTop = 0;
    }
  }

  function syncScroll(from, to) {
    for (const [scroll, size, viewport] of [['scrollLeft','scrollWidth','clientWidth'],['scrollTop','scrollHeight','clientHeight']]) {
      const denominator = from[size] - from[viewport];
      const target = denominator > 0 ? from[scroll] / denominator * Math.max(0, to[size] - to[viewport]) : 0;
      if (Math.abs(to[scroll] - target) >= 1) to[scroll] = target;
    }
  }

  function bind() {
    const on = (element, type, handler) => element.addEventListener(type, handler, { signal: controller.signal });
    const openFile = () => { if (!busy) refs.File.click(); };
    on(refs.Choose, 'click', openFile);
    on(refs.Dropzone, 'click', () => { if (Date.now() >= skipClickUntil && !(source && Number(refs.Zoom.value))) openFile(); });
    on(refs.Dropzone, 'keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openFile(); }
    });
    on(refs.File, 'change', event => { const file = event.target.files[0]; event.target.value = ''; chooseFile(file); });
    on(refs.Selected, 'click', useSelected);
    on(refs.Convert, 'click', convert);
    on(refs.Cancel, 'click', cancel);
    on(refs.Download, 'click', download);
    on(refs.Add, 'click', addToCanvas);
    root.querySelectorAll('select, input[type="range"], input[type="checkbox"]').forEach(control => {
      const handler = control === refs.Zoom ? updateZoom : control === refs.Preset || control === refs.Quality ? applyPreset : updateSettings;
      on(control, 'input', handler);
    });
    for (const pane of [refs.Dropzone, refs.ResultPane]) {
      on(pane, 'scroll', () => syncScroll(pane, pane === refs.Dropzone ? refs.ResultPane : refs.Dropzone));
      on(pane, 'pointerdown', event => {
        if (event.button !== 0 || !source || !Number(refs.Zoom.value)) return;
        pan = { pane, id: event.pointerId, x: event.clientX, y: event.clientY, left: pane.scrollLeft, top: pane.scrollTop };
        pane.setPointerCapture?.(event.pointerId); pane.classList.add('panning');
      });
      on(pane, 'pointermove', event => {
        if (!pan || pan.pane !== pane || pan.id !== event.pointerId) return;
        const dx = event.clientX - pan.x, dy = event.clientY - pan.y;
        pane.scrollLeft = pan.left - dx; pane.scrollTop = pan.top - dy;
        syncScroll(pane, pane === refs.Dropzone ? refs.ResultPane : refs.Dropzone);
        if (Math.hypot(dx, dy) > 4) skipClickUntil = Date.now() + 350;
      });
      const stopPan = event => {
        if (!pan || pan.pane !== pane || pan.id !== event.pointerId) return;
        if (pane.hasPointerCapture?.(event.pointerId)) pane.releasePointerCapture(event.pointerId);
        pane.classList.remove('panning'); pan = null;
      };
      on(pane, 'pointerup', stopPan); on(pane, 'pointercancel', stopPan); on(pane, 'lostpointercapture', stopPan);
    }
    on(refs.Dropzone, 'dragenter', event => {
      event.preventDefault(); if (!busy) refs.Dropzone.classList.add('dragging');
    });
    on(refs.Dropzone, 'dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy'; });
    on(refs.Dropzone, 'dragleave', event => {
      if (!event.relatedTarget || !refs.Dropzone.contains(event.relatedTarget)) refs.Dropzone.classList.remove('dragging');
    });
    on(refs.Dropzone, 'drop', event => {
      event.preventDefault(); event.stopPropagation(); refs.Dropzone.classList.remove('dragging');
      chooseFile(event.dataTransfer.files[0]);
    });
    // Drop guards also apply inside an installed sandbox, which has its own document.
    on(root, 'dragover', event => { if (Array.from(event.dataTransfer?.types || []).some(type => type === 'Files' || type === 'text/uri-list')) event.preventDefault(); });
    on(root, 'drop', event => { if (Array.from(event.dataTransfer?.types || []).some(type => type === 'Files' || type === 'text/uri-list')) event.preventDefault(); });
  }

  return {
    async mount(options) {
      destroyed = false;
      controller = new AbortController();
      api = options.pluginApi || options.api;
      if (options.container) {
        const [html, css] = await getAssetText();
        if (destroyed) return;
        host = document.createElement('div');
        host.style.width = host.style.height = '100%';
        host.dataset.theme = options.theme;
        root = host.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>${css}</style>${html}`;
        options.container.replaceChildren(host);
      } else root = options.root;
      refs = Object.fromEntries(['Status','Convert','Download','Add','Cancel','Choose','Selected','Dropzone','File','SourcePreview','SourceEmpty','SourceSize','SourceName','ResultPreview','ResultPane','ResultEmpty','ResultSize','Stats','Mode','Colors','ColorsField','Threshold','ThresholdField','ThresholdValue','Detail','Smooth','SmoothValue','Speckles','RemoveWhite','Preset','Quality','Zoom'].map(name => [name, root.querySelector('#vs' + name)]));
      bind(); ready();
    },
    setTheme(theme) { if (host) host.dataset.theme = theme; else if (!destroyed) document.body.dataset.theme = theme; },
    destroy() {
      destroyed = true; revision++; tracer.destroy(); controller?.abort(); pan = null;
      releaseSource(source); source = null; clearResult();
      root = refs = api = null;
      host?.remove(); host = null;
    },
  };
}
