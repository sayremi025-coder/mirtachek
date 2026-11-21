/* Мир Тачек — справочники, состояние интерфейса, реестры действий и разделов */
import { tomorrow } from './utils.js';

export const Prefs = {
  get(k, d) { try { const v = localStorage.getItem('mt2_pref_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('mt2_pref_' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
};

export const ROLES = {
  guest: { label: 'Гость', tabs: ['catalog', 'favorites', 'cart'] },
  customer: { label: 'Покупатель', tabs: ['catalog', 'favorites', 'cart', 'orders', 'docs'] },
  store: { label: 'Магазин', tabs: ['catalog', 'favorites', 'cart', 'orders', 'docs', 'reports'] },
  dealer: { label: 'Дилер', tabs: ['catalog', 'favorites', 'cart', 'orders', 'docs', 'reports'] },
  admin: { label: 'Администратор', tabs: ['catalog', 'favorites', 'cart', 'orders', 'docs', 'reports', 'crm', 'manage'] },
};
export const ROLE_OPTIONS = [['customer', 'Покупатель'], ['store', 'Магазин'], ['dealer', 'Дилер'], ['admin', 'Администратор']];

export const TABS = {
  catalog: { label: 'Каталог', icon: 'package' },
  favorites: { label: 'Избранное', icon: 'heart' },
  cart: { label: 'Корзина', icon: 'cart' },
  orders: { label: 'Заказы', icon: 'calendar' },
  docs: { label: 'Документы и оплаты', icon: 'truck' },
  reports: { label: 'Отчеты', icon: 'chart' },
  crm: { label: 'CRM и WhatsApp', icon: 'users' },
  manage: { label: 'Управление', icon: 'settings' },
};

/** Режимы корзины по ролям */
export const CART_MODES = {
  guest: ['retailOrder'],
  customer: ['retailOrder'],
  store: ['storeOrder'],
  dealer: ['dealerOrder', 'dealerShipment'],
  admin: ['sale', 'companyShipment', 'issue'],
};
export const MODE_META = {
  retailOrder: { label: 'Заказ: самовывоз или доставка', level: 'retail', order: 'retail' },
  storeOrder: { label: 'Заказ у компании на дату', level: 'store', order: 'store' },
  dealerOrder: { label: 'Заказ у компании на дату', level: 'dealer', order: 'dealer' },
  dealerShipment: { label: 'Отгрузка в магазин (с моего товара)', level: 'store', doc: 'shipment' },
  sale: { label: 'Розничная продажа', level: 'retail', doc: 'sale' },
  companyShipment: { label: 'Отгрузка магазину со склада', level: 'store', doc: 'shipment' },
  issue: { label: 'Выдача товара дилеру', level: 'dealer', doc: 'issue' },
};
export const LEVEL_LABEL = { retail: 'розничные', store: 'для магазина', dealer: 'дилерские' };

export const ORDER_KINDS = {
  retail: { label: 'Покупатель', prefix: 'ЗК' },
  store: { label: 'Магазин', prefix: 'ЗМ' },
  dealer: { label: 'Дилер', prefix: 'ЗД' },
};
export const ORDER_STATUS = { new: 'Новый', processing: 'В работе', done: 'Выполнен', cancelled: 'Отменен' };

export const DOC_KINDS = {
  sale: { label: 'Розничная продажа', short: 'Продажа', title: 'Чек', prefix: 'РП' },
  shipment: { label: 'Отгрузка в магазин', short: 'Отгрузка', title: 'Накладная', prefix: 'ОТ' },
  issue: { label: 'Выдача дилеру', short: 'Выдача дилеру', title: 'Накладная', prefix: 'ВД' },
};
export const PAY_TYPES = { cash: 'Наличными', transfer: 'Перевод / карта', debt: 'В долг', partial: 'Частичная оплата' };
export const VIA = { cash: 'Наличные', transfer: 'Перевод / карта' };
export const PAY_STATE = {
  paid: { label: 'Оплачен', cls: 'ok' },
  partial: { label: 'Частично', cls: 'warn' },
  debt: { label: 'Долг', cls: 'danger' },
  pending: { label: 'Ждет подтверждения', cls: 'info' },
  dispute: { label: 'Расхождение', cls: 'danger' },
};
export const PAYMENT_STATUS = { pending: 'Ждет подтверждения', confirmed: 'Подтверждена', rejected: 'Отклонена (расхождение)', void: 'Аннулирована' };
export const STAGES = ['Новый', 'Интерес', 'Переговоры', 'Клиент', 'Постоянный', 'Долг / сверка', 'Неактивен'];
export const PERIODS = [['day', 'За день'], ['week', 'За неделю'], ['month', 'За месяц'], ['all', 'За всё время']];

export const S = {
  view: 'catalog',
  cart: Prefs.get('cart', []),
  favs: Prefs.get('favs', []),
  catalog: { q: '', type: 'all', category: 'all', sort: 'name', page: 1 },
  favView: { page: 1 },
  orders: { status: 'active', kind: 'all', date: 'all', q: '', page: 1 },
  docs: { kind: 'all', pay: 'all', status: 'all', q: '', page: 1 },
  inbox: { page: 1 },
  reports: { period: 'month', from: '', to: '', tab: 'docs', page: 1 },
  crm: { kind: 'all', segment: 'all', q: '', page: 1 },
  crmLog: { tab: 'views', page: 1 },
  manage: { tab: 'users', q: '', role: 'all', page: 1 },
  mprod: { q: '', type: 'all', page: 1, editId: null, imageFile: null },
  stock: { q: '', page: 1, low: false },
  audit: { page: 1 },
  checkout: Object.assign({
    mode: 'retailOrder', name: '', phone: '', delivery: 'pickup', address: '', comment: '', booking: '',
    forDate: tomorrow(), counterparty: '', payType: 'cash', partialAmount: '', partialVia: 'cash', orderId: '',
  }, Prefs.get('checkout', {})),
  wa: {},
};
if (!S.checkout.forDate || S.checkout.forDate < tomorrow().slice(0, 10)) S.checkout.forDate = tomorrow();
S.checkout.orderId = '';

export const persistCheckout = () => Prefs.set('checkout', Object.assign({}, S.checkout, { orderId: '' }));
export const persistCart = () => Prefs.set('cart', S.cart);
export const persistFavs = () => Prefs.set('favs', S.favs);

/** Реестры, которые наполняют модули разделов */
export const Actions = {};
export const Views = {};
/** Функции рендера, их подставляет app.js */
export const App = { render() {}, renderView() {}, invalidate() {}, go() {} };
