'use strict';
const { app, BrowserWindow, shell, nativeTheme } = require('electron');
const path = require('path');
const { buildMenu } = require('./menu');
const { registerIpc } = require('./ipc');
const { settingsStore } = require('./store');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

let mainWindow = null;
let pendingFilePath = null;

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

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
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
  const settings = settingsStore.get();
  nativeTheme.themeSource = settings.theme === 'dark' ? 'dark' : 'light';

  buildMenu(() => mainWindow);
  registerIpc();
  createWindow();
  sendPendingFile();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
