/* Мир Тачек — общие утилиты: форматирование, даты, файлы, CSV/XLSX */
import { APP } from './config.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (v) => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
};
export const norm = (s) => String(s ?? '').trim().toLowerCase();
export const DAY = 864e5;
export const round2 = (n) => Math.round(num(n) * 100) / 100;
export const sum = (arr, fn = (x) => x) => arr.reduce((s, x) => s + num(fn(x)), 0);
const pad = (n) => String(n).padStart(2, '0');

export const money = (v) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(num(v))) + ' ' + APP.CURRENCY;
export const moneyShort = (v) => {
  const n = num(v), a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' млн';
  if (a >= 1e3) return Math.round(n / 1e3) + ' тыс';
  return String(Math.round(n));
};
export const pct = (v) => num(v).toFixed(1).replace('.', ',') + '%';
export const fmtDateTime = (ts) => (ts ? new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString('ru-RU') : '—');
export const ymd = (ts = Date.now()) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const fmtYmd = (s) => (s ? String(s).split('-').reverse().join('.') : '—');
export const tomorrow = () => ymd(Date.now() + DAY);

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const docNumber = (prefix) => `${prefix}-${ymd().slice(2).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

export function phoneDigits(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  return d;
}
export const waLink = (phone, text) => `https://wa.me/${phoneDigits(phone)}?text=${encodeURIComponent(text)}`;
export function openExternal(url) {
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}

export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export function download(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
export function setPath(o, p, v) {
  const ks = p.split('.'); const last = ks.pop();
  const t = ks.reduce((x, k) => { if (x[k] == null) x[k] = {}; return x[k]; }, o);
  t[last] = v;
}

export function daysAgo(ts) {
  if (!ts) return '—';
  const d = Math.floor((Date.now() - ts) / DAY);
  if (d <= 0) return 'сегодня';
  if (d === 1) return 'вчера';
  const m10 = d % 10, m100 = d % 100;
  const w = m10 === 1 && m100 !== 11 ? 'день' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'дня' : 'дней';
  return `${d} ${w} назад`;
}

export const opts = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`).join('');

/* ------------------------------ Периоды ------------------------------ */
export function periodRange(period, from, to) {
  const now = new Date();
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  switch (period) {
    case 'day': return { from: sod, to: Infinity, label: 'За день: ' + fmtDate(sod) };
    case 'week': { const s = sod - ((now.getDay() + 6) % 7) * DAY; return { from: s, to: Infinity, label: 'За неделю: с ' + fmtDate(s) }; }
    case 'month': { const s = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); return { from: s, to: Infinity, label: 'За месяц: с ' + fmtDate(s) }; }
    case 'custom': {
      const f = from ? new Date(from + 'T00:00:00').getTime() : 0;
      const t = to ? new Date(to + 'T23:59:59.999').getTime() : Infinity;
      return { from: f, to: t, label: `Период: ${from ? fmtDate(f) : 'с начала'} — ${to ? fmtDate(t) : 'по сегодня'}` };
    }
    default: return { from: 0, to: Infinity, label: 'За всё время' };
  }
}
export const inRange = (ts, r) => num(ts) >= r.from && num(ts) <= r.to;

/* ------------------------------ CSV/XLSX ----------------------------- */
export function toCSV(rows, headers) {
  const hs = headers || Object.keys(rows[0] || {});
  const cell = (v) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + [hs.map(cell).join(';'), ...rows.map((r) => hs.map((h) => cell(r[h])).join(';'))].join('\r\n');
}

export function parseCSV(text) {
  const src = String(text).replace(/^﻿/, '');
  const first = src.split(/\r?\n/)[0] || '';
  const delim = [';', ',', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  if (!clean.length) return [];
  const hs = clean[0].map((h) => String(h).trim());
  return clean.slice(1).map((r) => Object.fromEntries(hs.map((h, i) => [h, r[i] ?? ''])));
}

export function hasXLSX() { return typeof window.XLSX !== 'undefined'; }

/** sheets: [{ name, headers, rows }] */
export function exportXLSX(filename, sheets) {
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  sheets.forEach((s) => {
    const aoa = [s.headers, ...s.rows.map((r) => s.headers.map((h) => r[h] ?? ''))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const w = [];
    aoa.forEach((r) => r.forEach((v, i) => { w[i] = Math.min(60, Math.max(w[i] || 8, String(v ?? '').length + 2)); }));
    ws['!cols'] = w.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

export async function readTable(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'json') {
    const data = JSON.parse(await file.text());
    return Array.isArray(data) ? data : Array.isArray(data.products) ? data.products : [];
  }
  if (ext === 'csv' || ext === 'txt') return parseCSV(await file.text());
  if (ext === 'xlsx' || ext === 'xls') {
    if (!hasXLSX()) throw new Error('Библиотека Excel не загрузилась. Проверьте интернет или используйте CSV.');
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  }
  throw new Error('Поддерживаются файлы .xlsx, .xls, .csv, .json');
}

export function compressImage(file, maxSide = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Файл не является изображением'));
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function withTimeout(promise, ms, onTimeout) {
  let t;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => { t = setTimeout(() => (onTimeout ? resolve(onTimeout()) : reject(new Error('Превышено время ожидания'))), ms); }),
  ]).finally(() => clearTimeout(t));
}
