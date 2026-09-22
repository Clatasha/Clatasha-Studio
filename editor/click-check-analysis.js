// Pure analysis helpers for Clatasha Click Check.
// These functions intentionally use conservative thresholds to avoid noisy warnings.

function percentileFromHistogram(histogram, total, percentile) {
  if (!total) return 0;
  const target = total * percentile;
  let seen = 0;
  for (let index = 0; index < histogram.length; index++) {
    seen += histogram[index];
    if (seen >= target) return index;
  }
  return histogram.length - 1;
}

export function summarizeClickCheckPixels(imageData) {
  const { data, width, height } = imageData || {};
  if (!data || !width || !height) return null;

  const pixelCount = width * height;
  const histogram = new Uint32Array(256);
  const colorBuckets = new Map();
  const luminance = new Uint8Array(pixelCount);
  const visibleMask = new Uint8Array(pixelCount);
  let visiblePixels = 0;
  let darkPixels = 0;
  let brightPixels = 0;
  let sum = 0;
  let sumSquares = 0;

  for (let pixel = 0, offset = 0; pixel < pixelCount; pixel++, offset += 4) {
    const alpha = data[offset + 3];
    if (alpha <= 16) continue;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const value = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
    luminance[pixel] = value;
    visibleMask[pixel] = 1;
    histogram[value]++;
    visiblePixels++;
    sum += value;
    sumSquares += value * value;
    if (value <= 20) darkPixels++;
    if (value >= 240) brightPixels++;

    const bucket = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
    colorBuckets.set(bucket, (colorBuckets.get(bucket) || 0) + 1);
  }

  if (!visiblePixels) {
    return {
      visibleRatio: 0,
      averageLuminance: 0,
      luminanceDeviation: 0,
      tonalRange: 0,
      darkRatio: 0,
      brightRatio: 0,
      dominantColorRatio: 0,
      edgeStrength: 0,
    };
  }

  let dominantCount = 0;
  colorBuckets.forEach(count => { if (count > dominantCount) dominantCount = count; });
  const average = sum / visiblePixels;
  const variance = Math.max(0, sumSquares / visiblePixels - average * average);
  const low = percentileFromHistogram(histogram, visiblePixels, 0.05);
  const high = percentileFromHistogram(histogram, visiblePixels, 0.95);

  let edgeTotal = 0;
  let edgeComparisons = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (!visibleMask[index]) continue;
      if (x + 1 < width && visibleMask[index + 1]) {
        edgeTotal += Math.abs(luminance[index] - luminance[index + 1]);
        edgeComparisons++;
      }
      if (y + 1 < height && visibleMask[index + width]) {
        edgeTotal += Math.abs(luminance[index] - luminance[index + width]);
        edgeComparisons++;
      }
    }
  }

  return {
    visibleRatio: visiblePixels / pixelCount,
    averageLuminance: average,
    luminanceDeviation: Math.sqrt(variance),
    tonalRange: high - low,
    darkRatio: darkPixels / visiblePixels,
    brightRatio: brightPixels / visiblePixels,
    dominantColorRatio: dominantCount / visiblePixels,
    edgeStrength: edgeComparisons ? edgeTotal / edgeComparisons : 0,
  };
}

export function getClickCheckCanvasWarnings(metrics, hasImage) {
  if (!hasImage || !metrics) return [];
  const warnings = [];

  if (metrics.visibleRatio < 0.02) {
    warnings.push({
      category: 'Image',
      message: 'The rendered canvas is almost entirely transparent. Check image visibility and placement.',
      penalty: 18,
    });
    return warnings;
  }

  if (metrics.dominantColorRatio >= 0.97 && metrics.luminanceDeviation < 5) {
    warnings.push({
      category: 'Image',
      message: 'The rendered design is almost one solid color. The image may be blank or have very little visible content.',
      penalty: 12,
    });
    return warnings;
  }

  if (metrics.averageLuminance <= 22 && metrics.darkRatio >= 0.88) {
    warnings.push({
      category: 'Image',
      message: 'Most of the rendered design is extremely dark. Important image details may disappear at small sizes.',
      penalty: 9,
    });
  } else if (metrics.averageLuminance >= 238 && metrics.brightRatio >= 0.88) {
    warnings.push({
      category: 'Image',
      message: 'Most of the rendered design is extremely bright. Important image details may be difficult to distinguish.',
      penalty: 9,
    });
  }

  if (metrics.tonalRange < 18 && metrics.luminanceDeviation < 7) {
    warnings.push({
      category: 'Image',
      message: 'The rendered design has very little tonal separation. Check whether the main image is easy to distinguish.',
      penalty: 8,
    });
  }

  return warnings;
}

export function getClickCheckImageLayerWarnings(entries) {
  const meaningful = (entries || []).filter(entry => entry.displayAreaRatio >= 0.03);
  const warnings = [];

  const upscaled = meaningful.filter(entry => entry.upscaleFactor >= 1.5);
  if (upscaled.length) {
    const maximum = Math.max(...upscaled.map(entry => entry.upscaleFactor));
    warnings.push({
      category: 'Image',
      message: `${upscaled.length} image layer${upscaled.length === 1 ? ' is' : 's are'} enlarged beyond source resolution, up to ${maximum.toFixed(1)}×. The exported image may look soft or pixelated.`,
      penalty: Math.min(18, 8 + (upscaled.length - 1) * 3),
    });
  }

  const stretched = meaningful.filter(entry => entry.stretchFactor >= 1.18);
  if (stretched.length) {
    const maximum = Math.max(...stretched.map(entry => entry.stretchFactor));
    warnings.push({
      category: 'Image',
      message: `${stretched.length} image layer${stretched.length === 1 ? ' has' : 's have'} uneven horizontal and vertical scaling, up to ${maximum.toFixed(2)}×. Check for visible stretching.`,
      penalty: Math.min(12, 7 + (stretched.length - 1) * 2),
    });
  }

  const outside = (entries || []).filter(entry => entry.displayAreaRatio >= 0.005 && entry.visibleCanvasRatio === 0);
  const mostlyOutside = meaningful.filter(entry => entry.displayAreaRatio < 0.5 && entry.visibleCanvasRatio > 0 && entry.visibleCanvasRatio < 0.15);
  if (outside.length) {
    warnings.push({
      category: 'Image',
      message: `${outside.length} visible image layer${outside.length === 1 ? ' is' : 's are'} completely outside the canvas and will not appear in the export.`,
      penalty: Math.min(15, 8 + (outside.length - 1) * 3),
    });
  }
  if (mostlyOutside.length) {
    warnings.push({
      category: 'Image',
      message: `Less than 15% of ${mostlyOutside.length} image layer${mostlyOutside.length === 1 ? ' is' : 's are'} inside the canvas. Check its placement before exporting.`,
      penalty: Math.min(10, 6 + (mostlyOutside.length - 1) * 2),
    });
  }

  const mostlyTransparent = meaningful.filter(entry => entry.alphaCoverage !== null && entry.alphaCoverage < 0.025);
  if (mostlyTransparent.length) {
    warnings.push({
      category: 'Image',
      message: `${mostlyTransparent.length} image layer${mostlyTransparent.length === 1 ? ' contains' : 's contain'} very little visible content inside a large transparent area.`,
      penalty: Math.min(12, 7 + (mostlyTransparent.length - 1) * 2),
    });
  }

  return warnings;
}
