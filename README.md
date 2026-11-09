# dsh-plugin-drawing5

Подключает облачный MCP-сервер **drawing5** к [DeepSeek Harness](https://github.com/deepseek-harness/deepseek-harness):
после установки в модели появляются инструменты `mcp__drawing5__*` — навигация по
комплектам чертежей, поиск по чертежу, листы, штампы, загрузка PDF.

Клиенту не нужно ставить Python и править YAML: плагин сам добавляет в конфигурацию
одну строку `@deepseek-ai/dsh-mcp-client`.

## Что внутри

| Файл | Назначение |
|---|---|
| `package.json` | манифест бандла: `dsh.bundle.patch = ./cordis.patch.yml` |
| `cordis.patch.yml` | слой конфигурации: строка MCP-клиента + строка подсказки |
| `index.js` | вспомогательный плагин: пишет в лог адрес сервера и предупреждает, если не задан токен |
| `plugin-index.json` | пример индекса плагин-маркета (формат 1) для Discover |

## Установка

### Кнопка «Добавить плагин» (десктоп-приложение DSH)

1. **Plugins → Add plugin**.
2. В поле «Имя пакета плагина» вставьте спецификацию:

   | Источник | Что ввести |
   |---|---|
   | npm | `dsh-plugin-drawing5` (после публикации пакета) |
   | локальная папка | `C:\путь\к\dsh-plugin-drawing5` |
   | GitHub | `github:owner/dsh-plugin-drawing5` |
   | tarball | прямая ссылка `https://хост/plugins/dsh-plugin-drawing5-0.2.0.tgz` |

3. Реестр: **Официальный реестр npm** (`registry.npmjs.org`) — если пакет опубликован
   там; **Пользовательский адрес** — если вы отдаёте пакет через свой реестр
   (Artifactory/Nexus/Verdaccio). Для реестра с авторизацией креды кладутся в `~/.npmrc`.
4. **Установить** → перезапустите DSH (набор бандлов читается при старте профиля).

Прямая ссылка на tarball и адрес GitHub идут мимо реестра: такая машина
должна доставать их напрямую (или через прокси).

### CLI

```sh
dsh plugin --profile desktop add dsh-plugin-drawing5
dsh plugin --profile desktop add ./dsh-plugin-drawing5      # локальная папка
dsh plugin --profile desktop add ./dsh-plugin-drawing5.tgz  # tarball (npm pack)
dsh plugin --profile desktop remove dsh-plugin-drawing5
```

`dsh plugin` — это pnpm в каталоге профиля, поэтому работают и `update`, и `why`,
и `list`.

### Вкладка Discover

**Настройки → Плагины → Источники индекса** — поле для публичного URL файла
`plugin-index.json` (формат 1). После добавления плагин появляется в Discover
и ставится одной кнопкой.

Индекс нашего плагина раздаётся с сервера:

```text
https://drawing5.dev-bim.com/plugin-index.json
```

Источник в индексе — `git`: публичный репозиторий
`github.com/devbim26/dsh-plugin-drawing5` с зафиксированным коммитом.
Формат 1 допускает ещё и `npm` (пакет из реестра), но там нужен
опубликованный пакет; git-источник работает без него. Прямую ссылку на
tarball умеет принимать поле «Add plugin», но не Discover.

## Токен и адрес сервера

Сервер в облачном режиме требует персональный токен (его выдаёт владелец сервера,
см. `var/licenses.json` на стороне сервера).

```bat
setx DRAWING5_API_KEY <ваш токен>
setx DRAWING5_SERVER_URL https://drawing5.dev-bim.com
```

После `setx` приложение нужно перезапустить — переменные окружения читаются при
старте процесса. `DRAWING5_SERVER_URL` указывается **без** `/mcp` (его плагин
дописывает сам).

Если токен не задан, запросы к серверу вернут 401, а в лог DSH падает подсказка
от плагина `drawing5-hint`.

## Проверка, что всё поднялось

```sh
dsh --profile desktop --dump-config | grep -A8 "dsh-plugin-drawing5"
```

В выводе должен быть комментарий `# == dsh-plugin-drawing5` и строка
`serverName: drawing5`. В самой сессии агента инструменты видны как
`mcp__drawing5__list_sheets`, `mcp__drawing5__search`, `mcp__drawing5__get_sheet` и т. д.

## Как работать с чертежами

Типичный сценарий, который агент проведёт сам:

1. `list_developments` → `list_houses` — найти дом;
2. `list_documents` — что уже загружено и готово;
3. если комплекта нет — загрузить PDF из рабочей папки (агент умеет вызывать
   команды, бинарник не попадает в контекст модели):

   ```sh
   curl -F file=@<путь-к-pdf> \
        -H "Authorization: Bearer $DRAWING5_API_KEY" \
        "<DRAWING5_SERVER_URL>/documents?development_id=<id>&house_id=<id>"
   ```

   и дождаться `get_document` со статусом `ready` (обработка идёт в фоне);
4. `list_sheets` → `search` / `get_sheet`.

## Если плагин ставится поверх ручной настройки

Если в `~/.dsh/cordis.patch.yml` (или в `cordis.patch.yml` профиля) уже есть строка
`drawing5-mcp`, **удалите её**: плагин добавляет свою строку с тем же `serverName`,
а два MCP-клиента с одинаковым именем сервера конфликтуют (второй не поднимется,
в лог уйдёт ошибка). Плагин — это и есть «тот самый» ручной патч, только
оформленный как пакет.

Чтобы задать адрес или токен иначе, не правя плагин, переопределите строку
в профиле (обычная строка без `insert:` целиком заменяет строку плагина):

```yaml
- id: drawing5-mcp
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: drawing5
    transport: streamable-http
    url: 'https://drawing5.dev-bim.com/mcp'
    headers:
      Authorization: 'Bearer <токен>'
    toolCallTimeoutMs: 120000
```

## Публикация (для продажи)

```sh
npm publish            # из каталога пакета
```

Если на аккаунте включена двухфакторная аутентификация, публикация требует
подтверждения: `npm publish --otp <код>` из приложения-аутентификатора.

Для Discover-вкладки нужен публичный URL файла `plugin-index.json`
(формат 1, пример в комплекте) — его добавляют в
**Настройки → Плагины → Источники индекса**. Клиент увидит плагин
в Discover и сможет поставить его одной кнопкой; обновления приходят
через npm.

Индекс валидируется библиотекой `@deepseek-ai/dsh-plugin-market-index`
(`parseMarketIndex`).

## Ограничения

* Плагин поднимает **только клиент**. Сам MCP-сервер живёт на стороне владельца
  (нужен запущенный `mcp_server.py` в облачном режиме и туннель до него).
* Локальный режим сервера (`DRAWING5_MCP_MODE=local`) из плагина недоступен:
  в локальном режиме токена нет, а плагин работает через публичный адрес.
* `extract_stamps(pdf_path)` в облачном режиме недоступен (Путь на машине сервера
  наружу не отдаётся); облачный аналог — `extract_stamps(document_id)`.
