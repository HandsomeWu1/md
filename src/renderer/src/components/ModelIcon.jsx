import React from 'react';
import {
  siDeepseek,
  siClaude,
  siMinimax,
  siTencenthy,
  siQwen,
  siKimi,
  siMoonshotai,
  siGooglegemini,
  siMistralai,
  siMeta,
  siBaidu,
  siBytedance,
  siOllama,
  siOpenrouter,
  siX,
} from 'simple-icons';

// OpenAI 在 simple-icons v16 起因商标政策被移除，这里保留其官方单色 logo 的 path
// （来自 simple-icons 历史版本，CC0-1.0 授权）。
const OPENAI_PATH =
  'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z';

const PROVIDERS = [
  {
    key: 'deepseek',
    name: 'DeepSeek',
    icon: siDeepseek,
    match: (id, host) => host.includes('deepseek') || id.includes('deepseek'),
  },
  {
    key: 'openai',
    name: 'OpenAI',
    path: OPENAI_PATH,
    hex: '#10A37F',
    match: (id, host) =>
      host.includes('api.openai.com') || /^(gpt-|chatgpt|text-davinci|davinci|o[134](-|$))/.test(id),
  },
  {
    key: 'claude',
    name: 'Claude',
    icon: siClaude,
    match: (id, host) => host.includes('anthropic') || id.includes('claude'),
  },
  {
    key: 'minimax',
    name: 'MiniMax',
    icon: siMinimax,
    match: (id, host) => host.includes('minimax') || id.includes('minimax') || id.startsWith('abab'),
  },
  {
    key: 'hunyuan',
    name: '腾讯混元',
    icon: siTencenthy,
    match: (id, host) =>
      host.includes('hunyuan') ||
      host.includes('tencent') ||
      id.includes('hunyuan') ||
      id.startsWith('hy-') ||
      id === 'hy',
  },
  {
    key: 'qwen',
    name: '通义千问',
    icon: siQwen,
    match: (id, host) =>
      host.includes('dashscope') || host.includes('aliyun') || id.includes('qwen') || id.includes('qwq'),
  },
  {
    key: 'moonshot',
    name: 'Moonshot',
    icon: siMoonshotai,
    match: (id, host) => host.includes('moonshot') || id.includes('moonshot'),
  },
  {
    key: 'kimi',
    name: 'Kimi',
    icon: siKimi,
    match: (id, host) => id.includes('kimi'),
  },
  {
    key: 'gemini',
    name: 'Gemini',
    icon: siGooglegemini,
    match: (id, host) => host.includes('generativelanguage') || id.includes('gemini'),
  },
  {
    key: 'grok',
    name: 'Grok',
    icon: siX,
    match: (id, host) => host.includes('x.ai') || id.includes('grok'),
  },
  {
    key: 'mistral',
    name: 'Mistral',
    icon: siMistralai,
    match: (id, host) => host.includes('mistral') || id.includes('mistral') || id.includes('codestral'),
  },
  {
    key: 'llama',
    name: 'Llama',
    icon: siMeta,
    match: (id, host) => id.includes('llama') || host.includes('meta'),
  },
  {
    key: 'ernie',
    name: '文心一言',
    icon: siBaidu,
    match: (id, host) => host.includes('baidu') || id.includes('ernie'),
  },
  {
    key: 'doubao',
    name: '豆包',
    icon: siBytedance,
    match: (id, host) => host.includes('volces') || host.includes('volcengine') || id.includes('doubao'),
  },
  // 聚合平台放最后：只有模型 ID 未命中任何厂商时才回退到平台图标
  {
    key: 'openrouter',
    name: 'OpenRouter',
    icon: siOpenrouter,
    match: (id, host) => host.includes('openrouter'),
  },
  {
    key: 'ollama',
    name: 'Ollama',
    icon: siOllama,
    match: (id, host) => host.includes('11434') || host.includes('ollama'),
  },
];

// 判断颜色是否过暗（黑色系 logo 在深色主题下会看不清，需改用主题前景色）
function isDarkColor(hex) {
  const h = (hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 60;
}

// 识别厂商，返回 { key, name, path, hex, label }
export function detectProvider(entry) {
  const model = (entry?.model || '').trim();
  // OpenRouter 等聚合平台的 ID 形如 `vendor/model`，取最后一段参与匹配
  const id = model.toLowerCase().split('/').pop() || '';
  const host = (entry?.baseUrl || '').toLowerCase();

  for (const p of PROVIDERS) {
    if (p.match(id, host)) {
      const hex = p.icon ? `#${p.icon.hex}` : p.hex;
      return { key: p.key, name: p.name, path: p.icon ? p.icon.path : p.path, hex };
    }
  }

  return {
    key: 'unknown',
    name: model || '未知模型',
    path: null,
    hex: '#9CA3AF',
    label: (model.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').charAt(0) || '?').toUpperCase(),
  };
}

export default function ModelIcon({ entry, size = 16, className = '' }) {
  const { name, path, hex, label } = detectProvider(entry);
  const cls = `ai-model-logo ${className}`.trim();

  // 无官方 logo 时回退为圆角字母徽标
  if (!path) {
    return (
      <svg className={cls} viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={name}>
        <title>{name}</title>
        <rect x="0" y="0" width="24" height="24" rx="6" fill={hex} />
        <text
          x="12"
          y="12.5"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontSize="13"
          fontWeight="700"
          fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        >
          {label}
        </text>
      </svg>
    );
  }

  // 黑色系 logo（如 Kimi/Moonshot/Ollama/X）用主题前景色，深色主题下自动转白
  const fill = isDarkColor(hex) ? 'var(--text)' : hex;
  return (
    <svg className={cls} viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={name}>
      <title>{name}</title>
      <path d={path} fill={fill} />
    </svg>
  );
}
