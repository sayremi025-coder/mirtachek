/* Мир Тачек — раздел «Заказы» (заказы покупателей, магазинов и дилеров на дату) */
import * as D from '../domain.js';
import * as Svc from '../services.js';
import { S, Actions, Views, App, ORDER_KINDS, ORDER_STATUS } from '../state.js';
import { $, esc, num, norm, money, opts, fmtDateTime, fmtYmd, ymd, tomorrow, waLink, openExternal } from '../utils.js';
import { icon } from '../icons.js';
import { toast, openModal, paginate, pagerHTML, segBtns, emptyState, confirmDialog, formDialog } from '../ui.js';
import { APP } from '../config.js';
import { loadOrderToCart, orderText } from './cart.js';
import { printHTML } from './docs.js';

function filtered() {
  const f = S.orders, q = norm(f.q);
  const today = ymd(), tmr = tomorrow();
  return D.orders()
    .filter((o) => f.status === 'all' || (f.status === 'active' ? ['new', 'processing'].includes(o.status) : o.status === f.status))
    .filter((o) => f.kind === 'all' || o.kind === f.kind)
    .filter((o) => f.date === 'all' || (f.date === 'today' ? o.forDate === today : f.date === 'tomorrow' ? o.forDate === tmr : true))
    .filter((o) => !q || norm([o.number, o.name, o.phone, o.comment, o.assignedDealerName, ...(o.items || []).map((i) => i.name)].join(' ')).includes(q))
    .sort((a, b) => (a.forDate || '9').localeCompare(b.forDate || '9') || num(b.createdAt) - num(a.createdAt));
}

function actionsFor(o) {
  const r = D.role(), u = D.myUid();
  const a = [`<button type="button" class="icon-btn icon-btn--sm" data-action="order-view" data-id="${o.id}" title="Открыть" aria-label="Открыть">${icon('file')}</button>`];
  const active = ['new', 'processing'].includes(o.status);
  if (r === 'admin') {
    if (o.phone) a.push(`<button type="button" class="icon-btn icon-btn--sm icon-btn--wa" data-action="order-wa" data-id="${o.id}" title="Написать клиенту" aria-label="WhatsApp">${icon('whatsapp')}</button>`);
    if (active) {
      if (o.status === 'new') a.push(`<button type="button" class="btn btn--ghost btn--sm" data-action="order-status" data-status="processing" data-id="${o.id}">В работу</button>`);
      a.push(`<button type="button" class="btn btn--primary btn--sm" data-action="order-process" data-id="${o.id}">${icon('check')}${o.kind === 'retail' ? 'Провести продажу' : o.kind === 'store' ? 'Отгрузить' : 'Выдать дилеру'}</button>`);
      if (o.kind === 'store') a.push(`<button type="button" class="btn btn--ghost btn--sm" data-action="order-assign" data-id="${o.id}">${icon('truck')}Дилеру</button>`);
      a.push(`<button type="button" class="icon-btn icon-btn--sm" data-action="order-cancel" data-id="${o.id}" title="Отменить" aria-label="Отменить">${icon('x')}</button>`);
    }
  } else if (r === 'dealer' && o.assignedDealerUid === u && active) {
    a.push(`<button type="button" class="btn btn--primary btn--sm" data-action="order-process" data-id="${o.id}">${icon('truck')}Отгрузить по заказу</button>`);
  } else if (o.uid === u) {
    a.push(`<button type="button" class="icon-btn icon-btn--sm icon-btn--wa" data-action="order-wa" data-id="${o.id}" title="Написать в WhatsApp" aria-label="WhatsApp">${icon('whatsapp')}</button>`);
    if (o.status === 'new') a.push(`<button type="button" class="btn btn--ghost btn--sm" data-action="order-cancel" data-id="${o.id}">Отменить</button>`);
  }
  if (o.resultDocId && D.doc(o.resultDocId)) a.push(`<button type="button" class="btn btn--ghost btn--sm" data-action="doc-view" data-id="${o.resultDocId}">${icon('file')}Документ</button>`);
  return a.join('');
}

Views.orders = {
  shell() {
    const r = D.role();
    const sub = r === 'admin' ? 'Заказы покупателей, магазинов и дилеров. Проводите, передавайте дилерам, печатайте сборочный лист.'
      : r === 'dealer' ? 'Ваши заказы у компании и заказы магазинов, переданные вам.'
        : r === 'store' ? 'Ваши заказы у компании на нужную дату.' : 'Ваши заказы и их статусы.';
    return `<div class="view-head"><div><h1>Заказы</h1><p class="muted">${esc(sub)}</p></div>
      <div class="btn-row">${r === 'admin' ? `<button type="button" class="btn btn--dark btn--sm" data-action="picklist">${icon('list')}Сборочный лист на завтра</button>` : ''}
      <button type="button" class="btn btn--primary btn--sm" data-action="nav" data-view="cart">${icon('plus')}Новый заказ</button></div></div>
      <div class="metrics" id="ordMetrics"></div>
      <div class="toolbar">
        <label class="search">${icon('search')}<input type="search" data-bind="orders.q" value="${esc(S.orders.q)}" placeholder="Номер, имя, телефон, товар" aria-label="Поиск заказов"></label>
        <div class="seg" data-seg="orders.status">${segBtns('orders.status', [['active', 'Активные'], ['done', 'Выполнены'], ['cancelled', 'Отменены'], ['all', 'Все']])}</div>
        <select data-bind="orders.date" aria-label="Дата">${opts([['all', 'Любая дата'], ['today', 'На сегодня'], ['tomorrow', 'На завтра']], S.orders.date)}</select>
        ${r === 'admin' ? `<select data-bind="orders.kind" aria-label="От кого">${opts([['all', 'Все заказчики'], ['retail', 'Покупатели'], ['store', 'Магазины'], ['dealer', 'Дилеры']], S.orders.kind)}</select>` : ''}
      </div>
      <section class="panel panel--flush"><div class="table-wrap" id="ordTable"></div><div id="ordPager"></div></section>`;
  },
  body() {
    const all = D.orders();
    const active = all.filter((o) => ['new', 'processing'].includes(o.status));
    const tmr = active.filter((o) => o.forDate === tomorrow());
    $('#ordMetrics').innerHTML = `
      <div class="metric"><span>Новые</span><b>${all.filter((o) => o.status === 'new').length}</b><small>ожидают обработки</small></div>
      <div class="metric"><span>В работе</span><b>${all.filter((o) => o.status === 'processing').length}</b><small>собираются</small></div>
      <div class="metric metric--accent"><span>На завтра</span><b>${tmr.length}</b><small>${money(tmr.reduce((s, o) => s + num(o.total), 0))}</small></div>
      <div class="metric"><span>Выполнено</span><b>${all.filter((o) => o.status === 'done').length}</b><small>за всё время</small></div>`;
    const list = filtered();
    const pg = paginate(list, S.orders.page, APP.TABLE_SIZE);
    S.orders.page = pg.page;
    $('#ordTable').innerHTML = list.length ? `<table class="table"><thead><tr>
        <th>Заказ</th><th>На дату</th><th>Заказчик</th><th class="num">Позиций</th><th class="num">Сумма</th><th>Статус</th><th></th></tr></thead>
      <tbody>${pg.items.map((o) => `<tr>
        <td><b>${esc(o.number)}</b><small>${fmtDateTime(o.createdAt)}</small></td>
        <td>${o.forDate ? `<b>${fmtYmd(o.forDate)}</b>` : '<span class="muted">—</span>'}${o.forDate === tomorrow() ? '<small>завтра</small>' : o.forDate === ymd() ? '<small>сегодня</small>' : ''}</td>
        <td><span class="tag tag--${o.kind}">${esc(ORDER_KINDS[o.kind].label)}</span> ${esc(o.name)}<small>${esc(o.phone || '')}${o.assignedDealerName ? ' · дилер: ' + esc(o.assignedDealerName) : ''}</small></td>
        <td class="num">${(o.items || []).reduce((s, i) => s + num(i.qty), 0)}</td>
        <td class="num"><b>${money(o.total)}</b></td>
        <td><span class="status status--o-${o.status}">${esc(ORDER_STATUS[o.status] || o.status)}</span></td>
        <td><div class="actions">${actionsFor(o)}</div></td></tr>`).join('')}</tbody></table>`
      : emptyState('calendar', 'Заказов нет', 'Оформите заказ в корзине или измените фильтры.');
    $('#ordPager').innerHTML = pagerHTML('orders', pg);
  },
};

function orderModal(o) {
  openModal(`<h2 id="modalTitle">${icon('calendar')}Заказ ${esc(o.number)}</h2>
    <dl class="kv">
      <dt>Заказчик</dt><dd>${esc(ORDER_KINDS[o.kind].label)}: ${esc(o.name)}${o.phone ? ', ' + esc(o.phone) : ''}</dd>
      <dt>Создан</dt><dd>${fmtDateTime(o.createdAt)}</dd>
      ${o.forDate ? `<dt>На дату</dt><dd>${fmtYmd(o.forDate)}</dd>` : ''}
      <dt>Получение</dt><dd>${o.delivery === 'delivery' ? 'Доставка: ' + esc(o.address) : 'Самовывоз'}</dd>
      ${o.booking ? `<dt>Запись</dt><dd>${fmtDateTime(new Date(o.booking).getTime())}</dd>` : ''}
      <dt>Статус</dt><dd>${esc(ORDER_STATUS[o.status])}${o.assignedDealerName ? ', дилер: ' + esc(o.assignedDealerName) : ''}</dd>
      ${o.comment ? `<dt>Комментарий</dt><dd>${esc(o.comment)}</dd>` : ''}
    </dl>
    <div class="table-wrap"><table class="table"><thead><tr><th>Позиция</th><th class="num">Кол-во</th><th class="num">Цена</th><th class="num">Сумма</th></tr></thead>
    <tbody>${(o.items || []).map((i) => `<tr><td>${esc(i.name)}</td><td class="num">${i.qty}</td><td class="num">${money(i.price)}</td><td class="num">${money(i.qty * i.price)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="3">Итого</td><td class="num">${money(o.total)}</td></tr></tfoot></table></div>
    <div class="btn-row"><div class="actions">${actionsFor(o)}</div></div>`, 'modal--wide');
}

function pickListHTML(date) {
  const rows = D.pickList(date);
  const ords = D.orders().filter((o) => ['new', 'processing'].includes(o.status) && o.forDate === date);
  return `<div class="receipt">
    <header class="receipt__head"><div class="receipt__brand">${icon('logo')}<div><b>${esc(D.companyName())}</b><small>Сборочный лист</small></div></div>
      <div class="receipt__no"><b id="modalTitle">На ${fmtYmd(date)}</b><small>Заказов: ${ords.length}</small></div></header>
    ${rows.length ? `<table class="receipt__table"><thead><tr><th>№</th><th>Товар</th><th>Нужно</th><th>На складе</th><th>Не хватает</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}<small>в ${r.orders} заказ.</small></td><td>${r.qty}</td><td>${r.stock}</td><td class="${r.short ? 'is-debt' : ''}">${r.short || '—'}</td></tr>`).join('')}</tbody></table>
      <h3>Заказы</h3><table class="receipt__table"><thead><tr><th>Заказ</th><th>Заказчик</th><th>Получение</th><th>Сумма</th></tr></thead>
      <tbody>${ords.map((o) => `<tr><td>${esc(o.number)}</td><td>${esc(o.name)}<small>${esc(ORDER_KINDS[o.kind].label)}${o.assignedDealerName ? ', дилер ' + esc(o.assignedDealerName) : ''}</small></td><td>${o.delivery === 'delivery' ? esc(o.address) : 'Самовывоз'}</td><td>${money(o.total)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">На эту дату активных заказов нет.</p>'}
  </div>`;
}

Object.assign(Actions, {
  'order-view': (el) => { const o = D.order(el.dataset.id); if (o) orderModal(o); },
  'order-wa': (el) => {
    const o = D.order(el.dataset.id);
    if (!o) return;
    const toClient = D.isAdmin();
    const text = toClient ? `Здравствуйте, ${o.name}! «${D.companyName()}» по заказу ${o.number} на ${money(o.total)}. ` + (o.kind === 'retail' ? 'Подтвердите, пожалуйста, самовывоз или адрес доставки.' : 'Заказ принят в работу.') : orderText(o);
    openExternal(waLink(toClient ? o.phone : D.companyPhone(), text));
  },
  'order-status': async (el) => { const o = D.order(el.dataset.id); if (o) { await Svc.setOrderStatus(o, el.dataset.status); toast('Статус обновлен', 'ok'); } },
  'order-cancel': async (el) => {
    const o = D.order(el.dataset.id);
    if (o && await confirmDialog('Отменить заказ?', `${o.number} на ${money(o.total)}`, 'Отменить заказ', true)) { await Svc.setOrderStatus(o, 'cancelled'); toast('Заказ отменен', 'ok'); }
  },
  'order-process': (el) => { const o = D.order(el.dataset.id); if (o) loadOrderToCart(o); },
  'order-assign': async (el) => {
    const o = D.order(el.dataset.id);
    if (!o) return;
    const ds = D.dealers();
    if (!ds.length) { toast('Нет пользователей с ролью «Дилер»', 'error'); return; }
    const v = await formDialog(`Передать заказ ${o.number} дилеру`, `<label class="field"><span>Дилер</span><select name="dealer" required>${opts(ds.map((d) => [d.uid, d.name]), o.assignedDealerUid)}</select></label>`, 'Передать', 'Дилер увидит заказ и сможет оформить отгрузку магазину со своего товара.');
    if (!v) return;
    const dealer = ds.find((d) => d.uid === v.dealer);
    await Svc.assignOrder(o, dealer);
    toast(`Заказ передан: ${dealer.name}`, 'ok');
  },
  picklist: async () => {
    const v = await formDialog('Сборочный лист', `<label class="field"><span>Дата</span><input type="date" name="date" value="${tomorrow()}" required></label>`, 'Показать');
    if (!v) return;
    openModal(`${pickListHTML(v.date)}<div class="btn-row"><button type="button" class="btn btn--dark" data-action="picklist-print" data-date="${v.date}">${icon('printer')}Печать</button></div>`, 'modal--receipt');
  },
  'picklist-print': (el) => printHTML(pickListHTML(el.dataset.date)),
});
