/**
 * 模型接入层：两种鉴权方式
 *  1. dsh    —— 复用本机 DSH 已登录的 DeepSeek 账号（无需 API Key）
 *  2. apikey —— 用环境变量里的 DEEPSEEK_API_KEY
 */

import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_BASE = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com'
const DEFAULT_MODEL = process.env.NL2TEX_MODEL || 'deepseek-flash'
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')

/** 从 DSH 凭据文件读取账号 token（只读，不打印） */
export function readDshToken() {
  const file = join(DSH_HOME, '.credentials.yaml')
  if (!existsSync(file)) return null
  const raw = readFileSync(file, 'utf8')
  const m = raw.match(/token:\s*(\S+)[\s\S]*?issuer:\s*(\S+)/)
  return m ? m[1] : null
}

/** 决定用哪种鉴权，返回 { kind, headers } */
export function resolveAuth() {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (apiKey) {
    return { kind: 'apikey', headers: { 'x-api-key': apiKey } }
  }
  const token = readDshToken()
  if (token) {
    return { kind: 'dsh', headers: { 'x-dsh-auth-token': token } }
  }
  throw new Error(
    '没有可用的凭据：请设置 DEEPSEEK_API_KEY，或在 DSH 中登录 DeepSeek 账号',
  )
}

/**
 * 调一次对话接口。
 * @param {object} opts
 * @param {Array<{role:string,content:string}>} opts.messages
 * @param {string} [opts.model]
 * @param {number} [opts.maxTokens]
 * @param {boolean} [opts.thinking]  是否开启思考模式（默认关）
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{text:string, usage:object, model:string, ms:number}>}
 */
export async function chat({
  messages,
  model = DEFAULT_MODEL,
  maxTokens = 512,
  thinking = false,
  timeoutMs = 30000,
  image = null,
}) {
  const auth = resolveAuth()

  // 有图片时，把最后一条 user 消息改成多模态内容块
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

  const body = {
    model,
    max_tokens: maxTokens,
    thinking: { type: thinking ? 'enabled' : 'disabled' },
    messages: finalMessages,
  }

  const t0 = performance.now()
  const res = await fetch(`${DEFAULT_BASE}/anthropic/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...auth.headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const ms = Math.round(performance.now() - t0)

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`模型接口 HTTP ${res.status}: ${detail.slice(0, 300)}`)
  }

  const data = await res.json()
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')

  return {
    text,
    usage: data.usage ?? {},
    model: data.model ?? model,
    auth: auth.kind,
    ms,
  }
}

export const config = { base: DEFAULT_BASE, model: DEFAULT_MODEL }
