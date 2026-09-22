const DB_NAME = 'ClatashaPluginPackages';
const DB_VERSION = 1;
const STORE_NAME = 'packages';

function openPluginDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Plugin storage could not be opened.'));
  });
}

function runTransaction(mode, operation) {
  return openPluginDatabase().then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let request;
    let result;
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      database.close();
      reject(error);
    };
    try { request = operation(store); }
    catch (error) { fail(error); return; }
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => fail(request.error || new Error('Plugin storage operation failed.'));
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(result);
    };
    transaction.onabort = () => fail(transaction.error || new Error('Plugin storage transaction was cancelled.'));
    transaction.onerror = () => fail(transaction.error || new Error('Plugin storage transaction failed.'));
  }));
}

export function listInstalledPluginPackages() {
  return runTransaction('readonly', store => store.getAll());
}

export function saveInstalledPluginPackage(record) {
  return runTransaction('readwrite', store => store.put(record));
}

export function deleteInstalledPluginPackage(id) {
  return runTransaction('readwrite', store => store.delete(id));
}
