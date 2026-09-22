document.getElementById('openEditor').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('editor/editor.html') });
  window.close();
});

(async function loadRecent() {
  try {
    const db = await openDB();
    const tx = db.transaction('projects', 'readonly');
    const store = tx.objectStore('projects');
    const request = store.getAll();
    request.onsuccess = () => {
      const projects = request.result
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5);
      if (projects.length === 0) return;
      const section = document.getElementById('recentSection');
      const list = document.getElementById('recentList');
      section.style.display = 'block';
      projects.forEach(p => {
        const li = document.createElement('li');
        li.textContent = p.name;
        li.addEventListener('click', () => {
          chrome.tabs.create({ url: chrome.runtime.getURL(`editor/editor.html?id=${p.id}`) });
          window.close();
        });
        list.appendChild(li);
      });
    };
    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
    tx.onerror = () => db.close();
  } catch (e) {
    console.error('Unable to load recent projects:', e);
  }
})();

function openDB() {
  return new Promise((resolve, reject) => {
    // Open the newest existing schema. Passing the old hard-coded version 1
    // throws VersionError after the templates update upgraded this DB to v2.
    const req = indexedDB.open('ClatashaStudio');
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('projects')) {
        const store = db.createObjectStore('projects', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
