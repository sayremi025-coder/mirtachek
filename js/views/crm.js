/* Мир Тачек — раздел «CRM и WhatsApp» (администратор) */
import { Data } from '../data.js';
import * as D from '../domain.js';
import * as Svc from '../services.js';
import { S, Actions, Views, ROLES, STAGES } from '../state.js';
import { $, esc, num, norm, money, opts, fmtDateTime, fmtDate, daysAgo, waLink, openExternal, DAY, phoneDigits } from '../utils.js';
import { icon } from '../icons.js';
import { toast, openModal, closeModal, paginate, pagerHTML, segBtns, emptyState, confirmDialog, formDialog } from '../ui.js';
import { APP } from '../config.js';

function filtered() {
  const f = S.crm, q = norm(f.q), t = Date.now();
  return D.crmEntries()
    .filter((c) => f.kind === 'all' || c.kind === f.kind)
    .filter((c) => {
      if (f.segment === 'viewed7') return c.lastViewAt && t - c.lastViewAt >= 5 * DAY && t - c.lastViewAt <= 9 * DAY && c.lastOrderAt < c.lastViewAt;
      if (f.segment === 'debt') return c.debt > 0;
      if (f.segment === 'task') return Boolean(c.task);
      if (f.segment === 'new') return c.registeredAt && t - c.registeredAt <= 7 * DAY;
      return true;
    })
    .filter((c) => !q || norm([c.name, c.phone, c.email, c.stage, c.task, c.note].join(' ')).includes(q))
    .sort((a, b) => Math.max(num(b.lastViewAt), num(b.registeredAt)) - Math.max(num(a.lastViewAt), num(a.registeredAt)));
}

function card(c) {
  const p = c.lastViewProductId ? D.product(c.lastViewProductId) : null;
  return `<article class="card crm-card">
    <div class="crm-card__head"><span class="avatar">${icon(c.kind === 'store' ? 'store' : c.kind === 'dealer' ? 'truck' : 'user')}</span>
      <div><b title="${esc(c.name)}">${esc(c.name)}</b>${c.phone ? `<a href="tel:+${phoneDigits(c.phone)}" class="muted">${esc(c.phone)}</a>` : '<span class="muted">нет телефона</span>'}</div>
      <span class="tag">${esc((ROLES[c.kind] || {}).label || 'Контакт')}${c.manual ? ' · вручную' : ''}</span></div>
    <label class="field field--inline"><span>Этап</span><select data-crm-stage="${esc(c.key)}" aria-label="Этап">${opts(STAGES.map((s) => [s, s]), c.stage)}</select></label>
    <p class="crm-card__task">${icon('clock')}<span>${esc(c.task || 'Задача не назначена')}</span></p>
    <dl class="kv kv--sm">
      ${p ? `<dt>Смотрел</dt><dd>${esc(p.name)}, ${daysAgo(c.lastViewAt)}</dd>` : ''}
      ${c.lastOrderAt ? `<dt>Заказ</dt><dd>${daysAgo(c.lastOrderAt)}</dd>` : ''}
      ${c.lastContactAt ? `<dt>Связь</dt><dd>${daysAgo(c.lastContactAt)}</dd>` : ''}
      ${c.debt > 0 ? `<dt>Долг</dt><dd class="is-debt">${money(c.debt)}</dd>` : ''}
    </dl>
    <div class="crm-card__wa">
      <button type="button" class="btn btn--wa btn--sm" data-action="crm-wa" data-scenario="viewed" data-key="${esc(c.key)}">${icon('whatsapp')}Смотрел товар</button>
      <button type="button" class="btn btn--wa btn--sm" data-action="crm-wa" data-scenario="novelty" data-key="${esc(c.key)}">${icon('whatsapp')}Новинка</button>
      <button type="button" class="btn btn--wa btn--sm" data-action="crm-wa" data-scenario="debt" data-key="${esc(c.key)}">${icon('whatsapp')}Долг / сверка</button>
    </div>
    <div class="crm-card__foot"><button type="button" class="btn btn--ghost btn--sm" data-action="crm-edit" data-key="${esc(c.key)}">${icon('edit')}Изменить</button>
      ${c.manual ? `<button type="button" class="btn btn--ghost btn--sm" data-action="crm-delete" data-key="${esc(c.key)}" aria-label="Удалить">${icon('trash')}</button>` : ''}</div>
  </article>`;
}

Views.crm = {
  shell() {
    return `<div class="view-head"><div><h1>CRM и WhatsApp</h1><p class="muted">Все пользователи и ручные контакты: этапы, задачи, готовые сообщения.</p></div>
      <button type="button" class="btn btn--primary" data-action="crm-add">${icon('plus')}Добавить контакт</button></div>
      <div class="toolbar">
        <label class="search">${icon('search')}<input type="search" data-bind="crm.q" value="${esc(S.crm.q)}" placeholder="Имя, телефон, этап, задача" aria-label="Поиск"></label>
        <div class="seg" data-seg="crm.kind">${segBtns('crm.kind', [['all', 'Все'], ['customer', 'Покупатели'], ['store', 'Магазины'], ['dealer', 'Дилеры']])}</div>
        <select data-bind="crm.segment" aria-label="Сегмент">${opts([['all', 'Все сегменты'], ['viewed7', 'Смотрели товар ~7 дней назад, без заказа'], ['debt', 'С долгом'], ['task', 'С задачей'], ['new', 'Новые за 7 дней']], S.crm.segment)}</select>
      </div>
      <div class="crm-grid" id="crmGrid"></div><div id="crmPager"></div>
      <section class="panel panel--flush">
        <div class="panel__head"><div class="seg" data-seg="crmLog.tab">${segBtns('crmLog.tab', [['views', 'Просмотры товаров'], ['requests', 'Заявки с сайта']])}</div></div>
        <div class="table-wrap" id="crmLog"></div><div id="crmLogPager"></div>
      </section>`;
  },
  body() {
    const list = filtered();
    const pg = paginate(list, S.crm.page);
    S.crm.page = pg.page;
    $('#crmGrid').innerHTML = list.length ? pg.items.map(card).join('') : emptyState('users', 'Контактов нет', 'Пользователи появляются после первого входа, контакты можно добавить вручную.');
    $('#crmPager').innerHTML = pagerHTML('crm', pg);
    let rows, html;
    if (S.crmLog.tab === 'views') {
      rows = Data.list('views').sort((a, b) => num(b.at) - num(a.at));
      const lp = paginate(rows, S.crmLog.page, APP.TABLE_SIZE); S.crmLog.page = lp.page;
      html = rows.length ? `<table class="table"><thead><tr><th>Время</th><th>Кто</th><th>Товар</th></tr></thead><tbody>${lp.items.map((v) => `<tr><td>${fmtDateTime(v.at)}</td><td>${esc(v.name)}<small>${esc((ROLES[v.role] || {}).label || '')}${v.phone ? ' · ' + esc(v.phone) : ''}</small></td><td>${esc(v.productName)}</td></tr>`).join('')}</tbody></table>` : emptyState('eye', 'Просмотров пока нет', 'Сохраняются просмотры вошедших пользователей.');
      $('#crmLogPager').innerHTML = pagerHTML('crmLog', lp);
    } else {
      rows = Data.list('requests').sort((a, b) => num(b.createdAt) - num(a.createdAt));
      const lp = paginate(rows, S.crmLog.page, APP.TABLE_SIZE); S.crmLog.page = lp.page;
      html = rows.length ? `<table class="table"><thead><tr><th>Дата</th><th>Имя</th><th>Телефон</th><th>Запрос</th><th>Статус</th><th></th></tr></thead><tbody>${lp.items.map((r) => `<tr>
        <td>${fmtDateTime(r.createdAt)}</td><td>${esc(r.name)}</td><td>${esc(r.phone)}</td><td>${esc(r.text)}</td><td>${r.status === 'done' ? '<span class="status status--ok">Обработана</span>' : '<span class="status status--warn">Новая</span>'}</td>
        <td><div class="actions"><button type="button" class="icon-btn icon-btn--sm icon-btn--wa" data-action="req-wa" data-id="${r.id}" aria-label="WhatsApp">${icon('whatsapp')}</button>
        ${r.status !== 'done' ? `<button type="button" class="btn btn--ghost btn--sm" data-action="req-done" data-id="${r.id}">${icon('check')}Обработана</button>` : ''}</div></td></tr>`).join('')}</tbody></table>` : emptyState('inbox', 'Заявок нет', 'Заявки приходят из формы консультации в каталоге.');
      $('#crmLogPager').innerHTML = pagerHTML('crmLog', lp);
    }
    $('#crmLog').innerHTML = html;
  },
};

const entry = (key) => D.crmEntries().find((c) => c.key === key);

function scenarioText() {
  const w = S.wa, c = entry(w.key);
  if (!c) return '';
  const hello = `Здравствуйте, ${c.name}!`;
  const brand = D.companyName();
  const p = w.productId ? D.product(w.productId) : null;
  const price = p ? D.levelPrice(p, c.kind === 'store' ? 'store' : c.kind === 'dealer' ? 'dealer' : 'retail') : 0;
  if (w.scenario === 'viewed') {
    if (!p) return `${hello} Это «${brand}». Недавно вы смотрели товары в нашем каталоге — подскажем по наличию и цене.`;
    const offer = w.offer === 'gift' ? `При заказе на этой неделе — подарок от «${brand}».` : `Для вас скидка ${num(w.discount)}%: ${money(price * (1 - num(w.discount) / 100))} вместо ${money(price)}.`;
    return `${hello} Это «${brand}». Около недели назад вы смотрели ${p.type === 'service' ? 'услугу' : 'товар'} «${p.name}». ${offer} Ответьте на сообщение — ${p.type === 'service' ? 'запишем на удобное время' : 'забронируем товар за вами'}.`;
  }
  if (w.scenario === 'novelty') {
    if (!p) return `${hello} В «${brand}» появились новинки — пришлем подборку под ваш автомобиль.`;
    return `${hello} В «${brand}» новинка: «${p.name}» — ${money(price)}.${p.description ? ' ' + p.description.slice(0, 160) : ''} ${p.type === 'service' ? 'Запись открыта.' : num(p.stock) > 0 ? `В наличии: ${num(p.stock)}.` : 'Доступно под заказ.'} Напишите, если интересно.`;
  }
  const docs = c.uid ? D.debtDocsForUid(c.uid) : [];
  const total = docs.reduce((s, d) => s + D.paySummary(d).debt, 0) || c.debt;
  if (!total) return `${hello} «${brand}», сверка взаиморасчетов: по нашим данным задолженности нет. Подтвердите, пожалуйста, ответным сообщением.`;
  const lines = docs.slice(0, 15).map((d) => `- ${d.number} от ${fmtDate(d.createdAt)}: ${money(D.paySummary(d).debt)}`);
  return [`${hello} «${brand}», сверка взаиморасчетов.`, `Общая сумма долга: ${money(total)}.`, ...lines, 'Просим подтвердить сверку или сообщить дату оплаты. Спасибо!'].join('\n');
}

function openWa(key, scenario) {
  const c = entry(key);
  if (!c) return;
  const prods = D.products().sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
  const news = prods.filter((p) => p.isNew);
  const pool = scenario === 'novelty' && news.length ? news : prods;
  S.wa = { key, scenario, offer: 'discount', discount: 5, productId: scenario === 'viewed' ? c.lastViewProductId || (pool[0] || {}).id || '' : scenario === 'novelty' ? (pool[0] || {}).id || '' : '' };
  const titles = { viewed: 'Смотрел товар около 7 дней назад', novelty: 'Напоминание о новинке', debt: 'Напоминание по долгу / сверке' };
  openModal(`<h2 id="modalTitle">${icon('whatsapp')}${esc(titles[scenario])}</h2>
    <p class="muted">Получатель: <b>${esc(c.name)}</b>${c.phone ? ', ' + esc(c.phone) : ' — телефон не указан, WhatsApp предложит выбрать контакт'}</p>
    ${scenario !== 'debt' ? `<label class="field"><span>Товар / услуга</span><select data-bind="wa.productId">${opts(pool.map((p) => [p.id, p.name]), S.wa.productId)}</select></label>` : ''}
    ${scenario === 'viewed' ? `<div class="field-grid"><label class="field"><span>Предложение</span><select data-bind="wa.offer">${opts([['discount', 'Скидка'], ['gift', 'Приз / подарок']], 'discount')}</select></label>
      <label class="field" id="waDiscountRow"><span>Скидка, %</span><input type="number" min="1" max="50" data-bind="wa.discount" value="5"></label></div>` : ''}
    <label class="field"><span>Текст (можно изменить)</span><textarea id="waText" rows="8"></textarea></label>
    <label class="field"><span>Ссылка</span><input type="text" id="waLinkOut" readonly></label>
    <div class="btn-row"><button type="button" class="btn btn--wa" data-action="wa-open">${icon('whatsapp')}Открыть WhatsApp</button>
      <button type="button" class="btn btn--ghost" data-action="wa-copy">${icon('copy')}Копировать ссылку</button></div>`, 'modal--wide');
  updateWa();
}
export function updateWa() {
  const c = entry(S.wa.key);
  if (!c || !$('#waText')) return;
  const t = scenarioText();
  $('#waText').value = t;
  $('#waLinkOut').value = waLink(c.phone, t);
  const row = $('#waDiscountRow'); if (row) row.hidden = S.wa.offer === 'gift';
}
export function waTextEdited(value) {
  const c = entry(S.wa.key);
  $('#waLinkOut').value = waLink(c ? c.phone : '', value);
}

async function editContact(key) {
  const c = key ? entry(key) : null;
  const v = c || { kind: 'customer', name: '', phone: '', stage: 'Новый', task: '', note: '', manual: true };
  const res = await formDialog(c ? 'Контакт: ' + c.name : 'Новый контакт', `
    <div class="field-grid">
      <label class="field"><span>Тип</span><select name="kind" ${c && !c.manual ? 'disabled' : ''}>${opts([['customer', 'Покупатель'], ['store', 'Магазин'], ['dealer', 'Дилер']], v.kind)}</select></label>
      <label class="field"><span>Этап</span><select name="stage">${opts(STAGES.map((s) => [s, s]), v.stage)}</select></label></div>
    <label class="field"><span>Имя / название</span><input type="text" name="name" value="${esc(v.name)}" ${c && !c.manual ? 'readonly' : 'required'}></label>
    <label class="field"><span>Телефон (WhatsApp)</span><input type="tel" name="phone" value="${esc(v.phone)}"></label>
    <label class="field"><span>Задача</span><input type="text" name="task" value="${esc(v.task)}" placeholder="Позвонить в пятницу, сверка"></label>
    <label class="field"><span>Заметка</span><textarea name="note" rows="3">${esc(v.note)}</textarea></label>`, 'Сохранить');
  if (!res) return;
  await Svc.saveContact(Object.assign({}, c || {}, { kind: res.kind || v.kind, name: c && !c.manual ? c.name : res.name, phone: res.phone, stage: res.stage, task: res.task, note: res.note }));
  toast('Контакт сохранен', 'ok');
}

export async function setStage(key, stage) {
  const c = entry(key);
  if (c) await Svc.saveContact(Object.assign({}, c, { stage }));
}

Object.assign(Actions, {
  'crm-add': () => editContact(null),
  'crm-edit': (el) => editContact(el.dataset.key),
  'crm-delete': async (el) => { const c = entry(el.dataset.key); if (c && await confirmDialog('Удалить контакт?', c.name, 'Удалить', true)) await Svc.deleteContact(c.contactId); },
  'crm-wa': (el) => openWa(el.dataset.key, el.dataset.scenario),
  'wa-open': async () => {
    const c = entry(S.wa.key);
    if (!c) return;
    openExternal(waLink(c.phone, $('#waText').value));
    await Svc.saveContact(Object.assign({}, c, { lastContactAt: Date.now() }));
    closeModal();
  },
  'wa-copy': async () => { try { await navigator.clipboard.writeText($('#waLinkOut').value); toast('Ссылка скопирована', 'ok'); } catch (e) { $('#waLinkOut').select(); toast('Выделите и скопируйте ссылку', 'warn'); } },
  'req-wa': (el) => { const r = Data.get('requests', el.dataset.id); if (r) openExternal(waLink(r.phone, `Здравствуйте, ${r.name}! Это «${D.companyName()}», по вашей заявке: ${r.text}`)); },
  'req-done': async (el) => { const r = Data.get('requests', el.dataset.id); if (r) await Svc.setRequestStatus(r, 'done'); },
});
