/* Мир Тачек — UI-компоненты: тосты, модалки, диалоги, пагинация, диаграммы */
import { $, $$, esc, num, getPath, moneyShort, money } from './utils.js';
import { icon } from './icons.js';
import { APP } from './config.js';

export function toast(message, type = 'info', ms = 3500) {
  const map = { ok: 'check', error: 'alert', warn: 'alert', info: 'info' };
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `${icon(map[type] || 'info')}<span>${esc(message)}</span>`;
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, ms);
}

let onCloseFn = null;
export function openModal(html, cls = '', onClose = null) {
  const m = $('#modal');
  if (!m.hidden && onCloseFn) { const f = onCloseFn; onCloseFn = null; f(); }
  m.className = 'modal ' + cls;
  $('#modalBody').innerHTML = html;
  $('#modalClose').innerHTML = icon('x');
  m.hidden = false;
  document.body.style.overflow = 'hidden';
  onCloseFn = onClose;
  const f = $('#modalBody [autofocus]') || $('#modalBody input:not([type=hidden]), #modalBody select');
  if (f) setTimeout(() => f.focus(), 30);
}
export function closeModal() {
  const m = $('#modal');
  if (m.hidden) return;
  m.hidden = true;
  $('#modalBody').innerHTML = '';
  document.body.style.overflow = '';
  const f = onCloseFn; onCloseFn = null;
  if (f) f();
}
export const isModalOpen = () => !$('#modal').hidden;

export function confirmDialog(title, text, okLabel = 'Подтвердить', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    openModal(`<h2 id="modalTitle">${icon(danger ? 'alert' : 'info')}${esc(title)}</h2>
      <p class="muted pre">${esc(text)}</p>
      <div class="btn-row"><button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" id="dlgOk">${esc(okLabel)}</button>
      <button type="button" class="btn btn--ghost" data-action="close-modal">Отмена</button></div>`, '', () => { if (!done) resolve(false); });
    $('#dlgOk').addEventListener('click', () => { done = true; closeModal(); resolve(true); });
  });
}

/** Небольшая форма в модалке. Возвращает объект значений или null. */
export function formDialog(title, fieldsHTML, okLabel = 'Сохранить', intro = '') {
  return new Promise((resolve) => {
    let done = false;
    openModal(`<form id="dlgForm" class="stack" novalidate>
      <h2 id="modalTitle">${esc(title)}</h2>${intro ? `<p class="muted pre">${intro}</p>` : ''}
      ${fieldsHTML}
      <div class="btn-row"><button type="submit" class="btn btn--primary">${icon('check')}${esc(okLabel)}</button>
      <button type="button" class="btn btn--ghost" data-action="close-modal">Отмена</button></div></form>`, '', () => { if (!done) resolve(null); });
    $('#dlgForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const out = {};
      new FormData(form).forEach((v, k) => { out[k] = v; });
      $$('input[type=checkbox]', form).forEach((c) => { out[c.name] = c.checked; });
      done = true; closeModal(); resolve(out);
    });
  });
}

/* ----------------------------- Пагинация ----------------------------- */
export function paginate(list, page, size = APP.PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(Math.max(1, num(page) || 1), pages);
  return { items: list.slice((p - 1) * size, p * size), page: p, pages, total: list.length, size };
}
export function pagerHTML(key, pg) {
  if (!pg.total) return '';
  const from = (pg.page - 1) * pg.size + 1, to = Math.min(pg.total, pg.page * pg.size);
  const info = `<span class="pager__info">Показано ${from}–${to} из ${pg.total}</span>`;
  if (pg.pages <= 1) return `<div class="pager">${info}</div>`;
  const b = (n, l, cls = '', dis = false, aria = '') => `<button type="button" class="pager__btn ${cls}" data-action="page" data-key="${key}" data-page="${n}" ${dis ? 'disabled' : ''} ${aria ? `aria-label="${aria}"` : ''}>${l}</button>`;
  const parts = [];
  for (let n = 1; n <= pg.pages; n++) {
    if (n === 1 || n === pg.pages || Math.abs(n - pg.page) <= 1) parts.push(b(n, n, n === pg.page ? 'is-active' : ''));
    else if (parts[parts.length - 1] !== 'gap') parts.push('gap');
  }
  return `<div class="pager">${info}<div class="pager__pages">${b(pg.page - 1, icon('chevronLeft'), '', pg.page <= 1, 'Назад')}${parts.map((x) => (x === 'gap' ? '<span class="pager__gap">…</span>' : x)).join('')}${b(pg.page + 1, icon('chevronRight'), '', pg.page >= pg.pages, 'Вперед')}</div></div>`;
}

/* --------------------------- Мелкие элементы ------------------------- */
export const segBtns = (path, items) => items.map(([v, l]) => `<button type="button" class="seg__btn" data-action="set" data-path="${path}" data-value="${esc(v)}">${esc(l)}</button>`).join('');
export function syncSegs(root, state) {
  $$('[data-seg]', root).forEach((seg) => {
    const val = String(getPath(state, seg.dataset.seg));
    $$('.seg__btn', seg).forEach((x) => x.classList.toggle('is-active', x.dataset.value === val));
  });
}
export const emptyState = (ic, title, text, action = '') => `<div class="empty">${icon(ic)}<b>${esc(title)}</b><span>${esc(text)}</span>${action}</div>`;
export const thumb = (p) => (p && p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy">` : `<span class="ph">${icon(p && p.type === 'service' ? 'wrench' : 'package')}</span>`);
export const stepper = (id, value) => `<div class="stepper">
  <button type="button" data-action="step" data-target="#${id}" data-delta="-1" aria-label="Меньше">${icon('minus')}</button>
  <input id="${id}" type="number" min="1" value="${value}" aria-label="Количество">
  <button type="button" data-action="step" data-target="#${id}" data-delta="1" aria-label="Больше">${icon('plus')}</button></div>`;
export const badge = (text, cls = '') => `<span class="tag ${cls}">${esc(text)}</span>`;

/* ----------------------------- Диаграммы ----------------------------- */
function niceScale(min, max, ticks) {
  const range = max - min || 1;
  const rough = range / ticks;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) || rough;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}

/** Столбчатая диаграмма: labels[], series[{name, values[], cls}] */
export function barChart({ labels, series, height = 260 }) {
  const n = labels.length;
  if (!n) return '';
  const W = Math.max(640, n * (series.length * 12 + 12) + 80), H = height, L = 64, R = 12, T = 14, B = 40;
  const vals = series.flatMap((s) => s.values.map(num));
  const sc = niceScale(Math.min(0, ...vals), Math.max(0, ...vals, 1), 4);
  const y = (v) => T + ((sc.max - v) / (sc.max - sc.min)) * (H - T - B);
  const gw = (W - L - R) / n;
  const bw = Math.max(3, Math.min(26, (gw - 6) / series.length));
  let g = '';
  for (let v = sc.min; v <= sc.max + sc.step / 2; v += sc.step) {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="chart__grid${Math.abs(v) < 1e-9 ? ' chart__zero' : ''}"/>`;
    g += `<text x="${L - 8}" y="${y(v) + 4}" class="chart__ylab">${esc(moneyShort(v))}</text>`;
  }
  const step = Math.ceil(n / 12);
  let bars = '';
  labels.forEach((lab, i) => {
    const x0 = L + i * gw + (gw - bw * series.length) / 2;
    series.forEach((s, k) => {
      const v = num(s.values[i]);
      const y0 = y(0), yv = y(v);
      bars += `<rect x="${x0 + k * bw}" y="${Math.min(y0, yv)}" width="${bw - 1}" height="${Math.max(1, Math.abs(yv - y0))}" rx="2" class="${s.cls}${v < 0 ? ' is-neg' : ''}"><title>${esc(lab)} · ${esc(s.name)}: ${esc(money(v))}</title></rect>`;
    });
    if (i % step === 0) bars += `<text x="${L + i * gw + gw / 2}" y="${H - B + 18}" class="chart__xlab">${esc(lab)}</text>`;
  });
  const legend = series.map((s) => `<span><i class="${s.cls}"></i>${esc(s.name)}</span>`).join('');
  return `<div class="chart"><div class="chart__legend">${legend}</div><div class="chart__scroll">
    <svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.round(W * 0.75)}px" role="img" aria-label="Диаграмма">${g}${bars}</svg></div></div>`;
}

/** Горизонтальные полосы: rows[{label, value, sub, cls}] */
export function hbars(rows, format = money) {
  if (!rows.length) return '<p class="muted">Нет данных за период</p>';
  const max = Math.max(...rows.map((r) => Math.abs(num(r.value))), 1);
  return `<div class="hbars">${rows.map((r) => `<div class="hbar">
    <div class="hbar__head"><span>${esc(r.label)}</span><b>${esc(format(r.value))}</b></div>
    <div class="hbar__track"><div class="hbar__fill ${r.cls || ''}${num(r.value) < 0 ? ' is-neg' : ''}" style="width:${(Math.abs(num(r.value)) / max) * 100}%"></div></div>
    ${r.sub ? `<small class="muted">${esc(r.sub)}</small>` : ''}</div>`).join('')}</div>`;
}
