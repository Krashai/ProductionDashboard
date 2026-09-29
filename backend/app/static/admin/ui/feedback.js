// Komunikaty (toast), okno potwierdzenia (<dialog>, nie window.confirm) i
// stan "zapisywanie" przycisków.
import { h, clear } from './dom.js';

export function toast(message, tone = 'ok') {
  const region = document.getElementById('toasts');
  const el = h('div', { class: `toast toast-${tone}`, role: 'status', text: message });
  region.append(el);
  setTimeout(() => el.remove(), tone === 'error' ? 8000 : 4000);
}

/**
 * Potwierdzenie akcji nieodwracalnej. `requireText` wymusza przepisanie
 * nazwy (np. przy usuwaniu sterownika razem z jego zmiennymi).
 * Zwraca Promise<boolean>.
 */
export function confirmAction({ title, message, confirmLabel = 'Usuń', tone = 'danger', requireText = null }) {
  const dialog = document.getElementById('confirm-dialog');
  clear(dialog);
  return new Promise((resolve) => {
    const input = requireText
      ? h('input', { class: 'input', autocomplete: 'off', 'aria-label': 'Potwierdzenie' })
      : null;
    const confirmBtn = h('button', { type: 'button', class: `btn btn-${tone}`, text: confirmLabel, disabled: Boolean(requireText) });
    const cancelBtn = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Anuluj' });
    const finish = (result) => {
      dialog.close();
      resolve(result);
    };
    if (input) input.addEventListener('input', () => { confirmBtn.disabled = input.value.trim() !== requireText; });
    confirmBtn.addEventListener('click', () => finish(true));
    cancelBtn.addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', () => resolve(false), { once: true });
    dialog.append(
      h('h2', { class: 'dialog-title', text: title }),
      ...[message].flat().map((line) => h('p', { class: 'dialog-text', text: line })),
      input ? h('label', { class: 'field' },
        // Bez stylu field-label (uppercase) — nazwę trzeba przepisać
        // dokładnie, więc musi być widoczna w oryginalnej pisowni.
        h('span', { class: 'dialog-text' }, 'Wpisz ', h('strong', { text: requireText }), ', aby potwierdzić:'), input) : null,
      h('div', { class: 'dialog-actions' }, cancelBtn, confirmBtn),
    );
    dialog.showModal();
    (input ?? cancelBtn).focus();
  });
}

/** Blokuje przycisk na czas operacji (F4: brak podwójnego zapisu). */
export async function withBusy(button, busyLabel, operation) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  button.setAttribute('aria-busy', 'true');
  try {
    return await operation();
  } finally {
    button.disabled = false;
    button.textContent = original;
    button.removeAttribute('aria-busy');
  }
}
