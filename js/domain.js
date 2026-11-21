/* =========================================================================
   Мир Тачек — бизнес-логика (только чтение и расчеты)
   Цены, видимость, оплаты и долги, товар на руках у дилера, отчеты.
   ========================================================================= */
import { Data } from './data.js';
import { APP } from './config.js';
import { num, norm, sum, round2, inRange, ymd, DAY, fmtDate } from './utils.js';

export const COMPANY = 'company';

/* ------------------------------ Пользователь ----------------------------- */
export const me = () => Data.profile;
export const myUid = () => (Data.profile ? Data.profile.uid : null);
export const role = () => (Data.profile && !Data.profile.blocked ? Data.profile.role || 'customer' : 'guest');
export const isAdmin = () => role() === 'admin';
export const users = () => Data.list('users');
export const userById = (uid) => Data.get('users', uid) || (Data.profile && Data.profile.uid === uid ? Data.profile : null);
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru');
export const stores = () => users().filter((u) => u.role === 'store' && !u.blocked).sort(byName);
export const dealers = () => users().filter((u) => u.role === 'dealer' && !u.blocked).sort(byName);
export const companyName = () => Data.settings.companyName || APP.BRAND;
export const companyPhone = () => Data.settings.whatsapp || APP.WHATSAPP_DEFAULT;
export const lowStockLimit = () => num(Data.settings.lowStock) || APP.LOW_STOCK;

/* --------------------------------- Цены --------------------------------- */
export function withPrices(p) {
  const retail = num(p.retailPrice);
  const st = Data.prices.store[p.id], dl = Data.prices.dealer[p.id], cs = Data.prices.cost[p.id];
  const storePrice = st != null ? num(st) : retail;
  return Object.assign({}, p, {
    retailPrice: retail,
    storePrice,
    dealerPrice: dl != null ? num(dl) : storePrice,
    costPrice: cs != null ? num(cs) : 0,
  });
}
export const products = () => Data.list('products').map(withPrices);
export const product = (id) => { const p = Data.get('products', id); return p ? withPrices(p) : null; };
export const levelPrice = (p, level) => num(level === 'store' ? p.storePrice : level === 'dealer' ? p.dealerPrice : level === 'cost' ? p.costPrice : p.retailPrice);
export const roleLevel = (r = role()) => (r === 'store' ? 'store' : r === 'dealer' ? 'dealer' : 'retail');
export const categories = () => [...new Set(Data.list('products').map((p) => String(p.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));

/* ------------------------------ Видимость ------------------------------- */
export function canSee(rec) {
  if (isAdmin()) return true;
  const u = myUid();
  return Boolean(u && (rec.participants || []).includes(u));
}
export const orders = () => Data.list('orders').filter(canSee);
export const documents = () => Data.list('documents').filter(canSee);
export const allDocuments = () => Data.list('documents');
export const doc = (id) => Data.get('documents', id);
export const order = (id) => Data.get('orders', id);
export const payment = (id) => Data.get('payments', id);

/* ------------------------------- Оплаты --------------------------------- */
let idx = { v: -1, byDoc: {} };
function paymentsIndex() {
  if (idx.v === Data.version) return idx.byDoc;
  const byDoc = {};
  Data.list('payments').forEach((p) => { (byDoc[p.docId] = byDoc[p.docId] || []).push(p); });
  idx = { v: Data.version, byDoc };
  return byDoc;
}
export const docPayments = (docId) => (paymentsIndex()[docId] || []).slice().sort((a, b) => num(a.createdAt) - num(b.createdAt));

/** Итог оплат документа: учитываются только подтвержденные */
export function paySummary(d) {
  const ps = docPayments(d.id);
  const confirmed = ps.filter((p) => p.status === 'confirmed');
  const pending = ps.filter((p) => p.status === 'pending');
  const rejected = ps.filter((p) => p.status === 'rejected');
  const paid = round2(sum(confirmed, (p) => p.amount));
  const cash = round2(sum(confirmed.filter((p) => p.via === 'cash'), (p) => p.amount));
  const transfer = round2(sum(confirmed.filter((p) => p.via === 'transfer'), (p) => p.amount));
  const debt = Math.max(0, round2(num(d.total) - paid));
  const pendingAmt = round2(sum(pending, (p) => p.amount));
  let state = 'debt';
  if (rejected.length) state = 'dispute';
  else if (debt <= 0.01) state = 'paid';
  else if (pending.length) state = 'pending';
  else if (paid > 0) state = 'partial';
  return { paid, cash, transfer, debt, pendingAmt, pending, rejected, confirmed, all: ps, state };
}

/** Может ли текущий пользователь подтвердить/отклонить оплату */
export function canConfirmPayment(p) {
  if (p.status !== 'pending') return false;
  if (isAdmin()) return true;
  const u = myUid();
  return Boolean(u && (p.participants || []).includes(u) && p.createdBy !== u);
}
/** Кто должен подтвердить: имя второй стороны */
export function confirmerName(p) {
  const d = doc(p.docId);
  if (!d) return '—';
  if (p.createdBy === p.payeeUid) return d.buyerName || 'покупатель';
  return d.sellerUid === COMPANY ? 'администратор' : d.sellerName || 'продавец';
}
export function myPendingConfirmations() {
  return Data.list('payments').filter((p) => canConfirmPayment(p) && canSee(p)).sort((a, b) => num(b.createdAt) - num(a.createdAt));
}
export function myPendingAcceptance() {
  const u = myUid();
  if (!u) return [];
  return documents().filter((d) => d.status === 'pending' && d.buyerUid === u);
}
export function disputedDocs() { return documents().filter((d) => paySummary(d).state === 'dispute'); }

/* ------------------------- Документы: подписи ------------------------- */
export const isCompanyDoc = (d) => d.sellerUid === COMPANY;
export function docStatusLabel(d) {
  if (d.status === 'pending') return d.kind === 'issue' ? 'Ожидает получения дилером' : 'Ожидает приемки';
  if (d.kind === 'sale') return 'Проведена';
  return 'Принят';
}
export function stampOf(d) {
  const s = paySummary(d);
  if (s.state === 'dispute') return { cls: 'debt', text: 'Расхождение' };
  if (s.state === 'paid') return { cls: 'paid', text: s.transfer === 0 ? 'Оплачено наличными' : s.cash === 0 ? 'Оплачено переводом' : 'Оплачено' };
  if (s.state === 'pending') return { cls: 'partial', text: 'Оплата ждет подтверждения' };
  if (s.state === 'partial') return { cls: 'partial', text: 'Частичная оплата' };
  return { cls: 'debt', text: 'В долг' };
}

/* -------------------------- Товар на руках у дилера ------------------- */
export function dealerStock(dealerUid) {
  const map = {};
  allDocuments().forEach((d) => {
    const sign = d.kind === 'issue' && d.buyerUid === dealerUid ? 1 : d.kind === 'shipment' && d.sellerUid === dealerUid ? -1 : 0;
    if (!sign) return;
    (d.items || []).forEach((it) => {
      if (it.type === 'service') return;
      const m = map[it.id] || (map[it.id] = { id: it.id, name: it.name, qty: 0 });
      m.qty += sign * num(it.qty);
    });
  });
  return map;
}

/* ------------------------------- Отчеты -------------------------------- */
function emptyAgg() { return { total: 0, cost: 0, profit: 0, paid: 0, cash: 0, transfer: 0, debt: 0, pending: 0, count: 0, disputes: 0 }; }
function addDoc(a, d) {
  const s = paySummary(d);
  a.total += num(d.total); a.cost += num(d.costTotal); a.profit += num(d.total) - num(d.costTotal);
  a.paid += s.paid; a.cash += s.cash; a.transfer += s.transfer; a.debt += s.debt; a.pending += s.pendingAmt; a.count++;
  if (s.state === 'dispute') a.disputes++;
  return a;
}

function seriesByTime(docsList, range) {
  const ts = docsList.map((d) => num(d.createdAt));
  const from = range.from || (ts.length ? Math.min(...ts) : Date.now());
  const to = range.to === Infinity ? Date.now() : range.to;
  const monthly = to - from > 62 * DAY;
  const keyOf = (t) => (monthly ? ymd(t).slice(0, 7) : ymd(t));
  const keys = [];
  if (monthly) {
    const d = new Date(from); d.setDate(1);
    while (d.getTime() <= to) { keys.push(ymd(d.getTime()).slice(0, 7)); d.setMonth(d.getMonth() + 1); }
  } else {
    for (let t = new Date(new Date(from).toDateString()).getTime(); t <= to; t += DAY) keys.push(ymd(t));
  }
  const rev = Object.fromEntries(keys.map((k) => [k, 0])), prof = Object.fromEntries(keys.map((k) => [k, 0]));
  docsList.forEach((d) => { const k = keyOf(d.createdAt); if (k in rev) { rev[k] += num(d.total); prof[k] += num(d.total) - num(d.costTotal); } });
  const label = (k) => (monthly ? k.split('-').reverse().join('.') : k.slice(8, 10) + '.' + k.slice(5, 7));
  return { labels: keys.map(label), revenue: keys.map((k) => rev[k]), profit: keys.map((k) => prof[k]), monthly };
}

function productAgg(docsList) {
  const map = {};
  docsList.forEach((d) => (d.items || []).forEach((it) => {
    const m = map[it.id] || (map[it.id] = { id: it.id, name: it.name, category: it.category || (product(it.id) || {}).category || 'Без категории', type: it.type, qty: 0, revenue: 0, cost: 0 });
    m.qty += num(it.qty); m.revenue += num(it.price) * num(it.qty); m.cost += num(it.cost) * num(it.qty);
  }));
  return Object.values(map).map((m) => Object.assign(m, { profit: m.revenue - m.cost, margin: m.revenue ? ((m.revenue - m.cost) / m.revenue) * 100 : 0 }));
}

function categoryAgg(prodRows) {
  const map = {};
  prodRows.forEach((r) => {
    const m = map[r.category] || (map[r.category] = { category: r.category, revenue: 0, cost: 0 });
    m.revenue += r.revenue; m.cost += r.cost;
  });
  return Object.values(map).map((m) => Object.assign(m, { profit: m.revenue - m.cost, margin: m.revenue ? ((m.revenue - m.cost) / m.revenue) * 100 : 0 })).sort((a, b) => b.profit - a.profit);
}

export function stockRows() {
  const low = lowStockLimit();
  return products().filter((p) => p.type !== 'service').map((p) => ({
    id: p.id, name: p.name, sku: p.sku || '', category: p.category || '', stock: num(p.stock),
    costPrice: p.costPrice, retailPrice: p.retailPrice,
    costValue: Math.max(0, num(p.stock)) * p.costPrice, retailValue: Math.max(0, num(p.stock)) * p.retailPrice,
    low: num(p.stock) <= low,
  })).sort((a, b) => a.stock - b.stock);
}

/** Отчет администратора по компании */
export function companyReport(range) {
  const all = allDocuments();
  const comp = all.filter((d) => d.sellerUid === COMPANY);
  const inPeriod = comp.filter((d) => inRange(d.createdAt, range)).sort((a, b) => num(b.createdAt) - num(a.createdAt));
  const totals = inPeriod.reduce(addDoc, emptyAgg());
  const byKind = { sale: emptyAgg(), shipment: emptyAgg(), issue: emptyAgg() };
  inPeriod.forEach((d) => addDoc(byKind[d.kind] || (byKind[d.kind] = emptyAgg()), d));
  const recv = Data.list('payments').filter((p) => p.payeeUid === COMPANY && p.status === 'confirmed' && inRange(p.confirmedAt || p.createdAt, range));
  const received = { cash: sum(recv.filter((p) => p.via === 'cash'), (p) => p.amount), transfer: sum(recv.filter((p) => p.via === 'transfer'), (p) => p.amount) };
  const receivableAll = sum(comp, (d) => paySummary(d).debt);
  const disputes = all.filter((d) => paySummary(d).state === 'dispute');
  const pendingPays = Data.list('payments').filter((p) => p.status === 'pending');
  const stock = stockRows();
  const prodRows = productAgg(inPeriod).sort((a, b) => b.profit - a.profit);

  // Дилерская сеть
  const dealerRows = dealers().map((u) => dealerReport(u.uid, range));
  // Магазины
  const storeRows = stores().map((u) => storeReport(u.uid, range));
  // Заказы за период
  const ord = Data.list('orders').filter((o) => inRange(o.createdAt, range));

  return {
    range, docs: inPeriod, totals,
    margin: totals.total ? (totals.profit / totals.total) * 100 : 0,
    byKind, received, receivableAll, disputes, pendingPays,
    stock,
    stockCost: sum(stock, (r) => r.costValue), stockRetail: sum(stock, (r) => r.retailValue),
    lowCount: stock.filter((r) => r.low).length,
    series: seriesByTime(inPeriod, range),
    products: prodRows, categoriesAgg: categoryAgg(prodRows),
    dealers: dealerRows, stores: storeRows,
    orders: { count: ord.length, newCount: ord.filter((o) => o.status === 'new').length, sum: sum(ord.filter((o) => o.status !== 'cancelled'), (o) => o.total) },
  };
}

/** Отчет дилера (для дилера и администратора) */
export function dealerReport(dealerUid, range) {
  const u = userById(dealerUid) || { name: 'Дилер' };
  const all = allDocuments();
  const ship = all.filter((d) => d.kind === 'shipment' && d.sellerUid === dealerUid && inRange(d.createdAt, range)).sort((a, b) => num(b.createdAt) - num(a.createdAt));
  const issues = all.filter((d) => d.kind === 'issue' && d.buyerUid === dealerUid && inRange(d.createdAt, range));
  const sh = ship.reduce(addDoc, emptyAgg());
  const is = issues.reduce(addDoc, emptyAgg());
  const allShip = all.filter((d) => d.kind === 'shipment' && d.sellerUid === dealerUid);
  const allIssues = all.filter((d) => d.kind === 'issue' && d.buyerUid === dealerUid);
  const storeDebtAll = sum(allShip, (d) => paySummary(d).debt);
  const debtToCompany = sum(allIssues, (d) => paySummary(d).debt);
  const stockMap = dealerStock(dealerUid);
  const onHand = Object.values(stockMap).filter((x) => x.qty !== 0).map((x) => {
    const p = product(x.id);
    return { id: x.id, name: x.name, qty: x.qty, value: x.qty * (p ? p.dealerPrice : 0) };
  }).sort((a, b) => b.qty - a.qty);
  const byStore = {};
  ship.forEach((d) => {
    const k = d.buyerName || '—';
    addDoc(byStore[k] || (byStore[k] = Object.assign(emptyAgg(), { name: k, uid: d.buyerUid })), d);
  });
  return {
    uid: dealerUid, name: u.name, range, shipments: ship, issues,
    shipped: sh.total, dealerMargin: sh.profit, cash: sh.cash, transfer: sh.transfer, storeDebt: sh.debt,
    pending: sh.pending, disputes: sh.disputes, count: sh.count,
    issued: is.total, issuedCount: is.count, paidToCompany: is.paid,
    storeDebtAll, debtToCompany,
    onHand, onHandValue: sum(onHand, (x) => Math.max(0, x.value)),
    byStore: Object.values(byStore).sort((a, b) => b.total - a.total),
  };
}

/** Отчет магазина: поставки от компании и дилеров */
export function storeReport(storeUid, range) {
  const u = userById(storeUid) || { name: 'Магазин' };
  const all = allDocuments();
  const recv = all.filter((d) => d.kind === 'shipment' && d.buyerUid === storeUid && inRange(d.createdAt, range)).sort((a, b) => num(b.createdAt) - num(a.createdAt));
  const agg = recv.reduce(addDoc, emptyAgg());
  const debtAll = sum(all.filter((d) => d.kind === 'shipment' && d.buyerUid === storeUid), (d) => paySummary(d).debt);
  const bySupplier = {};
  recv.forEach((d) => {
    const k = d.sellerUid === COMPANY ? companyName() + ' (склад)' : d.sellerName || 'Дилер';
    addDoc(bySupplier[k] || (bySupplier[k] = Object.assign(emptyAgg(), { name: k, uid: d.sellerUid })), d);
  });
  return {
    uid: storeUid, name: u.name, range, docs: recv,
    received: agg.total, paid: agg.paid, cash: agg.cash, transfer: agg.transfer, debt: agg.debt,
    pending: agg.pending, disputes: agg.disputes, count: agg.count, debtAll,
    bySupplier: Object.values(bySupplier).sort((a, b) => b.total - a.total),
  };
}

/** Сборочный лист: суммарно по товарам из активных заказов на дату */
export function pickList(dateYmd) {
  const map = {};
  Data.list('orders').filter((o) => ['new', 'processing'].includes(o.status) && (!dateYmd || o.forDate === dateYmd)).forEach((o) => {
    (o.items || []).forEach((it) => {
      const m = map[it.id] || (map[it.id] = { id: it.id, name: it.name, qty: 0, orders: 0 });
      m.qty += num(it.qty); m.orders++;
    });
  });
  return Object.values(map).map((m) => { const p = product(m.id); return Object.assign(m, { stock: p ? num(p.stock) : 0, short: p && p.type !== 'service' ? Math.max(0, m.qty - num(p.stock)) : 0 }); }).sort((a, b) => b.qty - a.qty);
}

/* ---------------------------------- CRM --------------------------------- */
export function crmEntries() {
  const views = Data.list('views');
  const lastView = {};
  views.forEach((v) => { if (v.uid && (!lastView[v.uid] || num(v.at) > num(lastView[v.uid].at))) lastView[v.uid] = v; });
  const contacts = Data.list('contacts');
  const meta = {};
  contacts.forEach((c) => { if (c.uid) meta[c.uid] = c; });
  const debtByUid = {}, lastOrder = {};
  allDocuments().forEach((d) => { if (d.buyerUid) debtByUid[d.buyerUid] = (debtByUid[d.buyerUid] || 0) + paySummary(d).debt; });
  Data.list('orders').forEach((o) => { if (!lastOrder[o.uid] || num(o.createdAt) > lastOrder[o.uid]) lastOrder[o.uid] = num(o.createdAt); });
  const fromUsers = users().filter((u) => u.role !== 'admin').map((u) => {
    const m = meta[u.uid] || {};
    const lv = lastView[u.uid];
    return {
      key: 'u:' + u.uid, contactId: m.id || '', uid: u.uid, kind: u.role, name: u.name || u.email, phone: m.phone || u.phone || '', email: u.email || '',
      stage: m.stage || 'Новый', task: m.task || '', note: m.note || '', registeredAt: u.createdAt, blocked: u.blocked,
      lastViewAt: lv ? lv.at : 0, lastViewProductId: lv ? lv.productId : '', lastContactAt: m.lastContactAt || 0,
      lastOrderAt: lastOrder[u.uid] || 0, debt: debtByUid[u.uid] || 0, manual: false,
    };
  });
  const manual = contacts.filter((c) => !c.uid).map((c) => {
    const ph = c.phone ? c.phone.replace(/\D/g, '').slice(-10) : '';
    const debt = ph ? sum(allDocuments().filter((d) => !d.buyerUid && String(d.buyerPhone || '').replace(/\D/g, '').slice(-10) === ph), (d) => paySummary(d).debt) : 0;
    return {
      key: 'c:' + c.id, contactId: c.id, uid: '', kind: c.kind || 'customer', name: c.name, phone: c.phone || '', email: '',
      stage: c.stage || 'Новый', task: c.task || '', note: c.note || '', registeredAt: c.createdAt, lastViewAt: 0, lastViewProductId: '',
      lastContactAt: c.lastContactAt || 0, lastOrderAt: 0, debt, manual: true,
    };
  });
  return fromUsers.concat(manual);
}
export const debtDocsForUid = (uid) => allDocuments().filter((d) => d.buyerUid === uid && paySummary(d).debt > 0).sort((a, b) => num(a.createdAt) - num(b.createdAt));

export { fmtDate, norm };
