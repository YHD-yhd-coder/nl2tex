#!/usr/bin/env node
/** 评测：跑 test/cases.json，统计编译通过率、关键词命中率、耗时与花费 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { nl2latex } from '../src/core.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const cases = JSON.parse(readFileSync(join(ROOT, 'cases.json'), 'utf8'))

const PRICE = { input: 0.3, cacheRead: 0.006, output: 1.2 } // USD / 1M
const CNY = 7.2

let passValid = 0
let passExpect = 0
let totalMs = 0
let usd = 0
const rows = []

const hit = (latex, expectAny) =>
  !expectAny || expectAny.length === 0 || expectAny.some((s) => latex.includes(s))

for (const c of cases) {
  let r
  try {
    r = await nl2latex(c.input, { subject: c.subject, cache: false })
  } catch (e) {
    rows.push({ input: c.input, subject: c.subject, status: 'ERROR', detail: String(e.message || e) })
    continue
  }

  totalMs += r.ms
  usd +=
    ((r.usage.input_tokens ?? 0) * PRICE.input +
      (r.usage.cache_read_input_tokens ?? 0) * PRICE.cacheRead +
      (r.usage.output_tokens ?? 0) * PRICE.output) /
    1e6

  const valid = r.valid
  const expect = hit(r.latex, c.expectAny)
  if (valid) passValid++
  if (valid && expect) passExpect++

  rows.push({
    input: c.input,
    subject: c.subject,
    latex: r.latex,
    valid,
    expect,
    confidence: r.confidence,
    ms: r.ms,
    error: r.error,
  })
}

const n = cases.length
for (const row of rows) {
  const mark = row.status === 'ERROR' ? '×' : row.valid && row.expect ? '✓' : '!'
  console.log(`${mark} [${row.subject ?? '-'}] ${row.input}`)
  if (row.status === 'ERROR') console.log(`   ERROR ${row.detail}`)
  else console.log(`   ${row.latex}   (conf ${row.confidence}, ${row.ms}ms)${row.valid ? '' : '  ← ' + row.error}`)
}

console.log('\n──────────')
console.log(`用例数        ${n}`)
console.log(`编译通过      ${passValid}/${n}  (${((passValid / n) * 100).toFixed(1)}%)`)
console.log(`关键词命中    ${passExpect}/${n}  (${((passExpect / n) * 100).toFixed(1)}%)`)
console.log(`平均耗时      ${Math.round(totalMs / n)} ms`)
console.log(`本次花费      ¥${(usd * CNY).toFixed(3)}`)

process.exit(passValid / n < 0.9 ? 1 : 0)
