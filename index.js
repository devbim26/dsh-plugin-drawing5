/**
 * dsh-plugin-drawing5 — подключение MCP-сервера drawing5 к DeepSeek Harness.
 *
 * Плагин делает две вещи:
 *
 * 1. Регистрирует справочник `drawing5-mcp` в каталоге скиллов хоста.
 *    Тело скилла лежит рядом — в `skills/drawing5-mcp/SKILL.md` — и читается
 *    при старте, поэтому установка пакета даёт и инструменты MCP, и
 *    справочник: пользователю не нужно ничего копировать руками.
 *
 * 2. Проверяет, что токен и адрес сервера заданы, и пишет в лог понятную
 *    подсказку, если они не настроены.
 *
 * Строка MCP-клиента живёт в `cordis.patch.yml`: этот модуль — только
 * подсказка и скилл.
 */
import { readFile } from 'node:fs/promises'

export const name = 'drawing5'

/** Сервис каталога скиллов нужен, чтобы зарегистрировать справочник. */
export const inject = ['skills']

const DEFAULT_SERVER_URL = 'https://drawing5.dev-bim.com'
const DEFAULT_TOKEN_ENV = 'DRAWING5_API_KEY'

/** Справочник лежит рядом с этим файлом — путь отсчитывается от модуля. */
const SKILL_URL = new URL('./skills/drawing5-mcp/SKILL.md', import.meta.url)

/**
 * Разобрать frontmatter скилла: имя, описание и тело.
 *
 * Разбор намеренно простой: скилл — это markdown с заголовком `---\n`,
 * парой полей `имя: значение` и телом после закрывающего `---`. Сложный
 * YAML здесь не нужен, а лишняя зависимость в пакете — тоже.
 *
 * @param {string} text содержимое SKILL.md.
 * @returns {{name: string, description: string, content: string}|null}
 *   разобранный скилл либо null, если frontmatter не найден.
 */
export function parseSkill(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (match === null) return null
  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (key === '' || line.startsWith(' ')) continue
    fields[key] = line.slice(separator + 1).trim()
  }
  if (fields.name === undefined || fields.description === undefined) return null
  return {
    name: fields.name,
    description: fields.description,
    content: match[2].trim(),
  }
}

/**
 * Подключить плагин к хосту.
 *
 * @param {object} ctx контекст Cordis.
 * @param {{serverUrl?: string, tokenEnv?: string}} config настройки строки.
 */
export async function apply(ctx, config = {}) {
  const serverUrl = config.serverUrl ?? DEFAULT_SERVER_URL
  const tokenEnv = config.tokenEnv ?? DEFAULT_TOKEN_ENV

  ctx.logger.info(`drawing5: MCP-сервер ${serverUrl}/mcp`)

  if (!process.env[tokenEnv]) {
    ctx.logger.warn(
      `drawing5: не задана переменная окружения ${tokenEnv} — сервер вернёт 401. ` +
        `Задайте её (Windows: setx ${tokenEnv} <токен>) и перезапустите DSH.`,
    )
  }

  await registerSkill(ctx)
}

/**
 * Зарегистрировать справочник по инструментам в глобальном слое каталога.
 *
 * Если справочник уже есть — в `~/.dsh/skills` или в `~/.agents/skills`, —
 * он не регистрируется заново: копия пользователя новее и он её не
 * перекрывает. Ошибка чтения или разбора не должна ломать старт хоста: без
 * справочника агент всё равно видит описания инструментов из `tools/list`.
 *
 * @param {object} ctx контекст Cordis.
 */
async function registerSkill(ctx) {
  let skill
  try {
    const text = await readFile(SKILL_URL, 'utf8')
    skill = parseSkill(text)
  } catch (error) {
    ctx.logger.warn(`drawing5: справочник drawing5-mcp не прочитан: ${String(error)}`)
    return
  }
  if (skill === null) {
    ctx.logger.warn('drawing5: не удалось разобрать frontmatter скилла drawing5-mcp')
    return
  }

  const existing = await ctx.skills.list()
  if (existing.some(entry => entry.name === skill.name)) {
    ctx.logger.info(`drawing5: справочник ${skill.name} уже есть в каталоге`)
    return
  }

  ctx.skills.register({
    name: skill.name,
    description: skill.description,
    content: skill.content,
    source: 'runtime',
  })
  ctx.logger.info(`drawing5: справочник ${skill.name} зарегистрирован`)
}
