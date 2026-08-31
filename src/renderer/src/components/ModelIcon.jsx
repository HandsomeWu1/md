import React from 'react';

// 模型厂商徽标：按「API 地址 → 模型 ID」猜厂商，渲染品牌色圆角徽标 + 字母。
// 全部为内联 SVG，不依赖外链图片，离线可用；未识别到的模型回退为首字母灰色徽标。
//
// 说明：OpenRouter 等聚合平台的模型 ID 形如 `vendor/model`，这里取 `/` 后的部分再匹配，
// 因此 `anthropic/claude-3.5-sonnet` 会显示 Claude 的徽标，而非平台徽标。

const PROVIDERS = [
  {
    key: 'deepseek',
    name: 'DeepSeek',
    color: '#4D6BFE',
    label: 'D',
    match: (id, host) => host.includes('deepseek') || id.includes('deepseek'),
  },
  {
    key: 'openai',
    name: 'OpenAI',
    color: '#10A37F',
    label: 'AI',
    match: (id, host) =>
      host.includes('api.openai.com') ||
      /^(gpt-|chatgpt|text-davinci|davinci|o[134](-|$))/.test(id),
  },
  {
    key: 'claude',
    name: 'Anthropic Claude',
    color: '#D97757',
    label: 'C',
    match: (id, host) => host.includes('anthropic') || id.includes('claude'),
  },
  {
    key: 'minimax',
    name: 'MiniMax',
    color: '#7C5CFF',
    label: 'M',
    match: (id, host) => host.includes('minimax') || id.includes('minimax') || id.startsWith('abab'),
  },
  {
    key: 'hunyuan',
    name: '腾讯混元',
    color: '#0052D9',
    label: 'H',
    match: (id, host) =>
      host.includes('hunyuan') ||
      host.includes('tencent') ||
      id.includes('hunyuan') ||
      id.startsWith('hy-') ||
      id === 'hy',
  },
  {
    key: 'qwen',
    name: '阿里通义千问',
    color: '#6B57FF',
    label: 'Q',
    match: (id, host) =>
      host.includes('dashscope') || host.includes('aliyun') || id.includes('qwen') || id.includes('qwq'),
  },
  {
    key: 'glm',
    name: '智谱 GLM',
    color: '#4A6CF7',
    label: 'G',
    match: (id, host) => host.includes('bigmodel') || host.includes('zhipu') || id.includes('glm-'),
  },
  {
    key: 'moonshot',
    name: 'Moonshot Kimi',
    color: '#00A896',
    label: 'K',
    match: (id, host) => host.includes('moonshot') || id.includes('moonshot') || id.includes('kimi'),
  },
  {
    key: 'gemini',
    name: 'Google Gemini',
    color: '#4285F4',
    label: 'G',
    match: (id, host) => host.includes('generativelanguage') || id.includes('gemini'),
  },
  {
    key: 'grok',
    name: 'xAI Grok',
    color: '#111827',
    label: 'X',
    match: (id, host) => host.includes('x.ai') || id.includes('grok'),
  },
  {
    key: 'mistral',
    name: 'Mistral',
    color: '#FA520F',
    label: 'M',
    match: (id, host) => host.includes('mistral') || id.includes('mistral') || id.includes('codestral'),
  },
  {
    key: 'llama',
    name: 'Meta Llama',
    color: '#F59E0B',
    label: 'L',
    match: (id, host) => id.includes('llama') || host.includes('meta'),
  },
  {
    key: 'ernie',
    name: '百度文心',
    color: '#4E6EF2',
    label: 'E',
    match: (id, host) => host.includes('baidu') || id.includes('ernie'),
  },
  {
    key: 'doubao',
    name: '字节豆包',
    color: '#FF7A00',
    label: 'D',
    match: (id, host) => host.includes('volces') || host.includes('volcengine') || id.includes('doubao'),
  },
  {
    key: 'step',
    name: '阶跃星辰',
    color: '#00C48C',
    label: 'S',
    match: (id, host) => host.includes('stepfun') || id.startsWith('step-'),
  },
  {
    key: 'yi',
    name: '零一万物',
    color: '#2E5BFF',
    label: 'Y',
    match: (id, host) => host.includes('01.ai') || id.startsWith('yi-') || id === 'yi',
  },
  {
    key: 'cohere',
    name: 'Cohere',
    color: '#39594D',
    label: 'C',
    match: (id, host) => host.includes('cohere') || id.includes('command'),
  },
  // 聚合平台放最后：只有模型 ID 未命中任何厂商时才回退到平台徽标
  {
    key: 'openrouter',
    name: 'OpenRouter',
    color: '#7B61FF',
    label: 'R',
    match: (id, host) => host.includes('openrouter'),
  },
  {
    key: 'ollama',
    name: 'Ollama',
    color: '#1F2937',
    label: 'O',
    match: (id, host) => host.includes('11434') || host.includes('ollama'),
  },
];

const FALLBACK_COLOR = '#9CA3AF';

// 识别厂商，返回 { key, name, color, label }
export function detectProvider(entry) {
  const model = (entry?.model || '').trim();
  // OpenRouter 等聚合平台的 ID 形如 `vendor/model`，取最后一段参与匹配
  const id = model.toLowerCase().split('/').pop() || '';
  const host = (entry?.baseUrl || '').toLowerCase();

  for (const p of PROVIDERS) {
    if (p.match(id, host)) {
      return { key: p.key, name: p.name, color: p.color, label: p.label };
    }
  }
  return {
    key: 'unknown',
    name: model || '未知模型',
    color: FALLBACK_COLOR,
    label: (model.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').charAt(0) || '?').toUpperCase(),
  };
}

export default function ModelIcon({ entry, size = 16, className = '' }) {
  const { name, color, label } = detectProvider(entry);
  return (
    <svg
      className={`ai-model-logo ${className}`.trim()}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      role="img"
      aria-label={name}
    >
      <title>{name}</title>
      <rect x="0" y="0" width="16" height="16" rx="4.5" fill={color} />
      <text
        x="8"
        y="8.5"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fff"
        fontSize={label.length > 1 ? 7.5 : 9}
        fontWeight="700"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
      >
        {label}
      </text>
    </svg>
  );
}
