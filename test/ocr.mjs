#!/usr/bin/env node
/** 图片识别冒烟测试：把 test/fixtures/formula.png 交给模型，检查还原度 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nl2latexFromImage } from '../src/core.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const png = readFileSync(join(ROOT, 'fixtures', 'formula.png')).toString('base64')

const expected = '\\int_{0}^{\\infty} e^{-x^2} \\, dx = \\frac{\\sqrt{\\pi}}{2}'
const r = await nl2latexFromImage({ data: png, mediaType: 'image/png' }, { subject: 'math' })

const norm = (s) => s.replace(/\s+/g, '').replace(/\\,/g, '').replace(/[{}]/g, '')
const exact = norm(r.latex) === norm(expected)
const flat = norm(r.latex)
const likely = exact || (flat.includes('\\int') && flat.includes('e^-x2'))

console.log('识别结果  ', r.latex)
console.log('期望      ', expected)
console.log('编译      ', r.valid ? '通过' : '失败：' + r.error)
console.log('完全一致  ', exact ? '是' : '否')
console.log('关键结构  ', likely ? '一致' : '不一致')
console.log('耗时      ', r.ms + ' ms')
console.log('花费 token', JSON.stringify(r.usage))

process.exit(r.valid && likely ? 0 : 1)
