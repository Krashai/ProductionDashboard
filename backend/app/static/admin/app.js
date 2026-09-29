// Wejście panelu: logowanie, zakładki (obszary jak na wallboardzie +
// Sterowniki + Wszystkie alarmy), wyszukiwarka, kopia zapasowa, routing #hash.
import { api, getToken, setToken, clearToken } from './api.js';
import { coverage } from './catalog.js';
import { h, clear } from './ui/dom.js';
import { initDrawer, closeDrawer } from './ui/drawer.js';
import { toast, confirmAction, withBusy } from './ui/feedback.js';
import { store, reloadConfig, startLivePolling, onConfigChange, clearViewLiveUpdaters, onLive, tagState, plcsInArea } from './store.js';
import { renderArea } from './views/area.js';
import { renderPlcs } from './views/plcs.js';
import { renderAlarms } from './views/alarms.js';

const main = document.getElementById('main');
const tabs = document.getElementById('tabs');
const search = document.getElementById('search');

function currentRoute() {
  const [, kind = 'area', id] = location.hash.split('/');
  if (kind === 'plcs' || kind === 'alarms') return { kind };
  const area = store.areas.find((a) => a.id === id) ?? store.areas[0];
  return { kind: 'area', area };
}

function query() {
  return search.value.trim().toLowerCase();
}

function renderView() {
  clearViewLiveUpdaters();
  const route = currentRoute();
  if (route.kind === 'plcs') renderPlcs(main, query());
  else if (route.kind === 'alarms') renderAlarms(main, query());
  else if (route.area) renderArea(main, route.area, query());
  renderTabs(route);
  onLive(() => updateTabBadges());
}

function tabHref(route) {
  return route.kind === 'area' ? `#/area/${route.area.id}` : `#/${route.kind}`;
}

function renderTabs(route) {
  clear(tabs);
  const active = tabHref(route);
  const link = (href, label, badgeKey) => h('a', {
    class: 'tab', href, 'aria-current': href === active ? 'page' : undefined, dataset: { badge: badgeKey ?? '' },
  }, h('span', { text: label }), h('span', { class: 'tab-badge' }));
  for (const area of store.areas) tabs.append(link(`#/area/${area.id}`, area.name, area.id));
  tabs.append(h('span', { class: 'tab-sep', 'aria-hidden': 'true' }));
  tabs.append(link('#/plcs', 'Sterowniki', 'plcs'));
  tabs.append(link('#/alarms', 'Wszystkie alarmy', 'alarms'));
}

/** Plakietki zakładek: pokrycie obszaru i kropka, gdy coś jest w alarmie. */
function updateTabBadges() {
  for (const tab of tabs.querySelectorAll('.tab')) {
    const key = tab.dataset.badge;
    const badge = tab.querySelector('.tab-badge');
    const area = store.areas.find((a) => a.id === key);
    let alarm = false;
    if (area) {
      const plcIds = new Set(plcsInArea(area.id).map((p) => p.id));
      const tags = store.tags.filter((t) => plcIds.has(t.plc_id));
      const cov = coverage(area, tags);
      alarm = tags.some((t) => tagState(t).key === 'alarm');
      badge.textContent = `${cov.configured}/${cov.total}`;
    } else if (key === 'alarms') {
      const active = store.tags.filter((t) => tagState(t).key === 'alarm').length;
      alarm = active > 0;
      badge.textContent = active ? String(active) : '';
    } else if (key === 'plcs') {
      const offline = store.plcs.filter((p) => !store.live.plcs?.[p.id]?.online).length;
      badge.textContent = store.plcs.length ? `${store.plcs.length - offline}/${store.plcs.length} online` : '';
    }
    tab.classList.toggle('tab-alarm', alarm);
  }
  document.getElementById('live-status').hidden = store.liveOk;
}

// --- kopia zapasowa -----------------------------------------------------------

async function downloadBackup(button) {
  await withBusy(button, 'Pobieranie…', async () => {
    try {
      const data = await api('/api/config/export', { auth: true });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `konfiguracja-plc-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast('Pobrano kopię zapasową konfiguracji.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function restoreBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('To nie jest plik JSON z kopią konfiguracji.', 'error');
    return;
  }
  const plcCount = Array.isArray(data?.plcs) ? data.plcs.length : '?';
  const tagCount = Array.isArray(data?.tags) ? data.tags.length : '?';
  const ok = await confirmAction({
    title: 'Przywrócić konfigurację z kopii?',
    message: [
      `Obecna konfiguracja (${store.plcs.length} sterowników, ${store.tags.length} zmiennych) zostanie w całości zastąpiona kopią z pliku „${file.name}” (${plcCount} sterowników, ${tagCount} zmiennych).`,
      'Jeśli plik zawiera błąd, nic nie zostanie zmienione.',
    ],
    confirmLabel: 'Przywróć',
  });
  if (!ok) return;
  try {
    const result = await api('/api/config/restore', { method: 'POST', body: data });
    await reloadConfig();
    toast(`Przywrócono: ${result.plcs} sterowników, ${result.tags} zmiennych.`);
  } catch (err) {
    toast(`Nie przywrócono kopii: ${err.message}`, 'error');
  }
}

function initBackupMenu() {
  const menu = document.getElementById('backup-menu');
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', () => {
    const [file] = fileInput.files;
    fileInput.value = '';
    menu.open = false;
    if (file) restoreBackup(file);
  });
  const downloadBtn = h('button', { type: 'button', class: 'menu-item', text: 'Pobierz kopię (JSON)' });
  downloadBtn.addEventListener('click', () => { menu.open = false; downloadBackup(downloadBtn); });
  menu.querySelector('.menu').append(
    downloadBtn,
    h('button', { type: 'button', class: 'menu-item', text: 'Przywróć z pliku…', on: { click: () => fileInput.click() } }),
    fileInput,
  );
}

// --- logowanie ----------------------------------------------------------------

function showLogin(message) {
  const overlay = document.getElementById('login');
  const form = overlay.querySelector('form');
  const input = form.querySelector('input');
  const error = form.querySelector('.form-error');
  error.textContent = message ?? '';
  error.hidden = !message;
  overlay.hidden = false;
  input.value = '';
  input.focus();
  return new Promise((resolve) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      await withBusy(button, 'Sprawdzanie…', async () => {
        try {
          await api('/api/auth/check', { auth: true, token: input.value.trim() });
          setToken(input.value.trim());
          overlay.hidden = true;
          resolve();
        } catch (err) {
          error.textContent = err.status === 401 ? 'Nieprawidłowy token.' : err.message;
          error.hidden = false;
          input.select();
        }
      });
    };
  });
}

async function ensureLoggedIn() {
  const token = getToken();
  if (token) {
    try {
      await api('/api/auth/check', { auth: true, token });
      return;
    } catch {
      clearToken();
    }
  }
  await showLogin();
}

async function boot() {
  initDrawer();
  initBackupMenu();
  document.getElementById('logout').addEventListener('click', () => {
    clearToken();
    closeDrawer();
    showLogin();
  });
  window.addEventListener('auth-required', () => {
    closeDrawer();
    showLogin('Sesja wygasła albo token jest nieprawidłowy — zaloguj się ponownie.');
  });
  await ensureLoggedIn();
  try {
    await reloadConfig();
  } catch (err) {
    main.replaceChildren(h('p', { class: 'form-error', text: `Nie udało się wczytać konfiguracji: ${err.message}` }));
    return;
  }
  onConfigChange(renderView);
  window.addEventListener('hashchange', () => { closeDrawer(); renderView(); });
  let searchTimer = null;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderView, 150);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      event.preventDefault();
      search.focus();
    }
  });
  renderView();
  startLivePolling();
}

boot();
