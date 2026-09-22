// Keep the top menus responsive while the much larger editor module loads.
// This script intentionally has no dependency on Fabric, IndexedDB, fonts,
// templates, or plugins.
(function bootstrapClatashaMenus() {
  let activeMenu = null;

  function close() {
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
      menu.style.display = 'none';
      menu.style.visibility = '';
    });
    document.querySelectorAll('.menu-btn[data-menu]').forEach(button => {
      button.classList.remove('active');
      button.setAttribute('aria-expanded', 'false');
    });
    document.getElementById('workspaceThemesTrigger')?.classList.remove('open');
    const themeTrigger = document.getElementById('workspaceThemesTrigger');
    if (themeTrigger) themeTrigger.setAttribute('aria-expanded', 'false');
    activeMenu = null;
  }

  function open(button) {
    const menuId = button.dataset.menu;
    const menu = document.getElementById('menu-' + menuId);
    if (!menu) return;

    if (activeMenu === menuId && menu.style.display !== 'none') {
      close();
      return;
    }

    close();
    const rect = button.getBoundingClientRect();
    menu.style.left = Math.max(4, rect.left) + 'px';
    menu.style.display = 'block';
    button.classList.add('active');
    button.setAttribute('aria-expanded', 'true');
    activeMenu = menuId;

    document.dispatchEvent(new CustomEvent('clatasha:menu-open', {
      detail: { menuId },
    }));
  }

  document.querySelectorAll('.menu-btn[data-menu]').forEach(button => {
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      open(button);
    });
  });

  document.addEventListener('click', close);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });

  window.ClatashaMenuBootstrap = Object.freeze({ close, open });
})();
