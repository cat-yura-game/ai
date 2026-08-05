# Настройка нового Cloudflare Worker

Старый Worker не нужен: создайте отдельные Worker и D1-базу специально для веб-нейросети.

## 1. Создайте D1

1. В Cloudflare откройте **Storage & Databases → D1 SQL Database → Create**.
2. Назовите базу, например `zashugannyy-kot-web`.
3. Откройте вкладку **Console**, вставьте всё содержимое файла `schema.sql` и нажмите **Execute**.

## 2. Создайте Worker

1. Откройте **Workers & Pages → Create → Worker**.
2. Назовите его, например `zashugannyy-kot-web-api`.
3. Откройте редактор кода, удалите пример Cloudflare и вставьте целиком `worker.js`.
4. Пока не нажимайте окончательную публикацию: сначала добавьте привязку и переменные.

## 3. Подключите D1

В настройках Worker откройте **Bindings → Add binding → D1 database**:

- Variable name: `DB`
- D1 database: созданная на первом шаге база

Имя `DB` важно: именно его использует код.

## 4. Добавьте секреты

В **Settings → Variables and Secrets** добавьте три секрета (тип **Secret**):

| Имя | Значение |
|---|---|
| `OPENROUTER_API_KEY` | Ваш API-ключ OpenRouter |
| `BOT_SERVICE_SECRET` | Длинная случайная строка для связи Telegram-бота с Worker |
| `SESSION_SECRET` | Другая длинная случайная строка для защиты кодов и сессий |

Для двух последних значений используйте разные случайные строки длиной хотя бы 32 символа. Никогда не добавляйте эти значения в `config.js`, HTML или публичный репозиторий.

## 5. Добавьте обычные переменные

| Имя | Пример | Назначение |
|---|---|---|
| `ALLOWED_ORIGIN` | `https://ваш-сайт.example` | Точный адрес сайта без `/` в конце. Для локального теста временно можно `*`. |
| `OPENROUTER_MODEL_LOW` | `provider/model-slug` | Реальная модель для режима Low |
| `OPENROUTER_MODEL_MEDIUM` | `provider/model-slug` | Реальная модель для Medium |
| `OPENROUTER_MODEL_HIGH` | `provider/model-slug` | Реальная модель для High |
| `WEB_LIMIT_PERIOD` | `daily` | `daily` — обновлять ежедневно; `subscription` — один лимит на текущий период платной подписки (Free остаётся ежедневным) |

Сайт не знает настоящих названий моделей: пользователь видит только Low, Medium и High. Все три режима расходуют один общий веб-лимит.

## 6. Опубликуйте и подключите сайт

1. Нажмите **Deploy**.
2. Откройте `https://ИМЯ-WORKER.workers.dev/health`. Должен прийти JSON со `status: "ok"`.
3. В файле сайта `config.js` замените адрес-заглушку:

```js
window.AI_WEB_CONFIG = {
  WORKER_URL: 'https://ИМЯ-WORKER.workers.dev',
};
```

4. Разместите файлы сайта на статическом хостинге и затем поставьте его точный адрес в `ALLOWED_ORIGIN`.

## 7. Подключите Telegram-бота

В окружение бота добавьте:

```text
AI_WEB_WORKER_URL=https://ИМЯ-WORKER.workers.dev
AI_WEB_SERVICE_SECRET=то_же_значение_что_BOT_SERVICE_SECRET
AI_WEB_SITE_URL=https://адрес-вашего-сайта
```

В готовом `bot.py` эти параметры называются так:

```text
AI_WEB_ENABLED=true
AI_WEB_SITE_URL=https://ai.ваш-домен.ru
AI_WEB_WORKER_URL=https://ИМЯ-WORKER.workers.dev
AI_WEB_SERVICE_SECRET=то_же_значение_что_BOT_SERVICE_SECRET
AI_WEB_TIMEOUT_SECONDS=15
```

Шаблон также лежит в корне проекта в файле `.env.web-ai.example`. Для собственного домена укажите его точный HTTPS-адрес без `/` в конце и то же значение используйте в `ALLOWED_ORIGIN` Worker.

Перенесите функции из `bot-integration-example.py` в код бота:

- при нажатии «Войти на сайте» вызывайте `request_web_login_code(...)`;
- после покупки, продления, подарка или окончания подписки вызывайте `sync_web_subscription(...)`.

Worker сам делает код одноразовым, хранит только HMAC-хеш, ограничивает срок кода 10 минут и создаёт сессию сайта на 30 дней.

## API, которое уже реализовано

| Метод и путь | Кто вызывает |
|---|---|
| `POST /internal/auth/code` | Telegram-бот, выдаёт одноразовый код |
| `POST /internal/subscription/sync` | Telegram-бот, обновляет тариф |
| `POST /api/auth/exchange` | Сайт, меняет код на сессию |
| `GET /api/me` | Сайт, получает профиль и остаток |
| `POST /api/chat` | Сайт, отправляет запрос в OpenRouter |
| `POST /api/logout` | Сайт, завершает сессию |

Лимит списывается атомарно перед обращением к модели. Если OpenRouter вернул ошибку или не успел ответить, запрос возвращается пользователю.
