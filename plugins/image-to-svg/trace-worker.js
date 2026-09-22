import { traceVectors } from './vector-engine.js';

self.onmessage = async event => {
  const { id, image, options } = event.data || {};
  try {
    const result = await traceVectors(image, options, {
      onProgress: (stage, percent) => self.postMessage({ id, type: 'progress', stage, percent }),
    });
    self.postMessage({ id, type: 'result', result });
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error?.message || 'Conversion failed.' });
  }
};
