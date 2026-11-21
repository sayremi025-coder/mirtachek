/* =========================================================================
   Мир Тачек — точка входа: роутинг, шапка, вход, события, запуск
   ========================================================================= */
import { Data } from './data.js';
import * as D from './domain.js';
import { S, Actions, Views, App, ROLES, TABS, persistCheckout } from './state.js';
import { $, $$, esc, num, setPath, debounce, opts } from './utils.js';
import { icon } from './icons.js';
import { toast, openModal, closeModal, syncSegs, formDialog } from './ui.js';
import { APP } from './config.js';

import './views/catalog.js';
import { submitRequest } from './views/catalog.js';
import { syncCheckout, setCartQty } from './views/cart.js';
import './views/orders.js';
import './views/docs.js';
import './views/reports.js';
import { updateWa, waTextEdited, setStage } from './views/crm.js';
import { submitProduct, onProductInput, onProductImage, importFile, changeUserRole, submitStock, submitSettings } from './views/manage.js';

/* ------------------------------- Рендер ------------------------------- */
const built = {};
let builtFor = '';

function renderView(name = S.view) {
  const el = $('#view-' + name);
  const v = Views[name];
  if (!el || !v) return;
  if (!built[name]) { el.innerHTML = v.shell(); built[name] = true; }
  v.body();
  syncSegs(el, S);
}
function invalidate(name) { if (name) delete built[name]; else Object.keys(built).forEach((k) => delete built[k]); }

function render() {
  const key = D.role() + '|' + (Data.profile ? Data.profile.uid : '');
  if (key !== builtFor) { invalidate(); builtFor = key; }
  if (!ROLES[D.role()].tabs.includes(S.view)) S.view = 'catalog';
  renderHeader();
  renderTabs();
  $$('.view').forEach((el) => { el.hidden = el.id !== 'view-' + S.view; });
  renderView();
}
const scheduleRender = (() => { let raf = 0; return () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }; })();
const scheduleBody = debounce(() => renderView(), 160);

function go(view) {
  S.view = ROLES[D.role()].tabs.includes(view) ? view : 'catalog';
  closeModal();
  render();
  window.scrollTo({ top: 0 });
  try { history.replaceState(null, '', '#' + S.view); } catch (e) { /* ignore */ }
}
Object.assign(App, { render, renderView, invalidate, go });

/* -------------------------------- Шапка ------------------------------- */
function badgeCounts() {
  const r = D.role();
  const c = { cart: S.cart.reduce((s, l) => s + num(l.qty), 0), favorites: S.favs.length };
  if (r !== 'guest') {
    c.docs = D.myPendingAcceptance().length + D.myPendingConfirmations().length + (r === 'admin' ? D.disputedDocs().length : 0);
    c.orders = r === 'admin' ? D.orders().filter((o) => o.status === 'new').length : r === 'dealer' ? D.orders().filter((o) => o.assignedDealerUid === D.myUid() && o.status === 'processing').length : 0;
  }
  return c;
}

function renderHeader() {
  $('#brandMark').innerHTML = icon('logo');
  $('#brandName').textContent = D.companyName();
  const conn = $('#connStatus');
  const mode = Data.mode;
  conn.className = 'conn ' + (mode === 'live' ? 'conn--live' : mode === 'demo' ? 'conn--demo' : 'conn--off');
  conn.innerHTML = `${icon(mode === 'live' ? 'cloud' : 'cloudOff')}<span>${mode === 'live' ? 'LIVE' : mode === 'demo' ? 'Демо-режим' : 'Нет связи'}</span>`;
  conn.title = mode === 'live' ? 'Данные синхронизируются с Firebase' : mode === 'demo' ? 'Firebase не настроен: данные хранятся в этом браузере' : Data.error;
  const p = Data.profile;
  const r = D.role();
  let user = '';
  if (Data.isDemo()) {
    user = `<label class="role-switch"><span class="sr-only">Демо-пользователь</span><select id="demoUser" aria-label="Демо-пользователь">
      ${opts([['', 'Гость (без входа)'], ...Data.demoUsers().map((u) => [u.uid, `${ROLES[u.role] ? ROLES[u.role].label : u.role}: ${u.name}`])], p ? p.uid : '')}</select></label>`;
  } else if (p) {
    user = `<button type="button" class="user-chip" data-action="profile" title="Профиль">${icon(r === 'store' ? 'store' : r === 'dealer' ? 'truck' : r === 'admin' ? 'shield' : 'user')}
      <span><b>${esc(p.name || p.email || 'Профиль')}</b><small>${esc(p.blocked ? 'Заблокирован' : ROLES[r].label)}</small></span></button>`;
  } else if (Data.isLive()) {
    user = `<button type="button" class="btn btn--primary btn--sm" data-action="login">${icon('login')}Войти</button>`;
  }
  $('#userBox').innerHTML = user;
  const c = badgeCounts();
  $('#cartBtn').innerHTML = icon('cart') + (c.cart ? `<span class="cart-count">${c.cart}</span>` : '');
  $('#banner').innerHTML = p && p.blocked ? `<div class="banner banner--danger">${icon('ban')}Ваш аккаунт заблокирован администратором. Доступен только просмотр каталога.</div>`
    : Data.mode === 'error' ? `<div class="banner banner--danger">${icon('alert')}${esc(Data.error)} <button type="button" class="btn btn--ghost btn--sm" data-action="reload">Повторить</button></div>`
      : Data.isDemo() ? `<div class="banner">${icon('info')}Демо-режим: Firebase еще не подключен, данные хранятся только в этом браузере. Переключайте пользователей в шапке, чтобы проверить роли.</div>` : '';
}

function renderTabs() {
  const c = badgeCounts();
  $('#tabs').innerHTML = `<div class="tabs__inner">${ROLES[D.role()].tabs.map((t) => {
    const n = c[t];
    return `<button type="button" class="tab ${S.view === t ? 'is-active' : ''}" data-action="nav" data-view="${t}">${icon(TABS[t].icon)}<span>${TABS[t].label}</span>${n ? `<b>${n}</b>` : ''}</button>`;
  }).join('')}</div>`;
}

/* --------------------------------- Вход -------------------------------- */
function openLogin(mode = 'login') {
  openModal(`<div class="auth">
    <h2 id="modalTitle">${icon('login')}Вход в «${esc(D.companyName())}»</h2>
    <p class="muted">При первом входе вы автоматически становитесь покупателем. Роль магазина, дилера или администратора назначает администратор.</p>
    <button type="button" class="btn btn--dark btn--lg btn--block" data-action="login-google">${icon('user')}Войти через Google</button>
    <div class="divider"><span>или по email</span></div>
    <form id="authForm" data-mode="${mode}" class="stack" novalidate>
      ${mode === 'register' ? '<label class="field"><span>Имя или название</span><input type="text" name="name" autocomplete="name" required></label>' : ''}
      <label class="field"><span>Email</span><input type="email" name="email" autocomplete="username" required></label>
      <label class="field"><span>Пароль</span><input type="password" name="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" minlength="6" required></label>
      <button type="submit" class="btn btn--primary btn--block">${mode === 'register' ? 'Зарегистрироваться' : 'Войти'}</button>
    </form>
    <div class="btn-row auth__links">
      <button type="button" class="link" data-action="login" data-mode="${mode === 'register' ? 'login' : 'register'}">${mode === 'register' ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Регистрация'}</button>
      ${mode === 'login' ? '<button type="button" class="link" data-action="login-reset">Забыли пароль?</button>' : ''}
    </div></div>`);
}

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Неверный email или пароль', 'auth/wrong-password': 'Неверный пароль', 'auth/user-not-found': 'Пользователь не найден',
  'auth/email-already-in-use': 'Этот email уже зарегистрирован', 'auth/weak-password': 'Пароль должен быть не короче 6 символов',
  'auth/invalid-email': 'Некорректный email', 'auth/popup-closed-by-user': 'Окно входа закрыто', 'auth/unauthorized-domain': 'Домен сайта не добавлен в Firebase → Authentication → Authorized domains',
  'auth/operation-not-allowed': 'Этот способ входа не включен в Firebase Authentication', 'auth/network-request-failed': 'Нет связи с сервером',
};
const authMsg = (e) => AUTH_ERRORS[e.code] || e.message;

function openProfile() {
  const p = Data.profile;
  if (!p) return;
  const r = D.role();
  openModal(`<form id="profileForm" class="stack">
    <h2 id="modalTitle">${icon('user')}Профиль</h2>
    <dl class="kv"><dt>Роль</dt><dd>${esc(ROLES[r].label)}</dd><dt>Email</dt><dd>${esc(p.email || '—')}</dd></dl>
    <label class="field"><span>${r === 'store' ? 'Название магазина' : 'Имя и фамилия'}</span><input type="text" name="name" value="${esc(p.name || '')}" ${r === 'store' ? 'readonly' : ''} required></label>
    ${r === 'store' ? '<p class="note">Название магазина меняет администратор: по нему вам приходят отгрузки.</p>' : ''}
    <label class="field"><span>Телефон (WhatsApp)</span><input type="tel" name="phone" value="${esc(p.phone || '')}" placeholder="+7 7__ ___ __ __"></label>
    <div class="btn-row"><button type="submit" class="btn btn--primary">${icon('check')}Сохранить</button>
      ${Data.isLive() ? `<button type="button" class="btn btn--ghost" data-action="logout">${icon('logout')}Выйти</button>` : ''}</div>
  </form>`);
}

Object.assign(Actions, {
  nav: (el) => go(el.dataset.view),
  set: (el) => {
    const path = el.dataset.path;
    setPath(S, path, el.dataset.value);
    const root = path.split('.')[0];
    if (S[root] && typeof S[root] === 'object' && 'page' in S[root] && !path.endsWith('.page')) S[root].page = 1;
    if (root === 'checkout') persistCheckout();
    if (path === 'reports.period') { S.reports.from = ''; S.reports.to = ''; }
    if (path === 'manage.tab') S.manage.page = 1;
    renderView();
  },
  page: (el) => {
    const key = el.dataset.key;
    if (!S[key]) return;
    S[key].page = num(el.dataset.page);
    renderView();
    if (['catalog', 'favView', 'crm'].includes(key)) window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  step: (el) => { const i = $(el.dataset.target); if (i) i.value = Math.max(1, num(i.value) + num(el.dataset.delta)); },
  'close-modal': () => closeModal(),
  reload: () => location.reload(),
  login: (el) => { if (Data.isLive()) openLogin(el.dataset.mode || 'login'); else toast('В демо-режиме выберите пользователя в шапке', 'info'); },
  'login-google': async () => { try { await Data.signInGoogle(); closeModal(); toast('Вход выполнен', 'ok'); } catch (e) { toast(authMsg(e), 'error', 6000); } },
  'login-reset': async () => {
    const v = await formDialog('Восстановление пароля', '<label class="field"><span>Email</span><input type="email" name="email" required></label>', 'Отправить ссылку');
    if (v) { try { await Data.resetPassword(v.email); toast('Письмо для сброса пароля отправлено', 'ok'); } catch (e) { toast(authMsg(e), 'error'); } }
  },
  logout: async () => { closeModal(); await Data.signOut(); S.view = 'catalog'; toast('Вы вышли', 'ok'); },
  profile: () => openProfile(),
});

/* -------------------------------- События ------------------------------ */
function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = Actions[el.dataset.action];
  if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  Promise.resolve().then(() => fn(el, e)).catch((err) => { console.error(err); toast(err.message || String(err), 'error', 6000); });
}

function onInput(e) {
  const t = e.target;
  if (t.id === 'waText') { waTextEdited(t.value); return; }
  if (t.form && t.form.id === 'productForm') { onProductInput(t); return; }
  const path = t.dataset.bind;
  if (!path) return;
  setPath(S, path, t.type === 'checkbox' ? t.checked : t.value);
  const [root, key] = path.split('.');
  if (key !== 'page' && S[root] && typeof S[root] === 'object' && 'page' in S[root]) S[root].page = 1;
  if (root === 'checkout') {
    persistCheckout();
    if (key === 'mode' || key === 'counterparty') renderView(); else syncCheckout();
    return;
  }
  if (root === 'wa') { updateWa(); return; }
  if (root === 'reports' && (key === 'from' || key === 'to')) S.reports.period = S.reports.from || S.reports.to ? 'custom' : 'all';
  if (t.tagName === 'SELECT' || t.type === 'date') renderView(); else scheduleBody();
}

function guard(fn) { Promise.resolve().then(fn).catch((err) => { console.error(err); toast(err.message || String(err), 'error', 6000); }); }

function onChange(e) {
  const t = e.target;
  if (t.id === 'demoUser') { Data.setDemoUser(t.value); S.view = 'catalog'; toast(t.value ? `Вы: ${t.options[t.selectedIndex].text}` : 'Вы гость', 'ok'); return; }
  if (t.matches('[data-cart-qty]')) setCartQty(t.dataset.cartQty, t.value);
  else if (t.matches('[data-crm-stage]')) guard(() => setStage(t.dataset.crmStage, t.value));
  else if (t.matches('[data-user-role]')) guard(() => changeUserRole(t.dataset.userRole, t.value, t));
  else if (t.id === 'importFile') { const f = t.files[0]; t.value = ''; guard(() => importFile(f)); }
  else if (t.id === 'pfImageFile') onProductImage(t.files[0]);
}

function onSubmit(e) {
  const f = e.target;
  if (f.id === 'dlgForm') return;
  e.preventDefault();
  if (!f.checkValidity()) { f.reportValidity(); return; }
  guard(async () => {
    switch (f.id) {
      case 'productForm': await submitProduct(f); break;
      case 'stockForm': await submitStock(f); break;
      case 'settingsForm': await submitSettings(f); break;
      case 'requestForm': await submitRequest(f); break;
      case 'profileForm': await Data.updateMyProfile({ name: f.name.value, phone: f.phone.value }); closeModal(); toast('Профиль сохранен', 'ok'); break;
      case 'authForm': {
        try {
          if (f.dataset.mode === 'register') await Data.signUpEmail(f.name.value.trim(), f.email.value.trim(), f.password.value);
          else await Data.signInEmail(f.email.value.trim(), f.password.value);
          closeModal(); toast('Вход выполнен', 'ok');
        } catch (err) { toast(authMsg(err), 'error', 6000); }
        break;
      }
      default: break;
    }
  });
}

/* -------------------------------- Запуск ------------------------------- */
async function boot() {
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  window.addEventListener('afterprint', () => { $('#print-area').innerHTML = ''; });
  $('#modalClose').innerHTML = icon('x');
  const hash = location.hash.replace('#', '');
  if (TABS[hash]) S.view = hash;
  Data.on((what) => {
    if (what === 'auth' || what === '*') invalidate();
    scheduleRender();
  });
  render();
  await Data.init();
  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
