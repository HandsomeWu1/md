'use strict';
const { app, BrowserWindow, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { buildMenu } = require('./menu');
const { registerIpc } = require('./ipc');
const { settingsStore } = require('./store');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow = null;
let pendingFilePath = null;

// 启动日志：写入 userData 目录，便于「点击无反应」时排查。
let logFile = null;
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  try {
    if (process.env.NODE_ENV !== 'production') console.log(line);
    if (logFile) fs.appendFileSync(logFile, line + '\n', 'utf8');
  } catch {
    // 日志失败不影响启动
  }
}

// 全局异常兜底：任何未捕获异常都记录，避免「静默退出」无从排查。
process.on('uncaughtException', (err) => {
  log('UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
  log('UNHANDLED REJECTION:', reason);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 760,
    minHeight: 480,
    title: 'Typora Dev',
    show: false,
    backgroundColor: '#ffffff',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });

  // 启用拼写检查（英文优先；中文拼写检查依赖系统词典，macOS 原生支持）。
  mainWindow.webContents.session.setSpellCheckerLanguages(['en-US']).catch(() => {});

  // 安全加固：禁止页面导航离开应用、禁止 window.open / webview
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 错误日志：渲染进程崩溃 / 页面加载失败 / preload 失败 / 渲染层 console 报错
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log('RENDER PROCESS GONE:', details.reason);
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('DID FAIL LOAD:', code, desc, url);
  });
  mainWindow.webContents.on('preload-error', (_e, preloadPath, err) => {
    log('PRELOAD ERROR:', preloadPath, err && err.message);
  });
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) log('RENDERER CONSOLE:', message);
  });

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }

  // 显示窗口：ready-to-show 触发时显示；同时加 3 秒超时兜底，
  // 避免「渲染进程加载失败导致 ready-to-show 永不触发、窗口永不显示」。
  let shown = false;
  const doShow = () => {
    if (shown || !mainWindow || mainWindow.isDestroyed()) return;
    shown = true;
    mainWindow.show();
    log('WINDOW SHOWN');
  };
  mainWindow.once('ready-to-show', doShow);
  setTimeout(doShow, 3000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function sendPendingFile() {
  if (pendingFilePath && mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('app:open-file', pendingFilePath);
      pendingFilePath = null;
    });
  }
}

// macOS: 从 Finder 打开 .md 文件
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('app:open-file', filePath);
  } else {
    pendingFilePath = filePath;
  }
});

app.whenReady().then(() => {
  try {
    logFile = path.join(app.getPath('userData'), 'startup.log');
    log('===== APP START =====');
    log('app version:', app.getVersion());
    log('platform:', process.platform, process.arch);
    log('cwd:', process.cwd());
    log('__dirname:', __dirname);

    const settings = settingsStore.get();
    nativeTheme.themeSource = settings.theme === 'dark' ? 'dark' : 'light';

    buildMenu(() => mainWindow);
    registerIpc();
    createWindow();
    sendPendingFile();
  } catch (err) {
    log('WHEN_READY ERROR:', err && err.stack ? err.stack : err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
