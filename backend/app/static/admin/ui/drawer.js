// Panel boczny do edycji — jeden naraz. Zamykany Esc, przyciskiem lub tłem.
import { h, clear } from './dom.js';

let onCloseHandler = null;

export function openDrawer(title, subtitle, body, footer, { onClose } = {}) {
  const drawer = document.getElementById('drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  clear(drawer);
  onCloseHandler = onClose ?? null;
  const closeBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Zamknij', text: '✕', on: { click: closeDrawer } });
  drawer.append(
    h('header', { class: 'drawer-header' },
      h('div', {}, h('p', { class: 'eyebrow', text: subtitle }), h('h2', { class: 'drawer-title', text: title })),
      closeBtn),
    h('div', { class: 'drawer-body' }, body),
    h('footer', { class: 'drawer-footer' }, footer),
  );
  drawer.hidden = false;
  backdrop.hidden = false;
  drawer.setAttribute('aria-label', title);
  requestAnimationFrame(() => drawer.querySelector('input, select, button:not(.btn-icon)')?.focus());
}

export function closeDrawer() {
  const drawer = document.getElementById('drawer');
  if (drawer.hidden) return;
  drawer.hidden = true;
  document.getElementById('drawer-backdrop').hidden = true;
  clear(drawer);
  const handler = onCloseHandler;
  onCloseHandler = null;
  handler?.();
}

export function isDrawerOpen() {
  return !document.getElementById('drawer').hidden;
}

export function initDrawer() {
  document.getElementById('drawer-backdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isDrawerOpen() && !document.getElementById('confirm-dialog').open) closeDrawer();
  });
}
