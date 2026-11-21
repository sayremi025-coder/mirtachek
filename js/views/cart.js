/* Мир Тачек — раздел «Корзина и оформление» */
import { Data } from '../data.js';
import * as D from '../domain.js';
import * as Svc from '../services.js';
import { S, Actions, Views, App, CART_MODES, MODE_META, LEVEL_LABEL, PAY_TYPES, VIA, ORDER_KINDS, persistCart, persistCheckout } from '../state.js';
import { $, esc, num, money, opts, waLink, openExternal, fmtYmd, fmtDateTime, tomorrow, ymd } from '../utils.js';
import { icon } from '../icons.js';
import { toast, emptyState, thumb, confirmDialog } from '../ui.js';
import { showDocument } from './docs.js';

export const modesFor = () => CART_MODES[D.role()] || CART_MODES.guest;

export function cartLines(mode = S.checkout.mode) {
  const level = (MODE_META[mode] || MODE_META.retailOrder).level;
  return S.cart.map((l) => {
    const p = D.product(l.id);
    if (!p) return null;
    const qty = Math.max(1, Math.round(num(l.qty)));
    const price = D.levelPrice(p, level);
    return { p, qty, price, sum: price * qty };
  }).filter(Boolean);
}
const hasService = (lines) => lines.some((l) => l.p.type === 'service');

function counterpartyOptions(mode) {
  if (mode === 'dealerShipment' || mode === 'companyShipment') return [['', 'Выберите магазин'], ...D.stores().map((u) => [u.uid, u.name])];
  if (mode === 'issue') return [['', 'Выберите дилера'], ...D.dealers().map((u) => [u.uid, u.name])];
  if (mode === 'sale') return [['', 'Без аккаунта (ввести имя и телефон)'], ...D.users().filter((u) => u.role === 'customer' && !u.blocked).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru')).map((u) => [u.uid, `${u.name}${u.phone ? ', ' + u.phone : ''}`])];
  return [];
}

Views.cart = {
  shell() {
    const ck = S.checkout;
    const modes = modesFor();
    if (!modes.includes(ck.mode)) ck.mode = modes[0];
    const me = Data.profile || {};
    if (!ck.name) ck.name = me.name || '';
    if (!ck.phone) ck.phone = me.phone || '';
    return `<div class="view-head"><div><h1>Корзина и оформление</h1><p class="muted" id="ckHint"></p></div>
      <button type="button" class="btn btn--ghost btn--sm" data-action="cart-clear">${icon('trash')}Очистить</button></div>
      <div class="cart-layout">
        <section class="panel"><div id="ckOrderNote"></div><div id="cartItems"></div></section>
        <form class="panel checkout" id="checkoutForm" novalidate>
          <h2 class="panel__title">Оформление</h2>
          <label class="field ${modes.length < 2 ? 'is-hidden' : ''}"><span>Что оформляем</span>
            <select data-bind="checkout.mode">${opts(modes.map((m) => [m, MODE_META[m].label]), ck.mode)}</select></label>
          <label class="field" id="ckCounterRow"><span id="ckCounterLabel">Получатель</span><select data-bind="checkout.counterparty" id="ckCounter"></select></label>
          <div class="field-grid" id="ckContactRow">
            <label class="field"><span>Имя</span><input type="text" data-bind="checkout.name" value="${esc(ck.name)}" autocomplete="name"></label>
            <label class="field"><span>Телефон</span><input type="tel" data-bind="checkout.phone" value="${esc(ck.phone)}" placeholder="+7 7__ ___ __ __" autocomplete="tel"></label>
          </div>
          <label class="field" id="ckDateRow"><span>На какую дату</span><input type="date" data-bind="checkout.forDate" value="${esc(ck.forDate)}" min="${ymd()}"></label>
          <div class="field" id="ckDeliveryRow"><span>Получение</span>
            <div class="seg" data-seg="checkout.delivery">${'<button type="button" class="seg__btn" data-action="set" data-path="checkout.delivery" data-value="pickup">Самовывоз</button><button type="button" class="seg__btn" data-action="set" data-path="checkout.delivery" data-value="delivery">Доставка</button>'}</div></div>
          <label class="field" id="ckAddressRow"><span>Адрес доставки</span><input type="text" data-bind="checkout.address" value="${esc(ck.address)}" placeholder="Город, улица, дом" autocomplete="street-address"></label>
          <label class="field" id="ckPayRow"><span id="ckPayLabel">Оплата</span><select data-bind="checkout.payType">${opts(Object.entries(PAY_TYPES), ck.payType)}</select></label>
          <div class="field-grid" id="ckPartialRow">
            <label class="field"><span>Внесено сейчас</span><input type="number" min="0" step="1" data-bind="checkout.partialAmount" value="${esc(ck.partialAmount)}"></label>
            <label class="field"><span>Способ</span><select data-bind="checkout.partialVia">${opts(Object.entries(VIA), ck.partialVia)}</select></label>
          </div>
          <label class="field" id="ckBookingRow"><span>Желаемая дата и время записи на услугу</span><input type="datetime-local" data-bind="checkout.booking" value="${esc(ck.booking)}"></label>
          <label class="field"><span>Комментарий</span><textarea rows="3" data-bind="checkout.comment" placeholder="Размер колеса, объем кузова, марка электродов, пожелания">${esc(ck.comment)}</textarea></label>
          <div class="totals" id="ckTotals"></div>
          <div class="btn-col" id="ckButtons"></div>
        </form>
      </div>`;
  },
  body() {
    renderItems();
    syncCheckout();
  },
};

function renderItems() {
  const el = $('#cartItems');
  const lines = cartLines();
  const ck = S.checkout;
  const stockMap = ck.mode === 'dealerShipment' ? D.dealerStock(D.myUid()) : null;
  const companyStock = MODE_META[ck.mode] && MODE_META[ck.mode].doc && ck.mode !== 'dealerShipment';
  const o = ck.orderId ? D.order(ck.orderId) : null;
  $('#ckOrderNote').innerHTML = o ? `<div class="note-box">${icon('info')}<span>Оформление по заказу <b>${esc(o.number)}</b> от ${esc(o.name)}. После проведения заказ получит статус «Выполнен».</span>
    <button type="button" class="btn btn--ghost btn--sm" data-action="cart-detach-order">Отвязать</button></div>` : '';
  if (!lines.length) {
    el.innerHTML = emptyState('cart', 'Корзина пуста', 'Добавьте товары или услуги из каталога.', '<button type="button" class="btn btn--primary" data-action="nav" data-view="catalog">Перейти в каталог</button>');
    return;
  }
  el.innerHTML = `<div class="cart-list">${lines.map((l) => {
    let avail = '';
    if (l.p.type !== 'service') {
      if (stockMap) { const have = stockMap[l.p.id] ? stockMap[l.p.id].qty : 0; avail = `<span class="${have < l.qty ? 'is-debt' : 'muted'}">у вас на руках: ${have}</span>`; }
      else if (companyStock || D.isAdmin()) avail = `<span class="${num(l.p.stock) < l.qty ? 'is-debt' : 'muted'}">на складе: ${num(l.p.stock)}</span>`;
    }
    return `<div class="cart-line">
      <div class="cart-line__media">${thumb(l.p)}</div>
      <div class="cart-line__info"><b>${esc(l.p.name)}</b><span class="muted">${l.p.type === 'service' ? 'Услуга' : 'Товар'}${l.p.category ? ' · ' + esc(l.p.category) : ''}</span>${avail}<span>${money(l.price)} за ед.</span></div>
      <div class="stepper"><button type="button" data-action="cart-dec" data-id="${l.p.id}" aria-label="Меньше">${icon('minus')}</button>
        <input type="number" min="1" value="${l.qty}" data-cart-qty="${l.p.id}" aria-label="Количество">
        <button type="button" data-action="cart-inc" data-id="${l.p.id}" aria-label="Больше">${icon('plus')}</button></div>
      <div class="cart-line__sum">${money(l.sum)}</div>
      <button type="button" class="icon-btn icon-btn--sm" data-action="cart-remove" data-id="${l.p.id}" aria-label="Удалить">${icon('trash')}</button>
    </div>`;
  }).join('')}</div>`;
}

const show = (sel, on) => { const e = $(sel); if (e) e.hidden = !on; };

export function syncCheckout() {
  const ck = S.checkout;
  const mode = ck.mode;
  const meta = MODE_META[mode];
  const r = D.role();
  const lines = cartLines();
  const total = lines.reduce((s, l) => s + l.sum, 0);
  const isDoc = Boolean(meta.doc);
  const cpOpts = counterpartyOptions(mode);
  const sel = $('#ckCounter');
  if (cpOpts.length) {
    if (!cpOpts.some(([v]) => v === ck.counterparty)) ck.counterparty = '';
    sel.innerHTML = opts(cpOpts, ck.counterparty);
  }
  $('#ckCounterLabel').textContent = mode === 'issue' ? 'Дилер' : mode === 'sale' ? 'Покупатель' : 'Магазин-получатель';
  show('#ckCounterRow', cpOpts.length > 0);
  show('#ckContactRow', mode === 'retailOrder' || (mode === 'sale' && !ck.counterparty));
  show('#ckDateRow', mode === 'storeOrder' || mode === 'dealerOrder');
  show('#ckDeliveryRow', !['issue'].includes(mode));
  show('#ckAddressRow', ck.delivery === 'delivery' && mode !== 'issue');
  show('#ckPayRow', isDoc);
  show('#ckPartialRow', isDoc && ck.payType === 'partial');
  show('#ckBookingRow', hasService(lines) && (mode === 'retailOrder' || mode === 'sale'));
  $('#ckPayLabel').textContent = mode === 'dealerShipment' ? 'Как рассчитался магазин' : mode === 'issue' ? 'Как рассчитался дилер' : 'Оплата';

  const hints = {
    retailOrder: 'Заказ сохранится, и откроется WhatsApp, чтобы договориться о самовывозе или доставке.',
    storeOrder: 'Заказ увидите вы и администратор. По умолчанию — на завтра.',
    dealerOrder: 'Заказ увидите вы и администратор. По умолчанию — на завтра.',
    dealerShipment: 'Оплату, которую вы укажете, магазин должен подтвердить. Неподтвержденные деньги не уменьшают долг.',
    sale: 'Продажа спишет остатки со склада и откроет чек.',
    companyShipment: 'Отгрузка спишет остатки со склада. Магазин подтверждает приемку.',
    issue: 'Выдача спишет остатки со склада и перейдет на руки дилеру.',
  };
  $('#ckHint').textContent = hints[mode] || '';

  const paid = !isDoc ? 0 : ck.payType === 'cash' || ck.payType === 'transfer' ? total : ck.payType === 'partial' ? Math.min(total, Math.max(0, num(ck.partialAmount))) : 0;
  $('#ckTotals').innerHTML = `<div><span class="muted">Позиций</span><b>${lines.reduce((s, l) => s + l.qty, 0)}</b></div>
    <div><span class="muted">Цены</span><b>${LEVEL_LABEL[meta.level]}</b></div>
    <div class="totals__sum"><span>Итого</span><b>${money(total)}</b></div>
    ${isDoc && paid < total ? `<div><span class="muted">Оплачено</span><b>${money(paid)}</b></div><div class="totals__debt"><span>Долг</span><b>${money(total - paid)}</b></div>` : ''}`;

  let btns = '';
  if (mode === 'retailOrder') {
    btns = r === 'guest'
      ? `<button type="button" class="btn btn--wa btn--lg" data-action="checkout-wa">${icon('whatsapp')}Заказать через WhatsApp</button>
         <button type="button" class="btn btn--ghost" data-action="login">${icon('login')}Войти, чтобы сохранять заказы</button>`
      : `<button type="button" class="btn btn--wa btn--lg" data-action="checkout-order" data-wa="1">${icon('whatsapp')}Заказать и написать в WhatsApp</button>
         <button type="button" class="btn btn--ghost" data-action="checkout-order">${icon('check')}Только сохранить заказ</button>`;
  } else if (meta.order) {
    btns = `<button type="button" class="btn btn--primary btn--lg" data-action="checkout-order">${icon('send')}Отправить заказ</button>
      <button type="button" class="btn btn--wa" data-action="checkout-order" data-wa="1">${icon('whatsapp')}Отправить и сообщить в WhatsApp</button>`;
  } else {
    btns = `<button type="button" class="btn btn--primary btn--lg" data-action="checkout-post">${icon('check')}Провести / Оформить</button>`;
  }
  $('#ckButtons').innerHTML = btns;
}

function orderText(o) {
  const lines = [`${D.companyName()} — заказ ${o.number}`, `${ORDER_KINDS[o.kind].label}: ${o.name}${o.phone ? ', ' + o.phone : ''}`];
  if (o.forDate) lines.push(`На дату: ${fmtYmd(o.forDate)}`);
  lines.push(`Получение: ${o.delivery === 'delivery' ? 'доставка, ' + (o.address || 'адрес уточнить') : 'самовывоз'}`);
  lines.push('', 'Позиции:');
  o.items.forEach((it, i) => lines.push(`${i + 1}. ${it.name} — ${it.qty} x ${money(it.price)} = ${money(it.qty * it.price)}`));
  lines.push('', `Итого: ${money(o.total)}`);
  if (o.booking) lines.push(`Запись на услугу: ${fmtDateTime(new Date(o.booking).getTime())}`);
  if (o.comment) lines.push(`Комментарий: ${o.comment}`);
  return lines.join('\n');
}
export { orderText };

async function submitOrder(withWA) {
  const ck = S.checkout;
  const meta = MODE_META[ck.mode];
  const lines = cartLines();
  if (!lines.length) throw new Error('Корзина пуста');
  if (meta.order === 'retail' && !ck.phone.trim()) throw new Error('Укажите телефон для связи');
  if (ck.delivery === 'delivery' && !ck.address.trim()) throw new Error('Укажите адрес доставки');
  if ((meta.order === 'store' || meta.order === 'dealer') && !ck.forDate) throw new Error('Укажите дату заказа');
  const o = await Svc.createOrder({
    kind: meta.order, lines, name: ck.name.trim(), phone: ck.phone.trim(), forDate: meta.order === 'retail' ? '' : ck.forDate,
    delivery: ck.delivery, address: ck.address.trim(), comment: ck.comment.trim(), booking: hasService(lines) ? ck.booking : '',
  });
  if (withWA) openExternal(waLink(D.companyPhone(), orderText(o)));
  S.cart = []; persistCart();
  Object.assign(ck, { comment: '', booking: '', forDate: tomorrow() }); persistCheckout();
  App.invalidate('cart');
  toast(`Заказ ${o.number} отправлен`, 'ok');
  App.go('orders');
}

function guestWA() {
  const ck = S.checkout;
  const lines = cartLines();
  if (!lines.length) { toast('Корзина пуста', 'error'); return; }
  if (!ck.phone.trim()) { toast('Укажите телефон для связи', 'error'); return; }
  const o = { number: 'с сайта', kind: 'retail', name: ck.name || 'Покупатель', phone: ck.phone, forDate: '', delivery: ck.delivery, address: ck.address, items: lines.map((l) => ({ name: l.p.name, qty: l.qty, price: l.price })), total: lines.reduce((s, l) => s + l.sum, 0), comment: ck.comment, booking: hasService(lines) ? ck.booking : '' };
  openExternal(waLink(D.companyPhone(), orderText(o)));
}

async function post() {
  const ck = S.checkout;
  const lines = cartLines();
  const mode = ck.mode;
  if (!lines.length) throw new Error('Корзина пуста');
  const cp = ck.counterparty ? D.userById(ck.counterparty) : null;
  if (mode === 'sale' && !cp && !ck.name.trim() && !ck.phone.trim()) throw new Error('Укажите покупателя: аккаунт или имя и телефон');
  if (ck.delivery === 'delivery' && mode !== 'issue' && !ck.address.trim()) throw new Error('Укажите адрес доставки');
  if (mode === 'dealerShipment') {
    const have = D.dealerStock(D.myUid());
    const short = lines.filter((l) => l.p.type !== 'service' && (have[l.p.id] ? have[l.p.id].qty : 0) < l.qty);
    if (short.length && !(await confirmDialog('Товара на руках меньше, чем в отгрузке', `${short.map((l) => `${l.p.name}: на руках ${have[l.p.id] ? have[l.p.id].qty : 0}, в отгрузке ${l.qty}`).join('\n')}\n\nВыдачи от компании учитываются автоматически. Продолжить?`, 'Продолжить'))) return;
  }
  const d = await Svc.postDocument({
    mode, lines, counterparty: cp, retail: { name: ck.name.trim(), phone: ck.phone.trim() },
    payment: { type: ck.payType, amount: ck.partialAmount, via: ck.partialVia },
    delivery: mode === 'issue' ? 'pickup' : ck.delivery, address: ck.address.trim(), comment: ck.comment.trim(),
    booking: hasService(lines) ? ck.booking : '', orderId: ck.orderId,
  });
  S.cart = []; persistCart();
  Object.assign(ck, { comment: '', booking: '', partialAmount: '', orderId: '', counterparty: '' }); persistCheckout();
  App.invalidate('cart');
  App.render();
  toast(`Документ ${d.number} проведен`, 'ok');
  showDocument(d.id);
}

/** Загрузить заказ в корзину для проведения (админ) или отгрузки (дилер) */
export function loadOrderToCart(o) {
  const r = D.role();
  S.cart = (o.items || []).filter((it) => D.product(it.id)).map((it) => ({ id: it.id, qty: it.qty }));
  persistCart();
  const ck = S.checkout;
  ck.orderId = o.id;
  ck.comment = o.comment || '';
  ck.delivery = o.delivery || 'pickup';
  ck.address = o.address || '';
  ck.booking = o.booking || '';
  if (r === 'dealer') { ck.mode = 'dealerShipment'; ck.counterparty = o.uid; }
  else if (o.kind === 'retail') { ck.mode = 'sale'; ck.counterparty = o.uid; ck.name = o.name; ck.phone = o.phone; }
  else if (o.kind === 'store') { ck.mode = 'companyShipment'; ck.counterparty = o.uid; }
  else { ck.mode = 'issue'; ck.counterparty = o.uid; }
  ck.payType = 'debt';
  App.invalidate('cart');
  App.go('cart');
  const missing = (o.items || []).length - S.cart.length;
  if (missing > 0) toast(`Позиций нет в каталоге: ${missing}`, 'warn');
}

Object.assign(Actions, {
  'cart-inc': (el) => { const l = S.cart.find((x) => x.id === el.dataset.id); if (l) { l.qty = num(l.qty) + 1; persistCart(); App.render(); } },
  'cart-dec': (el) => { const l = S.cart.find((x) => x.id === el.dataset.id); if (l) { l.qty = Math.max(1, num(l.qty) - 1); persistCart(); App.render(); } },
  'cart-remove': (el) => { S.cart = S.cart.filter((l) => l.id !== el.dataset.id); persistCart(); App.render(); },
  'cart-clear': async () => {
    if (!S.cart.length) return;
    if (await confirmDialog('Очистить корзину?', 'Все позиции будут удалены.', 'Очистить', true)) { S.cart = []; S.checkout.orderId = ''; persistCart(); App.render(); }
  },
  'cart-detach-order': () => { S.checkout.orderId = ''; App.render(); },
  'checkout-order': (el) => submitOrder(el.dataset.wa === '1'),
  'checkout-wa': () => guestWA(),
  'checkout-post': () => post(),
});

export function setCartQty(id, v) {
  const l = S.cart.find((x) => x.id === id);
  if (!l) return;
  l.qty = Math.max(1, Math.round(num(v)) || 1);
  persistCart();
  App.render();
}
