export const MAX_TRACE_PIXELS = 2048 * 2048;
const MAX_EDGES = 3000000;
const MAX_SVG_BYTES = 16 * 1024 * 1024;
// This is an XML namespace identifier. It is never fetched or loaded.
const SVG_NAMESPACE = 'http:' + '//www.w3.org/2000/svg';
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));

function cancelledError() {
  const error = new Error('Conversion cancelled');
  error.name = 'AbortError';
  return error;
}

function histogramKey(r, g, b, a) {
  return ((r >> 3) << 14) | ((g >> 3) << 9) | ((b >> 3) << 4) | (a >> 4);
}

function skipPixel(data, offset, backgroundMask) {
  return data[offset + 3] < 16 || !!backgroundMask?.[offset / 4];
}

export async function cleanEdgeCoverage(source, width, height, checkpoint) {
  const data = new Uint8ClampedArray(source);
  // Anti-aliasing is coverage at the edge of a shape, rather than another fill.
  // Recover that edge before fitting curves, while retaining uniform translucent
  // artwork and its alpha. Exact pixel-art mode bypasses this step entirely.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4, alpha = source[offset + 3];
      if (alpha < 16 || alpha === 255) continue;
      let nearClear = false, strongest = alpha;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) { nearClear = true; continue; }
        const next = (ny * width + nx) * 4, candidate = source[next + 3];
        if (candidate < 16) { nearClear = true; continue; }
        const distance = Math.abs(source[next] - source[offset]) + Math.abs(source[next + 1] - source[offset + 1]) + Math.abs(source[next + 2] - source[offset + 2]);
        if (distance < 60) strongest = Math.max(strongest, candidate);
      }
      if (nearClear && strongest > alpha) data[offset + 3] = alpha < strongest / 2 ? 0 : strongest;
    }
    if ((y & 31) === 31) await checkpoint('Cleaning transparent edges', 0);
  }
  return data;
}

export async function whiteBackgroundMask(data, width, height, checkpoint) {
  const mask = new Uint8Array(width * height), queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const add = (index) => {
    if (mask[index]) return;
    const offset = index * 4;
    if (data[offset + 3] < 16 || data[offset] < 245 || data[offset + 1] < 245 || data[offset + 2] < 245) return;
    mask[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++], x = index % width;
    if (x) add(index - 1);
    if (x < width - 1) add(index + 1);
    if (index >= width) add(index - width);
    if (index < width * (height - 1)) add(index + width);
    if ((head & 16383) === 0) await checkpoint('Removing white background', 0);
  }
  return mask;
}

function medianPalette(histogram, count) {
  const entries = [...histogram.values()].map(bin => ({
    color: bin.sum.map(channel => channel / bin.count), weight: bin.count,
  }));
  if (!entries.length) return [];
  const boxes = [entries];
  while (boxes.length < count) {
    let best = -1, bestScore = -1, bestChannel = 0;
    for (let index = 0; index < boxes.length; index++) {
      const box = boxes[index];
      if (box.length < 2) continue;
      const min = [255, 255, 255, 255], max = [0, 0, 0, 0];
      let weight = 0;
      for (const entry of box) {
        weight += entry.weight;
        for (let channel = 0; channel < 4; channel++) {
          min[channel] = Math.min(min[channel], entry.color[channel]);
          max[channel] = Math.max(max[channel], entry.color[channel]);
        }
      }
      const ranges = max.map((value, channel) => (value - min[channel]) * (channel === 3 ? 0.75 : 1));
      const channel = ranges.indexOf(Math.max(...ranges));
      const score = ranges[channel] * Math.sqrt(weight);
      if (score > bestScore) { best = index; bestScore = score; bestChannel = channel; }
    }
    if (best < 0 || bestScore <= 0) break;
    const box = boxes[best].sort((a, b) => a.color[bestChannel] - b.color[bestChannel]);
    const halfway = box.reduce((sum, entry) => sum + entry.weight, 0) / 2;
    let accumulated = 0, split = 0;
    while (split < box.length - 1 && accumulated < halfway) accumulated += box[split++].weight;
    split = Math.max(1, Math.min(split, box.length - 1));
    boxes.splice(best, 1, box.slice(0, split), box.slice(split));
  }
  return boxes.map(box => {
    const sum = [0, 0, 0, 0];
    let weight = 0;
    for (const entry of box) {
      weight += entry.weight;
      for (let channel = 0; channel < 4; channel++) sum[channel] += entry.color[channel] * entry.weight;
    }
    return sum.map(value => Math.round(value / weight));
  });
}

function nearestColor(color, palette) {
  let best = 0, bestDistance = Infinity;
  for (let index = 0; index < palette.length; index++) {
    const candidate = palette[index];
    const dr = color[0] - candidate[0], dg = color[1] - candidate[1];
    const db = color[2] - candidate[2], da = color[3] - candidate[3];
    const distance = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db + 0.6 * da * da;
    if (distance < bestDistance) { bestDistance = distance; best = index; }
  }
  return best;
}

async function refinePalette(histogram, palette, checkpoint) {
  const bins = [...histogram.values()].map(bin => ({ ...bin, color: bin.sum.map(value => value / bin.count) }));
  for (let pass = 0; pass < 2; pass++) {
    const sums = palette.map(() => [0, 0, 0, 0, 0]);
    for (let index = 0; index < bins.length; index++) {
      const bin = bins[index], sum = sums[nearestColor(bin.color, palette)];
      for (let channel = 0; channel < 4; channel++) sum[channel] += bin.sum[channel];
      sum[4] += bin.count;
      if ((index & 2047) === 2047) await checkpoint('Refining colors', 20);
    }
    palette = palette.map((color, index) => sums[index][4] ? sums[index].slice(0, 4).map(value => Math.round(value / sums[index][4])) : color);
  }
  return palette;
}

async function mergeSmallRegions(labels, width, height, minArea, checkpoint) {
  if (minArea < 2) return;
  const seen = new Uint8Array(labels.length), queue = new Int32Array(labels.length);
  let processed = 0;
  for (let start = 0; start < labels.length; start++) {
    if (seen[start] || labels[start] < 0) continue;
    const color = labels[start], neighbors = new Map();
    let head = 0, tail = 1;
    queue[0] = start; seen[start] = 1;
    while (head < tail) {
      const index = queue[head++], x = index % width;
      const visit = (next) => {
        if (labels[next] === color) {
          if (!seen[next]) { seen[next] = 1; queue[tail++] = next; }
        } else if (labels[next] >= 0 && tail < minArea) {
          neighbors.set(labels[next], (neighbors.get(labels[next]) || 0) + 1);
        }
      };
      if (x) visit(index - 1);
      if (x < width - 1) visit(index + 1);
      if (index >= width) visit(index - width);
      if (index < labels.length - width) visit(index + width);
      if ((++processed & 16383) === 0) await checkpoint('Cleaning small regions', 35);
    }
    if (tail < minArea) {
      let replacement = -1, score = 0;
      for (const [neighbor, count] of neighbors) if (count > score) { score = count; replacement = neighbor; }
      for (let index = 0; index < tail; index++) labels[queue[index]] = replacement;
    }
  }
}

function ringArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function segmentDistanceSquared(point, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length)) : 0;
  const px = point[0] - a[0] - t * dx, py = point[1] - a[1] - t * dy;
  return px * px + py * py;
}

function simplifyChain(points, tolerance) {
  if (points.length < 3 || !tolerance) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]], limit = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop();
    let farthest = -1, distance = limit;
    for (let i = first + 1; i < last; i++) {
      const value = segmentDistanceSquared(points[i], points[first], points[last]);
      if (value > distance) { distance = value; farthest = i; }
    }
    if (farthest >= 0) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function simplifyRing(points, tolerance) {
  const corners = points.filter((point, index) => {
    const a = points[(index + points.length - 1) % points.length], b = points[(index + 1) % points.length];
    return (point[0] - a[0]) * (b[1] - point[1]) !== (point[1] - a[1]) * (b[0] - point[0]);
  });
  if (corners.length < 4 || !tolerance) return corners;
  let farthest = 1, distance = -1;
  for (let i = 1; i < corners.length; i++) {
    const value = (corners[i][0] - corners[0][0]) ** 2 + (corners[i][1] - corners[0][1]) ** 2;
    if (value > distance) { farthest = i; distance = value; }
  }
  const first = simplifyChain(corners.slice(0, farthest + 1), tolerance);
  const second = simplifyChain([...corners.slice(farthest), corners[0]], tolerance);
  const result = [...first.slice(0, -1), ...second.slice(0, -1)];
  // Never collapse a visible region or reverse its winding through smoothing.
  return result.length >= 3 && ringArea(result) * ringArea(corners) > 0 ? result : corners;
}

function cornerAnchors(points) {
  const n = points.length, span = Math.min(5, Math.floor(n / 6)), anchors = new Uint8Array(n);
  if (span < 2) return anchors.fill(1);
  const scores = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = points[(i + n - span) % n], b = points[i], c = points[(i + span) % n];
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < span * 0.6 || lv < span * 0.6) continue;
    const cosine = (ux * vx + uy * vy) / (lu * lv);
    if (cosine <= 0.5) scores[i] = 1 - cosine;
  }
  // Select the actual corner within each nearby cluster of turning samples.
  for (let i = 0; i < n; i++) if (scores[i]) {
    let strongest = true;
    for (let j = -span; j <= span; j++) {
      const other = (i + j + n) % n;
      if (scores[other] > scores[i] + 1e-9 || (Math.abs(scores[other] - scores[i]) < 1e-9 && other < i)) strongest = false;
    }
    if (strongest) anchors[i] = 1;
  }
  return anchors;
}

function curveRing(points, smoothing) {
  if (!smoothing || points.length < 12) {
    const reduced = simplifyRing(points, 0);
    return { d: 'M' + reduced.map(point => point.join(' ')).join('L') + 'Z', points: reduced.length, curved: false };
  }
  const anchors = cornerAnchors(points), anchorKeys = new Set();
  points.forEach((point, i) => { if (anchors[i]) anchorKeys.add(point.join(',')); });
  const window = smoothing > 1.3 ? 3 : 2;
  const filtered = points.map((point, i) => {
    for (let offset = -window; offset <= window; offset++) if (anchors[(i + offset + points.length) % points.length]) return point;
    let x = 0, y = 0, sum = 0;
    for (let offset = -window; offset <= window; offset++) {
      const weight = window + 1 - Math.abs(offset), sample = points[(i + offset + points.length) % points.length];
      x += sample[0] * weight; y += sample[1] * weight; sum += weight;
    }
    return [x / sum, y / sum];
  });
  const tolerance = 0.25 + smoothing * 0.45;
  const fixed = [...anchors.keys()].filter(index => anchors[index]);
  // Simplify between sharp corners so the simplifier cannot discard a tip.
  const reduced = fixed.length ? fixed.flatMap((start, index) => {
    const end = fixed[(index + 1) % fixed.length], chain = [filtered[start]];
    let cursor = (start + 1) % points.length;
    while (cursor !== end) { chain.push(filtered[cursor]); cursor = (cursor + 1) % points.length; }
    chain.push(filtered[end]);
    return simplifyChain(chain, tolerance).slice(0, -1);
  }) : simplifyRing(filtered, tolerance);
  if (reduced.length < 3) return curveRing(points, 0);
  const number = value => Number(value.toFixed(3));
  const pair = point => point.map(number).join(' ');
  const isCorner = point => anchorKeys.has(point.join(','));
  let d = 'M' + pair(reduced[0]), curved = false;
  for (let i = 0; i < reduced.length; i++) {
    const before = reduced[(i + reduced.length - 1) % reduced.length], a = reduced[i];
    const b = reduced[(i + 1) % reduced.length], after = reduced[(i + 2) % reduced.length];
    if (isCorner(a) && isCorner(b)) { d += 'L' + pair(b); continue; }
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const leftLength = Math.hypot(a[0] - before[0], a[1] - before[1]);
    const rightLength = Math.hypot(after[0] - b[0], after[1] - b[1]);
    const first = isCorner(a) ? [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3] :
      [a[0] + (b[0] - before[0]) * length / (3 * (leftLength + length)), a[1] + (b[1] - before[1]) * length / (3 * (leftLength + length))];
    const second = isCorner(b) ? [b[0] - (b[0] - a[0]) / 3, b[1] - (b[1] - a[1]) / 3] :
      [b[0] - (after[0] - a[0]) * length / (3 * (length + rightLength)), b[1] - (after[1] - a[1]) * length / (3 * (length + rightLength))];
    d += 'C' + pair(first) + ' ' + pair(second) + ' ' + pair(b);
    curved = true;
  }
  return { d: d + 'Z', points: reduced.length, curved };
}

export async function traceImageData(imageData, options = {}, hooks = {}) {
  const { width, height, data: sourceData } = imageData || {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
    width * height > MAX_TRACE_PIXELS || sourceData?.length !== width * height * 4) {
    throw new Error('The tracing image is invalid or exceeds the detail limit.');
  }
  const colors = Math.max(2, Math.min(256, Math.round(Number(options.colors) || 64)));
  const mono = options.mode === 'mono';
  const threshold = Number.isFinite(Number(options.threshold)) ? Math.max(0, Math.min(255, Number(options.threshold))) : 128;
  const smoothing = Math.max(0, Math.min(2, Number(options.smoothing) || 0));
  const minArea = Math.max(0, Math.min(16, Number(options.minArea) || 0));
  const checkpoint = async (stage, progress) => {
    hooks.checkCancelled?.();
    hooks.onProgress?.(stage, progress);
    await (hooks.yieldTask || nextTask)();
    hooks.checkCancelled?.();
  };
  await checkpoint('Reading colors', 0);
  const data = smoothing ? await cleanEdgeCoverage(sourceData, width, height, checkpoint) : sourceData;
  const backgroundMask = options.removeWhite ? await whiteBackgroundMask(data, width, height, checkpoint) : null;
  const histogram = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (skipPixel(data, offset, backgroundMask)) continue;
      if (mono && 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2] >= threshold) continue;
      const r = mono ? 0 : data[offset], g = mono ? 0 : data[offset + 1], b = mono ? 0 : data[offset + 2], a = data[offset + 3];
      const key = histogramKey(r, g, b, a);
      let bin = histogram.get(key);
      if (!bin) { bin = { sum: [0, 0, 0, 0], count: 0 }; histogram.set(key, bin); }
      bin.sum[0] += r; bin.sum[1] += g; bin.sum[2] += b; bin.sum[3] += a; bin.count++;
    }
    if ((y & 31) === 31) await checkpoint('Reading colors', (y + 1) / height * 20);
  }
  if (!histogram.size) throw new Error('No visible shapes were found. Adjust the threshold or white-background option.');
  let palette = medianPalette(histogram, mono ? 4 : colors);
  if (!mono && smoothing) palette = await refinePalette(histogram, palette, checkpoint);
  const assignments = new Map();
  for (const [key, bin] of histogram) assignments.set(key, nearestColor(bin.sum.map(value => value / bin.count), palette));
  const labels = new Int16Array(width * height).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x, offset = index * 4;
      if (skipPixel(data, offset, backgroundMask)) continue;
      if (mono && 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2] >= threshold) continue;
      const key = histogramKey(mono ? 0 : data[offset], mono ? 0 : data[offset + 1], mono ? 0 : data[offset + 2], data[offset + 3]);
      labels[index] = assignments.get(key);
    }
    if ((y & 31) === 31) await checkpoint('Separating colors', 20 + (y + 1) / height * 15);
  }
  histogram.clear(); assignments.clear();
  await mergeSmallRegions(labels, width, height, minArea, checkpoint);
  const stride = width + 1, boundaries = palette.map(() => new Map());
  const hideSeams = smoothing > 0 && palette.length > 1 && palette.every(color => color[3] === 255);
  const outline = hideSeams ? new Map() : null;
  let edgeCount = 0;
  const addEdge = (edges, start, direction) => {
    if (++edgeCount > MAX_EDGES) throw new Error('This image has too many small details. Try Low detail and fewer colors.');
    edges.set(start, (edges.get(start) || 0) | (1 << direction));
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x, color = labels[index];
      if (color < 0) continue;
      const vertex = y * stride + x;
      if (!y || labels[index - width] !== color) addEdge(boundaries[color], vertex, 0);
      if (x === width - 1 || labels[index + 1] !== color) addEdge(boundaries[color], vertex + 1, 1);
      if (y === height - 1 || labels[index + width] !== color) addEdge(boundaries[color], vertex + stride + 1, 2);
      if (!x || labels[index - 1] !== color) addEdge(boundaries[color], vertex + stride, 3);
      if (outline) {
        if (!y || labels[index - width] < 0) addEdge(outline, vertex, 0);
        if (x === width - 1 || labels[index + 1] < 0) addEdge(outline, vertex + 1, 1);
        if (y === height - 1 || labels[index + width] < 0) addEdge(outline, vertex + stride + 1, 2);
        if (!x || labels[index - 1] < 0) addEdge(outline, vertex + stride, 3);
      }
    }
    if ((y & 15) === 15) await checkpoint('Tracing edges', 35 + (y + 1) / height * 25);
  }
  const paths = [], steps = [1, stride, -1, -stride];
  let outlinePath = '';
  let contours = 0, tracedRings = 0, pointsTotal = 0, curvedContours = 0;
  if (outline) boundaries.push(outline);
  for (let color = 0; color < boundaries.length; color++) {
    const edges = boundaries[color], rings = [], isOutline = edges === outline;
    while (edges.size) {
      const [start, mask] = edges.entries().next().value;
      let vertex = start, direction = [0, 1, 2, 3].find(value => mask & (1 << value));
      const ring = [];
      do {
        ring.push([vertex % stride, Math.floor(vertex / stride)]);
        const remaining = edges.get(vertex) & ~(1 << direction);
        if (remaining) edges.set(vertex, remaining); else edges.delete(vertex);
        vertex += steps[direction];
        if (vertex === start) break;
        const nextMask = edges.get(vertex) || 0;
        // Keep the filled region on the right. This separates diagonal islands
        // while preserving inner rings as holes in the even-odd compound path.
        const next = [(direction + 1) % 4, direction, (direction + 3) % 4, (direction + 2) % 4]
          .find(value => nextMask & (1 << value));
        if (next === undefined) throw new Error('A shape could not be traced. Try a lower detail setting.');
        direction = next;
        if ((ring.length & 8191) === 0) await checkpoint('Building paths', 60 + color / boundaries.length * 35);
      } while (true);
      if (Math.abs(ringArea(ring)) > 0) {
        const traced = curveRing(ring, smoothing);
        rings.push(traced.d);
        if (!isOutline) {
          pointsTotal += traced.points;
          if (traced.curved) curvedContours++;
        }
      }
      if (!isOutline) contours++;
      if ((++tracedRings & 127) === 0) await checkpoint('Building paths', 60 + color / boundaries.length * 35);
    }
    if (rings.length) {
      if (isOutline) { outlinePath = rings.join(''); continue; }
      const [r, g, b, a] = palette[color];
      const opacity = a === 255 ? '' : ` fill-opacity="${(a / 255).toFixed(4)}"`;
      // Slightly overlap opaque neighboring fills to hide rendering seams.
      // The common silhouette clips this overlap away from outer edges/holes.
      const overlap = hideSeams ? ` stroke="rgb(${r},${g},${b})" stroke-width="0.8" stroke-linejoin="round" paint-order="stroke fill"` : '';
      paths.push(`<path fill="rgb(${r},${g},${b})"${opacity}${overlap} fill-rule="evenodd" d="${rings.join('')}"/>`);
    }
    await checkpoint('Building paths', 60 + (color + 1) / boundaries.length * 35);
  }
  if (!paths.length) throw new Error('All shapes were too small. Turn off Remove small details and convert again.');
  const outputWidth = Math.max(1, Math.round(Number(options.outputWidth) || width));
  const outputHeight = Math.max(1, Math.round(Number(options.outputHeight) || height));
  const content = outlinePath ? `<defs><clipPath id="trace-outline"><path clip-rule="evenodd" d="${outlinePath}"/></clipPath></defs><g clip-path="url(#trace-outline)">${paths.join('')}</g>` : paths.join('');
  const svg = `<svg xmlns="${SVG_NAMESPACE}" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}">${content}</svg>`;
  if (svg.length > MAX_SVG_BYTES) throw new Error('The SVG is too large. Try fewer colors or a lower detail setting.');
  await checkpoint('Finishing SVG', 100);
  return { svg, colors: paths.length, contours, curvedContours, points: pointsTotal, width: outputWidth, height: outputHeight };
}
