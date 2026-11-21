# Мир Тачек PRO

Проект с нуля: каталог товаров для дома, сварочные изделия, индивидуальные заявки, заказы, CRM, склад и отчёты.

## Запуск
Откройте `index.html` через локальный веб-сервер (например, VS Code Live Server) или разместите файлы на HTTPS-хостинге.

## Подключение Firebase LIVE
1. Создайте проект в Firebase Console и зарегистрируйте Web App.
2. Вставьте параметры Web App в `js/firebase.js` вместо `YOUR_*`.
3. Включите Authentication (Google), Firestore Database и Storage.
4. Опубликуйте `firestore.rules` и `storage.rules`.
5. Установите Firebase CLI и выполните `firebase deploy --only firestore:rules,storage`.
6. Для функций: `cd functions && npm install`, затем `firebase deploy --only functions`.
7. Назначьте custom claim `admin=true` первому администратору доверенным способом через Firebase Admin SDK. Нельзя безопасно выдавать админскую роль из браузера.

## Важное про LIVE
`USE_DEMO = false`. Если конфигурация Firebase не заполнена, приложение честно работает в локальном режиме с localStorage-кэшем. Переключатель ролей предназначен для проверки интерфейса, а не для защиты доступа. В production следует использовать Firebase custom claims и callable Cloud Function `createOrder` для атомарного проведения заказов и списания остатков. Не считайте клиентский режим проведения защищённым бухгалтерским контуром до подключения этой функции.

## Импорт
Поля Excel/CSV/JSON: `name`, `type` (`product`/`service`), `category`, `description`, `retailPrice`, `storePrice`, `dealerPrice`, `costPrice`, `stock`, `imageUrl`, `isNew`.
