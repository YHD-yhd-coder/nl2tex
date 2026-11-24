/** 核心流程：描述/图片 -> 模型 -> JSON 解析 -> KaTeX 校验 -> (失败则带错误重试一次) */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chat, config } from './providers.mjs'
import { buildOcrSystem, buildSystem, SUBJECT_KEYS } from './prompt.mjs'
import { normalize, validate } from './validate.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = join(ROOT, '..', 'data', 'cache.json')
const CACHE_LIMIT = 500
const MAX_ALTERNATIVES = 3

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
    if (entries.length > CACHE_LIMIT) cache = Object.fromEntries(entries.slice(-CACHE_LIMIT))
    writeFileSync(CACHE_FILE, JSON.stringify(cache))
  } catch {
    /* 缓存失败不影响主流程 */
  }
}

const keyOf = (...parts) =>
  createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32)

/** 从模型输出里抠出 JSON 对象（容忍代码块、前后废话） */
export function parseModelJson(raw) {
  let s = String(raw ?? '').trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('输出里没有 JSON 对象')
  const obj = JSON.parse(s.slice(start, end + 1))

  const alternatives = Array.isArray(obj.alternatives)
    ? obj.alternatives
        .filter((a) => a && typeof a.latex === 'string' && a.latex.trim())
        .slice(0, MAX_ALTERNATIVES)
        .map((a) => ({
          label: typeof a.label === 'string' && a.label.trim() ? a.label.trim().slice(0, 24) : '另一种写法',
          latex: normalize(a.latex),
        }))
    : []

  return {
    latex: normalize(obj.latex ?? obj.formula ?? ''),
    display: obj.display !== false,
    confidence: typeof obj.confidence === 'number' ? obj.confidence : 0.5,
    note: typeof obj.note === 'string' ? obj.note : '',
    alternatives,
  }
}

/** 校验候选列表：以主公式开头，去重，最多 3 个，保留能编译的 */
function buildAlternatives(primaryLatex, primaryHtml, list) {
  const out = []
  const seen = new Set()
  const push = (label, latex, html) => {
    const key = latex.replace(/\s+/g, '')
    if (!latex || seen.has(key)) return
    seen.add(key)
    out.push({ label, latex, html })
  }

  if (primaryHtml) push('推荐', primaryLatex, primaryHtml)

  for (const alt of list) {
    if (out.length >= MAX_ALTERNATIVES) break
    const v = validate(alt.latex, { display: true })
    if (v.ok) push(alt.label, alt.latex, v.html)
  }
  return out
}

function addUsage(a = {}, b = {}) {
  const out = { ...a }
  for (const k of [
    'input_tokens',
    'output_tokens',
    'cache_read_input_tokens',
    'cache_creation_input_tokens',
  ]) {
    out[k] = (a[k] ?? 0) + (b[k] ?? 0)
  }
  return out
}

/**
 * 统一生成流程。
 * @param {object} p
 * @param {string} p.text
 * @param {string} p.subject
 * @param {string} p.model
 * @param {boolean} p.thinking
 * @param {{data:string, mediaType:string}|null} p.image
 */
async function generate({ text, subject, model, thinking, image }) {
  const system = image ? buildOcrSystem(subject) : buildSystem(subject)
  const userText = image ? '识别图片中的公式。' : text

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: userText },
  ]

  const started = performance.now()
  const first = await chat({ messages, model, thinking, image })
  let usage = { ...first.usage }
  let parsed
  let compile

  try {
    parsed = parseModelJson(first.text)
    compile = validate(parsed.latex, { display: parsed.display })
  } catch (e) {
    compile = { ok: false, error: String(e.message || e) }
  }

  let retried = false
  if (!compile.ok) {
    retried = true
    const retryMessages = [
      {
        role: 'system',
        content: image
          ? buildOcrSystem(subject)
          : buildSystem(subject, {
              retry: { error: compile.error, previous: parsed?.latex ?? first.text.slice(0, 200) },
            }),
      },
      { role: 'user', content: userText },
    ]
    const second = await chat({ messages: retryMessages, model, thinking: false, image })
    usage = addUsage(usage, second.usage)
    parsed = parseModelJson(second.text)
    compile = validate(parsed.latex, { display: parsed.display })
  }

  return {
    parsed,
    compile,
    usage,
    retried,
    model,
    ms: Math.round(performance.now() - started),
  }
}

function finalize({ input, subject, gen, mode }) {
  const { parsed, compile, usage, retried, model, ms } = gen
  return {
    input,
    mode,
    subject,
    latex: parsed.latex,
    display: parsed.display,
    confidence: parsed.confidence,
    note: parsed.note,
    valid: compile.ok,
    error: compile.ok ? null : compile.error,
    html: compile.ok ? compile.html : null,
    alternatives: buildAlternatives(parsed.latex, compile.ok ? compile.html : null, parsed.alternatives),
    retried,
    model,
    usage,
    ms,
    cached: false,
  }
}

/**
 * 自然语言 -> LaTeX
 * @param {string} text
 * @param {{subject?:string, model?:string, cache?:boolean, thinking?:boolean}} [opts]
 */
export async function nl2latex(text, opts = {}) {
  const input = String(text ?? '').trim()
  if (!input) throw new Error('描述不能为空')

  const subject = SUBJECT_KEYS.includes(opts.subject) ? opts.subject : 'math'
  const model = opts.model || config.model
  const useCache = opts.cache !== false

  const key = keyOf('text', model, subject, input)
  if (useCache) {
    const hit = loadCache()[key]
    if (hit) return { ...hit, cached: true }
  }

  const gen = await generate({ text: input, subject, model, thinking: !!opts.thinking, image: null })
  const result = finalize({ input, subject, gen, mode: 'text' })

  if (useCache && result.valid) {
    loadCache()[key] = result
    saveCache()
  }
  return result
}

/**
 * 图片 -> LaTeX
 * @param {{data:string, mediaType?:string}} image  base64（不带 data: 前缀）
 * @param {{subject?:string, model?:string, thinking?:boolean}} [opts]
 */
export async function nl2latexFromImage(image, opts = {}) {
  if (!image?.data) throw new Error('缺少图片数据')
  const data = String(image.data).replace(/^data:[^;]+;base64,/, '')
  if (data.length > 12 * 1024 * 1024) throw new Error('图片过大（base64 上限 12MB）')

  const subject = SUBJECT_KEYS.includes(opts.subject) ? opts.subject : 'math'
  const model = opts.model || config.model

  const gen = await generate({
    text: '',
    subject,
    model,
    thinking: !!opts.thinking,
    image: { data, mediaType: image.mediaType || 'image/png' },
  })

  return finalize({
    input: `[图片 ${image.mediaType || 'image/png'} ${Math.round((data.length * 3) / 4 / 1024)}KB]`,
    subject,
    gen,
    mode: 'image',
  })
}
