export function createTraceRunner() {
  let active = null, nextId = 0;
  function cancel() {
    if (!active) return;
    const error = new Error('Conversion cancelled'); error.name = 'AbortError';
    active.finish(error);
  }
  function run(image, options, onProgress) {
    cancel();
    return new Promise((resolve, reject) => {
      let worker, timer, settled = false;
      const id = ++nextId;
      const finish = (error, result) => {
        if (settled) return;
        settled = true; clearTimeout(timer); worker?.terminate();
        if (active?.id === id) active = null;
        if (error) reject(error); else resolve(result);
      };
      try {
        worker = new Worker(new URL('./trace-worker.js', import.meta.url), { type: 'module' });
        active = { id, finish };
        worker.onmessage = event => {
          const message = event.data;
          if (settled || message?.id !== id) return;
          if (message.type === 'progress') onProgress?.(message.stage, message.percent);
          else if (message.type === 'result') finish(null, message.result);
          else if (message.type === 'error') finish(new Error(message.message));
        };
        worker.onerror = event => { event.preventDefault?.(); finish(new Error('The local tracing engine could not run. Reload the extension and try again.')); };
        worker.onmessageerror = () => finish(new Error('The vector result could not be received. Try a lower detail setting.'));
        timer = setTimeout(() => finish(new Error('Tracing took too long. Try fewer colors or lower detail.')), 90000);
        worker.postMessage({ id, image, options }, [image.data.buffer]);
      } catch (error) { finish(new Error(error.message || 'Background tracing is unavailable.')); }
    });
  }
  return { run, cancel, destroy: cancel };
}
