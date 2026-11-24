/** 导出：LaTeX -> MathML / OMML（Word 公式） */

import katex from 'katex'
import * as mathml2omml from 'mathml2omml'

const mml2omml = mathml2omml.mml2omml ?? mathml2omml.default ?? mathml2omml

/** 取出独立的 <math> 元素（KaTeX 会包一层 span） */
export function toMathML(latex, { display = true } = {}) {
  const html = katex.renderToString(latex, {
    output: 'mathml',
    displayMode: display,
    throwOnError: true,
    strict: 'ignore',
    trust: false,
  })
  const m = html.match(/<math[\s\S]*<\/math>/)
  if (!m) throw new Error('MathML 生成失败')
  return m[0]
}

/** 转成 Word 的 Office Math（OMML） */
export function toOMML(latex, { display = true } = {}) {
  const mathml = toMathML(latex, { display })
  return String(mml2omml(mathml))
}

/** 包一层能直接粘进 Word 的 HTML（Word 会把 MathML 转成原生公式） */
export function toWordHtml(latex, { display = true } = {}) {
  const mathml = toMathML(latex, { display })
  return `<html><head><meta charset="utf-8"></head><body>${mathml}</body></html>`
}
