'use strict';
const { ipcMain, dialog, BrowserWindow, nativeTheme } = require('electron');
const fileService = require('./file-service');
const { exportHtml, exportPdf } = require('./export-service');
const { settingsStore } = require('./store');

const MARKDOWN_FILTERS = [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] }];

function getWin(e) {
  return BrowserWindow.fromWebContents(e.sender);
}

// 将同步/异步处理器包装为 { ok, ... } 结构，避免渲染层收到异常
function safe(fn) {
  return async (...args) => {
    try {
      return { ok: true, ...(await fn(...args)) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };
}

function registerIpc() {
  // ---------- 对话框 ----------
  ipcMain.handle('dialog:open-file', async (e) => {
    const win = getWin(e);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: MARKDOWN_FILTERS,
    });
    if (canceled || !filePaths[0]) return { canceled: true };
    const p = filePaths[0];
    fileService.grantFile(p);
    try {
      return { canceled: false, filePath: p, content: fileService.readFile(p) };
    } catch (err) {
      return { canceled: false, filePath: p, content: '', error: err.message };
    }
  });

  ipcMain.handle('dialog:open-folder', async (e) => {
    const win = getWin(e);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || !filePaths[0]) return { canceled: true };
    fileService.grantFolder(filePaths[0]);
    return { canceled: false, folderPath: filePaths[0] };
  });

  ipcMain.handle('dialog:save-file', async (e, name) => {
    const win = getWin(e);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: name || 'untitled.md',
      filters: MARKDOWN_FILTERS,
    });
    return { canceled, filePath };
  });

  // 通过路径直接打开（最近文件 / Finder 拖入），授权并读取
  ipcMain.handle('dialog:open-path', async (_e, p) => {
    try {
      fileService.grantFile(p);
      return { ok: true, filePath: p, content: fileService.readFile(p) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---------- 文件 ----------
  ipcMain.handle('file:read', safe((p) => ({ content: fileService.readFile(p) })));
  ipcMain.handle('file:write', safe((p, c) => ({ savedAt: fileService.writeFile(p, c) })));
  ipcMain.handle('file:create', safe((dir, name) => ({ path: fileService.createFile(dir, name) })));
  ipcMain.handle('file:create-folder', safe((dir, name) => ({ path: fileService.createFolder(dir, name) })));
  ipcMain.handle('file:rename', safe((oldP, newP) => ({ path: fileService.rename(oldP, newP) })));
  ipcMain.handle('file:delete', safe((p) => { fileService.deletePath(p); return {}; }));
  ipcMain.handle('file:list-tree', safe((root) => ({ tree: fileService.listTree(root) })));
  ipcMain.handle('file:reveal', safe((p) => { fileService.reveal(p); return {}; }));

  // ---------- 导出 ----------
  ipcMain.handle('export:html', async (e, html, name) => {
    try {
      return await exportHtml(getWin(e), html, name);
    } catch (err) {
      return { error: err.message };
    }
  });
  ipcMain.handle('export:pdf', async (e, html, name) => {
    try {
      return await exportPdf(getWin(e), html, name);
    } catch (err) {
      return { error: err.message };
    }
  });

  // ---------- 设置 / 最近文件 ----------
  ipcMain.handle('app:get-settings', () => settingsStore.get());
  ipcMain.handle('app:set-settings', (_e, partial) => {
    const next = settingsStore.set(partial || {});
    if (partial && partial.theme) {
      nativeTheme.themeSource = partial.theme === 'dark' ? 'dark' : 'light';
    }
    return next;
  });
  ipcMain.handle('app:get-recent', () => settingsStore.getRecent());
  ipcMain.handle('app:add-recent', (_e, p) => settingsStore.addRecent(p));
  ipcMain.handle('app:clear-recent', () => settingsStore.clearRecent());

  // ---------- 窗口 ----------
  ipcMain.handle('window:set-title', (e, title) => {
    getWin(e)?.setTitle(title || 'Typora Dev');
  });
  ipcMain.handle('window:set-edited', (e, edited) => {
    getWin(e)?.setDocumentEdited(!!edited);
  });
}

module.exports = { registerIpc };
