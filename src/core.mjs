/** 核心流程：描述 -> 模型 -> JSON 解析 -> KaTeX 校验 -> (失败则带错误重试一次) */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chat, config } from './providers.mjs'
import { buildSystem, SUBJECT_KEYS } from './prompt.mjs'
import { normalize, validate } from './validate.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = join(ROOT, '..', 'data', 'cache.json')
const CACHE_LIMIT = 500

let cache = null

function loadCache() {
  if (cache) return cache
  try {
    cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {}
  } catch {
    cache = {}
  }
  return cache
}

function saveCache() {
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true })
    const entries = Object.entries(cache)
    if (entries.length > CACHE_LIMIT) {
      cache = Object.fromEntries(entries.slice(-CACHE_LIMIT))
    }
    writeFileSync(CACHE_FILE, JSON.stringify(cache))
  } catch {
    /* 缓存失败不影响主流程 */
  }
}

const keyOf = (text, subject, model) =>
  createHash('sha256').update(`${model}\u0000${subject}\u0000${text}`).digest('hex').slice(0, 32)

/** 从模型输出里抠出 JSON 对象（容忍代码块、前后废话） */
export function parseModelJson(raw) {
  let s = String(raw ?? '').trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('输出里没有 JSON 对象')
  const obj = JSON.parse(s.slice(start, end + 1))
  return {
    latex: normalize(obj.latex ?? obj.formula ?? ''),
    display: obj.display !== false,
    confidence: typeof obj.confidence === 'number' ? obj.confidence : 0.5,
    note: typeof obj.note === 'string' ? obj.note : '',
    subject: typeof obj.subject === 'string' ? obj.subject : undefined,
  }
}

/**
 * @param {string} text 自然语言描述
 * @param {object} [opts]
 * @param {string} [opts.subject]
 * @param {string} [opts.model]
 * @param {boolean} [opts.cache]
 * @param {boolean} [opts.thinking]
 */
export async function nl2latex(text, opts = {}) {
  const input = String(text ?? '').trim()
  if (!input) throw new Error('描述不能为空')

  const subject = SUBJECT_KEYS.includes(opts.subject) ? opts.subject : 'math'
  const model = opts.model || config.model
  const useCache = opts.cache !== false

  const key = keyOf(input, subject, model)
  if (useCache) {
    const hit = loadCache()[key]
    if (hit) return { ...hit, cached: true }
  }

  const started = performance.now()
  const messages = [
    { role: 'system', content: buildSystem(subject) },
    { role: 'user', content: input },
  ]

  let first = await chat({ messages, model, thinking: !!opts.thinking })
  let parsed
  let compile = { ok: false, error: 'unparsed' }
  let retried = false
  let usage = { ...first.usage }

  try {
    parsed = parseModelJson(first.text)
    compile = validate(parsed.latex, { display: parsed.display })
  } catch (e) {
    compile = { ok: false, error: String(e.message || e) }
  }

  // 校验失败：带错误信息重试一次
  if (!compile.ok) {
    retried = true
    const retryMessages = [
      {
        role: 'system',
        content: buildSystem(subject, {
          retry: { error: compile.error, previous: parsed?.latex ?? first.text.slice(0, 200) },
        }),
      },
      { role: 'user', content: input },
    ]
    const second = await chat({ messages: retryMessages, model, thinking: false })
    usage = addUsage(usage, second.usage)
    parsed = parseModelJson(second.text)
    compile = validate(parsed.latex, { display: parsed.display })
  }

  const result = {
    input,
    subject,
    latex: parsed.latex,
    display: parsed.display,
    confidence: parsed.confidence,
    note: parsed.note,
    valid: compile.ok,
    error: compile.ok ? null : compile.error,
    html: compile.ok ? compile.html : null,
    retried,
    model,
    usage,
    ms: Math.round(performance.now() - started),
    cached: false,
  }

  if (useCache && compile.ok) {
    loadCache()[key] = { ...result, ms: result.ms }
    saveCache()
  }

  return result
}

function addUsage(a = {}, b = {}) {
  const out = { ...a }
  for (const k of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
    out[k] = (a[k] ?? 0) + (b[k] ?? 0)
  }
  return out
}
