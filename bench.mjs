#!/usr/bin/env node
/** 延迟基准：同一批用例跑 N 轮，输出 p50 / p95 / 花费 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nl2latex } from './src/core.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const cases = JSON.parse(readFileSync(join(ROOT, 'test', 'cases.json'), 'utf8')).slice(0, 10)
const rounds = Number(process.argv[2] || 2)
const PRICE = { input: 0.3, cacheRead: 0.006, output: 1.2 }
const CNY = 7.2

const lat = []
let usd = 0
let ok = 0

for (let i = 0; i < rounds; i++) {
  for (const c of cases) {
    const r = await nl2latex(c.input, { subject: c.subject, cache: false })
    lat.push(r.ms)
    if (r.valid) ok++
    usd +=
      ((r.usage.input_tokens ?? 0) * PRICE.input +
        (r.usage.cache_read_input_tokens ?? 0) * PRICE.cacheRead +
        (r.usage.output_tokens ?? 0) * PRICE.output) /
      1e6
  }
}

const sorted = [...lat].sort((a, b) => a - b)
const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
console.log(`请求数     ${lat.length}`)
console.log(`编译通过   ${ok}/${lat.length}`)
console.log(`p50        ${p(0.5)} ms`)
console.log(`p95        ${p(0.95)} ms`)
console.log(`min / max  ${sorted[0]} / ${sorted[sorted.length - 1]} ms`)
console.log(`花费       ¥${(usd * CNY).toFixed(3)}`)
