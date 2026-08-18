# Typora Dev

Typora 风格的所见即所得（WYSIWYG）Markdown 桌面编辑器，面向 **macOS Apple Silicon（M 系列芯片）**。本项目为**原创实现**，使用开源 Markdown 编辑框架 Milkdown（其自身灵感即来自 Typora），不包含任何 Typora 的私有代码、资源或商标。

> 应用图标使用 `service/md-preview/src/md_preview/static/logo.png`。

## 功能（v1 · 核心体验）

- **所见即所得 Markdown 编辑**：基于 Milkdown（ProseMirror），支持 CommonMark + GFM（标题、列表、任务列表、表格、删除线、代码块、引用、链接、图片、分割线等），输入即渲染。
- **侧栏文件树**：打开文件夹后浏览目录，点击打开 `.md/.markdown/.mdown/.txt` 文件。
- **大纲（TOC）**：侧栏切换「大纲」标签，展示文档标题结构，点击跳转。
- **明暗主题**：`Cmd+Shift+L` 或标题栏/状态栏按钮切换，自动持久化。
- **多标签页**：标签栏切换/关闭/新建，未保存标签显示圆点。
- **自动保存**：有路径的文件编辑后自动写盘（约 0.8s 防抖）。
- **导出 HTML / PDF**：通过菜单「文件 → 导出为 HTML / PDF」。
- **查找 / 替换**：`Cmd+F`（查找）、`Cmd+Alt+F`（替换），支持区分大小写、逐个替换与全部替换。
- **字数统计**：状态栏实时显示字数与字符数（中英文统一按「字」计数）。
- **最近文件**：欢迎页与文件菜单记录最近打开的文件。
- **原生 macOS 体验**：`hiddenInset` 标题栏、原生菜单、红绿灯未保存圆点、`Cmd+Q/W/N/O/S` 等快捷键、Finder 直接打开 `.md`。

## 技术栈

- **Electron**（主进程 / preload / 打包）
- **Milkdown v7** + React（`@milkdown/kit`、`@milkdown/react`、`@milkdown/theme-nord`）—— 所见即所得编辑器
- **markdown-it** —— 导出 HTML/PDF 的渲染
- **Vite** —— 渲染层构建
- **electron-builder** —— 打包 `.dmg` / `.zip`

## 目录结构

```
typora-dev/
├── package.json
├── electron-builder.yml        # 打包配置（mac arm64）
├── vite.config.mjs             # 渲染层构建配置
├── build/
│   └── icon.png                # 应用图标（1024×1024）
├── scripts/
│   ├── build-mac-arm64.sh      # 一键构建 .dmg/.zip
│   └── dev.sh                  # 本地开发
└── src/
    ├── main/                   # Electron 主进程
    │   ├── index.js            # 窗口、生命周期
    │   ├── menu.js             # 原生菜单
    │   ├── ipc.js              # IPC 处理器
    │   ├── file-service.js     # 文件读写 + 授权模型
    │   ├── export-service.js   # HTML/PDF 导出
    │   └── store.js            # 设置/最近文件持久化
    ├── preload/index.js        # contextBridge 白名单 API
    └── renderer/               # React 渲染层
        ├── index.html
        ├── public/logo.png
        └── src/
            ├── App.jsx         # 主逻辑
            ├── editor/         # Milkdown 集成
            ├── components/     # UI 组件
            ├── utils/          # 大纲/字数/导出工具
            └── styles/         # 主题与样式
```

## 环境要求

- **macOS Apple Silicon**（M1/M2/M3/M4 等）
- **Node.js ≥ 20**（含 npm）
- 构建 `.dmg` 时首次会下载 Electron 二进制

## 构建（macOS arm64）

```bash
cd typora-dev
npm install
npm run dist:mac-arm64
```

产物输出到 `release/`：`Typora Dev-0.1.0-arm64.dmg` 与 `-arm64-mac.zip`。

也可以直接用脚本：

```bash
bash scripts/build-mac-arm64.sh
```

> 说明：**Electron 的 macOS `.app` 无法在 Linux/Windows 上交叉构建**，必须在 macOS 上执行上述命令。

## 本地开发

```bash
npm run dev
```

将启动 Vite dev server（热更新）并拉起 Electron 窗口（加载 `http://127.0.0.1:5173`）。

## 代码签名（可选）

默认构建为**未签名**（`electron-builder.yml` 中 `identity: null`），适合本机自用。若需签名分发，请：

1. 准备 Apple Developer ID 证书；
2. 移除 `mac.identity: null`，设置 `hardenedRuntime: true`；
3. 配置 `CSC_LINK` / `CSC_KEY_PASSWORD` 环境变量后重新构建；
4. 如需公证（notarization），配置 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` 并加入 `notarize` 配置。

## 安全模型

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，渲染层仅能通过 `preload` 暴露的白名单 `window.api` 与主进程通信。
- **路径授权模型**：渲染层只能读写用户通过「打开文件 / 打开文件夹」显式授权的路径，任意路径访问会被主进程拒绝，防止渲染层被劫持后越权访问磁盘。
- CSP 限制脚本/资源来源；禁用页面导航、`window.open` 与 webview；导出时关闭 markdown-it 的 raw HTML 透传（防 XSS）。
- 密钥/凭据一律走环境变量，不入库。

## 已知限制与后续规划

- 未签名构建首次打开可能触发 Gatekeeper 提示，本机构建一般可正常运行；如遇「已损坏」，执行 `xattr -cr /Applications/Typora\ Dev.app`。
- 查找匹配当前在文档源码层计数与替换，暂未在编辑器内做高亮滚动（v2 计划）。
- 标签切换会重建编辑器实例，跨标签的撤销历史不保留（v1 取舍）。
- 规划中：图片拖拽/粘贴、KaTeX 数学公式、代码高亮、Mermaid 流程图、Focus/Typewriter 模式、脚注、目录索引、命令面板、拼写检查、PDF 高级选项、签名与公证 CI。
