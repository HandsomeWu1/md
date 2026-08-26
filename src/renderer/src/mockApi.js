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
    aiChat: async ({ requestId, messages }) => {
      // 取最后一条用户消息作为「问题」来源；识别改写模式以返回合法 Markdown 文档，
      // 方便在预览里测试「应用到文档」。
      const lastUser = [...(messages || [])].reverse().find((m) => m.role === 'user');
      const userText = (lastUser && lastUser.content) || '';
      const isRewrite = userText.includes('[改写模式]') ||
        (messages || []).some((m) => m.role === 'system' && /只输出改写后/.test(m.content || ''));

      const normalReply = '这是一段用于验证 UI 的模拟回复。AI 对话功能已在主进程侧链路完成接入，' +
        '渲染层通过 onAiChunk 接收流式增量并实时渲染到对话气泡中。';
      const rewriteReply = '# 改写后的文档\n\n' +
        '## 概述\n\n这是一段**由模拟改写模式返回**的 Markdown 文档，' +
        '用于验证「应用到文档」流程能够把 AI 输出写回编辑器。\n\n' +
        '## 要点\n\n- 第一条要点：保持原文的核心信息。\n- 第二条要点：语言更简洁通顺。\n\n' +
        '> 提示：这是引用块，用于确认 Markdown 渲染正常。';

      const full = isRewrite ? rewriteReply : normalReply;
      let content = '';
      // 按 6~10 字符切片模拟流式，每片延时让渲染层能看到渐进效果。
      let i = 0;
      while (i < full.length) {
        const step = 6 + Math.floor(Math.random() * 5);
        const delta = full.slice(i, i + step);
        i += step;
        // 发送前检查是否已被取消：若是则清理标记并立即返回取消结果。
        if (aiAborted.has(requestId)) {
          aiAborted.delete(requestId);
          return { ok: false, error: '已取消', canceled: true };
        }
        await new Promise((r) => setTimeout(r, 40));
        content += delta;
        aiChunkSubs.forEach((cb) => cb({ requestId, delta }));
      }
      return { ok: true, content };
    },
  };
}
