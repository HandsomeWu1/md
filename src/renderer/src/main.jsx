import React from 'react';
import { createRoot } from 'react-dom/client';
import { installMockApi } from './mockApi';
import App from './App';
import './styles/global.css';

// 非 Electron 环境（纯浏览器预览）下注入 mock API，避免 window.api 为 undefined。
installMockApi();

// 注意：不要使用 React.StrictMode。Milkdown 的 editor.create()/destroy() 是异步的，
// StrictMode 在开发模式下会 mount→unmount→remount 各执行一次 effect，
// 导致编辑器被「创建后又销毁」或两个实例争抢同一 DOM，表现为编辑器区域空白。
createRoot(document.getElementById('root')).render(<App />);
