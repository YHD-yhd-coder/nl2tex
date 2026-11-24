#!/usr/bin/env node
/** 命令行用法：node cli.mjs "求和 1/n立方+nx" --subject=math --json */

import { nl2latex } from './src/core.mjs'

const argv = process.argv.slice(2)
const flags = Object.fromEntries(
  argv
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=')
      return [k, v ?? true]
    }),
)
const text = argv.filter((a) => !a.startsWith('--')).join(' ')

if (!text || flags.help) {
  console.log(`用法: node cli.mjs "求和 1/n立方+nx" [--subject=math] [--json] [--thinking] [--no-cache]

学科: math physics chemistry cs economics biology`)
  process.exit(text ? 0 : 1)
}

try {
  const r = await nl2latex(text, {
    subject: flags.subject,
    thinking: !!flags.thinking,
    cache: flags['no-cache'] ? false : true,
  })

  if (flags.json) {
    console.log(JSON.stringify(r, null, 2))
  } else {
    console.log('')
    console.log(r.latex)
    console.log('')
    console.log(
      `[${r.valid ? '编译通过' : '编译失败'}] 置信度 ${r.confidence.toFixed(2)}  学科 ${r.subject}  ${r.ms}ms${r.cached ? ' (缓存)' : ''}`,
    )
    if (r.note) console.log(`说明: ${r.note}`)
    if (!r.valid) console.log(`错误: ${r.error}`)
  }
} catch (e) {
  console.error('失败:', e.message)
  process.exit(1)
}
