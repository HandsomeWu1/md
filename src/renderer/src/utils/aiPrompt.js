// AI 对话/改写的提示词与上下文组装（纯函数，便于单独推理与调整）。
//
// 只支持 OpenAI 兼容的 messages 结构。这里刻意把「改写」与「问答」的 system
// 提示分开：改写模式必须约束模型**只输出 Markdown 正文**，否则返回的解释文字
// 会被直接写进用户文档。

const CHAT_SYSTEM =
  '你是 Markdown 编辑器 Margin-AI 内置的写作助手。请用简洁的中文回答，' +
  '必要时使用 Markdown 排版。若用户询问文档内容，请依据提供的文档上下文作答。';

const REWRITE_SYSTEM =
  '你是 Markdown 编辑器 Margin-AI 内置的文档改写助手。' +
  '请严格按用户要求改写给定的 Markdown 文本。' +
  '只输出改写后的 Markdown 正文本身，不要输出任何解释、前言、结语，' +
  '也不要用 ``` 代码块把整篇结果包裹起来（文本内部原有的代码块要保留）。';

// 上下文裁剪：超长文档直接整篇发送会撑爆模型上下文，也会让请求极慢。
// 从中间截断并留下明确标记，比从尾部硬切更能保留文档的首尾结构信息。
export function clampContext(text, maxChars) {
  const s = text || '';
  const limit = Number(maxChars) > 0 ? Number(maxChars) : 60000;
  if (s.length <= limit) return { text: s, truncated: false };
  const head = Math.floor(limit * 0.6);
  const tail = limit - head;
  return {
    text: s.slice(0, head) + '\n\n…（文档过长，已省略中间部分）…\n\n' + s.slice(s.length - tail),
    truncated: true,
  };
}

// 去掉模型偶尔仍会加上的整篇 ``` 包裹。只在「首行是围栏且末行是围栏」时剥离，
// 避免误伤正文里本来就有的代码块。
export function stripCodeFence(text) {
  const s = (text || '').trim();
  if (!s.startsWith('```')) return s;
  const lines = s.split('\n');
  if (lines.length < 2 || lines[lines.length - 1].trim() !== '```') return s;
  // 中间若还出现围栏，说明整体不是单个代码块，不能剥离。
  const inner = lines.slice(1, -1);
  if (inner.some((l) => l.trim().startsWith('```'))) return s;
  return inner.join('\n').trim();
}

/**
 * 组装一次请求的 messages。
 * @param {object} o
 * @param {'chat'|'rewrite'} o.mode
 * @param {string} o.prompt      用户输入
 * @param {string} o.document    当前文档全文
 * @param {string} o.selection   选区 Markdown（无选区为空串）
 * @param {Array}  o.history     既往对话 [{ role, content }]，仅 chat 模式使用
 * @param {number} o.maxChars    上下文字符上限
 */
export function buildMessages({ mode, prompt, document = '', selection = '', history = [], maxChars = 60000 }) {
  if (mode === 'rewrite') {
    // 有选区时只改选区，避免 AI 顺手重写整篇——这是最容易造成意外破坏的地方。
    const target = selection || document;
    const { text, truncated } = clampContext(target, maxChars);
    const scope = selection ? '选中片段' : '整篇文档';
    return {
      truncated,
      messages: [
        { role: 'system', content: REWRITE_SYSTEM },
        {
          role: 'user',
          content:
            `[改写模式] 改写范围：${scope}。\n\n改写要求：${prompt}\n\n` +
            `以下是需要改写的 Markdown ${scope}：\n\n${text}`,
        },
      ],
    };
  }

  const { text, truncated } = clampContext(document, maxChars);
  const msgs = [{ role: 'system', content: CHAT_SYSTEM }];
  if (text.trim()) {
    msgs.push({
      role: 'system',
      content: `当前文档内容（供参考，不要主动改写）：\n\n${text}`,
    });
  }
  if (selection.trim()) {
    msgs.push({ role: 'system', content: `用户当前选中的片段：\n\n${selection}` });
  }
  for (const m of history) msgs.push({ role: m.role, content: m.content });
  msgs.push({ role: 'user', content: prompt });
  return { truncated, messages: msgs };
}
