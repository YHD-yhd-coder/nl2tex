/** 学科包：每个学科一段提示词 + 建议宏包 + 校验要点 */

export const SUBJECTS = {
  math: {
    label: '数学',
    hint: '求和/积分/极限/矩阵/分段函数，下标多字母用 \\mathrm{}',
    packages: [],
    rules: [
      '上下限写全（\\sum_{k=1}^{n}），用户没说就不猜，标低置信度',
      '分段函数用 \\begin{cases}',
      '矩阵用 pmatrix / bmatrix',
    ],
  },
  physics: {
    label: '物理',
    hint: '矢量、微分算子、单位',
    packages: ['siunitx'],
    rules: [
      '矢量用 \\vec{} 或 \\mathbf{}，保持全文一致',
      '单位用 \\,\\mathrm{m/s^2} 或 \\si{}',
      '偏导用 \\partial，全导用 \\mathrm{d}',
    ],
  },
  chemistry: {
    label: '化学',
    hint: '化学式、反应箭头、状态标注',
    packages: ['mhchem'],
    rules: [
      '化学式必须用 \\ce{}（如 \\ce{2H2 + O2 -> 2H2O}），不要写成 H_2O',
      '状态用 \\ce{(aq)} (s) (l) (g)',
      '可逆反应用 <=>，沉淀/气体箭头用 v / ^',
    ],
  },
  cs: {
    label: '计算机',
    hint: '复杂度、伪代码、逻辑',
    packages: [],
    rules: [
      '复杂度用 \\mathcal{O}(n\\log n)',
      '取整用 \\lfloor \\rfloor / \\lceil \\rceil',
      '逻辑符号用 \\land \\lor \\lnot \\Rightarrow',
    ],
  },
  economics: {
    label: '经济/统计',
    hint: '期望、方差、偏导、最优化',
    packages: [],
    rules: [
      '期望 \\mathbb{E}[X]，方差 \\operatorname{Var}(X)',
      '最优化写 \\max_{x} / \\min_{x}，约束用 \\text{s.t.}',
    ],
  },
  biology: {
    label: '生物',
    hint: '遗传比例、简单模型',
    packages: [],
    rules: ['基因型用 \\text{} 包裹（如 \\text{Aa} \\times \\text{Aa}）'],
  },
}

export const SUBJECT_KEYS = Object.keys(SUBJECTS)

/**
 * 组装 system prompt。
 * @param {string} subject
 * @param {{retry?: {error: string, previous: string}}} [ctx]
 */
export function buildSystem(subject = 'math', ctx = {}) {
  const pack = SUBJECTS[subject] ?? SUBJECTS.math
  const lines = [
    '你是公式转写器。把用户的中文或英文描述转成可直接编译的 LaTeX。',
    '',
    '只输出一个 JSON 对象，不要输出任何解释或 Markdown 代码块：',
    '{"latex":"...","display":true,"confidence":0.0,"note":"...","alternatives":[{"label":"...","latex":"..."}]}',
    '',
    '规则：',
    '1. 只做转写，不计算、不化简、不补全用户没有说的内容。',
    '2. 描述有歧义时 confidence 低于 0.6，并在 note 里写清歧义点和你采用的解释。',
    '3. 存在多种合理解读时，用 alternatives 给出最多 3 种（按可能性排序，第一项与 latex 字段一致），label 用不超过 10 个字说明这是哪种解读；没有歧义就省略该字段。',
    '4. 多字母下标用 \\mathrm{}，函数名用 \\sin \\cos \\log \\ln，普通文本用 \\text{}。',
    '5. 不要在 latex 字段里包含 $ 或 \\[ \\] 定界符。',
    '6. 无法转写时返回 {"latex":"","confidence":0,"note":"原因"}。',
    '',
    `当前学科：${pack.label}。`,
    ...pack.rules.map((r) => `- ${r}`),
  ]

  if (pack.packages.length) {
    lines.push(`允许使用的宏包：${pack.packages.join(', ')}`)
  }

  if (ctx.retry) {
    lines.push(
      '',
      '上一次的输出无法通过编译校验，请修正后重新输出 JSON：',
      `错误信息：${ctx.retry.error}`,
      `上一次的 latex：${ctx.retry.previous}`,
    )
  }

  return lines.join('\n')
}

/**
 * 图片识别用的 system prompt。
 * @param {string} subject
 */
export function buildOcrSystem(subject = 'math') {
  const pack = SUBJECTS[subject] ?? SUBJECTS.math
  return [
    '你是公式 OCR。把图片里的数学公式转写成可编译的 LaTeX。',
    '',
    '只输出一个 JSON 对象：',
    '{"latex":"...","display":true,"confidence":0.0,"note":"..."}',
    '',
    '规则：',
    '1. 严格照抄图片内容，不补全、不推导、不修改原公式。',
    '2. 图片模糊或符号不确定时降低 confidence，并在 note 里指出哪个符号不确定。',
    '3. 多字母下标用 \\mathrm{}，函数名用 \\sin \\cos \\log \\ln，普通文本用 \\text{}。',
    '4. 不要在 latex 字段里包含 $ 或 \\[ \\] 定界符。',
    '5. 图片里没有公式时返回 {"latex":"","confidence":0,"note":"未识别到公式"}。',
    '',
    `当前学科：${pack.label}。`,
    ...pack.rules.map((r) => `- ${r}`),
  ].join('\n')
}
