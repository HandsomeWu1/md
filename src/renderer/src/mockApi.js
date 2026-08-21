// 浏览器预览模式：当不在 Electron 内（window.api 未注入）时，
// 注入一个内存版 mock API，让渲染层 UI 能在纯浏览器中渲染与交互。
// 文件读写为内存模拟，仅用于预览界面，不影响 Electron 下的真实行为。
export function installMockApi() {
  if (window.api) return;

  const memory = new Map();
  const noopUnsub = () => {};

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
    getSettings: async () => ({ theme: 'light', headingNumbering: false, leanMode: false, fontSize: 13 }),
    setSettings: async (p) => p,
    getRecentFiles: async () => [],
    addRecentFile: async () => [],
    clearRecentFiles: async () => [],
    setWindowTitle: async () => {},
    setDocumentEdited: async () => {},
    confirmAppClose: async () => {},
    onBeforeClose: () => noopUnsub,
    onMenu: () => noopUnsub,
    onOpenFile: () => noopUnsub,
  };
}
