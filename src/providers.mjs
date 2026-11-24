/**
 * 模型接入层
 * 支持两种线协议：
 *   - anthropic: POST {base}/anthropic/v1/messages   （DeepSeek、DSH 账号）
 *   - openai   : POST {base}/chat/completions        （Kimi、GLM、Qwen、OpenRouter、自定义）
 * 鉴权优先级：用户传入 > 环境变量 > 本机 DSH 登录态
 */

import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getPreset } from './presets.mjs'

const DEFAULT_MODEL = process.env.NL2TEX_MODEL || 'deepseek-flash'
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')

/** 从 DSH 凭据文件读取账号 token（只读，不打印） */
export function readDshToken() {
  try {
    const file = join(DSH_HOME, '.credentials.yaml')
    if (!existsSync(file)) return null
    const raw = readFileSync(file, 'utf8')
    const m = raw.match(/token:\s*(\S+)[\s\S]*?issuer:\s*(\S+)/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/**
 * 解析一次请求用哪套配置。
 * @param {{providerId?:string, baseUrl?:string, format?:string, model?:string, apiKey?:string}} [cfg]
 */
export function resolveAuth(cfg = {}) {
  const preset = getPreset(cfg.providerId || 'deepseek')

  if (preset.keyless || cfg.providerId === 'dsh') {
    const token = readDshToken()
    if (token) return { kind: 'dsh', token, headers: { 'x-dsh-auth-token': token } }
    throw new Error('本机没有 DSH 登录态，请改用自己的 API Key')
  }

  const explicit = (cfg.apiKey || '').trim()
  if (explicit) {
    return {
      kind: 'user-key',
      headers: preset.format === 'openai' ? { authorization: `Bearer ${explicit}` } : { 'x-api-key': explicit },
    }
  }

  const envKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (envKey) {
    return { kind: 'env-key', headers: { 'x-api-key': envKey } }
  }

  const token = readDshToken()
  if (token) return { kind: 'dsh', token, headers: { 'x-dsh-auth-token': token } }

  throw new Error('没有可用的 Key：请在右上角 ⚙ 设置里填入自己的 API Key')
}

/**
 * 统一对话调用。
 * @param {object} opts
 * @param {Array<{role:string,content:string}>} opts.messages
 * @param {{id?:string, format?:string, baseUrl?:string, model?:string, apiKey?:string}} [opts.provider]
 */
export async function chat({
  messages,
  provider = {},
  maxTokens = 512,
  thinking = false,
  timeoutMs = 60000,
  image = null,
}) {
  const preset = getPreset(provider.id || 'deepseek')
  const format = provider.format || preset.format
  const baseUrl = (provider.baseUrl || preset.baseUrl || '').replace(/\/+$/, '')
  const model = provider.model || preset.defaultModel || DEFAULT_MODEL
  if (!baseUrl) throw new Error('缺少 baseUrl，请在设置里填写')

  const auth = resolveAuth({ ...provider, format })
  const started = performance.now()

  const res =
    format === 'openai'
      ? await callOpenAI({ baseUrl, model, messages, maxTokens, auth, timeoutMs, image })
      : await callAnthropic({ baseUrl, model, messages, maxTokens, thinking, auth, timeoutMs, image })

  const ms = Math.round(performance.now() - started)
  if (!res.ok) {
    throw new Error(`模型接口 HTTP ${res.status}: ${String(res.text).slice(0, 300)}`)
  }
  return { ...res.data, auth: auth.kind, ms, model, baseUrl, format }
}

async function callAnthropic({ baseUrl, model, messages, maxTokens, thinking, auth, timeoutMs, image }) {
  const finalMessages = image
    ? messages.map((m, i) =>
        i === messages.length - 1 && m.role === 'user'
          ? {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: image.mediaType || 'image/png',
                    data: image.data,
                  },
                },
                { type: 'text', text: m.content },
              ],
            }
          : m,
      )
    : messages

  const res = await fetch(`${baseUrl}/anthropic/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...auth.headers,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      thinking: { type: thinking ? 'enabled' : 'disabled' },
      messages: finalMessages,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) return { ok: false, status: res.status, text: await res.text() }
  const data = await res.json()
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return { ok: true, data: { text, usage: data.usage ?? {} } }
}

async function callOpenAI({ baseUrl, model, messages, maxTokens, auth, timeoutMs, image }) {
  // OpenAI 格式的图片消息：content 数组 + image_url
  const finalMessages = image
    ? messages.map((m, i) =>
        i === messages.length - 1 && m.role === 'user'
          ? {
              role: 'user',
              content: [
                { type: 'text', text: m.content },
                {
                  type: 'image_url',
                  image_url: { url: `data:${image.mediaType || 'image/png'};base64,${image.data}` },
                },
              ],
            }
          : m,
      )
    : messages

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...auth.headers,
    },
    body: JSON.stringify({
      model,
      messages: finalMessages,
      max_tokens: maxTokens,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) return { ok: false, status: res.status, text: await res.text() }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content ?? ''
  const u = data.usage ?? {}
  return {
    ok: true,
    data: {
      text: typeof text === 'string' ? text : JSON.stringify(text),
      usage: {
        input_tokens: u.prompt_tokens ?? 0,
        output_tokens: u.completion_tokens ?? 0,
        cache_read_input_tokens: u.prompt_tokens_details?.cached_tokens ?? 0,
      },
    },
  }
}
