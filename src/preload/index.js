'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// 暴露给渲染进程的最小化、白名单化 API。
const api = {
  // 对话框
  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  saveFileDialog: (name) => ipcRenderer.invoke('dialog:save-file', name),
  confirmClose: (name) => ipcRenderer.invoke('dialog:confirm-close', name),
  openPath: (p) => ipcRenderer.invoke('dialog:open-path', p),

  // 文件
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  writeFile: (p, content) => ipcRenderer.invoke('file:write', p, content),
  createFile: (dir, name) => ipcRenderer.invoke('file:create', dir, name),
  createFolder: (dir, name) => ipcRenderer.invoke('file:create-folder', dir, name),
  rename: (oldPath, newPath) => ipcRenderer.invoke('file:rename', oldPath, newPath),
  deletePath: (p) => ipcRenderer.invoke('file:delete', p),
  listTree: (root) => ipcRenderer.invoke('file:list-tree', root),
  revealInFinder: (p) => ipcRenderer.invoke('file:reveal', p),
  saveImage: (data, name) => ipcRenderer.invoke('image:save', data, name),

  // 导出
  exportHtml: (html, name) => ipcRenderer.invoke('export:html', html, name),
  exportPdf: (html, name) => ipcRenderer.invoke('export:pdf', html, name),

  // 设置 / 最近文件
  getSettings: () => ipcRenderer.invoke('app:get-settings'),
  setSettings: (partial) => ipcRenderer.invoke('app:set-settings', partial),
  getRecentFiles: () => ipcRenderer.invoke('app:get-recent'),
  addRecentFile: (p) => ipcRenderer.invoke('app:add-recent', p),
  clearRecentFiles: () => ipcRenderer.invoke('app:clear-recent'),

  // 窗口
  setWindowTitle: (title) => ipcRenderer.invoke('window:set-title', title),
  setDocumentEdited: (edited) => ipcRenderer.invoke('window:set-edited', edited),
  confirmAppClose: () => ipcRenderer.invoke('app:confirm-close'),

  // 关闭窗口前事件（主进程 → 渲染进程）
  onBeforeClose: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('app:before-close', handler);
    return () => ipcRenderer.removeListener('app:before-close', handler);
  },

  // AI
  aiChat: (payload) => ipcRenderer.invoke('ai:chat', payload),
  aiAbort: (requestId) => ipcRenderer.invoke('ai:abort', requestId),
  aiListModels: (payload) => ipcRenderer.invoke('ai:list-models', payload),
  onAiChunk: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('ai:chunk', handler);
    return () => ipcRenderer.removeListener('ai:chunk', handler);
  },

  // 菜单事件（主进程 → 渲染进程）
  onMenu: (cb) => {
    const handler = (_e, action, payload) => cb(action, payload);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },

  // Finder 打开文件事件
  onOpenFile: (cb) => {
    const handler = (_e, filePath) => cb(filePath);
    ipcRenderer.on('app:open-file', handler);
    return () => ipcRenderer.removeListener('app:open-file', handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
