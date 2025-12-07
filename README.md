# Desktop-клиент для продажи валюты

Папка содержит полнофункциональный настольный/CLI-клиент, который общается с FastAPI-бэкендом теми же REST-эндпоинтами, что и мобильное приложение. Клиент умеет авторизовываться, получать дашборд и доступные активы, предварительно считать сделку и исполнять продажу валюты по запросу пользователя или по команде, пришедшей с телефона.


### Модули 

| Модуль | Что делает |
| --- | --- |
| `cli.py` | Все команды CLI (status, login, logout, dashboard, sell, poll). Создает контекст, подключает API, настраивает логирование. |
| `config.py` | Описывает `AppConfig`, читает `config.json`, поддерживает переопределение переменными окружения `KURSACH_*`. |
| `state.py` | Persistence-слой для `device_state.json`: токен сессии, id последней команды, время последнего опроса. |
| `api.py` | Обертка над `httpx.Client`, все REST-методы (`/auth/login`, `/crypto/sell/overview`, `/crypto/device-commands/*` и т.д.) и обработка ошибок. |
| `commands.py` | Реализует обработчик межустройственных команд (`DeviceCommandDispatcher`) и вспомогательные принты дашборда/продажи. |
| `poller.py` | Цикл опроса бэкенда (`CommandPoller`). |


## Архитектура взаимодействия с сервером

Клиент всегда говорит с REST-бэкендом и повторяет ту же доменную модель, что и мобильное приложение.

| Действие | HTTP-метод и путь | Где используется |
| --- | --- | --- |
| Авторизация ПК | `POST /auth/login` | Команда `login`, а также действие `LOGIN_ON_DESKTOP` сохраняют `access_token`. |
| Выход | `POST /auth/logout` | Команда `logout`, очищает токен локально. |
| Основной дашборд | `GET /crypto/dashboard` | Команда `dashboard`, обработчик `OPEN_DESKTOP_DASHBOARD`. |
| Данные для продажи | `GET /crypto/sell/overview` | Команды `dashboard`, `sell overview`, `OPEN_DESKTOP_DASHBOARD`. |
| Предпросмотр продажи | `POST /crypto/sell/preview` | `sell preview`, `sell execute` (до подтверждения), `EXECUTE_DESKTOP_SELL`. |
| Исполнение продажи | `POST /crypto/sell` | `sell execute`, обработчик `EXECUTE_DESKTOP_SELL`. |
| История операций | `GET /crypto/transactions` | Метод зарезервирован для расширения ПК-интерфейса (уже есть в `api.py`). |
| Опрос команд | `GET /crypto/device-commands/poll` | Главный поллер связывает мобильное приложение и ПК. |
| Подтверждение | `POST /crypto/device-commands/{id}/ack` | После успешной или неуспешной обработки отправляется `ACKNOWLEDGED`/`FAILED`. |


## Потоки и сценарии

1. **Старт клиента.** `python -m kursach_desktop status` проверяет конфигурацию и наличие токена (команда `status` в `cli.py`).
2. **Авторизация.** Команда `login` вызывает `KursachApi.login`, получает JWT и через `DesktopStateStore` пишет его в `device_state.json`. Токен можно прислать и с телефона через действие `LOGIN_ON_DESKTOP` — тогда `commands.py` сохранит его автоматически.
3. **Получение дашборда.** `python -m kursach_desktop dashboard` делает два GET запроса (`/crypto/dashboard`, `/crypto/sell/overview`) и печатает портфель, ликвидные активы и PnL.
4. **Продажа валюты вручную.** Подкоманды `sell`:
   - `sell overview` — список активов с текущей ценой и максимальным количеством.
   - `sell preview --asset-id bitcoin --quantity 0.25` — расчет сделки (`POST /crypto/sell/preview`).
   - `sell execute --asset-id bitcoin --quantity 0.25` — исполнение сделки (`POST /crypto/sell`). Флаг `--skip-preview` отключает предварительный шаг, но по умолчанию предпросмотр выводится вместе с подтверждением.
5. **Продажа по команде с телефона.** Запустите `python -m kursach_desktop poll`. `CommandPoller` из `poller.py` каждые `poll_interval_seconds` (5) секунд запрашивает `GET /crypto/device-commands/poll`, печатает каждую команду и передает ее в `DeviceCommandDispatcher`. Поддерживаемые действия:
   - `LOGIN_ON_DESKTOP` — сохранить токен, присланный мобильным клиентом.
   - `OPEN_DESKTOP_DASHBOARD` — вывести дашборд и данные для продажи, чтобы дизайнеры видели живой payload.
   - `EXECUTE_DESKTOP_SELL` — выполнить продажу: предпросмотр, запрос подтверждения (или авто-подтверждение, если включен `auto_confirm_sales` или передан флаг `--auto-confirm`), затем `POST /crypto/sell`.
6. **Подтверждение команд.** После выполнения отправляем `POST /crypto/device-commands/{id}/ack` со статусом `ACKNOWLEDGED`. При ошибке (`CommandError` или `ApiError`) статус `FAILED`, что видно в консоли и логах.


## Быстрый старт

```powershell
cd ../kursach_desktop
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy config.example.json config.json
python -m kursach_desktop status
python -m kursach_desktop login
python -m kursach_desktop poll
```

Дальше можно:
- Запрашивать данные (`dashboard`, `sell overview`) и использовать их для отрисовки макетов.
- Эмулировать продажу валюты через CLI (`sell preview/execute`).
