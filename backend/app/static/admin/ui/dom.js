// Budowanie DOM wyłącznie przez textContent/właściwości — nigdy innerHTML.
// Nazwy PLC, etykiety i opisy alarmów pochodzą od operatora (SQLite), więc
// "<script>" w opisie bitu ma się wyświetlić jako tekst, nie wykonać.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'on') for (const [event, fn] of Object.entries(value)) el.addEventListener(event, fn);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key in el && !key.startsWith('aria') && key !== 'list') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function field(labelText, control, hint) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label', text: labelText }),
    control,
    hint ? h('span', { class: 'field-hint', text: hint }) : null);
}

export function pill(text, tone) {
  return h('span', { class: `pill pill-${tone}`, text });
}
