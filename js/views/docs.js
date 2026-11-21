/* Мир Тачек — раздел «Документы и оплаты»: приемка, подтверждение оплат, расхождения */
import * as D from '../domain.js';
import * as Svc from '../services.js';
import { S, Actions, Views, DOC_KINDS, PAY_STATE, PAYMENT_STATUS, VIA } from '../state.js';
import { $, esc, num, norm, money, opts, fmtDateTime, fmtDate, waLink, openExternal } from '../utils.js';
import { icon } from '../icons.js';
import { toast, openModal, closeModal, paginate, pagerHTML, segBtns, emptyState, confirmDialog, formDialog } from '../ui.js';
import { APP } from '../config.js';

export function printHTML(html) {
  $('#print-area').innerHTML = html;
  setTimeout(() => window.print(), 60);
}

/* --------------------------------- Чек -------------------------------- */
export function receiptHTML(d) {
  const s = D.paySummary(d);
  const st = D.stampOf(d);
  const k = DOC_KINDS[d.kind];
  return `<div class="receipt">
    <header class="receipt__head">
      <div class="receipt__brand">${icon('logo')}<div><b>${esc(D.companyName())}</b><small>Автозапчасти · автотовары · СТО</small></div></div>
      <div class="receipt__no"><b id="modalTitle">${esc(k.title)} № ${esc(d.number)}</b><small>${esc(k.label)}</small><small>${fmtDateTime(d.createdAt)}</small></div>
    </header>
    <dl class="receipt__meta">
      <dt>Продавец</dt><dd>${esc(d.sellerName)}${d.sellerRole === 'dealer' ? ' (дилер)' : ''}</dd>
      <dt>Покупатель</dt><dd>${esc(d.buyerName)}${d.buyerPhone ? ', ' + esc(d.buyerPhone) : ''}</dd>
      ${d.kind !== 'issue' ? `<dt>Получение</dt><dd>${d.delivery === 'delivery' ? 'Доставка: ' + esc(d.address) : 'Самовывоз'}</dd>` : ''}
      ${d.booking ? `<dt>Запись</dt><dd>${fmtDateTime(new Date(d.booking).getTime())}</dd>` : ''}
      <dt>Статус</dt><dd>${esc(D.docStatusLabel(d))}${d.acceptedAt && d.kind !== 'sale' ? ', ' + fmtDateTime(d.acceptedAt) : ''}</dd>
      <dt>Оформил</dt><dd>${esc(d.createdByName || '—')}</dd>
    </dl>
    <table class="receipt__table"><thead><tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead>
      <tbody>${(d.items || []).map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.name)}${it.sku ? `<small>Арт. ${esc(it.sku)}</small>` : ''}</td><td>${num(it.qty)}</td><td>${money(it.price)}</td><td>${money(num(it.price) * num(it.qty))}</td></tr>`).join('')}</tbody></table>
    <div class="receipt__totals">
      <div><span>Итого</span><b>${money(d.total)}</b></div>
      <div><span>Оплачено (подтверждено)</span><b>${money(s.paid)}</b></div>
      ${s.cash && s.transfer ? `<div class="muted"><span>наличными / переводом</span><span>${money(s.cash)} / ${money(s.transfer)}</span></div>` : ''}
      ${s.pendingAmt ? `<div class="muted"><span>Ждет подтверждения</span><span>${money(s.pendingAmt)}</span></div>` : ''}
      ${s.debt > 0 ? `<div class="is-debt"><span>Долг</span><b>${money(s.debt)}</b></div>` : ''}
    </div>
    ${d.comment ? `<p class="receipt__comment"><b>Комментарий:</b> ${esc(d.comment)}</p>` : ''}
    <div class="receipt__foot">
      <div class="stamp stamp--${st.cls}"><span>${esc(D.companyName())}</span><b>${esc(st.text)}</b><small>${fmtDate(Date.now())}</small></div>
      <div class="receipt__sign">${d.kind === 'sale' ? '<div>Спасибо за покупку!</div><div>Продавец: ____________________</div>'
        : `<div>Отпустил: ____________________ ${esc(d.sellerName)}</div><div>Принял: ____________________ ${esc(d.buyerName)}</div>`}</div>
    </div>
    <p class="note">Внутренний документ учета. Не является фискальным кассовым чеком.</p>
  </div>`;
}

export function docText(d) {
  const s = D.paySummary(d);
  const out = [`${D.companyName()} — ${DOC_KINDS[d.kind].title} № ${d.number}`, DOC_KINDS[d.kind].label, `Дата: ${fmtDateTime(d.createdAt)}`, `Продавец: ${d.sellerName}`, `Покупатель: ${d.buyerName}`, '', 'Позиции:'];
  (d.items || []).forEach((it, i) => out.push(`${i + 1}. ${it.name} — ${it.qty} x ${money(it.price)} = ${money(it.qty * it.price)}`));
  out.push('', `Итого: ${money(d.total)}`, `Оплачено (подтверждено): ${money(s.paid)}`);
  if (s.pendingAmt) out.push(`Ждет подтверждения: ${money(s.pendingAmt)}`);
  if (s.debt > 0) out.push(`Долг: ${money(s.debt)}`);
  out.push(`Статус: ${D.docStatusLabel(d)}, ${PAY_STATE[s.state].label}`);
  return out.join('\n');
}

const payBadge = (d) => { const s = D.paySummary(d); const m = PAY_STATE[s.state]; return `<span class="status status--${m.cls}">${esc(m.label)}</span>`; };
const canAccept = (d) => d.status === 'pending' && (d.buyerUid === D.myUid() || D.isAdmin());
const canAddPay = (d) => d.kind !== 'sale' ? (D.isAdmin() || [d.sellerUid, d.buyerUid].includes(D.myUid())) && D.paySummary(d).debt - D.paySummary(d).pendingAmt > 0.01 : D.isAdmin() && D.paySummary(d).debt > 0.01;

function docActions(d) {
  const a = [
    `<button type="button" class="icon-btn icon-btn--sm" data-action="doc-view" data-id="${d.id}" title="Открыть" aria-label="Открыть">${icon('file')}</button>`,
    `<button type="button" class="icon-btn icon-btn--sm" data-action="doc-print" data-id="${d.id}" title="Печать" aria-label="Печать">${icon('printer')}</button>`,
    `<button type="button" class="icon-btn icon-btn--sm icon-btn--wa" data-action="doc-wa" data-id="${d.id}" title="WhatsApp" aria-label="WhatsApp">${icon('whatsapp')}</button>`,
  ];
  if (canAccept(d)) a.push(`<button type="button" class="btn btn--ok btn--sm" data-action="doc-accept" data-id="${d.id}">${icon('check')}${d.kind === 'issue' ? 'Получил' : 'Принять'}</button>`);
  if (canAddPay(d)) a.push(`<button type="button" class="btn btn--ghost btn--sm" data-action="doc-pay" data-id="${d.id}">${icon('wallet')}Оплата</button>`);
  if (D.isAdmin()) a.push(`<button type="button" class="icon-btn icon-btn--sm" data-action="doc-delete" data-id="${d.id}" title="Удалить" aria-label="Удалить">${icon('trash')}</button>`);
  return a.join('');
}

function filtered() {
  const f = S.docs, q = norm(f.q);
  return D.documents()
    .filter((d) => f.kind === 'all' || d.kind === f.kind)
    .filter((d) => f.status === 'all' || d.status === f.status)
    .filter((d) => f.pay === 'all' || D.paySummary(d).state === f.pay || (f.pay === 'debt' && D.paySummary(d).debt > 0))
    .filter((d) => !q || norm([d.number, d.sellerName, d.buyerName, d.buyerPhone, d.comment].join(' ')).includes(q))
    .sort((a, b) => num(b.createdAt) - num(a.createdAt));
}

function inboxItems() {
  const items = [];
  D.myPendingAcceptance().forEach((d) => {
    const claims = D.docPayments(d.id).filter((p) => p.status === 'pending' && p.createdBy !== D.myUid());
    items.push({ at: d.createdAt, html: `<div class="inbox__item">
      <div><b>${esc(DOC_KINDS[d.kind].label)} ${esc(d.number)}</b> от ${esc(d.sellerName)} на <b>${money(d.total)}</b>
      <small>${claims.length ? `Продавец указал оплату: ${claims.map((p) => `${money(p.amount)} (${VIA[p.via]})`).join(', ')}` : 'Продавец указал: в долг'}</small></div>
      <div class="actions"><button type="button" class="btn btn--ok btn--sm" data-action="doc-accept" data-id="${d.id}">${icon('check')}${d.kind === 'issue' ? 'Получил' : 'Принять'}</button>
      <button type="button" class="icon-btn icon-btn--sm" data-action="doc-view" data-id="${d.id}" aria-label="Открыть">${icon('file')}</button></div></div>` });
  });
  D.myPendingConfirmations().filter((p) => { const d = D.doc(p.docId); return d && d.status !== 'pending'; }).forEach((p) => {
    items.push({ at: p.createdAt, html: `<div class="inbox__item">
      <div><b>Оплата ${money(p.amount)}</b> (${esc(VIA[p.via])}) по ${esc(p.docNumber)}
      <small>${esc(p.createdByName)} указал, что ${p.side === 'payee' ? 'получил деньги' : 'оплатил'}. Подтвердите, если это так.</small></div>
      <div class="actions"><button type="button" class="btn btn--ok btn--sm" data-action="pay-confirm" data-id="${p.id}">${icon('check')}Подтверждаю</button>
      <button type="button" class="btn btn--danger btn--sm" data-action="pay-reject" data-id="${p.id}">${D.isAdmin() ? 'Аннулировать' : 'Не было'}</button></div></div>` });
  });
  D.disputedDocs().forEach((d) => {
    const rej = D.paySummary(d).rejected;
    items.push({ at: d.updatedAt || d.createdAt, html: `<div class="inbox__item inbox__item--danger">
      <div><b>Расхождение по ${esc(d.number)}</b>: ${esc(d.sellerName)} → ${esc(d.buyerName)}
      <small>${rej.map((p) => `${esc(p.createdByName)} указал ${money(p.amount)}, вторая сторона не подтвердила`).join('; ')}. ${D.isAdmin() ? 'Решите, какая сторона права.' : 'Решение примет администратор.'}</small></div>
      <div class="actions"><button type="button" class="btn btn--ghost btn--sm" data-action="doc-view" data-id="${d.id}">${icon('file')}Подробнее</button></div></div>` });
  });
  return items.sort((a, b) => num(b.at) - num(a.at));
}

Views.docs = {
  shell() {
    const r = D.role();
    const sub = r === 'store' ? 'Отгрузки от компании и дилеров: приемка, оплаты, подтверждения.'
      : r === 'dealer' ? 'Выдачи от компании и ваши отгрузки магазинам. Оплаты подтверждает вторая сторона.'
        : r === 'customer' ? 'Ваши чеки по проведенным заказам.' : 'Все документы, оплаты и расхождения.';
    const kinds = r === 'customer' ? [] : r === 'store' ? [['shipment', 'Отгрузки']] : r === 'dealer' ? [['issue', 'Выдачи мне'], ['shipment', 'Мои отгрузки']] : [['sale', 'Продажи'], ['shipment', 'Отгрузки'], ['issue', 'Выдачи дилерам']];
    return `<div class="view-head"><div><h1>Документы и оплаты</h1><p class="muted">${esc(sub)}</p></div></div>
      <section class="panel" id="inboxPanel"><div class="panel__head"><h2 class="panel__title">${icon('inbox')}Требует вашего действия</h2></div><div id="inbox"></div><div id="inboxPager"></div></section>
      <div class="toolbar">
        <label class="search">${icon('search')}<input type="search" data-bind="docs.q" value="${esc(S.docs.q)}" placeholder="Номер, продавец, покупатель" aria-label="Поиск документов"></label>
        ${kinds.length ? `<div class="seg" data-seg="docs.kind">${segBtns('docs.kind', [['all', 'Все'], ...kinds])}</div>` : ''}
        <select data-bind="docs.status" aria-label="Статус">${opts([['all', 'Любой статус'], ['pending', 'Ожидают приемки'], ['accepted', 'Приняты / проведены']], S.docs.status)}</select>
        <select data-bind="docs.pay" aria-label="Оплата">${opts([['all', 'Любая оплата'], ['debt', 'Есть долг'], ['paid', 'Оплачены'], ['pending', 'Ждут подтверждения'], ['dispute', 'Расхождения']], S.docs.pay)}</select>
      </div>
      <section class="panel panel--flush"><div class="table-wrap" id="docsTable"></div><div id="docsPager"></div></section>`;
  },
  body() {
    const items = inboxItems();
    $('#inboxPanel').hidden = !items.length;
    const ip = paginate(items, S.inbox.page, 6);
    S.inbox.page = ip.page;
    $('#inbox').innerHTML = ip.items.map((x) => x.html).join('');
    $('#inboxPager').innerHTML = pagerHTML('inbox', ip);
    const list = filtered();
    const pg = paginate(list, S.docs.page, APP.TABLE_SIZE);
    S.docs.page = pg.page;
    $('#docsTable').innerHTML = list.length ? `<table class="table"><thead><tr>
        <th>Документ</th><th>Тип</th><th>Продавец → покупатель</th><th class="num">Сумма</th><th class="num">Оплачено</th><th class="num">Долг</th><th>Статус</th><th></th></tr></thead>
      <tbody>${pg.items.map((d) => { const s = D.paySummary(d); return `<tr>
        <td><b>${esc(d.number)}</b><small>${fmtDateTime(d.createdAt)}</small></td>
        <td><span class="tag tag--${d.kind}">${esc(DOC_KINDS[d.kind].short)}</span></td>
        <td>${esc(d.sellerName)} → ${esc(d.buyerName)}</td>
        <td class="num"><b>${money(d.total)}</b></td>
        <td class="num">${money(s.paid)}${s.pendingAmt ? `<small>+${money(s.pendingAmt)} ждет</small>` : ''}</td>
        <td class="num ${s.debt > 0 ? 'is-debt' : ''}">${money(s.debt)}</td>
        <td><span class="status status--${d.status}">${esc(D.docStatusLabel(d))}</span> ${payBadge(d)}</td>
        <td><div class="actions">${docActions(d)}</div></td></tr>`; }).join('')}</tbody></table>`
      : emptyState('file', 'Документов нет', 'Здесь появятся чеки, накладные и оплаты.');
    $('#docsPager').innerHTML = pagerHTML('docs', pg);
  },
};

/* --------------------------- Документ в окне -------------------------- */
function paymentsTable(d) {
  const ps = D.docPayments(d.id);
  if (!ps.length) return '<p class="muted">Оплат пока нет.</p>';
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Дата</th><th class="num">Сумма</th><th>Способ</th><th>Кто указал</th><th>Статус</th><th></th></tr></thead>
    <tbody>${ps.map((p) => `<tr>
      <td>${fmtDateTime(p.createdAt)}</td><td class="num"><b>${money(p.amount)}</b></td><td>${esc(VIA[p.via])}</td>
      <td>${esc(p.createdByName)}<small>${p.side === 'payee' ? 'получил' : 'оплатил'}${p.note ? ' · ' + esc(p.note) : ''}</small></td>
      <td><span class="status status--pay-${p.status}">${esc(PAYMENT_STATUS[p.status])}</span>${p.status === 'pending' ? `<small>подтверждает: ${esc(D.confirmerName(p))}</small>` : ''}</td>
      <td><div class="actions">${D.canConfirmPayment(p) ? `<button type="button" class="btn btn--ok btn--sm" data-action="pay-confirm" data-id="${p.id}">Подтвердить</button><button type="button" class="btn btn--danger btn--sm" data-action="pay-reject" data-id="${p.id}">${D.isAdmin() ? 'Аннулировать' : 'Не было'}</button>` : ''}
        ${D.isAdmin() && p.status === 'rejected' ? `<button type="button" class="btn btn--ok btn--sm" data-action="pay-resolve" data-status="confirmed" data-id="${p.id}">Признать оплату</button><button type="button" class="btn btn--ghost btn--sm" data-action="pay-resolve" data-status="void" data-id="${p.id}">Аннулировать</button>` : ''}</div></td>
    </tr>`).join('')}</tbody></table></div>`;
}

export function showDocument(id) {
  const d = D.doc(id);
  if (!d) return;
  const s = D.paySummary(d);
  openModal(`${receiptHTML(d)}
    <section class="stack"><h3>Оплаты</h3>
      ${s.state === 'dispute' ? `<div class="note-box note-box--danger">${icon('alert')}<span>Есть расхождение: одна сторона указала оплату, другая ее не подтвердила. ${D.isAdmin() ? 'Признайте оплату или аннулируйте ее.' : 'Администратор примет решение.'}</span></div>` : ''}
      ${paymentsTable(d)}</section>
    <div class="btn-row">
      ${canAccept(d) ? `<button type="button" class="btn btn--ok" data-action="doc-accept" data-id="${d.id}">${icon('check')}${d.kind === 'issue' ? 'Получил товар' : 'Принять'}</button>` : ''}
      ${canAddPay(d) ? `<button type="button" class="btn btn--ghost" data-action="doc-pay" data-id="${d.id}">${icon('wallet')}Внести оплату</button>` : ''}
      <button type="button" class="btn btn--dark" data-action="doc-print" data-id="${d.id}">${icon('printer')}Печать</button>
      <button type="button" class="btn btn--wa" data-action="doc-wa" data-id="${d.id}">${icon('whatsapp')}WhatsApp</button>
      <button type="button" class="btn btn--ghost" data-action="close-modal">Закрыть</button>
    </div>`, 'modal--receipt');
}

async function acceptFlow(d) {
  const claims = D.docPayments(d.id).filter((p) => p.status === 'pending' && p.createdBy !== D.myUid());
  const claimSum = claims.reduce((s, p) => s + num(p.amount), 0);
  const isIssue = d.kind === 'issue';
  if (claims.length) {
    const v = await formDialog(isIssue ? 'Получение товара' : 'Приемка товара', `
      <label class="radio"><input type="radio" name="choice" value="confirm" checked><span><b>Принял, оплату ${money(claimSum)} подтверждаю</b><small>Деньги действительно переданы продавцу</small></span></label>
      <label class="radio"><input type="radio" name="choice" value="debt"><span><b>Принял в долг, оплаты не было</b><small>Возникнет расхождение — решение примет администратор</small></span></label>`,
    'Подтвердить', `${esc(d.number)} от ${esc(d.sellerName)} на ${money(d.total)}. Продавец указал оплату: ${claims.map((p) => `${money(p.amount)} (${VIA[p.via]})`).join(', ')}.`);
    if (!v) return;
    await Svc.acceptDocument(d, { confirmClaims: v.choice === 'confirm', payNow: null });
  } else {
    const v = await formDialog(isIssue ? 'Получение товара' : 'Приемка товара', `
      <label class="radio"><input type="radio" name="choice" value="debt" checked><span><b>Принял в долг</b><small>Оплату можно внести позже</small></span></label>
      <label class="radio"><input type="radio" name="choice" value="pay"><span><b>Принял и оплатил сейчас</b><small>Продавец должен подтвердить получение денег</small></span></label>
      <div class="field-grid"><label class="field"><span>Сумма</span><input type="number" name="amount" min="0" step="1" value="${D.paySummary(d).debt}"></label>
      <label class="field"><span>Способ</span><select name="via">${opts(Object.entries(VIA), 'cash')}</select></label></div>`,
    'Подтвердить', `${esc(d.number)} от ${esc(d.sellerName)} на ${money(d.total)}. Продавец указал: в долг.`);
    if (!v) return;
    await Svc.acceptDocument(d, { confirmClaims: false, payNow: v.choice === 'pay' ? { amount: v.amount, via: v.via } : null });
  }
  toast('Приемка подтверждена', 'ok');
}

async function payFlow(d) {
  const s = D.paySummary(d);
  const left = Math.max(0, s.debt - s.pendingAmt);
  const me = D.myUid();
  const iAmSeller = d.sellerUid === me;
  const v = await formDialog(`Оплата по ${d.number}`, `<div class="field-grid">
      <label class="field"><span>Сумма</span><input type="number" name="amount" min="1" max="${left}" step="1" value="${left}" required autofocus></label>
      <label class="field"><span>Способ</span><select name="via">${opts(Object.entries(VIA), 'cash')}</select></label></div>
      <label class="field"><span>Примечание</span><input type="text" name="note" placeholder="Необязательно"></label>`, iAmSeller ? 'Получил оплату' : D.isAdmin() ? 'Внести оплату' : 'Я оплатил',
  `Долг ${money(s.debt)}${s.pendingAmt ? `, ждет подтверждения ${money(s.pendingAmt)}` : ''}. ${D.isAdmin() ? 'Оплата от администратора подтверждается сразу.' : 'Оплату должна подтвердить вторая сторона.'}`);
  if (!v) return;
  await Svc.addPayment(d, v);
  toast(D.isAdmin() ? 'Оплата внесена' : 'Оплата отправлена на подтверждение', 'ok');
}

const refreshModal = (docId) => { if (!$('#modal').hidden && $('#modal .receipt') && docId) showDocument(docId); };

Object.assign(Actions, {
  'doc-view': (el) => showDocument(el.dataset.id),
  'doc-print': (el) => { const d = D.doc(el.dataset.id); if (d) printHTML(receiptHTML(d)); },
  'doc-wa': (el) => {
    const d = D.doc(el.dataset.id);
    if (!d) return;
    const me = D.myUid();
    const other = D.isAdmin() ? (D.userById(d.buyerUid) || {}).phone || d.buyerPhone : d.sellerUid === me ? (D.userById(d.buyerUid) || {}).phone || d.buyerPhone : d.sellerUid === D.COMPANY ? D.companyPhone() : (D.userById(d.sellerUid) || {}).phone || D.companyPhone();
    openExternal(waLink(other || '', docText(d)));
  },
  'doc-accept': async (el) => { const d = D.doc(el.dataset.id); if (d) { closeModal(); await acceptFlow(d); } },
  'doc-pay': async (el) => { const d = D.doc(el.dataset.id); if (d) { closeModal(); await payFlow(d); } },
  'doc-delete': async (el) => {
    const d = D.doc(el.dataset.id);
    if (!d) return;
    if (await confirmDialog('Удалить документ?', `${d.number} на ${money(d.total)}. Оплаты по документу тоже удалятся.${d.sellerUid === D.COMPANY ? ' Остатки вернутся на склад.' : ''}`, 'Удалить', true)) {
      await Svc.deleteDocument(d); toast('Документ удален', 'ok');
    }
  },
  'pay-confirm': async (el) => { const p = D.payment(el.dataset.id); if (p) { await Svc.confirmPayment(p, true); toast('Оплата подтверждена', 'ok'); refreshModal(p.docId); } },
  'pay-reject': async (el) => {
    const p = D.payment(el.dataset.id);
    if (!p) return;
    if (await confirmDialog(D.isAdmin() ? 'Аннулировать оплату?' : 'Оплаты не было?', D.isAdmin() ? `${money(p.amount)} по ${p.docNumber} не будет учитываться.` : `${money(p.amount)} по ${p.docNumber}. Документ получит статус «Расхождение», решение примет администратор.`, D.isAdmin() ? 'Аннулировать' : 'Да, не было', true)) {
      await Svc.confirmPayment(p, false); toast(D.isAdmin() ? 'Оплата аннулирована' : 'Отмечено расхождение', 'ok');
    }
  },
  'pay-resolve': async (el) => { const p = D.payment(el.dataset.id); if (p) { await Svc.resolvePayment(p, el.dataset.status); toast('Расхождение закрыто', 'ok'); refreshModal(p.docId); } },
});
