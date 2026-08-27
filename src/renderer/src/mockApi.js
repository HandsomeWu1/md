// 浏览器预览模式：当不在 Electron 内（window.api 未注入）时，
// 注入一个内存版 mock API，让渲染层 UI 能在纯浏览器中渲染与交互。
// 文件读写为内存模拟，仅用于预览界面，不影响 Electron 下的真实行为。
export function installMockApi() {
  if (window.api) return;

  const memory = new Map();
  const noopUnsub = () => {};

  // 浏览器预览没有真实主进程，AI 用内存模拟流式推送：
  // 订阅集合让 aiChat 能把增量广播给所有 onAiChunk 回调；
  // aborted 集合记录被取消的请求，使「停止」按钮在预览中也能表现为取消。
  const aiChunkSubs = new Set();
  const aiAborted = new Set();

  // 设置值需要在多次 set/get 之间保持，否则 AI 设置弹窗读不回已保存的值；
  // 初始值与主进程 store 的 DEFAULTS 保持一致。
  let mockSettings = {
    theme: 'light',
    headingNumbering: false,
    leanMode: false,
    fontSize: 13,
    aiBaseUrl: '',
    aiApiKey: '',
    aiModel: '',
    aiTemperature: 0.3,
    aiMaxContextChars: 60000,
    aiSystemPrompt: '',
    aiPriceIn: 0,
    aiPriceOut: 0,
    aiPriceCached: 0,
    aiCurrency: '¥',
  };

  window.api = {
    openFileDialog: async () => ({ canceled: true }),
    openFolderDialog: async () => ({ canceled: true }),
    saveFileDialog: async () => ({ canceled: true, filePath: null }),
    confirmClose: async () => ({ response: 1 }),
    openPath: async (p) => ({ ok: true, filePath: p, content: memory.get(p) ?? '' }),
    readFile: async (p) => ({ ok: true, content: memory.get(p) ?? '' }),
    writeFile: async (p, content) => {
      memory.set(p, content);
      return { ok: true, savedAt: new Date().toISOString() };
    },
    createFile: async (dir, name) => ({ ok: true, path: `${dir}/${name}` }),
    createFolder: async (dir, name) => ({ ok: true, path: `${dir}/${name}` }),
    rename: async (_a, b) => ({ ok: true, path: b }),
    deletePath: async () => ({ ok: true }),
    listTree: async () => ({ ok: true, tree: [] }),
    revealInFinder: async () => ({}),
    saveImage: async (data) => {
      const blob = new Blob([data], { type: 'image/png' });
      return { ok: true, url: URL.createObjectURL(blob) };
    },
    exportHtml: async () => ({}),
    exportPdf: async () => ({}),
    getSettings: async () => ({ ...mockSettings }),
    // 返回合并后的完整设置，而不是只看本次传入的局部，方便弹窗回填。
    setSettings: async (p) => {
      mockSettings = { ...mockSettings, ...(p || {}) };
      return { ...mockSettings };
    },
    getRecentFiles: async () => [],
    addRecentFile: async () => [],
    clearRecentFiles: async () => [],
    setWindowTitle: async () => {},
    setDocumentEdited: async () => {},
    confirmAppClose: async () => {},
    onBeforeClose: () => noopUnsub,
    onMenu: () => noopUnsub,
    onOpenFile: () => noopUnsub,

    // AI（预览模拟）
    onAiChunk: (cb) => {
      aiChunkSubs.add(cb);
      return () => aiChunkSubs.delete(cb);
    },
    aiAbort: async (requestId) => {
      aiAborted.add(requestId);
      return { ok: true };
    },
    // 模型列表（预览模拟）。地址里含 "bad" 时模拟失败，便于验证手填兜底路径。
    aiListModels: async ({ baseUrl } = {}) => {
      await new Promise((r) => setTimeout(r, 200));
      if (!baseUrl) return { ok: false, error: '请先填写 API 地址' };
      if (/bad|invalid/.test(baseUrl)) return { ok: false, error: '获取模型列表失败（404）：Not Found' };
      return { ok: true, models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4-flash-vision-exp'] };
    },
    aiChat: async ({ requestId, messages }) => {
      const list = messages || [];
      const lastUser = [...list].reverse().find((m) => m.role === 'user');
      const userText = (lastUser && lastUser.content) || '';
      const systemText = list.filter((m) => m.role === 'system').map((m) => m.content || '').join('\n');

      // 模拟真实模型的意图判断：只有出现明确的修改类要求才走改写，
      // 「你好」这类寒暄一律当对话（这正是合并模式后必须保证的行为）。
      const wantsClear = /清空|清除全部|删掉全部|删除全部|全部删掉/.test(userText);
      const wantsRewrite =
        wantsClear ||
        /改写|改简洁|精简|简化|扩写|翻译|润色|修正|改成|加个|补充|重写|优化一下|改一下|改下/.test(userText);
      const rewriteForbidden = /不支持改写/.test(systemText);
      const onlySelection = /只改写这段选中内容/.test(systemText);

      const chatReply = '这是一段用于验证 UI 的模拟回复。当前问题不涉及修改文档，因此以对话方式回答，' +
        '文档内容不会被改动。';

      // 改写：基于原文做**局部**改动（改一段 + 追加一段），
      // 这样正文里的差异标注（修改/新增）才有真实可验证的效果。
      const buildRewrite = () => {
        const src = onlySelection
          ? /用户当前选中了以下片段：\n\n([\s\S]*?)\n\n若判断需要改写/.exec(systemText)
          : /当前文档的完整内容：\n\n([\s\S]*?)\n\n若判断需要改写/.exec(systemText);
        const source = src ? src[1].trim() : '';
        if (!source) return '# 改写后的文档\n\n这是模拟改写返回的内容。';
        if (onlySelection) return '【已改写】' + source;
        const blocks = source.split(/\n{2,}/);
        // 挑一个真正有内容的块来改。注意 Milkdown 会把空段落序列化成 <br />，
        // 若不跳过这些占位块，"改写"就会变成插入新段落，diff 结果与预期不符。
        const isFiller = (b) => !b.trim() || /^(<br\s*\/?>|\\)$/i.test(b.trim());
        let idx = blocks.findIndex((b, i) => i > 0 && !isFiller(b));
        if (idx < 0) idx = blocks.findIndex((b) => !isFiller(b));
        if (idx < 0) idx = 0;
        blocks[idx] = '【已精简】' + blocks[idx];
        blocks.push('这一段是模拟改写新增的内容，用于验证「新增」标注。');
        return blocks.join('\n\n');
      };

      const isRewrite = wantsRewrite && !rewriteForbidden;
      // 改写回复必须带上协议标记，与真实模型的输出格式保持一致。
      // 清空指令按协议在标记后留空正文。
      const full = isRewrite ? (wantsClear ? '%%REWRITE%%\n' : `%%REWRITE%%\n${buildRewrite()}`) : chatReply;

      // 模拟思考过程。两种传递方式都要能验证：
      // - 用户输入含「think标签」→ 走 content 内嵌 <think>（本地/中转模型常见）
      // - 否则走独立的 reasoning 字段（DeepSeek 官方 API 的方式）
      const useThinkTag = /think标签|thinktag/i.test(userText);
      const reasoningText = /不思考|无思考/.test(userText)
        ? ''
        : '先判断用户意图：这句话' +
          (isRewrite ? '明确要求修改文档，应当使用改写方式。' : '属于提问或寒暄，不涉及修改文档，用对话方式回答。') +
          '再检查是否有选中片段，以确定改写范围。';

      const emit = (payload) => aiChunkSubs.forEach((cb) => cb({ requestId, ...payload }));
      const canceled = () => {
        if (!aiAborted.has(requestId)) return false;
        aiAborted.delete(requestId);
        return true;
      };
      // 按 6~10 字符切片模拟流式，每片延时让渲染层能看到渐进效果。
      const stream = async (text, key) => {
        let i = 0;
        while (i < text.length) {
          const step = 6 + Math.floor(Math.random() * 5);
          const delta = text.slice(i, i + step);
          i += step;
          if (canceled()) return false;
          await new Promise((r) => setTimeout(r, 40));
          emit({ [key]: delta });
        }
        return true;
      };

      let content = '';
      if (reasoningText && !useThinkTag) {
        if (!(await stream(reasoningText, 'reasoning'))) {
          return { ok: false, error: '已取消', canceled: true };
        }
      }
      const body = reasoningText && useThinkTag ? `<think>${reasoningText}</think>\n${full}` : full;
      if (!(await stream(body, 'content'))) {
        return { ok: false, error: '已取消', canceled: true };
      }
      content = body;

      // 模拟 usage（真实服务需 stream_options.include_usage 才会返回）。
      const prompt = Math.round(systemText.length / 2) + Math.round(userText.length / 2) + 40;
      const completion = Math.round(content.length / 2) + 12;
      const cacheHit = Math.min(prompt, 64);
      return {
        ok: true,
        content,
        reasoning: useThinkTag ? '' : reasoningText,
        usage: {
          prompt,
          completion,
          total: prompt + completion,
          cacheHit,
          cacheMiss: prompt - cacheHit,
          reasoning: reasoningText && !useThinkTag ? Math.round(reasoningText.length / 2) : undefined,
        },
      };
    },
  };
}
