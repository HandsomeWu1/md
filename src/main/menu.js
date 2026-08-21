'use strict';
const { Menu } = require('electron');

function buildMenu(getWindow) {
  const send = (action, payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('menu:action', action, payload);
    }
  };

  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [
          {
            label: 'Margin',
            submenu: [
              { role: 'about', label: '关于 Margin' },
              { type: 'separator' },
              { label: '偏好设置…', accelerator: 'Cmd+,', click: () => send('app:preferences') },
              { type: 'separator' },
              { role: 'services', label: '服务' },
              { type: 'separator' },
              { role: 'hide', label: '隐藏 Margin' },
              { role: 'hideOthers', label: '隐藏其他' },
              { role: 'unhide', label: '全部显示' },
              { type: 'separator' },
              { role: 'quit', label: '退出 Margin' },
            ],
          },
        ]
      : []),
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: () => send('file:new') },
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: () => send('file:open') },
        { label: '打开文件夹…', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('file:open-folder') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => send('file:save') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('file:save-as') },
        { type: 'separator' },
        { label: '导出为 HTML…', click: () => send('export:html') },
        { label: '导出为 PDF…', click: () => send('export:pdf') },
        { type: 'separator' },
        { label: '关闭标签页', accelerator: 'CmdOrCtrl+W', click: () => send('file:close-tab') },
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: '退出' }]),
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', click: () => send('edit:undo') },
        { label: '重做', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('edit:redo') },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
        { type: 'separator' },
        { label: '查找', accelerator: 'CmdOrCtrl+F', click: () => send('edit:find') },
        { label: '查找并替换', accelerator: 'CmdOrCtrl+Alt+F', click: () => send('edit:replace') },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '切换侧栏', accelerator: 'CmdOrCtrl+Shift+1', click: () => send('view:toggle-sidebar') },
        { label: '切换大纲', accelerator: 'CmdOrCtrl+Shift+2', click: () => send('view:toggle-outline') },
        { label: '切换主题', accelerator: 'CmdOrCtrl+Shift+L', click: () => send('view:toggle-theme') },
        { type: 'separator' },
        { label: 'Focus 模式', accelerator: 'CmdOrCtrl+Shift+F', click: () => send('view:toggle-focus') },
        { label: 'Typewriter 模式', accelerator: 'CmdOrCtrl+Shift+T', click: () => send('view:toggle-typewriter') },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front', label: '前置全部窗口' }] : []),
      ],
    },
    {
      role: 'help',
      label: '帮助',
      submenu: [{ label: '关于 Margin', click: () => send('app:about') }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildMenu };
