/* =========================================================================
   Мир Тачек — бизнес-операции (запись данных)
   Каждая операция собирает пакет изменений и отправляет его одним commit.
   Правила Firestore повторяют эти ограничения на сервере.
   ========================================================================= */
import { Data } from './data.js';
import * as D from './domain.js';
import { DOC_KINDS, ORDER_KINDS, MODE_META } from './state.js';
import { newId, docNumber, num, round2, sum, norm, normalizeImageUrl } from './utils.js';

const now = () => Date.now();
const COMPANY = D.COMPANY;

function actor() {
  const p = Data.profile;
  return p ? { uid: p.uid, name: p.name || p.email || '', role: p.role || 'customer' } : { uid: '', name: 'Гость', role: 'guest' };
}
function auditOp(action, details, extra = {}) {
  const a = actor();
  return { op: 'set', col: 'audit', id: newId(), data: Object.assign({ at: now(), action, details, by: a.uid, byName: a.name, role: a.role }, extra) };
}
const uniq = (arr) => [...new Set(arr.filter((x) => x && x !== COMPANY))];

/* -------------------------------- Заказы -------------------------------- */
export async function createOrder({ kind, lines, name, phone, forDate, delivery, address, comment, booking }) {
  const a = actor();
  if (!a.uid) throw new Error('Войдите, чтобы сохранить заказ');
  const items = lines.map((l) => ({ id: l.p.id, name: l.p.name, sku: l.p.sku || '', type: l.p.type || 'product', qty: l.qty, price: l.price }));
  const id = newId();
  const order = {
    number: docNumber(ORDER_KINDS[kind].prefix), kind, uid: a.uid, name: name || a.name, phone: phone || '', role: a.role,
    items, total: round2(sum(items, (i) => i.price * i.qty)), forDate: forDate || '', delivery: delivery || 'pickup',
    address: delivery === 'delivery' ? address || '' : '', comment: comment || '', booking: booking || '',
    status: 'new', assignedDealerUid: '', assignedDealerName: '', resultDocId: '',
    participants: [a.uid], createdAt: now(), updatedAt: now(),
  };
  const ops = [{ op: 'set', col: 'orders', id, data: order }];
  const p = Data.profile;
  if (p && (!p.phone && phone)) ops.push({ op: 'merge', col: 'users', id: p.uid, data: { phone } });
  await Data.commit(ops);
  return Object.assign({ id }, order);
}

export async function setOrderStatus(o, status) {
  const ops = [{ op: 'merge', col: 'orders', id: o.id, data: { status, updatedAt: now() } }];
  if (D.isAdmin()) ops.push(auditOp('order', `Заказ ${o.number}: статус «${status}»`));
  await Data.commit(ops);
}

export async function assignOrder(o, dealer) {
  await Data.commit([
    { op: 'merge', col: 'orders', id: o.id, data: { assignedDealerUid: dealer.uid, assignedDealerName: dealer.name, participants: uniq([...(o.participants || []), dealer.uid]), status: 'processing', updatedAt: now() } },
    auditOp('order', `Заказ ${o.number} передан дилеру ${dealer.name}`),
  ]);
}

/* ------------------------------- Документы ------------------------------ */
/**
 * mode: sale | companyShipment | issue | dealerShipment
 * counterparty: пользователь-покупатель (или null для розницы без аккаунта)
 * payment: { type: cash|transfer|debt|partial, amount, via }
 */
export async function postDocument({ mode, lines, counterparty, retail, payment, delivery, address, comment, booking, orderId }) {
  const a = actor();
  const meta = MODE_META[mode];
  if (!meta || !meta.doc) throw new Error('Неизвестный тип документа');
  const kind = meta.doc;
  const byDealer = mode === 'dealerShipment';
  if (byDealer ? a.role !== 'dealer' : a.role !== 'admin') throw new Error('Недостаточно прав для этого документа');
  if (!lines.length) throw new Error('Корзина пуста');
  if (kind !== 'sale' && !counterparty) throw new Error(kind === 'issue' ? 'Выберите дилера' : 'Выберите магазин');
  if (kind === 'shipment' && counterparty.role !== 'store') throw new Error('Получатель должен иметь роль «Магазин»');
  if (kind === 'issue' && counterparty.role !== 'dealer') throw new Error('Получатель должен иметь роль «Дилер»');

  const sellerUid = byDealer ? a.uid : COMPANY;
  const costLevel = byDealer ? 'dealer' : 'cost';
  const items = lines.map((l) => ({
    id: l.p.id, name: l.p.name, sku: l.p.sku || '', category: l.p.category || '', type: l.p.type || 'product',
    qty: l.qty, price: round2(l.price), cost: round2(D.levelPrice(l.p, costLevel)),
  }));
  const total = round2(sum(items, (i) => i.price * i.qty));
  const costTotal = round2(sum(items, (i) => i.cost * i.qty));

  if (!byDealer) {
    const short = items.filter((i) => i.type !== 'service').filter((i) => { const p = D.product(i.id); return !p || num(p.stock) < i.qty; });
    if (short.length) throw new Error('Недостаточно на складе: ' + short.map((i) => `${i.name} (есть ${num((D.product(i.id) || {}).stock)})`).join('; '));
  }

  const buyerUid = counterparty ? counterparty.uid : '';
  const id = newId();
  const number = docNumber(DOC_KINDS[kind].prefix);
  const d = {
    number, kind, mode,
    sellerUid, sellerName: byDealer ? a.name : D.companyName(), sellerRole: byDealer ? 'dealer' : 'company',
    buyerUid, buyerName: counterparty ? counterparty.name : (retail && retail.name) || 'Розничный покупатель',
    buyerRole: counterparty ? counterparty.role : 'customer',
    buyerPhone: counterparty ? counterparty.phone || '' : (retail && retail.phone) || '',
    dealerUid: byDealer ? a.uid : kind === 'issue' ? buyerUid : '',
    participants: uniq([sellerUid, buyerUid]),
    items, total, costTotal,
    status: kind === 'sale' ? 'accepted' : 'pending', acceptMode: '', acceptedAt: kind === 'sale' ? now() : 0,
    delivery: delivery || 'pickup', address: delivery === 'delivery' ? address || '' : '', comment: comment || '', booking: booking || '',
    orderId: orderId || '', createdBy: a.uid, createdByName: a.name, createdAt: now(), updatedAt: now(),
  };
  const ops = [{ op: 'set', col: 'documents', id, data: d }];

  const amount = payment.type === 'cash' || payment.type === 'transfer' ? total : payment.type === 'partial' ? round2(num(payment.amount)) : 0;
  if (payment.type === 'partial' && !(amount > 0 && amount < total)) throw new Error('Сумма частичной оплаты должна быть больше нуля и меньше итога');
  if (amount > 0) {
    ops.push({ op: 'set', col: 'payments', id: newId(), data: paymentRecord(Object.assign({ id }, d), { amount, via: payment.type === 'partial' ? payment.via : payment.type, note: 'Оплата при оформлении' }) });
  }
  if (!byDealer) {
    items.filter((i) => i.type !== 'service').forEach((i) => {
      ops.push({ op: 'inc', col: 'products', id: i.id, field: 'stock', by: -i.qty, extra: { updatedAt: now() } });
      ops.push({ op: 'set', col: 'movements', id: newId(), data: { at: now(), productId: i.id, productName: i.name, qty: -i.qty, reason: `${DOC_KINDS[kind].label} ${number}`, docId: id, by: a.uid, byName: a.name } });
    });
    ops.push(auditOp('doc', `${DOC_KINDS[kind].label} ${number} на ${total}`, { docId: id }));
  }
  if (orderId) ops.push({ op: 'merge', col: 'orders', id: orderId, data: { status: 'done', resultDocId: id, updatedAt: now() } });
  await Data.commit(ops);
  return Object.assign({ id }, d);
}

/** Запись об оплате. Создатель-админ — сразу подтверждена, иначе ждет вторую сторону. */
function paymentRecord(d, { amount, via, note }) {
  const a = actor();
  const isAdminActor = a.role === 'admin';
  const payerUid = d.buyerUid || 'retail';
  const payeeUid = d.sellerUid;
  const createdByPayee = isAdminActor ? payeeUid === COMPANY : a.uid === payeeUid;
  return {
    docId: d.id, docNumber: d.number, docKind: d.kind, amount: round2(amount), via: via === 'transfer' ? 'transfer' : 'cash',
    payerUid, payeeUid, payerName: d.buyerName, payeeName: d.sellerName,
    createdBy: isAdminActor && payeeUid === COMPANY ? COMPANY : a.uid, createdByName: a.name, createdByRole: a.role,
    side: createdByPayee ? 'payee' : 'payer',
    status: isAdminActor ? 'confirmed' : 'pending',
    confirmedBy: isAdminActor ? a.uid : '', confirmedAt: isAdminActor ? now() : 0,
    participants: uniq([d.sellerUid, d.buyerUid]),
    note: note || '', createdAt: now(),
  };
}

/** Приемка покупателем (магазин принимает отгрузку, дилер получает выдачу) */
export async function acceptDocument(d, { confirmClaims, payNow }) {
  const a = actor();
  if (d.status !== 'pending') throw new Error('Документ уже принят');
  if (d.buyerUid !== a.uid && a.role !== 'admin') throw new Error('Принять может только получатель');
  const ops = [];
  const claims = D.docPayments(d.id).filter((p) => p.status === 'pending' && p.createdBy !== a.uid);
  claims.forEach((p) => ops.push({ op: 'merge', col: 'payments', id: p.id, data: { status: confirmClaims ? 'confirmed' : (a.role === 'admin' ? 'void' : 'rejected'), confirmedBy: a.uid, confirmedAt: now() } }));
  let mode = claims.length ? (confirmClaims ? 'paid-confirmed' : 'debt-disputed') : 'debt';
  if (payNow && num(payNow.amount) > 0) {
    ops.push({ op: 'set', col: 'payments', id: newId(), data: paymentRecord(d, { amount: payNow.amount, via: payNow.via, note: 'Оплата при приемке' }) });
    mode = 'paid';
  }
  ops.unshift({ op: 'merge', col: 'documents', id: d.id, data: { status: 'accepted', acceptedAt: now(), acceptMode: mode, updatedAt: now() } });
  if (a.role === 'admin') ops.push(auditOp('accept', `Приемка ${d.number} оформлена администратором`));
  await Data.commit(ops);
}

export async function addPayment(d, { amount, via, note }) {
  const a = actor();
  const s = D.paySummary(d);
  const amt = round2(num(amount));
  if (!(amt > 0)) throw new Error('Введите сумму больше нуля');
  if (amt > s.debt - s.pendingAmt + 0.01) throw new Error(`Сумма больше остатка долга (${round2(s.debt - s.pendingAmt)})`);
  if (a.role !== 'admin' && ![d.sellerUid, d.buyerUid].includes(a.uid)) throw new Error('Оплату может внести только участник документа');
  const ops = [{ op: 'set', col: 'payments', id: newId(), data: paymentRecord(d, { amount: amt, via, note }) }];
  if (a.role === 'admin') ops.push(auditOp('pay', `Оплата ${amt} по ${d.number}`));
  await Data.commit(ops);
}

export async function confirmPayment(p, ok) {
  const a = actor();
  if (!D.canConfirmPayment(p)) throw new Error('Эту оплату подтверждает другая сторона');
  const status = ok ? 'confirmed' : a.role === 'admin' ? 'void' : 'rejected';
  const ops = [{ op: 'merge', col: 'payments', id: p.id, data: { status, confirmedBy: a.uid, confirmedAt: now() } }];
  if (a.role === 'admin') ops.push(auditOp('pay', `Оплата ${p.amount} по ${p.docNumber}: ${ok ? 'подтверждена' : 'аннулирована'}`));
  await Data.commit(ops);
}

/** Решение администратора по расхождению */
export async function resolvePayment(p, status) {
  if (!D.isAdmin()) throw new Error('Только администратор');
  await Data.commit([
    { op: 'merge', col: 'payments', id: p.id, data: { status, resolvedBy: actor().uid, resolvedAt: now() } },
    auditOp('dispute', `Расхождение по ${p.docNumber}: оплата ${p.amount} ${status === 'confirmed' ? 'признана' : 'аннулирована'}`),
  ]);
}

export async function deleteDocument(d) {
  if (!D.isAdmin()) throw new Error('Только администратор');
  const ops = [{ op: 'delete', col: 'documents', id: d.id }];
  D.docPayments(d.id).forEach((p) => ops.push({ op: 'delete', col: 'payments', id: p.id }));
  if (d.sellerUid === COMPANY) {
    (d.items || []).filter((i) => i.type !== 'service').forEach((i) => {
      if (D.product(i.id)) ops.push({ op: 'inc', col: 'products', id: i.id, field: 'stock', by: i.qty, extra: { updatedAt: now() } });
      ops.push({ op: 'set', col: 'movements', id: newId(), data: { at: now(), productId: i.id, productName: i.name, qty: i.qty, reason: `Удален документ ${d.number}`, docId: d.id, by: actor().uid, byName: actor().name } });
    });
  }
  if (d.orderId && D.order(d.orderId)) ops.push({ op: 'merge', col: 'orders', id: d.orderId, data: { status: 'processing', resultDocId: '', updatedAt: now() } });
  ops.push(auditOp('doc', `Удален документ ${d.number}`));
  await Data.commit(ops);
}

/* -------------------------------- Каталог ------------------------------- */
function productOps(p, prices) {
  const ops = [{ op: 'set', col: 'products', id: p.id, data: p }];
  ['store', 'dealer', 'cost'].forEach((lvl) => { if (prices[lvl] != null) ops.push({ op: 'price', level: lvl, id: p.id, value: prices[lvl] }); });
  return ops;
}
export function normalizeProduct(src, existing) {
  const type = src.type === 'service' ? 'service' : 'product';
  const retail = round2(num(src.retailPrice));
  const p = Object.assign({}, existing ? Data.get('products', existing.id) || {} : {}, {
    id: existing ? existing.id : src.id || newId(),
    type, sku: String(src.sku || '').trim(), name: String(src.name || '').trim(), category: String(src.category || '').trim(),
    description: String(src.description || '').trim(), unit: String(src.unit || (type === 'service' ? 'услуга' : 'шт')).trim(),
    retailPrice: retail, stock: type === 'service' ? 0 : Math.round(num(src.stock)),
    isNew: Boolean(src.isNew), featured: Boolean(src.featured), imageUrl: normalizeImageUrl(src.imageUrl),
    createdAt: existing ? existing.createdAt || now() : num(src.createdAt) || now(), updatedAt: now(),
  });
  ['storePrice', 'dealerPrice', 'costPrice'].forEach((k) => delete p[k]);
  const store = num(src.storePrice) || retail;
  const prices = { store, dealer: num(src.dealerPrice) || store, cost: num(src.costPrice) };
  return { p, prices };
}

export async function saveProduct(src, existing) {
  if (!D.isAdmin()) throw new Error('Только администратор');
  const { p, prices } = normalizeProduct(src, existing);
  if (!p.name) throw new Error('Введите название');
  if (!(p.retailPrice > 0)) throw new Error('Укажите розничную цену');
  const ops = productOps(p, prices);
  if (existing && num(existing.stock) !== p.stock && p.type !== 'service') {
    ops.push({ op: 'set', col: 'movements', id: newId(), data: { at: now(), productId: p.id, productName: p.name, qty: p.stock - num(existing.stock), reason: 'Корректировка в карточке товара', by: actor().uid, byName: actor().name } });
  } else if (!existing && p.stock) {
    ops.push({ op: 'set', col: 'movements', id: newId(), data: { at: now(), productId: p.id, productName: p.name, qty: p.stock, reason: 'Начальный остаток', by: actor().uid, byName: actor().name } });
  }
  ops.push(auditOp('catalog', `${existing ? 'Изменен' : 'Добавлен'} товар: ${p.name}`));
  await Data.commit(ops);
  return p;
}

export async function deleteProduct(p) {
  if (!D.isAdmin()) throw new Error('Только администратор');
  await Data.commit([
    { op: 'delete', col: 'products', id: p.id },
    { op: 'price', level: 'store', id: p.id, value: null },
    { op: 'price', level: 'dealer', id: p.id, value: null },
    { op: 'price', level: 'cost', id: p.id, value: null },
    auditOp('catalog', `Удален товар: ${p.name}`),
  ]);
}

/** Массовый импорт: обновляет по ID, артикулу или названию, добавляет новые */
export async function importProducts(rows) {
  if (!D.isAdmin()) throw new Error('Только администратор');
  const existing = D.products();
  let created = 0, updated = 0;
  const ops = [];
  rows.forEach((src) => {
    const match = (src.id && existing.find((p) => p.id === src.id))
      || (src.sku && existing.find((p) => p.sku && norm(p.sku) === norm(src.sku)))
      || existing.find((p) => norm(p.name) === norm(src.name) && (p.type || 'product') === src.type);
    if (match && !src.imageUrl) src.imageUrl = match.imageUrl || '';
    const { p, prices } = normalizeProduct(src, match || null);
    if (match) updated++; else created++;
    ops.push(...productOps(p, prices));
    const delta = p.stock - (match ? num(match.stock) : 0);
    if (p.type !== 'service' && delta) ops.push({ op: 'set', col: 'movements', id: newId(), data: { at: now(), productId: p.id, productName: p.name, qty: delta, reason: 'Импорт каталога', by: actor().uid, byName: actor().name } });
  });
  ops.push(auditOp('catalog', `Импорт каталога: новых ${created}, обновлено ${updated}`));
  await Data.commit(ops);
  return { created, updated };
}

/** Склад: приход, списание, инвентаризация */
export async function stockOperation({ productId, mode, qty, reason }) {
  if (!D.isAdmin()) throw new Error('Только администратор');
  const p = D.product(productId);
  if (!p) throw new Error('Товар не найден');
  const q = Math.round(num(qty));
  if (mode !== 'set' && !(q > 0)) throw new Error('Количество должно быть больше нуля');
  if (mode === 'set' && q < 0) throw new Error('Остаток не может быть отрицательным');
  const before = num(p.stock);
  const delta = mode === 'in' ? q : mode === 'out' ? -q : q - before;
  if (before + delta < 0) throw new Error('Нельзя списать больше, чем есть на складе');
  const label = { in: 'Приход', out: 'Списание', set: 'Инвентаризация' }[mode];
  await Data.commit([
    { op: 'inc', col: 'products', id: p.id, field: 'stock', by: delta, extra: { updatedAt: now() } },
    { op: 'set', col: 'movements', id: newId(), data: { at: now(), productId: p.id, productName: p.name, qty: delta, before, after: before + delta, reason: `${label}${reason ? ': ' + reason : ''}`, by: actor().uid, byName: actor().name } },
    auditOp('stock', `${label}: ${p.name}, ${delta > 0 ? '+' : ''}${delta}`),
  ]);
}

/* ------------------------------ Пользователи ---------------------------- */
export async function setUserRole(u, newRole) {
  if (!D.isAdmin()) throw new Error('Только администратор');
  if (u.uid === D.myUid() && newRole !== 'admin') throw new Error('Нельзя снять роль администратора с самого себя');
  await Data.commit([
    { op: 'merge', col: 'users', id: u.uid, data: { role: newRole, roleUpdatedAt: now(), roleUpdatedBy: D.myUid() } },
    auditOp('role', `${u.name || u.email}: роль «${u.role}» → «${newRole}»`, { targetUid: u.uid }),
  ]);
}
export async function setUserBlocked(u, blocked) {
  if (!D.isAdmin()) throw new Error('Только администратор');
  if (u.uid === D.myUid()) throw new Error('Нельзя заблокировать самого себя');
  await Data.commit([
    { op: 'merge', col: 'users', id: u.uid, data: { blocked } },
    auditOp('role', `${u.name || u.email}: ${blocked ? 'заблокирован' : 'разблокирован'}`, { targetUid: u.uid }),
  ]);
}
export async function updateUser(u, { name, phone }) {
  if (!D.isAdmin()) throw new Error('Только администратор');
  const n = String(name || '').trim();
  if (!n) throw new Error('Введите имя или название');
  if (u.role === 'store' && D.stores().some((s) => s.uid !== u.uid && norm(s.name) === norm(n))) throw new Error('Магазин с таким названием уже есть');
  await Data.commit([
    { op: 'merge', col: 'users', id: u.uid, data: { name: n, phone: String(phone || '').trim() } },
    auditOp('user', `Профиль изменен: ${n}`, { targetUid: u.uid }),
  ]);
}
export async function createDemoUser({ name, role, phone }) {
  if (!Data.isDemo()) throw new Error('Пользователи создаются при входе через Google или email');
  const uid = 'demo-' + newId();
  await Data.commit([{ op: 'set', col: 'users', id: uid, data: { uid, name, role, phone, email: '', blocked: false, createdAt: now() } }]);
}

/* -------------------------------- Прочее -------------------------------- */
export async function saveSettings(patch) {
  if (!D.isAdmin()) throw new Error('Только администратор');
  await Data.commit([{ op: 'merge', col: 'settings', id: 'public', data: patch }, auditOp('settings', 'Изменены настройки компании')]);
}

export async function submitDealerReport(rep) {
  const a = actor();
  await Data.commit([{ op: 'set', col: 'dealerReports', id: newId(), data: {
    dealerUid: a.uid, dealerName: a.name, periodLabel: rep.range.label, from: rep.range.from || 0, to: rep.range.to === Infinity ? now() : rep.range.to,
    shipped: round2(rep.shipped), cash: round2(rep.cash), transfer: round2(rep.transfer), storeDebt: round2(rep.storeDebt),
    pending: round2(rep.pending), disputes: rep.disputes, count: rep.count, dealerMargin: round2(rep.dealerMargin),
    debtToCompany: round2(rep.debtToCompany), onHandValue: round2(rep.onHandValue),
    stores: rep.byStore.map((s) => ({ name: s.name, total: round2(s.total), paid: round2(s.paid), debt: round2(s.debt) })),
    createdAt: now(),
  } }]);
}

const viewed = new Set();
export function logView(p) {
  const a = actor();
  if (!a.uid || a.role === 'admin' || viewed.has(p.id)) return;
  viewed.add(p.id);
  const me = Data.profile || {};
  Data.commit([{ op: 'set', col: 'views', id: newId(), data: { uid: a.uid, name: a.name, phone: me.phone || '', role: a.role, productId: p.id, productName: p.name, at: now() } }]).catch(() => {});
}

export async function saveContact(c) {
  if (!D.isAdmin()) throw new Error('Только администратор');
  const id = c.contactId || (c.uid ? 'u_' + c.uid : newId());
  const data = { uid: c.uid || '', kind: c.kind || 'customer', name: c.name || '', phone: c.phone || '', stage: c.stage || 'Новый', task: c.task || '', note: c.note || '', updatedAt: now() };
  if (c.lastContactAt) data.lastContactAt = c.lastContactAt;
  if (!c.contactId) data.createdAt = now();
  await Data.commit([{ op: 'merge', col: 'contacts', id, data }]);
}
export async function deleteContact(id) {
  if (!D.isAdmin()) throw new Error('Только администратор');
  await Data.commit([{ op: 'delete', col: 'contacts', id }]);
}

export async function saveRequest({ name, phone, text }) {
  const a = actor();
  await Data.commit([{ op: 'set', col: 'requests', id: newId(), data: { name: String(name).slice(0, 120), phone: String(phone).slice(0, 40), text: String(text).slice(0, 2000), uid: a.uid || '', createdAt: now(), status: 'new' } }]);
}
export async function setRequestStatus(r, status) {
  await Data.commit([{ op: 'merge', col: 'requests', id: r.id, data: { status } }]);
}
