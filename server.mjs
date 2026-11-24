#!/usr/bin/env node
/** 本地服务：网页 UI + JSON 接口（只监听 127.0.0.1） */

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize as pathNormalize } from 'node:path'
import { fileURLToPath } from 'node:url'

import { nl2latex, nl2latexFromImage } from './src/core.mjs'
import { resolveAuth } from './src/providers.mjs'
import { PRESETS, PRESET_KEYS } from './src/presets.mjs'
import { SUBJECT_KEYS } from './src/prompt.mjs'
import { hasMhchem } from './src/validate.mjs'
import { toMathML, toOMML } from './src/export.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8777)
const KATEX_DIR = join(ROOT, 'node_modules', 'katex', 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

async function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(body)
}

async function serveFile(res, file) {
  try {
    const s = await stat(file)
    if (!s.isFile()) throw new Error('not file')
    const data = await readFile(file)
    const ext = extname(file)
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
    })
    res.end(data)
  } catch {
    await send(res, 404, JSON.stringify({ error: 'not found' }))
  }
}

async function readJson(req, limit = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const path = url.pathname

  try {
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      return serveFile(res, join(ROOT, 'public', 'index.html'))
    }

    if (req.method === 'GET' && path.startsWith('/katex/')) {
      const rel = pathNormalize(path.slice('/katex/'.length))
      if (rel.includes('..')) return send(res, 400, '{"error":"bad path"}')
      return serveFile(res, join(KATEX_DIR, rel))
    }

    if (req.method === 'GET' && path === '/api/health') {
      let auth = 'none'
      try {
        auth = resolveAuth().kind
      } catch {}
      return send(
        res,
        200,
        JSON.stringify({
          ok: true,
          auth,
          presets: PRESET_KEYS,
          subjects: SUBJECT_KEYS,
          mhchem: hasMhchem(),
          version: '0.4.0',
        }),
      )
    }

    if (req.method === 'GET' && path === '/api/presets') {
      return send(res, 200, JSON.stringify({ presets: PRESETS, order: PRESET_KEYS }))
    }

    if (req.method === 'POST' && path === '/api/nl2tex') {
      const body = await readJson(req)
      if (!body.text || typeof body.text !== 'string') {
        return send(res, 400, JSON.stringify({ error: '缺少 text 字段' }))
      }
      const result = await nl2latex(body.text, {
        subject: body.subject,
        thinking: !!body.thinking,
        cache: body.cache !== false,
        provider: providerFrom(req),
      })
      return send(res, 200, JSON.stringify(result))
    }

    if (req.method === 'POST' && path === '/api/ocr') {
      const body = await readJson(req, 24 * 1024 * 1024)
      if (!body.image || typeof body.image !== 'string') {
        return send(res, 400, JSON.stringify({ error: '缺少 image 字段（dataURL 或 base64）' }))
      }
      const result = await nl2latexFromImage(
        { data: body.image, mediaType: body.mediaType || 'image/png' },
        {
          subject: body.subject,
          thinking: !!body.thinking,
          provider: providerFrom(req),
        },
      )
      return send(res, 200, JSON.stringify(result))
    }

    if (req.method === 'POST' && path === '/api/export') {
      const body = await readJson(req)
      if (!body.latex) return send(res, 400, JSON.stringify({ error: '缺少 latex 字段' }))
      const display = body.display !== false
      if (body.to === 'mathml') {
        return send(res, 200, JSON.stringify({ to: 'mathml', content: toMathML(body.latex, { display }) }))
      }
      if (body.to === 'omml') {
        return send(res, 200, JSON.stringify({ to: 'omml', content: toOMML(body.latex, { display }) }))
      }
      return send(res, 400, JSON.stringify({ error: "to 只能是 'mathml' 或 'omml'" }))
    }

    return send(res, 404, JSON.stringify({ error: 'not found' }))
  } catch (e) {
    return send(res, 500, JSON.stringify({ error: String(e.message || e) }))
  }
})

/** 从请求头还原供应商配置（浏览器端只发非敏感字段 + Key） */
function providerFrom(req) {
  const h = req.headers
  return {
    id: h['x-nl2tex-provider'] || 'deepseek',
    format: h['x-nl2tex-format'] || undefined,
    baseUrl: h['x-nl2tex-base'] || undefined,
    model: h['x-nl2tex-model'] || undefined,
    apiKey: h['x-nl2tex-key'] || undefined,
  }
}

server.listen(PORT, '127.0.0.1', () => {
  let auth = '未配置'
  try {
    auth = resolveAuth().kind
  } catch {}
  console.log(`nl2tex 已启动  http://127.0.0.1:${PORT}`)
  console.log(`服务端鉴权   ${auth}（用户也可在网页里用自己的 Key）`)
  console.log(`按 Ctrl+C 停止`)
})
