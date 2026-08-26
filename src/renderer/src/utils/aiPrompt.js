// AI 提示词与上下文组装（纯函数，便于单独推理与调整）。
//
// 只支持 OpenAI 兼容的 messages 结构。
//
// 单一模式设计：不再让用户手选「对话 / 改写」，而是由模型自行判断意图。
// 判断结果通过**回复的首行标记**回传，而不是用 function calling ——
// 用户可能接任意 OpenAI 兼容端点（Ollama、vLLM、各家小模型），tools 支持度参差不齐，
// 纯文本标记协议在所有端点上都能工作，且天然适配流式解析。
//
// 安全默认值：没有标记就一律当对话，绝不碰文档。宁可漏改，不可误改。

export const REWRITE_MARKER = '%%REWRITE%%';

const SYSTEM_PROMPT =
  '你是 Markdown 编辑器 Margin-AI 内置的助手。你有两种回应方式，请自行判断使用哪一种。\n\n' +
  '【方式一：对话】（默认）\n' +
  '当用户在打招呼、闲聊、提问、或请你解释、分析、总结内容时，直接用简洁的中文回答，' +
  '必要时使用 Markdown 排版。例如「你好」「这篇文档讲了什么」「什么是向量数据库」都属于对话。\n\n' +
  '【方式二：改写文档】\n' +
  '仅当用户**明确要求修改文档内容**时才使用，例如「改简洁些」「加个小标题」「翻译成英文」' +
  '「修正错别字」「扩写这段」「把列表改成表格」。\n' +
  '格式要求：第一行只输出 ' +
  REWRITE_MARKER +
  '（前后不要加任何其它字符），从第二行开始输出改写后的完整 Markdown 正文。\n' +
  '不要输出任何解释、前言或结语，也不要用 ``` 把整篇结果包裹起来（正文内部原有的代码块要保留）。\n\n' +
  '【判断原则】\n' +
  '如果不确定用户是否想修改文档，就用对话方式回答并主动询问。' +
  '用户没有明确提出修改要求时，绝对不要使用方式二。';

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
 * 解析模型回复，判断这是对话还是改写。**流式安全**：可用未收完的内容反复调用。
 *
 * @param {string} raw 已收到的回复内容（可能不完整）
 * @returns {{ kind: 'pending'|'chat'|'rewrite', text: string }}
 *   pending — 内容还太短、无法区分是否为标记，调用方应显示「思考中」而不是先当对话渲染
 *             （否则会先闪出半个标记再跳走）
 *   chat    — 对话回复，text 为原文
 *   rewrite — 改写结果，text 为剥掉标记与围栏后的正文
 */
export function parseAiReply(raw) {
  const s = (raw || '').replace(/^\s+/, '');
  if (!s) return { kind: 'pending', text: '' };

  // 标记大小写不敏感：部分模型会把标记写成小写。
  const upper = s.toUpperCase();
  if (s.length < REWRITE_MARKER.length) {
    // 还看不出全貌：只要仍是标记的前缀就继续等，否则可以确定是对话。
    return REWRITE_MARKER.startsWith(upper) ? { kind: 'pending', text: '' } : { kind: 'chat', text: raw };
  }
  if (upper.startsWith(REWRITE_MARKER)) {
    // 去掉标记本身及其后的换行，剩下就是文档正文。
    const body = s.slice(REWRITE_MARKER.length).replace(/^[ \t]*\r?\n/, '');
    return { kind: 'rewrite', text: stripCodeFence(body) };
  }
  return { kind: 'chat', text: raw };
}

/**
 * 组装一次请求的 messages。
 * @param {object} o
 * @param {string} o.prompt      用户输入
 * @param {string} o.document    当前文档全文
 * @param {string} o.selection   选区 Markdown（无选区为空串）
 * @param {Array}  o.history     既往对话 [{ role, content }]
 * @param {number} o.maxChars    上下文字符上限
 * @param {boolean} o.canRewrite 当前视图是否允许改写（代码视图不允许）
 */
export function buildMessages({
  prompt,
  document = '',
  selection = '',
  history = [],
  maxChars = 60000,
  canRewrite = true,
}) {
  const msgs = [{ role: 'system', content: SYSTEM_PROMPT }];

  // 不允许改写时直接告知模型，比事后拒绝它的改写结果体验更好
  // （否则用户会看到「已生成」却又「未写入」的矛盾提示）。
  if (!canRewrite) {
    msgs.push({
      role: 'system',
      content: '注意：当前视图不支持改写文档，请始终使用方式一（对话）回答，不要输出改写标记。',
    });
  }

  // 有选区时，改写目标只能是选区——这是避免「顺手重写整篇」的关键约束，
  // 因此选区存在与否会改变发给模型的正文范围与改写指令。
  if (selection.trim()) {
    const { text, truncated: selTruncated } = clampContext(selection, maxChars);
    msgs.push({
      role: 'system',
      content:
        `用户当前选中了以下片段：\n\n${text}\n\n` +
        '若判断需要改写，只改写这段选中内容，并且只输出这段的改写结果（不要输出整篇文档）。',
    });
    // 选区之外的文档内容也给一点上下文，但明确它不是改写目标。
    const { text: docText } = clampContext(document, Math.max(2000, Math.floor(maxChars / 4)));
    if (docText.trim()) {
      msgs.push({ role: 'system', content: `所在文档的完整内容（仅供理解上下文，不是改写目标）：\n\n${docText}` });
    }
    for (const m of history) msgs.push({ role: m.role, content: m.content });
    msgs.push({ role: 'user', content: prompt });
    return { truncated: selTruncated, messages: msgs };
  }

  const { text, truncated } = clampContext(document, maxChars);
  if (text.trim()) {
    msgs.push({
      role: 'system',
      content: `当前文档的完整内容：\n\n${text}\n\n若判断需要改写，请输出改写后的整篇文档。`,
    });
  } else {
    msgs.push({ role: 'system', content: '当前文档为空。' });
  }
  for (const m of history) msgs.push({ role: m.role, content: m.content });
  msgs.push({ role: 'user', content: prompt });
  return { truncated, messages: msgs };
}
