/* =========================================================================
   Мир Тачек — конфигурация
   1. Firebase Console → Project settings → Your apps → Web app → Config.
      Вставьте значения в FIREBASE_CONFIG.
   2. Впишите email владельца в ADMIN_EMAILS (и тот же email в firestore.rules).
      Этот аккаунт при первом входе сразу станет администратором.
   Пока FIREBASE_CONFIG пустой, сайт работает в демо-режиме (данные в браузере).
   ========================================================================= */

export const USE_DEMO = false; // LIVE по умолчанию

export const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

// Email владельца (нижний регистр). Должен совпадать со списком в firestore.rules
export const ADMIN_EMAILS = [
  // 'owner@gmail.com',
];

export const APP = {
  BRAND: 'Мир Тачек',
  CURRENCY: '₸',
  WHATSAPP_DEFAULT: '', // запасной номер, основной задается в «Управление → Настройки»
  PAGE_SIZE: 12,        // карточки
  TABLE_SIZE: 15,       // строки таблиц
  VIEWS_LIMIT: 2000,    // сколько последних просмотров загружать админу
  LOW_STOCK: 5,         // порог «мало на складе» по умолчанию
  FIREBASE_SDK: '10.14.1',
};

export const isFirebaseConfigured = () =>
  Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
