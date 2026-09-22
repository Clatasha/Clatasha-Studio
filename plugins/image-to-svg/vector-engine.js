import { MAX_TRACE_PIXELS, traceImageData, cleanEdgeCoverage, whiteBackgroundMask } from './trace-core.js';
import { initialize, vectorize_rgba } from './vendor/vtracer.js';

const MAX_SVG_BYTES = 16 * 1024 * 1024;
const task = () => new Promise(resolve => setTimeout(resolve, 0));
export async function traceVectors(image, options = {}, hooks = {}) {
  const { width, height, data } = image || {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_TRACE_PIXELS || data?.length !== width * height * 4) {
    throw new Error('The tracing image is invalid or exceeds the detail limit.');
  }
  const progress = async (stage, percent) => {
    hooks.checkCancelled?.(); hooks.onProgress?.(stage, percent);
    await (hooks.yieldTask || task)(); hooks.checkCancelled?.();
  };
  const smoothing = Math.max(0, Math.min(2, Number(options.smoothing) || 0));
  // Pixel art and monochrome retain the exact threshold/alpha behavior.
  if (!smoothing || options.mode === 'mono') {
    return { ...await traceImageData(image, options, hooks), engine: 'precision', traceWidth: width, traceHeight: height };
  }
  // Region tracing preserves exact flat-color corners better; layered color
  // tracing retains more photographic tones. Choose from the source itself.
  let flat = options.preset === 'logo';
  if (!flat && options.preset !== 'photo') {
    const bins = new Map(); let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] >= 16) {
        const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
        bins.set(key, (bins.get(key) || 0) + 1); count++;
      }
      if ((i & 2097151) === 2097148) await progress('Analyzing artwork', 0);
    }
    const dominant = [...bins.values()].sort((a, b) => b - a).slice(0, 8).reduce((sum, value) => sum + value, 0);
    flat = count > 0 && dominant / count >= 0.85;
  }
  if (flat) {
    return { ...await traceImageData(image, options, hooks), engine: 'flat', traceWidth: width, traceHeight: height };
  }
  await progress('Preparing accurate outlines', 0);
  const prepared = await cleanEdgeCoverage(data, width, height, progress);
  const background = options.removeWhite ? await whiteBackgroundMask(prepared, width, height, progress) : null;
  let visible = 0, clear = 0, translucent = 0;
  const sums = [0, 0, 0], squares = [0, 0, 0];
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    if (background?.[i] || prepared[offset + 3] < 16) { prepared[offset + 3] = 0; clear++; }
    else {
      visible++; if (prepared[offset + 3] !== 255) translucent++;
      for (let channel = 0; channel < 3; channel++) {
        const value = prepared[offset + channel]; sums[channel] += value; squares[channel] += value * value;
      }
    }
  }
  if (!visible) throw new Error('No visible shapes were found. Adjust the threshold or white-background option.');
  // VTracer color fills are opaque. Never flatten genuine translucent artwork.
  if (translucent > visible * 0.05) {
    return { ...await traceImageData({ width, height, data: prepared }, { ...options, removeWhite: false }, hooks), engine: 'alpha', traceWidth: width, traceHeight: height };
  }
  // Keep isolated translucent features in a separate vector layer. This lets
  // predominantly opaque logos use VTracer without discarding their edge alpha.
  let alphaLayer = null;
  if (translucent) {
    const alphaData = new Uint8ClampedArray(prepared.length);
    for (let i = 0; i < prepared.length; i += 4) if (prepared[i + 3] > 0 && prepared[i + 3] < 255) {
      alphaData.set(prepared.subarray(i, i + 4), i); prepared[i + 3] = 0; clear++;
    }
    alphaLayer = await traceImageData({ width, height, data: alphaData }, { colors: options.colors, smoothing: 0, minArea: 0 }, {
      ...hooks, onProgress: (stage, percent) => hooks.onProgress?.('Preserving translucent details', percent * 0.1),
    });
  }
  const quality = ['compact', 'balanced', 'high'].includes(options.quality) ? options.quality : 'high';
  const precision = quality === 'compact' ? 6 : quality === 'balanced' ? 7 : 8;
  const difference = quality === 'compact' ? 24 : quality === 'balanced' ? 10 : 0;
  const colors = Math.max(2, Math.min(256, Math.round(Number(options.colors) || 128)));
  await progress('Loading local vector engine', 15);
  await initialize();
  await progress('Tracing colors and curves', 25);
  const traced = vectorize_rgba(prepared, width, height, {
    preset: 'poster', mode: 'spline', hierarchical: 'stacked', clustering: 'color-cluster',
    colorPrecision: precision, layerDifference: difference, maxColors: colors,
    filterSpeckle: Math.max(0, Math.min(16, Number(options.minArea) || 0)),
    cornerThreshold: options.preset === 'logo' ? 35 : 60,
    lengthThreshold: 3.5, spliceThreshold: 30, maxIterations: 10,
    simplify: smoothing * (quality === 'compact' ? 0.7 : 0.2), pathPrecision: 3, optimize: 0,
  });
  if (traced.length > MAX_SVG_BYTES) throw new Error('The SVG exceeds 16 MB. Try fewer colors or lower detail.');
  await progress('Finishing vector artwork', 85);
  const paths = traced.match(/<path\b[^>]*\/>/g) || [];
  if (!paths.length) throw new Error('All shapes were too small. Turn off Remove small details and convert again.');
  if (paths.length > 60000) throw new Error('This image produces too many paths. Try fewer colors or lower detail.');
  const sourceVariance = squares.reduce((sum, value, channel) => sum + value / visible - (sums[channel] / visible) ** 2, 0) / 3;
  // Smooth low-frequency gradients can collapse into one initial color region.
  // Recover those tones with direct color separation rather than accepting a
  // visibly flat result. This is independent of output resolution.
  if (paths.length <= 3 && colors >= 8 && sourceVariance > 16) {
    return { ...await traceImageData(image, options, { ...hooks,
      onProgress: (stage, percent) => hooks.onProgress?.('Recovering fine color detail', 85 + percent * 0.15),
    }), engine: 'detail', traceWidth: width, traceHeight: height };
  }
  // A slight overlap removes hairline renderer seams. A common clip protects
  // the original transparent silhouette and prevents any stroke expansion.
  let clip = `<rect width="${width}" height="${height}"/>`;
  if (clear) {
    const mask = new Uint8ClampedArray(prepared.length);
    for (let i = 3; i < mask.length; i += 4) mask[i] = prepared[i];
    const outline = await traceImageData({ width, height, data: mask }, { colors: 2, smoothing, minArea: options.minArea || 0 }, {
      ...hooks, onProgress: (stage, percent) => hooks.onProgress?.('Refining transparent outlines', 85 + percent * 0.1),
    });
    clip = (outline.svg.match(/<path\b[^>]*\/>/g) || []).join('').replaceAll('fill-rule=', 'clip-rule=');
  }
  const fills = new Set(), content = paths.map(path => {
    const fill = path.match(/\bfill="(#[a-fA-F0-9]{6})"/)?.[1];
    if (!fill) throw new Error('The local vector engine returned an invalid shape.');
    fills.add(fill);
    return path.replace('/>', ` stroke="${fill}" stroke-width="0.35" stroke-linejoin="round" paint-order="stroke fill"/>`);
  }).join('');
  const outputWidth = Math.max(1, Math.round(Number(options.outputWidth) || width));
  const outputHeight = Math.max(1, Math.round(Number(options.outputHeight) || height));
  const alphaContent = alphaLayer ? (alphaLayer.svg.match(/<path\b[^>]*\/>/g) || []).join('') : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}"><defs><clipPath id="vt-outline">${clip}</clipPath></defs><g clip-path="url(#vt-outline)">${content}</g>${alphaContent}</svg>`;
  if (svg.length > MAX_SVG_BYTES) throw new Error('The SVG exceeds 16 MB. Try fewer colors or lower detail.');
  await progress('SVG ready', 100);
  return { svg, colors: fills.size + (alphaLayer?.colors || 0), contours: paths.length + (alphaLayer?.contours || 0), points: (content.match(/[MLCQAHVST]/g) || []).length,
    curvedContours: paths.filter(path => /[CQ]/.test(path.match(/\bd="([^"]*)"/)?.[1] || '')).length,
    width: outputWidth, height: outputHeight, traceWidth: width, traceHeight: height, engine: alphaLayer ? 'hybrid' : 'vtracer' };
}
