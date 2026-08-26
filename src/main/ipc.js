'use strict';
const { ipcMain, dialog, BrowserWindow, nativeTheme, app } = require('electron');
const fs = require('fs');
const path = require('path');
const fileService = require('./file-service');
const { exportHtml, exportPdf } = require('./export-service');
const { settingsStore } = require('./store');
const aiService = require('./ai-service');

const MARKDOWN_FILTERS = [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] }];

function getWin(e) {
  return BrowserWindow.fromWebContents(e.sender);
}

// 将同步/异步处理器包装为 { ok, ... } 结构，避免渲染层收到异常。
// 关键：ipcMain.handle 的 handler 第一个参数是 event（IpcMainInvokeEvent），
// 渲染层 invoke 传的参数从第二个开始。这里用 _event 接收并跳过它，
// 再把真正的参数传给 fn。
function safe(fn) {
  return async (_event, ...args) => {
    try {
      return { ok: true, ...(await fn(...args)) };
    } catch (err) {
      console.error('[IPC error]', err && err.stack ? err.stack : err);
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
    // 关键：用户主动通过对话框选中的路径必须授权，否则后续 file:write
    // 会因「未授权」被 file-service 拒绝，导致新建文件保存假成功。
    if (!canceled && filePath) {
      try {
        fileService.grantFile(filePath);
      } catch {}
    }
    return { canceled, filePath };
  });

  // 关闭未保存标签时的确认：返回 0=保存, 1=不保存, 2=取消
  ipcMain.handle('dialog:confirm-close', async (e, name) => {
    const win = getWin(e);
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['保存', '不保存', '取消'],
      defaultId: 0,
      cancelId: 2,
      message: `是否保存对「${name}」的更改？`,
      detail: '如果不保存，你的更改将丢失。',
    });
    return { response };
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

  // ---------- 图片保存（拖拽/粘贴图片时） ----------
  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif']);
  ipcMain.handle('image:save', (_e, data, name) => {
    try {
      const dir = path.join(app.getPath('userData'), 'images');
      fs.mkdirSync(dir, { recursive: true });
      let ext = (path.extname(name || '') || '.png').toLowerCase();
      if (!IMAGE_EXTS.has(ext)) ext = '.png';
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const filePath = path.join(dir, safeName);
      fs.writeFileSync(filePath, Buffer.from(data));
      return { ok: true, path: filePath, url: 'file://' + filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

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
    getWin(e)?.setTitle(title || 'Margin-AI');
  });
  ipcMain.handle('window:set-edited', (e, edited) => {
    getWin(e)?.setDocumentEdited(!!edited);
  });

  // 渲染层确认关闭（未保存文档已处理完毕）后，真正销毁窗口。
  // 用 destroy() 跳过 close 拦截，避免再次触发 app:before-close 死循环。
  ipcMain.handle('app:confirm-close', (e) => {
    const win = getWin(e);
    if (win && !win.isDestroyed()) win.destroy();
  });

  // ---------- AI ----------
  // 流式对话：主进程拉取流式增量后，逐段回推渲染层；窗口若已销毁则静默跳过，
  // 避免向已回收的 webContents 发送事件导致 Electron 报错。
  // 不使用 safe() 包装：需要把 canceled 标记原样回传，让 UI 区分「取消」与「失败」。
  ipcMain.handle('ai:chat', async (e, payload) => {
    const { requestId, messages } = payload || {};
    try {
      const { content } = await aiService.chat({
        requestId,
        messages,
        onDelta: (delta) => {
          if (!e.sender.isDestroyed()) {
            e.sender.send('ai:chunk', { requestId, delta });
          }
        },
      });
      return { ok: true, content };
    } catch (err) {
      return { ok: false, error: err.message, canceled: !!err.canceled };
    }
  });

  // 取消进行中的请求：渲染层点「停止」时调用，按 requestId 中止对应 fetch。
  ipcMain.handle('ai:abort', (_e, requestId) => {
    aiService.abort(requestId);
    return { ok: true };
  });
}

module.exports = { registerIpc };
