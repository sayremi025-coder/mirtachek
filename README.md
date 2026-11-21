# Мир Тачек
Веб-магазин тачек для дома и изделий сварочной мастерской: каталог, корзина, Google-вход, заявки на изготовление, заказы и базовая панель администратора.

## Подключение
1. Создайте проект Firebase и Web App.
2. В Authentication включите Google и добавьте домен в Authorized domains.
3. Создайте Firestore и Storage.
4. Вставьте Web App config в `js/firebase.js`.
5. Установите Firebase CLI, выполните `firebase login`, `firebase use --add`.
6. Разверните правила и функцию: `firebase deploy --only firestore:rules,storage:rules,functions`.

## Первый администратор
Сначала войдите через Google. Найдите UID пользователя в Authentication → Users. Через доверенную среду Firebase Admin SDK установите `users/UID` поле `role: "admin"`. Не публикуйте service account key. После этого администратор может назначать `buyer`, `dealer`, `store` прямо из панели.

## Важно
В целях безопасности правила Firestore запрещают клиенту самостоятельно менять роль. Назначение роли из браузера уже вызывает callable Cloud Function `setUserRole`; функция проверяет роль администратора и записывает историю изменений. Не вставляйте секреты в HTML/JS и не публикуйте ключи service account. Каталог содержит примерные позиции и цены — замените их фактическими данными.