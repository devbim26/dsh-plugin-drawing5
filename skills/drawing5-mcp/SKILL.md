---
name: drawing5-mcp
description: Работа с комплектами чертежей АР через MCP-сервер drawing5. Инструменты mcp__drawing5__* — навигация по комплектам, поиск по тексту чертежа, чтение листов, картинки листов, загрузка PDF. Используй, когда пользователь спрашивает о чертеже, листе, штампе, комплекте, разрезе или просит найти что-то на чертеже.
---

# Чертежи АР через MCP drawing5

Сервер `drawing5` отдаёт извлечённые данные чертежей: листы комплекта,
текст, сущности и картинки листов. Все инструменты видны модели как
`mcp__drawing5__search`, `mcp__drawing5__get_sheet` и так далее — с
префиксом `mcp__drawing5__`.

Два режима сервера:

* **local** — один локальный PDF, 6 инструментов: `list_sheets`, `search`,
  `get_sheet`, `get_sheet_images`, `extract_stamps`, `get_health`;
* **cloud** — мультиарендный, 11 инструментов: к тем шести добавляются
  `list_developments`, `list_houses`, `list_documents`, `upload_pdf`,
  `get_document`.

Инструменты `list_developments`, `list_houses`, `list_documents`,
`upload_pdf`, `get_document` есть только в облачном режиме. Если они
недоступны, работай с локальным комплектом.

## Карта инструментов

| Инструмент | Когда звать | Что возвращает | Что звать дальше |
|---|---|---|---|
| `list_developments` | облако: нужен `development_id` | `{company, developments:[{development_id, name}]}` | `list_houses` |
| `list_houses` | облако: нужен `house_id` | `{houses:[{house_id, name}]}` | `list_documents` |
| `list_documents` | облако: что уже загружено | `{documents:[{document_id, status, pages_done, pages_total, sheets_total, error}]}` | `get_document` → `list_sheets` |
| `upload_pdf` | облако: комплекта нет | `{document_id, status:"processing"}` | `get_document` до `ready` |
| `get_document` | облако: дождаться обработки | `{status, pages_done, pages_total, sheets_total, error}` | при `ready` — `list_sheets` |
| `list_sheets` | навигация по комплекту | `{sheets:[{sheet_no, title, page}], sheets_total}` | `get_sheet` / `get_sheet_images` |
| `search` | известно, что искать; номер листа неизвестен | `{results:[{sheet_no, page, snippet}], total}` | `get_sheet(sheet=…)` |
| `get_sheet` | известен `sheet_no` | `{results:{"<sheet_no>":{page, title, entities, words}}}` | `get_sheet_images` |
| `get_sheet_images` | нужно посмотреть чертёж глазами | преамбула JSON + картинки PNG/JPEG | вернуться к `search`/`list_sheets` |
| `extract_stamps` | редко: сводка по штампам | markdown-таблица | `list_sheets` (быстрее) |
| `get_health` | диагностика, проверка квоты | `{status, version, mode, license, quota}` | ничего |

## Сценарий A: прочитать готовый комплект

1. `list_documents(house_id=…)` (облако) — найти комплект со статусом
   `ready`. В локальном режиме шаг пропускается.
2. `list_sheets()` — номера листов, названия, страницы PDF.
3. `search(query="крючок")` — найти интересные листы; в ответе у каждого
   результата есть `sheet_no` и `page`.
4. `get_sheet(sheet="3")` — полное содержимое листа: `entities` (сущности
   чертежа) и `words` (сырой текстовый слой из PDF).
5. `get_sheet_images(sheet="3")` — если по тексту не понятно, что на
   чертеже.

## Сценарий B: загрузить новый комплект

1. `list_developments()` — застройки компании.
2. `list_houses(development_id=…)` — дома.
3. Загрузка PDF. Предпочтительный путь — REST-команда из рабочей папки
   агента: бинарник PDF не должен попадать в контекст модели.

   ```bash
   curl -F file=@«Квартал 1, дом 3.4 — АР.pdf» \
        -H "Authorization: Bearer $DRAWING5_API_KEY" \
        "$DRAWING5_SERVER_URL/documents?development_id=dev_kvartal_1&house_id=house_3_4"
   # → {"document_id": "doc_…", "status": "processing"}
   ```

   `upload_pdf` — запасной путь: тот же результат, но PDF уходит в
   base64 и занимает контекст.
4. `get_document(document_id)` — ждать статуса `ready`. Обработка 100
   листов занимает минуты; поля `pages_done`/`pages_total` показывают
   прогресс.
5. Перейти к сценарию A с найденным `document_id`.

## `sheet_no` — это не номер страницы

`sheet_no` — номер листа из штампа (`"3"`, `"12"`). `page` — номер
страницы PDF, где этот лист физически лежит. Это разные вещи, и их
путание даёт «лист не найден».

`list_sheets` и `search` возвращают оба поля. В `get_sheet` и
`get_sheet_images` передаётся `sheet_no` (параметр `sheet`), а не
`page`. Параметр `page`/`pages` в `get_sheet_images` — прямой доступ к
странице PDF, минуя штамп.

## Ошибки

Ошибка приходит как `isError: true` с текстом `HTTP <код>: <текст>`.

| Код | Что значит | Что делать |
|---|---|---|
| 401 | токен не передан, неизвестен или лицензия истекла | взять новый токен у владельца сервера; проверить `DRAWING5_API_KEY` |
| 404 | дом, документ или лист не найден | проверить `list_houses`, `list_documents`, `list_sheets`; у 404 по листу в теле бывает `available_sheets` |
| 409 | несколько листов с одним `sheet_no` | в теле `candidates` — страницы-кандидаты; уточнить номер листа |
| 413 | PDF больше лимита `max_pdf_mb` | уменьшить файл или поднять квоту |
| 429 | исчерпана суточная квота запросов или лимит документов | подождать суток или поднять квоту |
| 422 | нужен PDF для `include=raw`, но он недоступен | запросить без `include` или использовать `entities_only` |

## Лимиты

* `get_sheet_images` — не более 5 листов за вызов.
* `get_sheet` — до 20 листов за вызов через `sheets`, но в облачном
  режиме ответ **не обрезается**: пачка листов даёт очень большой
  ответ. Запрашивай по одному листу.
* `extract_stamps` разбирает PDF целиком и может не уложиться в таймаут
  вызова инструмента. Для быстрых ответов — `list_sheets` и `search`.
* Обработка комплектов идёт одним потоком: если сервер уже считает
  большой набор, следующий комплект встанет в очередь.
* В локальном режиме `get_sheet` обрезает ответ на 5 МБ и добавляет
  `degraded: true`.

## Словарь

* **комплект** — один PDF-файл со всеми листами чертежа.
* **лист** — одна страница комплекта с листом чертежа.
* **штамп** — таблица в углу листа с номером листа, названием и
  подписями; источник `sheet_no`.
* **сущность** — распознанный объект чертежа (таблица, текст, линия)
  с типом, подтипом и привязкой к странице.
* **`sheet_no`** — номер листа из штампа; `page` — страница PDF.

## Чего не делать

* Не грузить PDF через `upload_pdf`, пока можно загрузить через `curl`:
  base64 занимает контекст модели.
* Не запрашивать пачку листов в `get_sheet` без нужды.
* Не полагаться на `extract_stamps` для быстрых ответов.
* Не выдумывать `development_id`, `house_id` и `document_id` — брать их
  из `list_developments`, `list_houses`, `list_documents`.
* Не путать `sheet_no` и `page`.
