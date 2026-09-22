export const manifest = Object.freeze({
  id: 'clatasha.image-merger',
  name: 'Image Merger',
  version: '1.0.1',
  developer: 'Clatasha',
  description: 'Combine two local images into one polished canvas layer.',
  apiVersion: 1,
  type: 'tool',
  entry: 'plugin.js',
  menuLabel: 'Image Merger',
  icon: 'icon.svg',
  permissions: [
    'files.localImages',
    'canvas.readDocument',
    'canvas.readSelection',
    'canvas.addImage',
    'plugin.storage',
  ],
});

const DEFAULT_SETTINGS = Object.freeze({
  layout: 'horizontal',
  format: 'current',
  split: 50,
  divider: true,
  dividerColor: '#ffffff',
  dividerWidth: 4,
  background: 'black',
});

const OUTPUT_SIZES = Object.freeze({
  '16:9': { width: 1920, height: 1080, label: 'YouTube thumbnail' },
  '9:16': { width: 1080, height: 1920, label: 'Vertical graphic' },
});

let assetTextPromise = null;

function getAssetText() {
  if (!assetTextPromise) {
    assetTextPromise = Promise.all([
      fetch(new URL('./plugin.html', import.meta.url)).then(response => {
        if (!response.ok) throw new Error('Image Merger interface could not be loaded.');
        return response.text();
      }),
      fetch(new URL('./plugin.css', import.meta.url)).then(response => {
        if (!response.ok) throw new Error('Image Merger styles could not be loaded.');
        return response.text();
      }),
    ]);
  }
  return assetTextPromise;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The image could not be decoded.'));
    image.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('The merged image could not be created.'));
    }, 'image/png');
  });
}

export function createPlugin() {
  let shadowHost = null;
  let root = null;
  let api = null;
  let controller = null;
  let settings = { ...DEFAULT_SETTINGS };
  let slots = [null, null];
  let offsets = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  let dragState = null;
  let refs = null;
  let destroyed = false;

  function getOutputSize() {
    if (settings.format === 'current') {
      const size = api.canvas.getDocumentSize();
      return { width: size.width, height: size.height, label: 'Current canvas' };
    }
    return OUTPUT_SIZES[settings.format];
  }

  function getRects(size = getOutputSize()) {
    const ratio = clamp(settings.split, 20, 80) / 100;
    if (settings.layout === 'vertical') {
      const firstHeight = Math.round(size.height * ratio);
      return [
        { x: 0, y: 0, width: size.width, height: firstHeight },
        { x: 0, y: firstHeight, width: size.width, height: size.height - firstHeight },
      ];
    }
    const firstWidth = Math.round(size.width * ratio);
    return [
      { x: 0, y: 0, width: firstWidth, height: size.height },
      { x: firstWidth, y: 0, width: size.width - firstWidth, height: size.height },
    ];
  }

  function getCoverMetrics(image, rect, offset) {
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const rectRatio = rect.width / rect.height;
    let width;
    let height;
    if (imageRatio > rectRatio) {
      height = rect.height;
      width = height * imageRatio;
    } else {
      width = rect.width;
      height = width / imageRatio;
    }
    const maxX = Math.max(0, (width - rect.width) / 2);
    const maxY = Math.max(0, (height - rect.height) / 2);
    offset.x = clamp(offset.x, -maxX, maxX);
    offset.y = clamp(offset.y, -maxY, maxY);
    return {
      x: rect.x + (rect.width - width) / 2 + offset.x,
      y: rect.y + (rect.height - height) / 2 + offset.y,
      width,
      height,
      maxX,
      maxY,
    };
  }

  function drawSlot(context, slot, rect, offset) {
    if (!slot?.image) return;
    const metrics = getCoverMetrics(slot.image, rect, offset);
    context.save();
    context.beginPath();
    context.rect(rect.x, rect.y, rect.width, rect.height);
    context.clip();
    context.drawImage(slot.image, metrics.x, metrics.y, metrics.width, metrics.height);
    context.restore();
  }

  function setStatus(message, success = false) {
    if (!refs?.statusText) return;
    refs.statusText.textContent = message;
    refs.statusText.classList.toggle('success', success);
  }

  function saveSettings() {
    api.storage.set('settings', settings);
  }

  function syncControls() {
    root.querySelectorAll('[data-layout]').forEach(button => {
      button.classList.toggle('active', button.dataset.layout === settings.layout);
    });
    root.querySelectorAll('[data-format]').forEach(button => {
      button.classList.toggle('active', button.dataset.format === settings.format);
    });
    root.querySelectorAll('[data-background]').forEach(button => {
      button.classList.toggle('active', button.dataset.background === settings.background);
    });
    refs.splitRange.value = String(settings.split);
    refs.splitValue.textContent = `${settings.split}%`;
    refs.dividerToggle.checked = settings.divider;
    refs.dividerColor.value = settings.dividerColor;
    refs.dividerWidth.value = String(settings.dividerWidth);
    refs.dividerWidthValue.textContent = `${settings.dividerWidth} px`;
    refs.dividerOptions.classList.toggle('disabled', !settings.divider);
  }

  function updateSourceCard(index) {
    const slotNumber = index + 1;
    const slot = slots[index];
    const card = refs[`sourceCard${slotNumber}`];
    const thumb = refs[`thumb${slotNumber}`];
    const empty = refs[`empty${slotNumber}`];
    const remove = refs[`remove${slotNumber}`];
    card.classList.toggle('has-image', Boolean(slot));
    thumb.hidden = !slot;
    empty.hidden = Boolean(slot);
    remove.hidden = !slot;
    if (slot) {
      thumb.src = slot.url;
      thumb.alt = `${slot.name} preview`;
      card.setAttribute('aria-label', `Replace ${slot.name}`);
    } else {
      thumb.removeAttribute('src');
      card.setAttribute('aria-label', `Choose ${slotNumber === 1 ? 'first' : 'second'} image`);
    }
  }

  function render() {
    const size = getOutputSize();
    const canvas = refs.canvas;
    if (canvas.width !== size.width || canvas.height !== size.height) {
      canvas.width = size.width;
      canvas.height = size.height;
    }
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, size.width, size.height);
    if (settings.background !== 'transparent') {
      context.fillStyle = settings.background === 'white' ? '#ffffff' : '#000000';
      context.fillRect(0, 0, size.width, size.height);
    }

    const rects = getRects(size);
    drawSlot(context, slots[0], rects[0], offsets[0]);
    drawSlot(context, slots[1], rects[1], offsets[1]);

    if (settings.divider && slots[0] && slots[1] && settings.dividerWidth > 0) {
      context.fillStyle = settings.dividerColor;
      if (settings.layout === 'vertical') {
        const y = rects[0].height - settings.dividerWidth / 2;
        context.fillRect(0, y, size.width, settings.dividerWidth);
      } else {
        const x = rects[0].width - settings.dividerWidth / 2;
        context.fillRect(x, 0, settings.dividerWidth, size.height);
      }
    }

    const ready = Boolean(slots[0] && slots[1]);
    refs.canvasEmpty.hidden = Boolean(slots[0] || slots[1]);
    refs.download.disabled = !ready;
    refs.add.disabled = !ready;
    refs.swap.disabled = !ready;
    refs.dimensionText.textContent = `${size.width} × ${size.height} px`;
    refs.outputLabel.textContent = size.label;
    if (!ready) setStatus(slots[0] || slots[1] ? 'Add one more image' : 'Ready for two images');
  }

  function releaseSlot(index) {
    const slot = slots[index];
    if (slot?.revoke) URL.revokeObjectURL(slot.url);
    slots[index] = null;
    offsets[index] = { x: 0, y: 0 };
    refs[`file${index + 1}`].value = '';
    updateSourceCard(index);
  }

  async function setSlotFromUrl(index, url, name, revoke = false) {
    const image = await createImageElement(url);
    releaseSlot(index);
    slots[index] = { image, url, name: name || `Image ${index + 1}`, revoke };
    offsets[index] = { x: 0, y: 0 };
    updateSourceCard(index);
    render();
    setStatus(`${slots[index].name} loaded`, true);
  }

  async function setSlotFromFile(index, file) {
    if (!api.files.acceptsImage(file)) {
      setStatus('Choose a supported image file');
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      await setSlotFromUrl(index, url, file.name || `Image ${index + 1}`, true);
    } catch (error) {
      URL.revokeObjectURL(url);
      setStatus(error.message);
    }
  }

  async function useSelectedLayer(index) {
    try {
      const selected = await api.canvas.getSelectedImage();
      if (!selected?.dataUrl) {
        setStatus('Select one image layer in Clatasha first');
        return;
      }
      await setSlotFromUrl(index, selected.dataUrl, selected.name || 'Selected layer');
    } catch (error) {
      setStatus(error.message || 'The selected layer could not be used');
    }
  }

  function swapImages() {
    [slots[0], slots[1]] = [slots[1], slots[0]];
    [offsets[0], offsets[1]] = [offsets[1], offsets[0]];
    updateSourceCard(0);
    updateSourceCard(1);
    render();
    setStatus('Images swapped', true);
  }

  function clearAll() {
    releaseSlot(0);
    releaseSlot(1);
    render();
  }

  function getPointer(event) {
    const bounds = refs.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * refs.canvas.width / Math.max(1, bounds.width),
      y: (event.clientY - bounds.top) * refs.canvas.height / Math.max(1, bounds.height),
    };
  }

  function getSlotAtPoint(point) {
    const rects = getRects();
    if (settings.layout === 'vertical') return point.y < rects[0].height ? 0 : 1;
    return point.x < rects[0].width ? 0 : 1;
  }

  function startDrag(event) {
    const point = getPointer(event);
    const index = getSlotAtPoint(point);
    if (!slots[index]) return;
    dragState = {
      pointerId: event.pointerId,
      index,
      startPoint: point,
      startOffset: { ...offsets[index] },
    };
    refs.canvas.setPointerCapture(event.pointerId);
    refs.canvas.classList.add('dragging');
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const point = getPointer(event);
    const index = dragState.index;
    offsets[index].x = dragState.startOffset.x + point.x - dragState.startPoint.x;
    offsets[index].y = dragState.startOffset.y + point.y - dragState.startPoint.y;
    render();
    event.preventDefault();
  }

  function endDrag(event) {
    if (!dragState || (event.pointerId !== undefined && event.pointerId !== dragState.pointerId)) return;
    dragState = null;
    refs.canvas.classList.remove('dragging');
  }

  async function downloadPng() {
    if (!slots[0] || !slots[1]) return;
    try {
      setStatus('Preparing PNG...');
      const blob = await canvasToBlob(refs.canvas);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `clatasha-image-merger-${Date.now()}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatus('PNG downloaded', true);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function addToCanvas() {
    if (!slots[0] || !slots[1]) return;
    refs.add.disabled = true;
    try {
      setStatus('Adding merged image to Clatasha...');
      const blob = await canvasToBlob(refs.canvas);
      await api.canvas.addImageBlob(blob, { name: 'Image Merger Result' });
      setStatus('Added as Image Merger Result', true);
      api.ui.notify('Image Merger Result added as the top layer');
    } catch (error) {
      setStatus(error.message || 'The image could not be added');
    } finally {
      refs.add.disabled = !(slots[0] && slots[1]);
    }
  }

  function resetOffsets() {
    offsets = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  }

  function bindEvents() {
    const signal = controller.signal;
    [0, 1].forEach(index => {
      const number = index + 1;
      const card = refs[`sourceCard${number}`];
      const input = refs[`file${number}`];
      card.addEventListener('click', event => {
        if (event.target.closest('button')) return;
        input.click();
      }, { signal });
      card.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('button')) {
          event.preventDefault();
          input.click();
        }
      }, { signal });
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file) setSlotFromFile(index, file);
      }, { signal });
      refs[`remove${number}`].addEventListener('click', event => {
        event.stopPropagation();
        releaseSlot(index);
        render();
      }, { signal });
      refs[`selected${number}`].addEventListener('click', event => {
        event.stopPropagation();
        useSelectedLayer(index);
      }, { signal });
      card.addEventListener('dragover', event => {
        event.preventDefault();
        card.classList.add('drag-over');
      }, { signal });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'), { signal });
      card.addEventListener('drop', event => {
        event.preventDefault();
        card.classList.remove('drag-over');
        const file = [...(event.dataTransfer?.files || [])].find(item => api.files.acceptsImage(item));
        if (file) setSlotFromFile(index, file);
      }, { signal });
    });

    refs.swap.addEventListener('click', swapImages, { signal });
    refs.clear.addEventListener('click', clearAll, { signal });
    refs.download.addEventListener('click', downloadPng, { signal });
    refs.add.addEventListener('click', addToCanvas, { signal });
    refs.canvas.addEventListener('pointerdown', startDrag, { signal });
    refs.canvas.addEventListener('pointermove', moveDrag, { signal });
    refs.canvas.addEventListener('pointerup', endDrag, { signal });
    refs.canvas.addEventListener('pointercancel', endDrag, { signal });

    root.querySelectorAll('[data-layout]').forEach(button => {
      button.addEventListener('click', () => {
        settings.layout = button.dataset.layout;
        resetOffsets();
        syncControls();
        saveSettings();
        render();
      }, { signal });
    });
    root.querySelectorAll('[data-format]').forEach(button => {
      button.addEventListener('click', () => {
        settings.format = button.dataset.format;
        if (settings.format === '16:9') settings.layout = 'horizontal';
        if (settings.format === '9:16') settings.layout = 'vertical';
        if (settings.format === 'current') {
          const size = api.canvas.getDocumentSize();
          settings.layout = size.height > size.width ? 'vertical' : 'horizontal';
        }
        resetOffsets();
        syncControls();
        saveSettings();
        render();
      }, { signal });
    });
    root.querySelectorAll('[data-background]').forEach(button => {
      button.addEventListener('click', () => {
        settings.background = button.dataset.background;
        syncControls();
        saveSettings();
        render();
      }, { signal });
    });
    refs.splitRange.addEventListener('input', () => {
      settings.split = Number(refs.splitRange.value);
      refs.splitValue.textContent = `${settings.split}%`;
      saveSettings();
      render();
    }, { signal });
    refs.dividerToggle.addEventListener('change', () => {
      settings.divider = refs.dividerToggle.checked;
      syncControls();
      saveSettings();
      render();
    }, { signal });
    refs.dividerColor.addEventListener('input', () => {
      settings.dividerColor = refs.dividerColor.value;
      saveSettings();
      render();
    }, { signal });
    refs.dividerWidth.addEventListener('input', () => {
      settings.dividerWidth = Number(refs.dividerWidth.value);
      refs.dividerWidthValue.textContent = `${settings.dividerWidth} px`;
      saveSettings();
      render();
    }, { signal });
  }

  return {
    async mount({ container, pluginApi, theme }) {
      destroyed = false;
      api = pluginApi;
      controller = new AbortController();
      const [html, css] = await getAssetText();
      if (destroyed) return;
      shadowHost = document.createElement('div');
      shadowHost.style.width = '100%';
      shadowHost.style.height = '100%';
      shadowHost.dataset.theme = theme;
      root = shadowHost.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${css}</style>${html}`;
      container.replaceChildren(shadowHost);

      const saved = api.storage.get('settings', {});
      settings = { ...DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
      const documentSize = api.canvas.getDocumentSize();
      if (!saved?.layout && documentSize.height > documentSize.width) settings.layout = 'vertical';

      refs = {
        canvas: root.getElementById('mergerCanvas'),
        canvasEmpty: root.getElementById('canvasEmpty'),
        statusText: root.getElementById('statusText'),
        dimensionText: root.getElementById('dimensionText'),
        outputLabel: root.getElementById('outputLabel'),
        splitRange: root.getElementById('splitRange'),
        splitValue: root.getElementById('splitValue'),
        dividerToggle: root.getElementById('dividerToggle'),
        dividerOptions: root.getElementById('dividerOptions'),
        dividerColor: root.getElementById('dividerColor'),
        dividerWidth: root.getElementById('dividerWidth'),
        dividerWidthValue: root.getElementById('dividerWidthValue'),
        swap: root.getElementById('swapImages'),
        clear: root.getElementById('clearAll'),
        download: root.getElementById('downloadPng'),
        add: root.getElementById('addToCanvas'),
      };
      [1, 2].forEach(number => {
        refs[`sourceCard${number}`] = root.getElementById(`sourceCard${number}`);
        refs[`file${number}`] = root.getElementById(`file${number}`);
        refs[`thumb${number}`] = root.getElementById(`thumb${number}`);
        refs[`empty${number}`] = root.getElementById(`empty${number}`);
        refs[`remove${number}`] = root.getElementById(`remove${number}`);
        refs[`selected${number}`] = root.getElementById(`selected${number}`);
      });

      syncControls();
      bindEvents();
      render();
    },
    setTheme(theme) {
      if (shadowHost) shadowHost.dataset.theme = theme;
    },
    destroy() {
      destroyed = true;
      controller?.abort();
      if (refs) {
        releaseSlot(0);
        releaseSlot(1);
      }
      dragState = null;
      refs = null;
      root = null;
      shadowHost?.remove();
      shadowHost = null;
      api = null;
    },
  };
}
