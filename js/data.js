/* =========================================================================
   Мир Тачек — DataLayer
   LIVE: Firebase Auth + Firestore (офлайн-кэш IndexedDB) + Storage.
   DEMO: если Firebase не настроен — данные в localStorage, переключатель ролей.
   Чтение всегда из локального кэша (мгновенно), запись — пакетами (batch).
   ========================================================================= */
import { FIREBASE_CONFIG, USE_DEMO, ADMIN_EMAILS, APP, isFirebaseConfigured } from './config.js';
import { compressImage, withTimeout, num } from './utils.js';

const COLS = ['users', 'products', 'orders', 'documents', 'payments', 'dealerReports', 'views', 'contacts', 'requests', 'movements', 'audit'];
const LS = 'mt2_data_';
const SDK = `https://www.gstatic.com/firebasejs/${APP.FIREBASE_SDK}`;

const DEMO_USERS = [
  { uid: 'demo-admin', name: 'Администратор', email: 'admin@demo.local', role: 'admin', phone: '77000000000' },
  { uid: 'demo-dealer', name: 'Ахметов Ерлан', email: 'dealer@demo.local', role: 'dealer', phone: '77010000001' },
  { uid: 'demo-dealer2', name: 'Сериков Данияр', email: 'dealer2@demo.local', role: 'dealer', phone: '77010000002' },
  { uid: 'demo-store', name: 'Автомир Центр', email: 'store@demo.local', role: 'store', phone: '77020000001' },
  { uid: 'demo-store2', name: 'Авто Плюс', email: 'store2@demo.local', role: 'store', phone: '77020000002' },
  { uid: 'demo-customer', name: 'Покупатель Демо', email: 'client@demo.local', role: 'customer', phone: '77030000001' },
];

const clean = (o) => JSON.parse(JSON.stringify(o));
const readLS = (k, d) => { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const writeLS = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { console.warn('[Мир Тачек] localStorage переполнен', e); } };

export const Data = {
  mode: 'demo',          // demo | live | error
  ready: false,
  error: '',
  version: 0,
  authUser: null,
  profile: null,
  cache: Object.fromEntries(COLS.map((c) => [c, {}])),
  settings: {},
  prices: { store: {}, dealer: {}, cost: {} },
  _fb: null, _app: null, _auth: null, _db: null, _storage: null,
  _roleUnsubs: [], _publicUnsubs: [], _profileUnsub: null,
  _listeners: new Set(),

  on(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); },
  emit(what) { this.version++; this._listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } }); },
  list(col) { return Object.values(this.cache[col] || {}); },
  get(col, id) { return (this.cache[col] || {})[id] || null; },
  isLive() { return this.mode === 'live'; },
  isDemo() { return this.mode === 'demo'; },

  async init() {
    if (USE_DEMO || !isFirebaseConfigured()) { this._initDemo(); return; }
    try {
      await this._initFirebase();
    } catch (e) {
      console.error(e);
      this.mode = 'error';
      this.error = 'Не удалось подключиться к Firebase: ' + (e.message || e);
      this.ready = true;
      this.emit('*');
    }
  },

  /* ------------------------------ DEMO ------------------------------ */
  _initDemo() {
    this.mode = 'demo';
    COLS.forEach((c) => { this.cache[c] = readLS(c, {}); });
    this.settings = readLS('settings', { companyName: APP.BRAND, whatsapp: APP.WHATSAPP_DEFAULT, lowStock: APP.LOW_STOCK });
    this.prices = Object.assign({ store: {}, dealer: {}, cost: {} }, readLS('prices', {}));
    if (!Object.keys(this.cache.users).length) {
      DEMO_USERS.forEach((u) => { this.cache.users[u.uid] = Object.assign({ blocked: false, createdAt: Date.now() }, u); });
      writeLS('users', this.cache.users);
    }
    const uid = localStorage.getItem(LS + 'demoUid');
    this.profile = uid && this.cache.users[uid] ? this.cache.users[uid] : null;
    this.ready = true;
    this.emit('*');
  },
  demoUsers() { return this.list('users').sort((a, b) => (a.role + a.name).localeCompare(b.role + b.name, 'ru')); },
  setDemoUser(uid) {
    if (!this.isDemo()) return;
    this.profile = uid ? this.cache.users[uid] || null : null;
    if (uid) localStorage.setItem(LS + 'demoUid', uid); else localStorage.removeItem(LS + 'demoUid');
    this.emit('auth');
  },
  resetDemo() { COLS.concat(['settings', 'prices', 'demoUid']).forEach((k) => localStorage.removeItem(LS + k)); },

  /* ----------------------------- FIREBASE ---------------------------- */
  async _initFirebase() {
    const [appM, authM, fsM] = await withTimeout(Promise.all([
      import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`),
    ]), 20000);
    this._fb = { appM, authM, fsM };
    this._app = appM.initializeApp(FIREBASE_CONFIG);
    this._auth = authM.getAuth(this._app);
    try {
      this._db = fsM.initializeFirestore(this._app, { localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }) });
    } catch (e) {
      this._db = fsM.getFirestore(this._app);
    }
    this.mode = 'live';
    try { await authM.getRedirectResult(this._auth); } catch (e) { this.error = e.message; }
    await new Promise((resolve) => {
      let first = true;
      authM.onAuthStateChanged(this._auth, async (u) => {
        try { await this._onAuth(u); } catch (e) { console.error(e); this.error = e.message; }
        if (first) { first = false; resolve(); }
      });
    });
    this.ready = true;
    this.emit('*');
  },

  _stop(list) { list.forEach((u) => { try { u(); } catch (e) { /* ignore */ } }); list.length = 0; },

  async _onAuth(u) {
    const { doc, getDoc, setDoc, updateDoc, onSnapshot } = this._fb.fsM;
    this.authUser = u;
    this._stop(this._roleUnsubs);
    if (this._profileUnsub) { this._profileUnsub(); this._profileUnsub = null; }
    COLS.filter((c) => c !== 'products').forEach((c) => { this.cache[c] = {}; });
    this.prices = { store: {}, dealer: {}, cost: {} };
    if (!this._publicUnsubs.length) this._subscribePublic();
    if (!u) { this.profile = null; this.emit('auth'); return; }

    const ref = doc(this._db, 'users', u.uid);
    const email = String(u.email || '').toLowerCase();
    const boot = ADMIN_EMAILS.map((x) => String(x).toLowerCase()).includes(email);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          uid: u.uid, name: u.displayName || (email ? email.split('@')[0] : 'Покупатель'), email,
          phone: u.phoneNumber || '', role: boot ? 'admin' : 'customer', blocked: false,
          createdAt: Date.now(), lastLoginAt: Date.now(),
        });
      } else {
        const patch = { lastLoginAt: Date.now() };
        if (boot && snap.data().role !== 'admin') patch.role = 'admin';
        updateDoc(ref, patch).catch(() => {});
      }
    } catch (e) { this.error = 'Профиль: ' + e.message; }

    await new Promise((resolve) => {
      let first = true;
      this._profileUnsub = onSnapshot(ref, (s) => {
        const prev = this.profile;
        this.profile = s.exists() ? Object.assign({}, s.data(), { uid: u.uid }) : null;
        if (!prev || !this.profile || prev.role !== this.profile.role || prev.blocked !== this.profile.blocked) this._subscribeRole();
        this.emit('auth');
        if (first) { first = false; resolve(); }
      }, (e) => { this.error = e.message; this.emit('status'); if (first) { first = false; resolve(); } });
    });
  },

  _subscribePublic() {
    const { collection, doc, onSnapshot } = this._fb.fsM;
    this._publicUnsubs.push(onSnapshot(collection(this._db, 'products'), (snap) => {
      const map = {}; snap.forEach((d) => { map[d.id] = Object.assign({}, d.data(), { id: d.id }); });
      this.cache.products = map; this.emit('products');
    }, (e) => { this.error = 'Каталог: ' + e.message; this.emit('status'); }));
    this._publicUnsubs.push(onSnapshot(doc(this._db, 'settings', 'public'), (s) => {
      this.settings = s.exists() ? s.data() : {}; this.emit('settings');
    }, () => {}));
  },

  _subscribeRole() {
    this._stop(this._roleUnsubs);
    COLS.filter((c) => c !== 'products').forEach((c) => { this.cache[c] = {}; });
    this.prices = { store: {}, dealer: {}, cost: {} };
    const p = this.profile;
    if (!p || p.blocked) { this.emit('*'); return; }
    const { collection, doc, query, where, orderBy, limit, onSnapshot } = this._fb.fsM;
    const col = (n) => collection(this._db, n);
    const err = (n) => (e) => { console.warn('[Мир Тачек] ' + n, e); this.error = `${n}: ${e.message}`; this.emit('status'); };
    const sub = (name, q) => this._roleUnsubs.push(onSnapshot(q, (snap) => {
      const map = {}; snap.forEach((d) => { map[d.id] = Object.assign({}, d.data(), { id: d.id }); });
      this.cache[name] = map; this.emit(name);
    }, err(name)));
    const price = (level) => this._roleUnsubs.push(onSnapshot(doc(this._db, 'priceLists', level), (s) => {
      this.prices[level] = (s.exists() && s.data().prices) || {}; this.emit('prices');
    }, err('prices.' + level)));
    const mine = (n) => query(col(n), where('participants', 'array-contains', p.uid));

    if (p.role === 'admin') {
      ['users', 'orders', 'documents', 'payments', 'dealerReports', 'contacts', 'requests'].forEach((n) => sub(n, col(n)));
      sub('views', query(col('views'), orderBy('at', 'desc'), limit(APP.VIEWS_LIMIT)));
      sub('movements', query(col('movements'), orderBy('at', 'desc'), limit(3000)));
      sub('audit', query(col('audit'), orderBy('at', 'desc'), limit(1500)));
      ['store', 'dealer', 'cost'].forEach(price);
      return;
    }
    ['orders', 'documents', 'payments'].forEach((n) => sub(n, mine(n)));
    if (p.role === 'dealer') {
      sub('users', query(col('users'), where('role', '==', 'store')));
      sub('dealerReports', query(col('dealerReports'), where('dealerUid', '==', p.uid)));
      price('store'); price('dealer');
    }
    if (p.role === 'store') price('store');
  },

  /* ------------------------------- Вход ------------------------------ */
  async signInGoogle() {
    const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = this._fb.authM;
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try { await signInWithPopup(this._auth, provider); } catch (e) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) await signInWithRedirect(this._auth, provider);
      else throw e;
    }
  },
  async signInEmail(email, password) { await this._fb.authM.signInWithEmailAndPassword(this._auth, email, password); },
  async signUpEmail(name, email, password) {
    const { createUserWithEmailAndPassword, updateProfile } = this._fb.authM;
    const cred = await createUserWithEmailAndPassword(this._auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await this.updateMyProfile({ name });
  },
  async resetPassword(email) { await this._fb.authM.sendPasswordResetEmail(this._auth, email); },
  async signOut() {
    if (this.isDemo()) { this.setDemoUser(''); return; }
    await this._fb.authM.signOut(this._auth);
  },
  async updateMyProfile(patch) {
    const p = this.profile;
    if (!p) return;
    const allowed = {};
    ['name', 'phone'].forEach((k) => { if (patch[k] != null) allowed[k] = String(patch[k]).trim(); });
    await this.commit([{ op: 'merge', col: 'users', id: p.uid, data: allowed }]);
  },

  /* ------------------------------ Запись ----------------------------- */
  /**
   * ops: { op:'set'|'merge'|'delete', col, id, data }
   *      { op:'inc', col, id, field, by, extra }
   *      { op:'price', level, id, value }   value=null — удалить цену
   */
  async commit(ops) {
    if (!ops.length) return;
    if (this.mode === 'error') throw new Error('Нет подключения к базе');
    if (this.isDemo()) { this._applyLocal(ops); return; }
    const { doc, writeBatch, increment, deleteField } = this._fb.fsM;
    const chunks = [];
    for (let i = 0; i < ops.length; i += 450) chunks.push(ops.slice(i, i + 450));
    for (const chunk of chunks) {
      const batch = writeBatch(this._db);
      chunk.forEach((o) => {
        if (o.op === 'price') {
          batch.set(doc(this._db, 'priceLists', o.level), { prices: { [o.id]: o.value == null ? deleteField() : num(o.value) } }, { merge: true });
          return;
        }
        const ref = doc(this._db, o.col, o.id);
        if (o.op === 'set') batch.set(ref, clean(o.data));
        else if (o.op === 'merge') batch.set(ref, clean(o.data), { merge: true });
        else if (o.op === 'delete') batch.delete(ref);
        else if (o.op === 'inc') batch.update(ref, Object.assign({ [o.field]: increment(num(o.by)) }, clean(o.extra || {})));
      });
      // При отсутствии сети Firestore держит запись в очереди и отправит позже
      await withTimeout(batch.commit(), 10000, () => ({ queued: true }));
    }
  },

  _applyLocal(ops) {
    const touched = new Set();
    ops.forEach((o) => {
      if (o.op === 'price') {
        if (o.value == null) delete this.prices[o.level][o.id]; else this.prices[o.level][o.id] = num(o.value);
        touched.add('prices'); return;
      }
      if (o.col === 'settings') {
        this.settings = o.op === 'set' ? clean(o.data) : Object.assign({}, this.settings, clean(o.data));
        touched.add('settings'); return;
      }
      const map = this.cache[o.col] || (this.cache[o.col] = {});
      if (o.op === 'set') map[o.id] = Object.assign(clean(o.data), { id: o.id });
      else if (o.op === 'merge') map[o.id] = Object.assign({}, map[o.id] || {}, clean(o.data), { id: o.id });
      else if (o.op === 'delete') delete map[o.id];
      else if (o.op === 'inc' && map[o.id]) map[o.id] = Object.assign({}, map[o.id], { [o.field]: num(map[o.id][o.field]) + num(o.by) }, clean(o.extra || {}));
      touched.add(o.col);
    });
    touched.forEach((c) => writeLS(c, c === 'prices' ? this.prices : c === 'settings' ? this.settings : this.cache[c]));
    if (this.profile && touched.has('users')) this.profile = this.cache.users[this.profile.uid] || null;
    this.emit([...touched].join(','));
  },

  /* ------------------------------ Файлы ------------------------------ */
  async uploadImage(file) {
    if (!file) return '';
    if (this.isLive()) {
      try {
        if (!this._storage) {
          const stM = await import(`${SDK}/firebase-storage.js`);
          this._fb.stM = stM;
          this._storage = stM.getStorage(this._app);
        }
        const { ref, uploadBytes, getDownloadURL } = this._fb.stM;
        const ext = ((file.name || '').split('.').pop() || 'jpg').toLowerCase();
        const r = ref(this._storage, `product-images/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext}`);
        await withTimeout(uploadBytes(r, file, { contentType: file.type || 'image/jpeg' }), 30000);
        return await getDownloadURL(r);
      } catch (e) {
        console.warn('[Мир Тачек] Storage недоступен, фото будет сохранено в карточке товара', e);
      }
    }
    return compressImage(file, this.isDemo() ? 600 : 800, this.isDemo() ? 0.72 : 0.8);
  },
};
