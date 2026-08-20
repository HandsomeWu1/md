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
let isQuitting = false; // 标记 app 正在退出（Cmd+Q / 菜单退出），此时放行 close 拦截

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

// 尽早初始化日志（在 whenReady 之前），这样即使 whenReady 之前就崩，也能留下记录。
try {
  logFile = path.join(app.getPath('userData'), 'startup.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
} catch {
  logFile = null;
}
log('===== PROCESS STARTED =====');
log('electron:', process.versions.electron, 'node:', process.versions.node);
log('platform:', process.platform, process.arch);

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
    show: true,
    // 背景色 = 渲染层 --bg，确保 TitleBar 透明时整窗无缝衔接。
    // 跟随主题切换：构造时取一次，避免主题切换瞬间白闪。
    backgroundColor: settingsStore.get().theme === 'dark' ? '#1f1f1f' : '#ffffff',
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

  // macOS 上使用系统自带的拼写检查器（自动检测语言），无需手动调用 setSpellCheckerLanguages。
  // （setSpellCheckerLanguages 是同步方法、在 macOS 上是 no-op，之前误写成 .catch() 导致启动崩溃。）

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

  // 关闭窗口前拦截：通知渲染层检查未保存文档，由渲染层决定是否真正关闭。
  // （极简模式/直接点红绿灯关闭时，未保存内容不应静默丢失。）
  // 但 app 退出（Cmd+Q / 菜单退出）时放行，否则会卡住退出流程。
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.webContents.send('app:before-close');
  });

  // 窗口已在构造时 show: true，这里只做加载结果日志。
  mainWindow.webContents.on('did-finish-load', () => log('DID FINISH LOAD'));
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
    log('===== WHEN READY =====');
    log('app version:', app.getVersion());
    log('cwd:', process.cwd());
    log('__dirname:', __dirname);

    const settings = settingsStore.get();
    nativeTheme.themeSource = settings.theme === 'dark' ? 'dark' : 'light';

    buildMenu(() => mainWindow);
    log('menu built');
    registerIpc();
    log('ipc registered');
    createWindow();
    log('createWindow called, mainWindow =', mainWindow ? 'ok' : 'null');
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

// app 退出（Cmd+Q / 菜单「退出」）前设置标志，放行窗口 close 拦截，让退出流程正常走完。
// 否则 close 的 preventDefault 会中止 app.quit()，表现为「Cmd+Q 不退出」。
app.on('before-quit', () => {
  isQuitting = true;
});
