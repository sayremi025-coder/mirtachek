/* Мир Тачек — раздел «Управление» (администратор): пользователи, товары, склад, настройки, журнал */
import { Data } from '../data.js';
import * as D from '../domain.js';
import * as Svc from '../services.js';
import { S, Actions, Views, App, ROLES, ROLE_OPTIONS } from '../state.js';
import { $, esc, num, norm, money, opts, fmtDateTime, fmtDate, ymd, toCSV, download, exportXLSX, hasXLSX, readTable } from '../utils.js';
import { icon } from '../icons.js';
import { toast, paginate, pagerHTML, segBtns, emptyState, confirmDialog, formDialog, thumb } from '../ui.js';
import { APP } from '../config.js';

const SUBTABS = [['users', 'Пользователи'], ['products', 'Товары'], ['stock', 'Склад'], ['settings', 'Настройки'], ['audit', 'Журнал']];

/* ------------------------------ Excel-колонки --------------------------- */
export const CATALOG_COLUMNS = [
  ['id', 'ID'], ['sku', 'Артикул'], ['type', 'Тип'], ['name', 'Название'], ['category', 'Категория'], ['description', 'Описание'],
  ['unit', 'Ед. изм.'], ['retailPrice', 'Розница'], ['storePrice', 'Цена магазина'], ['dealerPrice', 'Цена дилера'], ['costPrice', 'Закуп'],
  ['stock', 'Остаток'], ['isNew', 'Новинка'], ['featured', 'На главной'], ['imageUrl', 'Фото (ссылка)'],
];
const ALIASES = (() => {
  const m = {};
  CATALOG_COLUMNS.forEach(([k, ru]) => { m[norm(k)] = k; m[norm(ru)] = k; });
  Object.assign(m, { 'наименование': 'name', 'товар': 'name', 'цена': 'retailPrice', 'розничная цена': 'retailPrice', 'себестоимость': 'costPrice', 'закупочная цена': 'costPrice', 'количество': 'stock', 'кол-во': 'stock', 'фото': 'imageUrl', 'image': 'imageUrl', 'ссылка на фото': 'imageUrl', 'код': 'sku', 'ед.': 'unit', 'единица': 'unit', 'популярное': 'featured' });
  return m;
})();
const yes = (v) => (typeof v === 'boolean' ? v : /^(да|yes|true|1|\+)$/i.test(String(v ?? '').trim()));
function rowToProduct(row) {
  const p = {};
  Object.keys(row).forEach((k) => { const key = ALIASES[norm(k)]; if (key) p[key] = row[k]; });
  const name = String(p.name ?? '').trim();
  if (!name) return null;
  return {
    id: String(p.id ?? '').trim() || undefined, sku: String(p.sku ?? '').trim(), name,
    type: /услуг|service/i.test(String(p.type || '')) ? 'service' : 'product',
    category: String(p.category ?? '').trim(), description: String(p.description ?? '').trim(), unit: String(p.unit ?? '').trim(),
    retailPrice: num(p.retailPrice), storePrice: num(p.storePrice), dealerPrice: num(p.dealerPrice), costPrice: num(p.costPrice),
    stock: num(p.stock), isNew: yes(p.isNew), featured: yes(p.featured), imageUrl: String(p.imageUrl ?? '').trim(),
  };
}
const productRow = (p) => ({
  'ID': p.id, 'Артикул': p.sku || '', 'Тип': p.type === 'service' ? 'Услуга' : 'Товар', 'Название': p.name, 'Категория': p.category || '', 'Описание': p.description || '',
  'Ед. изм.': p.unit || '', 'Розница': p.retailPrice, 'Цена магазина': p.storePrice, 'Цена дилера': p.dealerPrice, 'Закуп': p.costPrice,
  'Остаток': p.type === 'service' ? 0 : num(p.stock), 'Новинка': p.isNew ? 'да' : 'нет', 'На главной': p.featured ? 'да' : 'нет',
  'Фото (ссылка)': String(p.imageUrl || '').startsWith('data:') ? '' : p.imageUrl || '',
});
export const SAMPLE_ROWS = [
  ['', '08880-83322', 'Товар', 'Масло моторное 5W-30 синтетика, 4 л', 'Масла и жидкости', 'Синтетическое масло API SP, ACEA C3 для бензиновых и дизельных двигателей.', 'шт', 16900, 14500, 13200, 11000, 40, 'нет', 'да', ''],
  ['', '04152-YZZA6', 'Товар', 'Фильтр масляный Toyota / Lexus', 'Фильтры', 'Масляный фильтр для двигателей 2.0–3.5.', 'шт', 3200, 2600, 2300, 1700, 120, 'нет', 'нет', ''],
  ['', '17801-0H050', 'Товар', 'Фильтр воздушный', 'Фильтры', 'Воздушный фильтр двигателя.', 'шт', 4500, 3700, 3300, 2400, 80, 'нет', 'нет', ''],
  ['', 'BP-1820', 'Товар', 'Колодки тормозные передние', 'Тормозная система', 'Керамические колодки, низкий уровень пыли и шума.', 'компл', 18500, 15800, 14500, 11500, 35, 'нет', 'да', ''],
  ['', 'BD-2490', 'Товар', 'Диск тормозной вентилируемый', 'Тормозная система', 'Передний вентилируемый диск, антикоррозийное покрытие.', 'шт', 24900, 21500, 19800, 16000, 18, 'нет', 'нет', ''],
  ['', 'AKB-60', 'Товар', 'Аккумулятор 60 Ач, 540 А', 'Электрика', 'Необслуживаемый, прямая полярность. Гарантия 2 года.', 'шт', 42000, 37500, 35000, 30000, 12, 'да', 'да', ''],
  ['', 'SP-IR4', 'Товар', 'Свечи зажигания иридиевые, 4 шт.', 'Электрика', 'Ресурс до 100 000 км.', 'компл', 14800, 12600, 11500, 8800, 50, 'нет', 'нет', ''],
  ['', 'AF-G12-5', 'Товар', 'Антифриз G12+ красный, 5 л', 'Масла и жидкости', 'Готовый антифриз до -40 °C.', 'шт', 7900, 6600, 6100, 4800, 60, 'нет', 'нет', ''],
  ['', 'WB-600', 'Товар', 'Щетки стеклоочистителя бескаркасные, 2 шт.', 'Автотовары', 'Универсальный крепеж, всесезонные.', 'компл', 6900, 5600, 5100, 3600, 70, 'да', 'нет', ''],
  ['', 'DVR-FHD', 'Товар', 'Видеорегистратор Full HD с GPS', 'Автотовары', 'Запись 1080p, ночной режим, GPS.', 'шт', 29900, 25500, 23500, 19000, 9, 'да', 'да', ''],
  ['', '', 'Услуга', 'Замена масла и масляного фильтра', 'СТО', 'Слив, замена фильтра, заливка масла. Расходники отдельно.', 'услуга', 5000, 4500, 4000, 1500, 0, 'нет', 'да', ''],
  ['', '', 'Услуга', 'Компьютерная диагностика', 'СТО', 'Считывание ошибок, проверка датчиков и систем.', 'услуга', 8000, 7000, 6500, 2000, 0, 'нет', 'нет', ''],
  ['', '', 'Услуга', 'Замена тормозных колодок (одна ось)', 'СТО', 'Замена колодок, проверка дисков и суппортов.', 'услуга', 7000, 6000, 5500, 2000, 0, 'нет', 'нет', ''],
  ['', '', 'Услуга', 'Шиномонтаж, 4 колеса R13–R16', 'СТО', 'Снятие, монтаж, балансировка, установка.', 'услуга', 12000, 10500, 9500, 3500, 0, 'нет', 'нет', ''],
  ['', '', 'Услуга', 'Развал-схождение', 'СТО', 'Регулировка углов установки колес на 3D-стенде.', 'услуга', 10000, 9000, 8000, 3000, 0, 'да', 'нет', ''],
];

/* ------------------------------- Подразделы ---------------------------- */
function usersBody() {
  const f = S.manage, q = norm(f.q);
  const list = D.users().filter((u) => f.role === 'all' || u.role === f.role)
    .filter((u) => !q || norm([u.name, u.email, u.phone].join(' ')).includes(q))
    .sort((a, b) => num(b.createdAt) - num(a.createdAt));
  const pg = paginate(list, f.page, APP.TABLE_SIZE); f.page = pg.page;
  const me = D.myUid();
  const counts = Object.fromEntries(ROLE_OPTIONS.map(([r]) => [r, D.users().filter((u) => u.role === r).length]));
  return `<div class="metrics" data-live="um">${ROLE_OPTIONS.map(([r, l]) => `<div class="metric"><span>${esc(l)}</span><b>${counts[r]}</b></div>`).join('')}</div>
    <div class="toolbar">
      <label class="search">${icon('search')}<input type="search" data-bind="manage.q" value="${esc(f.q)}" placeholder="Имя, email, телефон" aria-label="Поиск пользователей"></label>
      <select data-bind="manage.role" aria-label="Роль">${opts([['all', 'Все роли'], ...ROLE_OPTIONS], f.role)}</select>
      ${Data.isDemo() ? `<button type="button" class="btn btn--ghost btn--sm" data-action="user-demo-add">${icon('plus')}Демо-пользователь</button>` : ''}
    </div>
    <p class="note">Каждый, кто входит впервые, становится покупателем. Роль меняет только администратор. Название магазина (имя пользователя) должно быть уникальным.</p>
    <section class="panel panel--flush" data-live="ut"><div class="table-wrap">${list.length ? `<table class="table"><thead><tr><th>Пользователь</th><th>Контакты</th><th>Роль</th><th>Статус</th><th>Регистрация</th><th></th></tr></thead>
      <tbody>${pg.items.map((u) => `<tr>
        <td><b>${esc(u.name || '—')}</b>${u.uid === me ? '<small>это вы</small>' : ''}</td>
        <td>${esc(u.email || '—')}<small>${esc(u.phone || '')}</small></td>
        <td><select data-user-role="${esc(u.uid)}" aria-label="Роль" ${u.uid === me ? 'disabled' : ''}>${opts(ROLE_OPTIONS, u.role)}</select></td>
        <td>${u.blocked ? '<span class="status status--danger">Заблокирован</span>' : '<span class="status status--ok">Активен</span>'}</td>
        <td>${fmtDate(u.createdAt)}<small>вход: ${fmtDate(u.lastLoginAt)}</small></td>
        <td><div class="actions"><button type="button" class="icon-btn icon-btn--sm" data-action="user-edit" data-id="${esc(u.uid)}" title="Изменить имя и телефон" aria-label="Изменить">${icon('edit')}</button>
          ${u.uid !== me ? `<button type="button" class="btn btn--ghost btn--sm" data-action="user-block" data-id="${esc(u.uid)}">${icon(u.blocked ? 'check' : 'ban')}${u.blocked ? 'Разблокировать' : 'Блокировать'}</button>` : ''}</div></td>
      </tr>`).join('')}</tbody></table>` : emptyState('users', 'Пользователей нет', 'Они появятся после первого входа.')}</div>${pagerHTML('manage', pg)}</section>`;
}

function productsBody() {
  const f = S.mprod, q = norm(f.q);
  const list = D.products().filter((p) => f.type === 'all' || (p.type || 'product') === f.type)
    .filter((p) => !q || norm([p.name, p.sku, p.category].join(' ')).includes(q))
    .sort((a, b) => num(b.updatedAt) - num(a.updatedAt));
  const pg = paginate(list, f.page, APP.TABLE_SIZE); f.page = pg.page;
  return `<div class="two-col">
    <form class="panel stack" id="productForm" novalidate>
      <div class="panel__head" style="margin:0"><h2 class="panel__title" id="pfTitle">Новый товар / услуга</h2>
        <button type="button" class="btn btn--ghost btn--sm" data-action="prod-new">${icon('plus')}Новая позиция</button></div>
      <div class="field-grid field-grid--3">
        <label class="field"><span>Тип</span><select name="type">${opts([['product', 'Товар'], ['service', 'Услуга']], 'product')}</select></label>
        <label class="field"><span>Артикул</span><input type="text" name="sku"></label>
        <label class="field"><span>Ед. изм.</span><input type="text" name="unit" placeholder="шт"></label></div>
      <label class="field"><span>Название</span><input type="text" name="name" required></label>
      <label class="field"><span>Категория</span><input type="text" name="category" list="pfCats"></label><datalist id="pfCats" data-live="pc">${D.categories().map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
      <div class="field-grid field-grid--4">
        <label class="field"><span>Розница</span><input type="number" name="retailPrice" min="0" step="1" required></label>
        <label class="field"><span>Магазину</span><input type="number" name="storePrice" min="0" step="1"></label>
        <label class="field"><span>Дилеру</span><input type="number" name="dealerPrice" min="0" step="1"></label>
        <label class="field"><span>Закуп</span><input type="number" name="costPrice" min="0" step="1"></label></div>
      <div class="field-grid field-grid--3">
        <label class="field" id="pfStockRow"><span>Остаток</span><input type="number" name="stock" min="0" step="1" value="0"></label>
        <label class="check"><input type="checkbox" name="isNew">Новинка</label>
        <label class="check"><input type="checkbox" name="featured">На главной</label></div>
      <div class="img-row"><div class="img-preview" id="pfPreview"><span class="ph">${icon('image')}</span></div>
        <div class="stack"><label class="field"><span>Фото по ссылке</span><input type="url" name="imageUrl" placeholder="https://..."></label>
          <div class="btn-row"><label class="btn btn--ghost btn--sm file-btn">${icon('upload')}Загрузить файл<input type="file" id="pfImageFile" accept="image/*"></label>
          <button type="button" class="btn btn--ghost btn--sm" data-action="prod-clear-image">${icon('x')}Убрать фото</button></div></div></div>
      <label class="field"><span>Описание</span><textarea name="description" rows="3"></textarea></label>
      <p class="note">Если цены магазина и дилера не указаны, они равны рознице. Маржа = цена − закуп.</p>
      <div class="btn-row"><button type="submit" class="btn btn--primary">${icon('check')}Сохранить</button></div>
    </form>
    <section class="panel stack">
      <h2 class="panel__title">Весь каталог одним Excel-файлом</h2>
      <ol class="steps"><li>Скачайте шаблон: в нем колонки и ${SAMPLE_ROWS.length} примеров (товары и услуги).</li><li>Заполните свои позиции: цены для всех ролей, закуп, остаток, ссылку на фото.</li><li>Загрузите файл — новые позиции добавятся, существующие обновятся по ID, артикулу или названию.</li></ol>
      <div class="btn-row">
        <button type="button" class="btn btn--dark btn--sm" data-action="prod-template">${icon('download')}Шаблон с примером .xlsx</button>
        <label class="btn btn--primary btn--sm file-btn">${icon('upload')}Загрузить .xlsx / .csv / .json<input type="file" id="importFile" accept=".xlsx,.xls,.csv,.json,.txt"></label></div>
      <div class="btn-row">
        <button type="button" class="btn btn--ghost btn--sm" data-action="prod-export" data-format="xlsx">${icon('download')}Экспорт .xlsx</button>
        <button type="button" class="btn btn--ghost btn--sm" data-action="prod-export" data-format="csv">${icon('download')}.csv</button>
        <button type="button" class="btn btn--ghost btn--sm" data-action="prod-export" data-format="json">${icon('download')}.json</button></div>
      <button type="button" class="btn btn--ghost btn--sm" data-action="prod-seed" style="align-self:flex-start">${icon('database')}Загрузить пример каталога</button>
    </section>
  </div>
  <section class="panel panel--flush">
    <div class="panel__head"><h2 class="panel__title">Позиции</h2>
      <div class="btn-row"><label class="search" style="min-width:220px">${icon('search')}<input type="search" data-bind="mprod.q" value="${esc(f.q)}" placeholder="Поиск" aria-label="Поиск товаров"></label>
      <div class="seg" data-seg="mprod.type">${segBtns('mprod.type', [['all', 'Все'], ['product', 'Товары'], ['service', 'Услуги']])}</div></div></div>
    <div data-live="pt"><div class="table-wrap">${list.length ? `<table class="table"><thead><tr><th></th><th>Название</th><th class="num">Розница</th><th class="num">Магазин</th><th class="num">Дилер</th><th class="num">Закуп</th><th class="num">Маржа</th><th class="num">Остаток</th><th></th></tr></thead>
      <tbody>${pg.items.map((p) => { const m = p.retailPrice ? ((p.retailPrice - p.costPrice) / p.retailPrice) * 100 : 0; return `<tr>
        <td><div class="thumb">${thumb(p)}</div></td>
        <td><b>${esc(p.name)}</b> ${p.isNew ? '<span class="tag tag--new">Новинка</span>' : ''}${p.featured ? ' <span class="tag">На главной</span>' : ''}<small>${esc([p.type === 'service' ? 'Услуга' : 'Товар', p.sku, p.category].filter(Boolean).join(' · '))}</small></td>
        <td class="num">${money(p.retailPrice)}</td><td class="num">${money(p.storePrice)}</td><td class="num">${money(p.dealerPrice)}</td><td class="num">${money(p.costPrice)}</td>
        <td class="num ${m < 10 ? 'is-debt' : 'is-ok'}">${m.toFixed(0)}%</td>
        <td class="num ${p.type !== 'service' && num(p.stock) <= D.lowStockLimit() ? 'is-debt' : ''}">${p.type === 'service' ? '—' : num(p.stock)}</td>
        <td><div class="actions"><button type="button" class="icon-btn icon-btn--sm" data-action="prod-edit" data-id="${p.id}" aria-label="Изменить">${icon('edit')}</button>
          <button type="button" class="icon-btn icon-btn--sm" data-action="prod-delete" data-id="${p.id}" aria-label="Удалить">${icon('trash')}</button></div></td></tr>`; }).join('')}</tbody></table>`
      : emptyState('package', 'Позиций нет', 'Добавьте товар через форму или загрузите Excel-файл.')}</div>${pagerHTML('mprod', pg)}</div></section>`;
}

function stockBody() {
  const f = S.stock, q = norm(f.q);
  const prods = D.products().filter((p) => p.type !== 'service').sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
  const rows = D.stockRows().filter((r) => !f.low || r.low);
  const moves = Data.list('movements').filter((m) => !q || norm([m.productName, m.reason, m.byName].join(' ')).includes(q)).sort((a, b) => num(b.at) - num(a.at));
  const pg = paginate(moves, f.page, APP.TABLE_SIZE); f.page = pg.page;
  const low = rows.filter((r) => r.low);
  return `<div class="two-col">
    <form class="panel stack" id="stockForm" novalidate>
      <h2 class="panel__title">Приход, списание, инвентаризация</h2>
      <label class="field"><span>Товар</span><select name="productId" required data-live="ss">${opts(prods.map((p) => [p.id, `${p.name} — остаток ${num(p.stock)}`]), '')}</select></label>
      <div class="field-grid"><label class="field"><span>Операция</span><select name="mode">${opts([['in', 'Приход'], ['out', 'Списание'], ['set', 'Инвентаризация (факт)']], 'in')}</select></label>
        <label class="field"><span>Количество</span><input type="number" name="qty" min="0" step="1" required></label></div>
      <label class="field"><span>Основание</span><input type="text" name="reason" placeholder="Закупка, брак, пересчет"></label>
      <div class="btn-row"><button type="submit" class="btn btn--primary">${icon('check')}Провести</button></div>
    </form>
    <section class="panel stack" data-live="sl"><h2 class="panel__title">Мало на складе (${low.length})</h2>
      ${low.length ? `<div class="hbars">${low.slice(0, 12).map((r) => `<div class="hbar"><div class="hbar__head"><span>${esc(r.name)}</span><b class="is-debt">${r.stock}</b></div></div>`).join('')}</div>` : '<p class="muted">Все позиции выше порога.</p>'}
      <p class="note">Порог задается в настройках: сейчас ${D.lowStockLimit()} шт.</p></section>
  </div>
  <section class="panel panel--flush"><div class="panel__head"><h2 class="panel__title">Движение товара</h2>
    <label class="search" style="min-width:240px">${icon('search')}<input type="search" data-bind="stock.q" value="${esc(f.q)}" placeholder="Товар, основание" aria-label="Поиск движений"></label></div>
    <div data-live="sm"><div class="table-wrap">${moves.length ? `<table class="table"><thead><tr><th>Время</th><th>Товар</th><th class="num">Изменение</th><th>Основание</th><th>Кто</th></tr></thead>
      <tbody>${pg.items.map((m) => `<tr><td>${fmtDateTime(m.at)}</td><td>${esc(m.productName)}</td><td class="num ${num(m.qty) < 0 ? 'is-debt' : 'is-ok'}">${num(m.qty) > 0 ? '+' : ''}${num(m.qty)}</td><td>${esc(m.reason)}</td><td>${esc(m.byName || '')}</td></tr>`).join('')}</tbody></table>`
      : emptyState('history', 'Движений нет', 'Здесь фиксируются продажи, выдачи, приходы и списания.')}</div>${pagerHTML('stock', pg)}</div></section>`;
}

function settingsBody() {
  const s = Data.settings;
  return `<div class="two-col"><form class="panel stack" id="settingsForm">
      <h2 class="panel__title">Настройки компании</h2>
      <label class="field"><span>Название компании</span><input type="text" name="companyName" value="${esc(s.companyName || APP.BRAND)}"></label>
      <label class="field"><span>WhatsApp компании (куда приходят заказы)</span><input type="tel" name="whatsapp" value="${esc(s.whatsapp || '')}" placeholder="77001234567"></label>
      <label class="field"><span>Адрес</span><input type="text" name="address" value="${esc(s.address || '')}"></label>
      <label class="field"><span>Часы работы</span><input type="text" name="hours" value="${esc(s.hours || '')}" placeholder="Пн–Сб 9:00–19:00"></label>
      <label class="field"><span>Порог «мало на складе», шт.</span><input type="number" name="lowStock" min="0" value="${num(s.lowStock) || APP.LOW_STOCK}"></label>
      <div class="btn-row"><button type="submit" class="btn btn--primary">${icon('check')}Сохранить</button></div></form>
    <section class="panel stack" data-live="sc"><h2 class="panel__title">Подключение</h2>
      <div class="status-line"><span class="dot ${Data.isLive() ? 'dot--ok' : ''}"></span><b>${Data.isLive() ? 'Firebase подключен (LIVE)' : Data.isDemo() ? 'Демо-режим: данные в этом браузере' : 'Ошибка подключения'}</b></div>
      ${Data.error ? `<p class="note">${esc(Data.error)}</p>` : ''}
      ${Data.isDemo() ? `<p class="muted">Чтобы включить общий учет для всех устройств, заполните <code>js/config.js</code> (инструкция в README.md).</p>
        <button type="button" class="btn btn--danger btn--sm" data-action="demo-reset" style="align-self:flex-start">${icon('trash')}Сбросить демо-данные</button>` : `<p class="muted">Вы вошли как ${esc((Data.profile || {}).email || '')}.</p>`}
    </section></div>`;
}

function auditBody() {
  const list = Data.list('audit').sort((a, b) => num(b.at) - num(a.at));
  const pg = paginate(list, S.audit.page, APP.TABLE_SIZE); S.audit.page = pg.page;
  return `<section class="panel panel--flush" data-live="au"><div class="panel__head"><h2 class="panel__title">Журнал действий администраторов</h2></div><div class="table-wrap">
    ${list.length ? `<table class="table"><thead><tr><th>Время</th><th>Кто</th><th>Действие</th></tr></thead><tbody>${pg.items.map((a) => `<tr><td>${fmtDateTime(a.at)}</td><td>${esc(a.byName || '')}</td><td>${esc(a.details)}</td></tr>`).join('')}</tbody></table>` : emptyState('history', 'Журнал пуст', 'Здесь фиксируются смены ролей, документы, склад и настройки.')}
    </div>${pagerHTML('audit', pg)}</section>`;
}

Views.manage = {
  shell() {
    return `<div class="view-head"><div><h1>Управление</h1><p class="muted">Пользователи и роли, товары, склад, настройки компании, журнал.</p></div></div>
      <div class="subtabs" data-seg="manage.tab">${segBtns('manage.tab', SUBTABS)}</div>
      <div id="manageBody" class="stack"></div>`;
  },
  body() {
    const tab = S.manage.tab;
    const host = $('#manageBody');
    const html = tab === 'users' ? usersBody() : tab === 'products' ? productsBody() : tab === 'stock' ? stockBody() : tab === 'settings' ? settingsBody() : auditBody();
    if (host.dataset.tab === tab && host.children.length) {
      // Обновляем только живые области, формы и поля поиска сохраняются
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      tmp.querySelectorAll('[data-live]').forEach((n) => {
        const cur = host.querySelector(`[data-live="${n.dataset.live}"]`);
        if (!cur) return;
        const val = cur.tagName === 'SELECT' ? cur.value : null;
        cur.replaceWith(n);
        if (val != null && [...n.options].some((o) => o.value === val)) n.value = val;
      });
      return;
    }
    host.dataset.tab = tab;
    host.innerHTML = html;
    if (tab === 'products') fillProductForm(S.mprod.editId ? D.product(S.mprod.editId) : null);
  },
};

/* ------------------------------ Форма товара --------------------------- */
function setPreview(src) { const el = $('#pfPreview'); if (el) el.innerHTML = src ? `<img src="${esc(src)}" alt="">` : `<span class="ph">${icon('image')}</span>`; }
export function syncProductType() { const f = $('#productForm'); if (f) $('#pfStockRow').hidden = f.type.value === 'service'; }
export function fillProductForm(p) {
  const f = $('#productForm');
  if (!f) return;
  f.reset();
  S.mprod.editId = p ? p.id : null;
  S.mprod.imageFile = null;
  f.dataset.image = p ? p.imageUrl || '' : '';
  $('#pfTitle').textContent = p ? 'Редактирование: ' + p.name : 'Новый товар / услуга';
  if (p) {
    f.type.value = p.type === 'service' ? 'service' : 'product';
    ['sku', 'unit', 'name', 'category', 'description'].forEach((k) => { f[k].value = p[k] || ''; });
    ['retailPrice', 'storePrice', 'dealerPrice', 'costPrice', 'stock'].forEach((k) => { f[k].value = num(p[k]); });
    f.isNew.checked = Boolean(p.isNew); f.featured.checked = Boolean(p.featured);
    f.imageUrl.value = String(p.imageUrl || '').startsWith('data:') ? '' : p.imageUrl || '';
  }
  setPreview(p && p.imageUrl);
  syncProductType();
}
export function onProductInput(t) {
  if (t.name === 'imageUrl') setPreview(t.value.trim() || $('#productForm').dataset.image);
  if (t.name === 'type') syncProductType();
}
export function onProductImage(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('Выберите изображение', 'error'); return; }
  S.mprod.imageFile = file;
  setPreview(URL.createObjectURL(file));
}
export async function submitProduct(form) {
  const v = (k) => String(form[k].value || '').trim();
  const existing = S.mprod.editId ? D.product(S.mprod.editId) : null;
  let imageUrl = v('imageUrl') || form.dataset.image || '';
  if (S.mprod.imageFile) { toast('Загрузка фото...', 'info', 2000); imageUrl = await Data.uploadImage(S.mprod.imageFile); }
  await Svc.saveProduct({
    type: form.type.value, sku: v('sku'), unit: v('unit'), name: v('name'), category: v('category'), description: v('description'),
    retailPrice: v('retailPrice'), storePrice: v('storePrice'), dealerPrice: v('dealerPrice'), costPrice: v('costPrice'), stock: v('stock'),
    isNew: form.isNew.checked, featured: form.featured.checked, imageUrl,
  }, existing);
  toast(existing ? 'Позиция обновлена' : 'Позиция добавлена', 'ok');
  fillProductForm(null);
}

export async function importFile(file) {
  if (!file) return;
  const rows = await readTable(file);
  const parsed = rows.map(rowToProduct);
  const valid = parsed.filter(Boolean);
  if (!valid.length) throw new Error('В файле нет строк с названием товара');
  const res = await Svc.importProducts(valid);
  toast(`Импорт: новых ${res.created}, обновлено ${res.updated}${parsed.length - valid.length ? `, пропущено ${parsed.length - valid.length}` : ''}`, 'ok', 6000);
}

function exportCatalog(format) {
  const list = D.products().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
  const headers = CATALOG_COLUMNS.map(([, ru]) => ru);
  const rows = list.map(productRow);
  const base = `mir-tachek-katalog-${ymd()}`;
  if (format === 'xlsx') { if (!hasXLSX()) { toast('Библиотека Excel не загрузилась, используйте CSV', 'error'); return; } exportXLSX(base + '.xlsx', [{ name: 'Каталог', headers, rows }]); }
  else if (format === 'csv') download(base + '.csv', toCSV(rows, headers), 'text/csv;charset=utf-8');
  else download(base + '.json', JSON.stringify(list.map(productRow), null, 2), 'application/json');
}

function templateRows() {
  const headers = CATALOG_COLUMNS.map(([, ru]) => ru);
  return { headers, rows: SAMPLE_ROWS.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))) };
}

Object.assign(Actions, {
  'prod-new': () => fillProductForm(null),
  'prod-edit': (el) => { fillProductForm(D.product(el.dataset.id)); $('#productForm').scrollIntoView({ behavior: 'smooth' }); },
  'prod-delete': async (el) => {
    const p = D.product(el.dataset.id);
    if (p && await confirmDialog('Удалить позицию?', `«${p.name}» будет удалена из каталога. Проведенные документы сохранятся.`, 'Удалить', true)) { await Svc.deleteProduct(p); toast('Удалено', 'ok'); }
  },
  'prod-clear-image': () => { const f = $('#productForm'); f.imageUrl.value = ''; f.dataset.image = ''; S.mprod.imageFile = null; $('#pfImageFile').value = ''; setPreview(''); },
  'prod-export': (el) => exportCatalog(el.dataset.format),
  'prod-template': () => {
    const t = templateRows();
    if (hasXLSX()) exportXLSX('mir-tachek-shablon-kataloga.xlsx', [{ name: 'Каталог', headers: t.headers, rows: t.rows }, { name: 'Инструкция', headers: ['Колонка', 'Что указывать'], rows: [
      ['ID', 'Оставьте пустым для новых. Для обновления — ID из экспорта'], ['Тип', 'Товар или Услуга'], ['Розница', 'Цена для покупателей'], ['Цена магазина', 'Оптовая цена для магазинов'],
      ['Цена дилера', 'Цена, по которой компания выдает товар дилеру'], ['Закуп', 'Себестоимость — видит только администратор'], ['Остаток', 'Количество на складе (для услуг 0)'],
      ['Новинка', 'да / нет'], ['На главной', 'да / нет — показывать в карусели'], ['Фото (ссылка)', 'Прямая ссылка на изображение https://...'],
    ].map(([a, b]) => ({ 'Колонка': a, 'Что указывать': b })) }]);
    else download('mir-tachek-shablon-kataloga.csv', toCSV(t.rows, t.headers), 'text/csv;charset=utf-8');
  },
  'prod-seed': async () => {
    if (!(await confirmDialog('Загрузить пример каталога?', `${SAMPLE_ROWS.length} позиций из шаблона. Совпадающие по названию будут обновлены.`, 'Загрузить'))) return;
    const t = templateRows();
    const res = await Svc.importProducts(t.rows.map(rowToProduct).filter(Boolean));
    toast(`Добавлено ${res.created}, обновлено ${res.updated}`, 'ok');
  },
  'user-edit': async (el) => {
    const u = D.userById(el.dataset.id);
    if (!u) return;
    const v = await formDialog('Пользователь', `<label class="field"><span>${u.role === 'store' ? 'Название магазина' : 'Имя и фамилия'}</span><input type="text" name="name" value="${esc(u.name || '')}" required></label>
      <label class="field"><span>Телефон (WhatsApp)</span><input type="tel" name="phone" value="${esc(u.phone || '')}"></label>`, 'Сохранить', esc(u.email || ''));
    if (v) { await Svc.updateUser(u, v); toast('Сохранено', 'ok'); }
  },
  'user-block': async (el) => {
    const u = D.userById(el.dataset.id);
    if (!u) return;
    if (await confirmDialog(u.blocked ? 'Разблокировать пользователя?' : 'Заблокировать пользователя?', `${u.name || u.email}${u.blocked ? '' : '\nОн не сможет оформлять заказы и видеть документы.'}`, u.blocked ? 'Разблокировать' : 'Заблокировать', !u.blocked)) {
      await Svc.setUserBlocked(u, !u.blocked); toast('Готово', 'ok');
    }
  },
  'user-demo-add': async () => {
    const v = await formDialog('Демо-пользователь', `<label class="field"><span>Имя / название</span><input type="text" name="name" required></label>
      <div class="field-grid"><label class="field"><span>Роль</span><select name="role">${opts(ROLE_OPTIONS, 'customer')}</select></label>
      <label class="field"><span>Телефон</span><input type="tel" name="phone"></label></div>`, 'Создать');
    if (v) { await Svc.createDemoUser(v); toast('Пользователь создан', 'ok'); }
  },
  'demo-reset': async () => {
    if (await confirmDialog('Сбросить демо-данные?', 'Все данные в этом браузере будут удалены.', 'Сбросить', true)) { Data.resetDemo(); location.reload(); }
  },
});

export async function changeUserRole(uid, newRole, selectEl) {
  const u = D.userById(uid);
  if (!u) return;
  const label = (ROLES[newRole] || {}).label;
  const warn = newRole === 'admin' ? '\nАдминистратор получит полный доступ: все отчеты, пользователи, цены закупа.' : '';
  if (!(await confirmDialog('Сменить роль?', `${u.name || u.email}: ${ROLES[u.role].label} → ${label}${warn}`, 'Сменить роль', newRole === 'admin'))) { selectEl.value = u.role; return; }
  try { await Svc.setUserRole(u, newRole); toast(`Роль изменена: ${label}`, 'ok'); } catch (e) { selectEl.value = u.role; throw e; }
}

export async function submitStock(form) {
  await Svc.stockOperation({ productId: form.productId.value, mode: form.mode.value, qty: form.qty.value, reason: form.reason.value.trim() });
  form.qty.value = ''; form.reason.value = '';
  toast('Складская операция проведена', 'ok');
}
export async function submitSettings(form) {
  await Svc.saveSettings({
    companyName: form.companyName.value.trim() || APP.BRAND, whatsapp: form.whatsapp.value.replace(/\D/g, ''),
    address: form.address.value.trim(), hours: form.hours.value.trim(), lowStock: num(form.lowStock.value),
  });
  App.invalidate();
  toast('Настройки сохранены', 'ok');
}
