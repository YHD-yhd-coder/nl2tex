/** 模型供应商预设：每个都填好 baseUrl / 协议 / 示例模型，用户只需选一个 + 填 Key */

export const PRESETS = {
  deepseek: {
    label: 'DeepSeek',
    format: 'anthropic',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-flash', 'deepseek-v4-pro'],
    defaultModel: 'deepseek-flash',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    note: '默认选项，便宜、快，支持图片',
  },
  kimi: {
    label: 'Kimi（月之暗面）',
    format: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    models: ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6'],
    defaultModel: 'kimi-k2.6',
    keyUrl: 'https://platform.kimi.ai',
    note: 'OpenAI 兼容；K3 默认开启思考，较贵',
  },
  zhipu: {
    label: '智谱 GLM',
    format: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4.6', 'glm-4.5-air'],
    defaultModel: 'glm-4.6',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    note: 'OpenAI 兼容',
  },
  qwen: {
    label: '通义千问',
    format: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-max'],
    defaultModel: 'qwen-plus',
    keyUrl: 'https://bailian.console.aliyun.com/',
    note: 'DashScope 兼容模式',
  },
  siliconflow: {
    label: 'SiliconFlow',
    format: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'],
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    note: '国内聚合平台',
  },
  openrouter: {
    label: 'OpenRouter',
    format: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['deepseek/deepseek-chat', 'anthropic/claude-sonnet-4'],
    defaultModel: 'deepseek/deepseek-chat',
    keyUrl: 'https://openrouter.ai/keys',
    note: '一个 Key 调多家模型',
  },
  dsh: {
    label: '本机 DSH 登录',
    format: 'anthropic',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-flash'],
    defaultModel: 'deepseek-flash',
    keyless: true,
    note: '不用填 Key，复用本机 DSH 的登录态（仅本机可用）',
  },
  custom: {
    label: '自定义（OpenAI 兼容）',
    format: 'openai',
    baseUrl: '',
    models: [],
    defaultModel: '',
    note: '任何 OpenAI 兼容网关：填 baseUrl + 模型名 + Key',
  },
}

export const PRESET_KEYS = Object.keys(PRESETS)

export function getPreset(id) {
  return PRESETS[id] ?? PRESETS.deepseek
}
