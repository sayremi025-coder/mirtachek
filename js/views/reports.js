/* Мир Тачек — раздел «Отчеты»: мини-1С для администратора, отчеты дилера и магазина */
import { Data } from '../data.js';
import * as D from '../domain.js';
import * as Svc from '../services.js';
import { S, Actions, Views, DOC_KINDS, PAY_STATE, PERIODS, ROLES } from '../state.js';
import { $, esc, num, money, pct, fmtDateTime, fmtDate, periodRange, waLink, openExternal, ymd, toCSV, download, exportXLSX, hasXLSX } from '../utils.js';
import { icon } from '../icons.js';
import { toast, paginate, pagerHTML, segBtns, emptyState, barChart, hbars, confirmDialog } from '../ui.js';
import { APP } from '../config.js';
import { printHTML } from './docs.js';

const range = () => periodRange(S.reports.period, S.reports.from, S.reports.to);
const metric = (label, value, hint = '', cls = '') => `<div class="metric ${cls ? 'metric--' + cls : ''}"><span>${esc(label)}</span><b>${value}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;
const tabsFor = (r) => (r === 'admin'
  ? [['docs', 'Документы'], ['products', 'Товары и маржа'], ['dealers', 'Дилеры'], ['stores', 'Магазины'], ['stock', 'Остатки'], ['submitted', 'Присланные отчеты']]
  : r === 'dealer' ? [['docs', 'Мои отгрузки'], ['stores', 'По магазинам'], ['onhand', 'Товар на руках'], ['submitted', 'Отправленные отчеты']]
    : [['docs', 'Поставки'], ['suppliers', 'По поставщикам']]);

/* ---------------------------- Табличные данные ------------------------- */
const docRow = (d) => { const s = D.paySummary(d); return {
  'Номер': d.number, 'Дата': fmtDateTime(d.createdAt), 'Тип': DOC_KINDS[d.kind].label, 'Продавец': d.sellerName, 'Покупатель': d.buyerName,
  'Сумма': num(d.total), 'Себестоимость': num(d.costTotal), 'Прибыль': num(d.total) - num(d.costTotal), 'Наличные': s.cash, 'Перевод': s.transfer,
  'Ждет подтверждения': s.pendingAmt, 'Долг': s.debt, 'Оплата': PAY_STATE[s.state].label, 'Статус': D.docStatusLabel(d) }; };
const DOC_H = ['Номер', 'Дата', 'Тип', 'Продавец', 'Покупатель', 'Сумма', 'Себестоимость', 'Прибыль', 'Наличные', 'Перевод', 'Ждет подтверждения', 'Долг', 'Оплата', 'Статус'];
const PROD_H = ['Товар', 'Категория', 'Продано', 'Выручка', 'Себестоимость', 'Прибыль', 'Маржа, %', 'Остаток'];
const prodRow = (r) => ({ 'Товар': r.name, 'Категория': r.category, 'Продано': r.qty, 'Выручка': Math.round(r.revenue), 'Себестоимость': Math.round(r.cost), 'Прибыль': Math.round(r.profit), 'Маржа, %': Math.round(r.margin * 10) / 10, 'Остаток': num((D.product(r.id) || {}).stock) });
const DEALER_H = ['Дилер', 'Получил от компании', 'Отгрузил магазинам', 'Маржа дилера', 'Собрано наличными', 'Собрано переводом', 'Долги магазинов (период)', 'Долги магазинов (всего)', 'Долг дилера компании', 'Товар на руках', 'Ждет подтверждения', 'Расхождения'];
const dealerRow = (r) => ({ 'Дилер': r.name, 'Получил от компании': Math.round(r.issued), 'Отгрузил магазинам': Math.round(r.shipped), 'Маржа дилера': Math.round(r.dealerMargin), 'Собрано наличными': Math.round(r.cash), 'Собрано переводом': Math.round(r.transfer), 'Долги магазинов (период)': Math.round(r.storeDebt), 'Долги магазинов (всего)': Math.round(r.storeDebtAll), 'Долг дилера компании': Math.round(r.debtToCompany), 'Товар на руках': Math.round(r.onHandValue), 'Ждет подтверждения': Math.round(r.pending), 'Расхождения': r.disputes });
const STORE_H = ['Магазин', 'Получено товара', 'Оплачено', 'Наличные', 'Перевод', 'Долг (период)', 'Долг (всего)', 'Ждет подтверждения', 'Расхождения'];
const storeRow = (r) => ({ 'Магазин': r.name, 'Получено товара': Math.round(r.received), 'Оплачено': Math.round(r.paid), 'Наличные': Math.round(r.cash), 'Перевод': Math.round(r.transfer), 'Долг (период)': Math.round(r.debt), 'Долг (всего)': Math.round(r.debtAll), 'Ждет подтверждения': Math.round(r.pending), 'Расхождения': r.disputes });
const STOCK_H = ['Товар', 'Артикул', 'Категория', 'Остаток', 'Закуп', 'Розница', 'Сумма по закупу', 'Сумма в рознице', 'Мало'];
const stockRow = (r) => ({ 'Товар': r.name, 'Артикул': r.sku, 'Категория': r.category, 'Остаток': r.stock, 'Закуп': r.costPrice, 'Розница': r.retailPrice, 'Сумма по закупу': Math.round(r.costValue), 'Сумма в рознице': Math.round(r.retailValue), 'Мало': r.low ? 'да' : '' });

function table(headers, rows, numeric) {
  return `<table class="table"><thead><tr>${headers.map((h) => `<th class="${numeric.includes(h) ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${headers.map((h) => `<td class="${numeric.includes(h) ? 'num' : ''}">${typeof r[h] === 'number' && !/Маржа, %|Продано|^Остаток|Расхожд|На руках/.test(h) ? money(r[h]) : esc(r[h])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/* ------------------------------- Разделы ------------------------------- */
function adminBody(rep) {
  const t = rep.totals;
  $('#repMetrics').innerHTML = [
    metric('Выручка компании', money(t.total), `${t.count} док.`, 'accent'),
    metric('Себестоимость', money(t.cost), 'по закупочным ценам'),
    metric('Валовая прибыль', money(t.profit), `маржа ${pct(rep.margin)}`, 'ok'),
    metric('Получено наличными', money(rep.received.cash), 'подтвержденные оплаты'),
    metric('Получено переводом', money(rep.received.transfer), 'подтвержденные оплаты'),
    metric('Дебиторка компании', money(rep.receivableAll), 'долги покупателей, магазинов, дилеров', 'debt'),
    metric('Ждут подтверждения', String(rep.pendingPays.length), money(rep.pendingPays.reduce((s, p) => s + num(p.amount), 0))),
    metric('Расхождения', String(rep.disputes.length), 'требуют решения', rep.disputes.length ? 'debt' : ''),
    metric('Склад по закупу', money(rep.stockCost), `в рознице ${money(rep.stockRetail)}`),
    metric('Мало на складе', String(rep.lowCount), `порог ${D.lowStockLimit()} шт.`, rep.lowCount ? 'debt' : ''),
    metric('Заказы за период', String(rep.orders.count), `новых ${rep.orders.newCount}, на ${money(rep.orders.sum)}`),
    metric('Розничные продажи', money(rep.byKind.sale.total), `отгрузки магазинам ${money(rep.byKind.shipment.total)} · выдачи дилерам ${money(rep.byKind.issue.total)}`),
  ].join('');
  $('#repCharts').innerHTML = `<section class="panel"><div class="panel__head"><h2 class="panel__title">Выручка и прибыль ${rep.series.monthly ? 'по месяцам' : 'по дням'}</h2></div>
      ${rep.docs.length ? barChart({ labels: rep.series.labels, series: [{ name: 'Выручка', values: rep.series.revenue, cls: 'bar-a' }, { name: 'Прибыль', values: rep.series.profit, cls: 'bar-b' }] }) : '<p class="muted">Нет документов за период</p>'}</section>
    <div class="two-col">
      <section class="panel"><h2 class="panel__title">Маржа по категориям</h2>${hbars(rep.categoriesAgg.slice(0, 10).map((c) => ({ label: c.category, value: c.profit, sub: `выручка ${money(c.revenue)}, маржа ${pct(c.margin)}`, cls: 'bar-b' })))}</section>
      <section class="panel"><h2 class="panel__title">Топ-10 товаров по прибыли</h2>${hbars(rep.products.slice(0, 10).map((p) => ({ label: p.name, value: p.profit, sub: `продано ${p.qty}, маржа ${pct(p.margin)}`, cls: 'bar-a' })))}</section>
    </div>`;
}
function dealerBody(rep) {
  $('#repMetrics').innerHTML = [
    metric('Отгружено магазинам', money(rep.shipped), `${rep.count} отгрузок`, 'accent'),
    metric('Моя маржа', money(rep.dealerMargin), 'цена магазина минус дилерская', 'ok'),
    metric('Собрано наличными', money(rep.cash), 'подтверждено магазинами'),
    metric('Собрано переводом', money(rep.transfer), 'подтверждено магазинами'),
    metric('Долги магазинов', money(rep.storeDebt), `всего ${money(rep.storeDebtAll)}`, 'debt'),
    metric('Ждет подтверждения', money(rep.pending), 'магазин еще не подтвердил'),
    metric('Расхождения', String(rep.disputes), 'решает администратор', rep.disputes ? 'debt' : ''),
    metric('Получено от компании', money(rep.issued), `${rep.issuedCount} выдач`),
    metric('Мой долг компании', money(rep.debtToCompany), 'по выдачам', rep.debtToCompany ? 'debt' : ''),
    metric('Товар на руках', money(rep.onHandValue), 'по дилерской цене'),
  ].join('');
  $('#repCharts').innerHTML = `<section class="panel"><h2 class="panel__title">Отгрузки по магазинам</h2>${hbars(rep.byStore.map((s) => ({ label: s.name, value: s.total, sub: `оплачено ${money(s.paid)}, долг ${money(s.debt)}`, cls: 'bar-a' })))}</section>`;
}
function storeBody(rep) {
  $('#repMetrics').innerHTML = [
    metric('Получено товара', money(rep.received), `${rep.count} поставок`, 'accent'),
    metric('Оплачено', money(rep.paid), 'подтверждено поставщиком', 'ok'),
    metric('Наличными', money(rep.cash)), metric('Переводом', money(rep.transfer)),
    metric('Мой долг', money(rep.debt), `всего ${money(rep.debtAll)}`, 'debt'),
    metric('Ждет подтверждения', money(rep.pending), 'поставщик еще не подтвердил'),
    metric('Расхождения', String(rep.disputes), 'решает администратор', rep.disputes ? 'debt' : ''),
  ].join('');
  $('#repCharts').innerHTML = `<section class="panel"><h2 class="panel__title">Поставки по поставщикам (включая дилеров)</h2>${hbars(rep.bySupplier.map((s) => ({ label: s.name, value: s.total, sub: `оплачено ${money(s.paid)}, долг ${money(s.debt)}`, cls: 'bar-a' })))}</section>`;
}

function currentReport() {
  const r = D.role(), rg = range();
  if (r === 'admin') return D.companyReport(rg);
  if (r === 'dealer') return D.dealerReport(D.myUid(), rg);
  return D.storeReport(D.myUid(), rg);
}

function tabData(rep) {
  const r = D.role(), tab = S.reports.tab;
  const N = (h) => h;
  if (tab === 'docs') {
    const docs = r === 'admin' ? rep.docs : r === 'dealer' ? rep.shipments : rep.docs;
    return { headers: DOC_H, rows: docs.map(docRow), numeric: ['Сумма', 'Себестоимость', 'Прибыль', 'Наличные', 'Перевод', 'Ждет подтверждения', 'Долг'].map(N) };
  }
  if (tab === 'products') return { headers: PROD_H, rows: rep.products.map(prodRow), numeric: ['Продано', 'Выручка', 'Себестоимость', 'Прибыль', 'Маржа, %', 'Остаток'] };
  if (tab === 'dealers') return { headers: DEALER_H, rows: rep.dealers.map(dealerRow), numeric: DEALER_H.slice(1) };
  if (tab === 'stores' && r === 'admin') return { headers: STORE_H, rows: rep.stores.map(storeRow), numeric: STORE_H.slice(1) };
  if (tab === 'stores') { const H = ['Магазин', 'Отгружено', 'Оплачено', 'Наличные', 'Перевод', 'Ждет подтверждения', 'Долг']; return { headers: H, rows: rep.byStore.map((s) => ({ 'Магазин': s.name, 'Отгружено': Math.round(s.total), 'Оплачено': Math.round(s.paid), 'Наличные': Math.round(s.cash), 'Перевод': Math.round(s.transfer), 'Ждет подтверждения': Math.round(s.pending), 'Долг': Math.round(s.debt) })), numeric: H.slice(1) }; }
  if (tab === 'suppliers') { const H = ['Поставщик', 'Поставлено', 'Оплачено', 'Ждет подтверждения', 'Долг', 'Расхождения']; return { headers: H, rows: rep.bySupplier.map((s) => ({ 'Поставщик': s.name, 'Поставлено': Math.round(s.total), 'Оплачено': Math.round(s.paid), 'Ждет подтверждения': Math.round(s.pending), 'Долг': Math.round(s.debt), 'Расхождения': s.disputes })), numeric: H.slice(1) }; }
  if (tab === 'stock') return { headers: STOCK_H, rows: rep.stock.map(stockRow), numeric: ['Остаток', 'Закуп', 'Розница', 'Сумма по закупу', 'Сумма в рознице'] };
  if (tab === 'onhand') { const H = ['Товар', 'На руках', 'Сумма по дилерской цене']; return { headers: H, rows: rep.onHand.map((x) => ({ 'Товар': x.name, 'На руках': x.qty, 'Сумма по дилерской цене': Math.round(x.value) })), numeric: ['На руках', 'Сумма по дилерской цене'] }; }
  if (tab === 'submitted') {
    const H = ['Дата', 'Дилер', 'Период', 'Отгружено', 'Наличные', 'Перевод', 'Долги магазинов', 'Ждет подтверждения', 'Расхождения'];
    const list = Data.list('dealerReports').filter((x) => r === 'admin' || x.dealerUid === D.myUid()).sort((a, b) => num(b.createdAt) - num(a.createdAt));
    return { headers: H, rows: list.map((x) => ({ 'Дата': fmtDateTime(x.createdAt), 'Дилер': x.dealerName, 'Период': x.periodLabel, 'Отгружено': num(x.shipped), 'Наличные': num(x.cash), 'Перевод': num(x.transfer), 'Долги магазинов': num(x.storeDebt), 'Ждет подтверждения': num(x.pending), 'Расхождения': x.disputes })), numeric: H.slice(3) };
  }
  return { headers: [], rows: [], numeric: [] };
}

Views.reports = {
  shell() {
    const r = D.role();
    const tabs = tabsFor(r);
    if (!tabs.some(([k]) => k === S.reports.tab)) S.reports.tab = tabs[0][0];
    const title = r === 'admin' ? 'Мини-1С: отчеты компании' : r === 'dealer' ? 'Мой отчет дилера' : 'Отчет магазина';
    return `<div class="view-head"><div><h1>${title}</h1><p class="muted" id="repLabel"></p></div>
      <div class="btn-row">
        ${r === 'dealer' ? `<button type="button" class="btn btn--primary btn--sm" data-action="report-submit">${icon('send')}Отправить отчет администратору</button>` : ''}
        <button type="button" class="btn btn--ghost btn--sm" data-action="report-xlsx">${icon('download')}Excel</button>
        <button type="button" class="btn btn--ghost btn--sm" data-action="report-csv">${icon('download')}CSV</button>
        <button type="button" class="btn btn--dark btn--sm" data-action="report-print">${icon('printer')}Печать</button></div></div>
      <div class="toolbar">
        <div class="seg" data-seg="reports.period">${segBtns('reports.period', PERIODS)}</div>
        <label class="field field--inline"><span>от</span><input type="date" id="repFrom" data-bind="reports.from" value="${esc(S.reports.from)}"></label>
        <label class="field field--inline"><span>до</span><input type="date" id="repTo" data-bind="reports.to" value="${esc(S.reports.to)}"></label>
      </div>
      ${r !== 'admin' ? `<div class="note-box">${icon('shield')}<span>В отчете учитываются только оплаты, подтвержденные обеими сторонами. Неподтвержденные суммы показаны отдельно, расхождения решает администратор.</span></div>` : ''}
      <div class="metrics" id="repMetrics"></div>
      <div id="repCharts" class="stack"></div>
      <section class="panel panel--flush">
        <div class="panel__head"><div class="seg" data-seg="reports.tab">${segBtns('reports.tab', tabs)}</div></div>
        <div class="table-wrap" id="repTable"></div><div id="repPager"></div>
      </section>`;
  },
  body() {
    const rep = currentReport();
    $('#repLabel').textContent = rep.range.label;
    $('#repFrom').value = S.reports.from; $('#repTo').value = S.reports.to;
    const r = D.role();
    if (r === 'admin') adminBody(rep); else if (r === 'dealer') dealerBody(rep); else storeBody(rep);
    const t = tabData(rep);
    const pg = paginate(t.rows, S.reports.page, APP.TABLE_SIZE);
    S.reports.page = pg.page;
    $('#repTable').innerHTML = t.rows.length ? table(t.headers, pg.items, t.numeric) : emptyState('chart', 'Нет данных', 'Выберите другой период или вкладку.');
    $('#repPager').innerHTML = pagerHTML('reports', pg);
  },
};

/* --------------------------------- Выгрузка ---------------------------- */
function summaryRows(rep) {
  const r = D.role();
  const rows = [['Период', rep.range.label]];
  if (r === 'admin') rows.push(['Выручка', rep.totals.total], ['Себестоимость', rep.totals.cost], ['Валовая прибыль', rep.totals.profit], ['Маржа, %', Math.round(rep.margin * 10) / 10], ['Получено наличными', rep.received.cash], ['Получено переводом', rep.received.transfer], ['Дебиторка (всего)', rep.receivableAll], ['Расхождений', rep.disputes.length], ['Склад по закупу', rep.stockCost], ['Склад в рознице', rep.stockRetail]);
  else if (r === 'dealer') rows.push(['Дилер', rep.name], ['Отгружено', rep.shipped], ['Маржа дилера', rep.dealerMargin], ['Наличные', rep.cash], ['Перевод', rep.transfer], ['Долги магазинов', rep.storeDebt], ['Ждет подтверждения', rep.pending], ['Расхождения', rep.disputes], ['Получено от компании', rep.issued], ['Долг компании', rep.debtToCompany], ['Товар на руках', rep.onHandValue]);
  else rows.push(['Магазин', rep.name], ['Получено товара', rep.received], ['Оплачено', rep.paid], ['Долг', rep.debt], ['Ждет подтверждения', rep.pending], ['Расхождения', rep.disputes]);
  return rows.map(([k, v]) => ({ 'Показатель': k, 'Значение': typeof v === 'number' ? Math.round(v * 100) / 100 : v }));
}

function exportAll() {
  if (!hasXLSX()) { toast('Библиотека Excel не загрузилась, используйте CSV', 'error'); return; }
  const rep = currentReport();
  const r = D.role();
  const sheets = [{ name: 'Сводка', headers: ['Показатель', 'Значение'], rows: summaryRows(rep) }];
  const save = S.reports.tab;
  tabsFor(r).forEach(([k, label]) => { S.reports.tab = k; const t = tabData(rep); sheets.push({ name: label, headers: t.headers, rows: t.rows }); });
  S.reports.tab = save;
  if (r === 'admin') {
    const pays = Data.list('payments').filter((p) => p.createdAt >= rep.range.from && p.createdAt <= rep.range.to);
    sheets.push({ name: 'Оплаты', headers: ['Дата', 'Документ', 'Сумма', 'Способ', 'Плательщик', 'Получатель', 'Указал', 'Статус'], rows: pays.map((p) => ({ 'Дата': fmtDateTime(p.createdAt), 'Документ': p.docNumber, 'Сумма': p.amount, 'Способ': p.via === 'cash' ? 'Наличные' : 'Перевод', 'Плательщик': p.payerName, 'Получатель': p.payeeName, 'Указал': p.createdByName, 'Статус': p.status })) });
    sheets.push({ name: 'Пользователи', headers: ['Имя', 'Email', 'Телефон', 'Роль', 'Статус', 'Регистрация'], rows: D.users().map((u) => ({ 'Имя': u.name, 'Email': u.email, 'Телефон': u.phone, 'Роль': (ROLES[u.role] || {}).label || u.role, 'Статус': u.blocked ? 'Заблокирован' : 'Активен', 'Регистрация': fmtDate(u.createdAt) })) });
  }
  exportXLSX(`mir-tachek-otchet-${ymd()}.xlsx`, sheets);
}

function printReport() {
  const rep = currentReport();
  const t = tabData(rep);
  printHTML(`<div class="print-report">
    <div class="receipt__head"><div class="receipt__brand">${icon('logo')}<div><b>${esc(D.companyName())}</b><small>${esc($('#view-reports h1').textContent)}</small></div></div>
      <div class="receipt__no"><b>${esc(rep.range.label)}</b><small>Сформирован: ${fmtDateTime(Date.now())}</small></div></div>
    <div class="metrics">${$('#repMetrics').innerHTML}</div>
    ${table(t.headers, t.rows, t.numeric)}</div>`);
}

function dealerText(rep) {
  const lines = [`${D.companyName()} — отчет дилера`, `Дилер: ${rep.name}`, rep.range.label, '',
    `Отгрузок: ${rep.count}, на ${money(rep.shipped)}`, `Наличными (подтверждено): ${money(rep.cash)}`, `Переводом (подтверждено): ${money(rep.transfer)}`,
    `В долг у магазинов: ${money(rep.storeDebt)}`, `Ждет подтверждения: ${money(rep.pending)}`, `Расхождений: ${rep.disputes}`, '', 'По магазинам:'];
  rep.byStore.forEach((s) => lines.push(`- ${s.name}: ${money(s.total)}, оплачено ${money(s.paid)}, долг ${money(s.debt)}`));
  return lines.join('\n');
}

Object.assign(Actions, {
  'report-xlsx': () => exportAll(),
  'report-csv': () => { const t = tabData(currentReport()); download(`mir-tachek-${S.reports.tab}-${ymd()}.csv`, toCSV(t.rows, t.headers), 'text/csv;charset=utf-8'); },
  'report-print': () => printReport(),
  'report-submit': async () => {
    const rep = D.dealerReport(D.myUid(), range());
    if (!(await confirmDialog('Отправить отчет администратору?', `${rep.range.label}\nОтгружено ${money(rep.shipped)}, наличными ${money(rep.cash)}, переводом ${money(rep.transfer)}, в долг ${money(rep.storeDebt)}.`, 'Отправить'))) return;
    await Svc.submitDealerReport(rep);
    toast('Отчет отправлен администратору', 'ok');
    if (D.companyPhone()) openExternal(waLink(D.companyPhone(), dealerText(rep)));
  },
});
