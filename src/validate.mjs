/** LaTeX 清洗与 KaTeX 编译校验 */

import katex from 'katex'

// mhchem 扩展（\ce{}）按需加载，失败不影响其它公式
let mhchemReady = false
try {
  await import('katex/contrib/mhchem')
  mhchemReady = true
} catch {
  mhchemReady = false
}

const DANGEROUS = /\\\\(href|url|includegraphics|htmlClass|htmlStyle|htmlId|newcommand|def|input|include)\b/

/** 去掉外层 $...$ / \[...\] / \(...\) 定界符和多余空白 */
export function normalize(raw) {
  if (typeof raw !== 'string') return ''
  let s = raw.trim()
  s = s.replace(/^```(?:latex|tex)?\s*/i, '').replace(/```$/, '').trim()
  s = s.replace(/^\$\$([\s\S]*)\$\$$/, '$1')
  s = s.replace(/^\$([\s\S]*)\$$/, '$1')
  s = s.replace(/^\\\[([\s\S]*)\\\]$/, '$1')
  s = s.replace(/^\\\(([\s\S]*)\\\)$/, '$1')
  return s.trim()
}

/**
 * 编译校验。
 * @param {string} latex
 * @param {{display?: boolean}} [opts]
 * @returns {{ok: boolean, html?: string, error?: string}}
 */
export function validate(latex, opts = {}) {
  const src = normalize(latex)
  if (!src) return { ok: false, error: '空公式' }
  if (src.length > 4000) return { ok: false, error: '公式过长（超过 4000 字符）' }
  if (DANGEROUS.test(src)) return { ok: false, error: '包含不允许的命令' }

  try {
    const html = katex.renderToString(src, {
      displayMode: opts.display !== false,
      throwOnError: true,
      strict: 'ignore',
      trust: false,
      output: 'html',
    })
    return { ok: true, html }
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 300) }
  }
}

export const hasMhchem = () => mhchemReady
