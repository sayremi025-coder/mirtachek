/* Мир Тачек — раздел «Каталог» и «Избранное» */
import { Data } from '../data.js';
import * as D from '../domain.js';
import * as Svc from '../services.js';
import { S, Actions, Views, App, persistCart, persistFavs } from '../state.js';
import { $, esc, num, norm, money, opts, waLink, openExternal } from '../utils.js';
import { icon } from '../icons.js';
import { toast, openModal, closeModal, paginate, pagerHTML, segBtns, emptyState, thumb, stepper } from '../ui.js';

/* ------------------------------ Карточка ------------------------------ */
export function shownPrice(p) {
  return D.levelPrice(p, D.roleLevel());
}
function priceBlock(p) {
  const r = D.role();
  if (r === 'admin') return `<div class="product__price">${money(p.retailPrice)}</div>
    <div class="price-grid"><span>Магазин</span><b>${money(p.storePrice)}</b><span>Дилер</span><b>${money(p.dealerPrice)}</b><span>Закуп</span><b>${money(p.costPrice)}</b></div>`;
  if (r === 'dealer') return `<div class="product__price">${money(p.dealerPrice)}</div><div class="price-grid"><span>Магазину</span><b>${money(p.storePrice)}</b><span>Розница</span><b>${money(p.retailPrice)}</b></div>`;
  if (r === 'store') return `<div class="product__price">${money(p.storePrice)}</div><div class="price-grid"><span>Розница</span><b>${money(p.retailPrice)}</b></div>`;
  return `<div class="product__price">${money(p.retailPrice)}</div>`;
}
function stockLabel(p) {
  if (p.type === 'service') return '<span class="stock stock--service">Услуга СТО</span>';
  return num(p.stock) > 0 ? `<span class="stock stock--ok">В наличии: ${num(p.stock)} ${esc(p.unit || 'шт')}</span>` : '<span class="stock stock--out">Под заказ</span>';
}
export function productCard(p, variant = 'catalog') {
  const isService = p.type === 'service';
  const fav = S.favs.includes(p.id);
  const actions = variant === 'fav'
    ? `<button type="button" class="btn btn--primary btn--sm" data-action="add-cart" data-id="${p.id}">${icon('cart')}В корзину</button>
       <button type="button" class="btn btn--ghost btn--sm" data-action="fav-remove" data-id="${p.id}">${icon('trash')}Удалить</button>`
    : `<button type="button" class="btn btn--primary btn--sm" data-action="add-cart" data-id="${p.id}">${icon(isService ? 'wrench' : 'cart')}${isService ? 'Записаться' : 'В корзину'}</button>
       <button type="button" class="icon-btn icon-btn--sm ${fav ? 'is-on' : ''}" data-action="toggle-fav" data-id="${p.id}" title="${fav ? 'Убрать из избранного' : 'В избранное'}" aria-label="Избранное">${icon('heart')}</button>
       <button type="button" class="icon-btn icon-btn--sm icon-btn--wa" data-action="wa-product" data-id="${p.id}" title="Спросить в WhatsApp" aria-label="WhatsApp">${icon('whatsapp')}</button>`;
  return `<article class="card product">
    <button type="button" class="product__media" data-action="open-product" data-id="${p.id}" aria-label="Открыть: ${esc(p.name)}">${thumb(p)}${p.isNew ? '<span class="tag tag--new">Новинка</span>' : ''}</button>
    <div class="product__body">
      <div class="product__meta"><span class="tag">${isService ? 'Услуга' : 'Товар'}</span><span class="muted">${esc(p.category || 'Без категории')}</span></div>
      <h3 class="product__title"><a href="#" data-action="open-product" data-id="${p.id}">${esc(p.name)}</a></h3>
      ${priceBlock(p)}${stockLabel(p)}
    </div>
    <div class="product__actions">${actions}</div>
  </article>`;
}

function filtered() {
  const f = S.catalog, q = norm(f.q);
  let list = D.products();
  if (f.type !== 'all') list = list.filter((p) => (p.type || 'product') === f.type);
  if (f.category !== 'all') list = list.filter((p) => String(p.category || '').trim() === f.category);
  if (q) list = list.filter((p) => norm([p.name, p.description, p.category, p.sku].join(' ')).includes(q));
  const pr = shownPrice;
  const nm = (a, b) => String(a.name).localeCompare(String(b.name), 'ru');
  const sorters = {
    name: nm, 'price-asc': (a, b) => pr(a) - pr(b) || nm(a, b), 'price-desc': (a, b) => pr(b) - pr(a) || nm(a, b),
    'stock-desc': (a, b) => num(b.stock) - num(a.stock) || nm(a, b), 'stock-asc': (a, b) => num(a.stock) - num(b.stock) || nm(a, b),
    new: (a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || num(b.createdAt) - num(a.createdAt),
  };
  return list.sort(sorters[f.sort] || nm);
}

function heroHTML() {
  const r = D.role();
  if (!['guest', 'customer'].includes(r)) return '';
  return `<section class="hero">
    <div class="hero__text">
      <span class="eyebrow">Автозапчасти · автотовары · СТО</span>
      <h1>${esc(D.companyName())}: всё для автомобиля в одном месте</h1>
      <p>Выберите товары или услуги, оформите заказ и договоритесь с нами в WhatsApp о самовывозе или доставке.</p>
      <div class="btn-row">
        <button type="button" class="btn btn--primary" data-action="scroll-catalog">${icon('package')}Открыть каталог</button>
        <button type="button" class="btn btn--wa" data-action="wa-company">${icon('whatsapp')}Написать в WhatsApp</button>
      </div>
    </div>
    <div class="hero__mark">${icon('logo')}<b>${esc(D.companyName())}</b><small>Торговля · Сервис · Доставка</small></div>
  </section>`;
}

function carouselItems() {
  const all = D.products();
  let list = all.filter((p) => p.featured);
  if (list.length < 4) list = list.concat(all.filter((p) => p.isNew && !p.featured));
  if (list.length < 4) list = list.concat(all.filter((p) => !p.featured && !p.isNew).sort((a, b) => num(b.createdAt) - num(a.createdAt)));
  return list.slice(0, 12);
}

Views.catalog = {
  shell() {
    const f = S.catalog;
    const r = D.role();
    return `${heroHTML()}
      <section class="carousel-wrap" id="carouselWrap">
        <div class="section-head"><h2>Популярное и новинки</h2>
          <div class="btn-row"><button type="button" class="icon-btn icon-btn--sm" data-action="carousel" data-dir="-1" aria-label="Назад">${icon('chevronLeft')}</button>
          <button type="button" class="icon-btn icon-btn--sm" data-action="carousel" data-dir="1" aria-label="Вперед">${icon('chevronRight')}</button></div></div>
        <div class="carousel" id="carousel"></div>
      </section>
      <div class="view-head" id="catalogTop"><div><h1>Каталог товаров и услуг</h1>
        <p class="muted">Цены: <b>${r === 'store' ? 'для магазина' : r === 'dealer' ? 'дилерские' : r === 'admin' ? 'все уровни' : 'розничные'}</b>.</p></div></div>
      <div class="toolbar">
        <label class="search">${icon('search')}<input type="search" data-bind="catalog.q" value="${esc(f.q)}" placeholder="Поиск: название, описание, категория, артикул" aria-label="Поиск"></label>
        <div class="seg" data-seg="catalog.type">${segBtns('catalog.type', [['all', 'Все'], ['product', 'Товары'], ['service', 'Услуги']])}</div>
        <select data-bind="catalog.category" id="catCategory" aria-label="Категория"></select>
        <select data-bind="catalog.sort" aria-label="Сортировка">${opts([['name', 'По названию'], ['price-asc', 'Цена: дешевле'], ['price-desc', 'Цена: дороже'], ['stock-desc', 'Остаток: больше'], ['stock-asc', 'Остаток: меньше'], ['new', 'Сначала новинки']], f.sort)}</select>
      </div>
      <div class="grid" id="catalogGrid"></div>
      <div id="catalogPager"></div>
      ${['guest', 'customer'].includes(r) ? `<section class="panel request-panel">
        <div><h2 class="panel__title">Нужна консультация или подбор запчасти?</h2><p class="muted">Оставьте заявку — мы перезвоним или напишем в WhatsApp.</p></div>
        <form id="requestForm" class="request-form">
          <input type="text" name="name" placeholder="Ваше имя" required value="${esc((Data.profile || {}).name || '')}">
          <input type="tel" name="phone" placeholder="Телефон" required value="${esc((Data.profile || {}).phone || '')}">
          <input type="text" name="text" placeholder="Марка, модель, год, что нужно" required>
          <button type="submit" class="btn btn--dark">${icon('send')}Отправить</button>
        </form></section>` : ''}`;
  },
  body() {
    const cats = D.categories();
    if (S.catalog.category !== 'all' && !cats.includes(S.catalog.category)) S.catalog.category = 'all';
    $('#catCategory').innerHTML = opts([['all', 'Все категории'], ...cats.map((c) => [c, c])], S.catalog.category);
    const items = carouselItems();
    $('#carouselWrap').hidden = !items.length;
    $('#carousel').innerHTML = items.map((p) => `<button type="button" class="carousel__item" data-action="open-product" data-id="${p.id}">
      <span class="carousel__media">${thumb(p)}</span><b>${esc(p.name)}</b><span class="carousel__price">${money(shownPrice(p))}</span></button>`).join('');
    const pg = paginate(filtered(), S.catalog.page);
    S.catalog.page = pg.page;
    const total = Data.list('products').length;
    $('#catalogGrid').innerHTML = pg.items.length ? pg.items.map((p) => productCard(p)).join('')
      : total ? emptyState('search', 'Ничего не найдено', 'Измените запрос или фильтры.')
        : emptyState('package', 'Каталог пока пуст', D.isAdmin() ? 'Добавьте товары: Управление → Товары (форма или Excel-файл).' : 'Скоро здесь появятся товары и услуги.',
          D.isAdmin() ? '<button type="button" class="btn btn--primary" data-action="nav" data-view="manage">Перейти в управление</button>' : '');
    $('#catalogPager').innerHTML = pagerHTML('catalog', pg);
  },
};

/* ------------------------------ Избранное ----------------------------- */
Views.favorites = {
  shell() {
    return `<div class="view-head"><div><h1>Избранное</h1><p class="muted">Сохраненные товары и услуги.</p></div>
      <button type="button" class="btn btn--primary btn--sm" data-action="fav-all-to-cart" id="favAll">${icon('cart')}Все в корзину</button></div>
      <div class="grid" id="favGrid"></div><div id="favPager"></div>`;
  },
  body() {
    const list = S.favs.map((id) => D.product(id)).filter(Boolean);
    const pg = paginate(list, S.favView.page);
    S.favView.page = pg.page;
    $('#favAll').hidden = !list.length;
    $('#favGrid').innerHTML = list.length ? pg.items.map((p) => productCard(p, 'fav')).join('')
      : emptyState('heart', 'Пока пусто', 'Нажмите на сердечко в карточке, чтобы сохранить товар.', '<button type="button" class="btn btn--primary" data-action="nav" data-view="catalog">В каталог</button>');
    $('#favPager').innerHTML = pagerHTML('favView', pg);
  },
};

/* ---------------------------- Карточка в окне ------------------------- */
export function openProduct(id, silent = false) {
  const p = D.product(id);
  if (!p) return;
  const isService = p.type === 'service';
  const fav = S.favs.includes(id);
  const r = D.role();
  const rows = r === 'admin'
    ? [['Розница', p.retailPrice], ['Цена магазина', p.storePrice], ['Цена дилера', p.dealerPrice], ['Закуп', p.costPrice]]
    : r === 'dealer' ? [['Ваша цена', p.dealerPrice], ['Цена для магазина', p.storePrice]]
      : r === 'store' ? [['Ваша цена', p.storePrice]] : [['Цена', p.retailPrice]];
  openModal(`<div class="pmodal">
    <div class="pmodal__media">${thumb(p)}</div>
    <div class="pmodal__info">
      <div class="product__meta"><span class="tag">${isService ? 'Услуга' : 'Товар'}</span>${p.isNew ? '<span class="tag tag--new">Новинка</span>' : ''}<span class="muted">${esc(p.category || 'Без категории')}</span></div>
      <h2 id="modalTitle">${esc(p.name)}</h2>
      ${p.sku ? `<p class="muted">Артикул: ${esc(p.sku)}</p>` : ''}
      <p class="pmodal__desc">${esc(p.description || 'Описание пока не заполнено.')}</p>
      <dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${money(v)}</dd>`).join('')}
        <dt>${isService ? 'Тип' : 'Наличие'}</dt><dd>${isService ? 'Услуга СТО, по записи' : num(p.stock) > 0 ? `${num(p.stock)} ${esc(p.unit || 'шт')}` : 'Под заказ'}</dd></dl>
      <div class="qty-row"><span class="muted">Количество</span>${stepper('modalQty', 1)}</div>
      <div class="btn-row">
        <button type="button" class="btn btn--primary" data-action="add-cart" data-id="${p.id}" data-qty-from="#modalQty">${icon(isService ? 'wrench' : 'cart')}${isService ? 'Записаться' : 'В корзину'}</button>
        <button type="button" class="btn btn--ghost ${fav ? 'is-on' : ''}" data-action="toggle-fav" data-id="${p.id}">${icon('heart')}${fav ? 'В избранном' : 'В избранное'}</button>
        <button type="button" class="btn btn--wa" data-action="wa-product" data-id="${p.id}">${icon('whatsapp')}WhatsApp</button>
      </div>
    </div></div>`, 'modal--wide');
  if (!silent) Svc.logView(p);
}

export function addToCart(id, qty = 1) {
  const p = D.product(id);
  if (!p) return;
  const q = Math.max(1, Math.round(num(qty)));
  const line = S.cart.find((l) => l.id === id);
  if (line) line.qty = num(line.qty) + q; else S.cart.push({ id, qty: q });
  persistCart();
  App.render();
  toast(`В корзине: ${p.name}`, 'ok', 2000);
}

function toggleFav(id) {
  const on = S.favs.includes(id);
  S.favs = on ? S.favs.filter((x) => x !== id) : [...S.favs, id];
  persistFavs();
  toast(on ? 'Удалено из избранного' : 'Добавлено в избранное', 'ok', 1600);
}

function companyWA(text) {
  const phone = D.companyPhone();
  if (!phone) toast('Номер WhatsApp компании еще не указан — выберите контакт в WhatsApp', 'warn');
  openExternal(waLink(phone, text));
}

Object.assign(Actions, {
  'open-product': (el) => openProduct(el.dataset.id),
  'add-cart': (el) => {
    const qEl = el.dataset.qtyFrom ? $(el.dataset.qtyFrom) : null;
    addToCart(el.dataset.id, qEl ? qEl.value : 1);
    if (qEl) closeModal();
  },
  'toggle-fav': (el) => {
    toggleFav(el.dataset.id);
    if (el.closest('#modal')) openProduct(el.dataset.id, true);
    App.render();
  },
  'fav-remove': (el) => { toggleFav(el.dataset.id); App.render(); },
  'fav-all-to-cart': () => {
    S.favs.filter((id) => D.product(id)).forEach((id) => { if (!S.cart.find((l) => l.id === id)) S.cart.push({ id, qty: 1 }); });
    persistCart(); App.render(); toast('Избранное добавлено в корзину', 'ok');
  },
  'wa-product': (el) => {
    const p = D.product(el.dataset.id);
    if (!p) return;
    const me = Data.profile || {};
    companyWA([`Здравствуйте! Интересует ${p.type === 'service' ? 'услуга' : 'товар'} в «${D.companyName()}»:`, `${p.name}${p.sku ? ' (арт. ' + p.sku + ')' : ''}`,
      `Цена: ${money(shownPrice(p))}`, p.type === 'service' ? 'Хочу записаться, подскажите свободное время.' : 'Подскажите наличие и условия доставки.',
      me.name ? `${me.name}${me.phone ? ', ' + me.phone : ''}` : ''].filter(Boolean).join('\n'));
  },
  'wa-company': () => companyWA(`Здравствуйте, «${D.companyName()}»! У меня вопрос.`),
  'scroll-catalog': () => { const el = $('#catalogTop'); if (el) el.scrollIntoView({ behavior: 'smooth' }); },
  carousel: (el) => { const c = $('#carousel'); if (c) c.scrollBy({ left: num(el.dataset.dir) * c.clientWidth * 0.8, behavior: 'smooth' }); },
});

export async function submitRequest(form) {
  const v = { name: form.name.value.trim(), phone: form.phone.value.trim(), text: form.text.value.trim() };
  if (!v.name || !v.phone || !v.text) { toast('Заполните имя, телефон и запрос', 'error'); return; }
  await Svc.saveRequest(v);
  form.text.value = '';
  toast('Заявка отправлена. Мы свяжемся с вами.', 'ok');
}
