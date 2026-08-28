import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import FileTree from './components/FileTree';
import Outline from './components/Outline';
import TabBar from './components/TabBar';
import StatusBar from './components/StatusBar';
import SearchDialog from './components/SearchDialog';
import Welcome from './components/Welcome';
import InputDialog from './components/InputDialog';
import Toolbar from './components/Toolbar';
import CodeView from './components/CodeView';
import AiPanel from './components/AiPanel';
import AiSettingsDialog from './components/AiSettingsDialog';
import SelectionAiMenu from './components/SelectionAiMenu';
import DiffConfirmBar from './components/DiffConfirmBar';
import { useAiChat, NO_DOC_KEY } from './hooks/useAiChat';
import Editor from './editor/Editor';
import { extractOutline, countWords, findInMarkdown, replaceAllInMarkdown } from './utils/markdown';
import { buildExportHtml } from './utils/export';
import { settingsApi } from './utils/settings';
import { setFocusMode, setTypewriterMode } from './editor/modes';
import { actions } from './editor/commands';
import { editorViewCtx } from '@milkdown/kit/core';

let uid = 0;
const nextId = () => `tab-${++uid}`;
const baseName = (p) => (p ? p.split('/').pop() : '未命名');

// 递归收集文件夹下所有 Markdown 文本文件，供「整个文件夹」作用域作为上下文 / 改写目标。
async function collectFolderMdFiles(api, root) {
  const out = [];
  const walk = async (dir) => {
    const res = await api.listTree(dir);
    if (!res || !res.ok) return;
    for (const node of res.tree || []) {
      const p = node.path;
      if (node.isDir) {
        await walk(p);
      } else if (/\.(md|markdown|mdown|txt)$/i.test(p)) {
        const r = await api.readFile(p);
        out.push({ name: baseName(p), path: p, markdown: (r && r.ok ? r.content : '') || '', kind: 'md' });
      }
    }
  };
  await walk(root);
  return out;
}

export default function App() {
  // 在组件体内取 api，避免模块顶层固化 window.api（preload/mock 注入时机更晚时会拿到 undefined）。
  const api = window.api;
  const [settings, setSettings] = useState({ theme: 'light', headingNumbering: false, leanMode: false, fontSize: 13 });
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState('files');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  // AI 作用域：'doc' 当前文档 | 'tabs' 已打开文件 | 'folder' 整个打开的文件夹
  const [aiScope, setAiScope] = useState('doc');
  // 选区浮动 AI 菜单的位置（视口坐标），null 表示隐藏
  const [aiSelMenu, setAiSelMenu] = useState(null);
  // 待确认的 AI 改动：{ tabId, snapshot, added, changed, removed, coarse }
  const [aiDiff, setAiDiff] = useState(null);
  const [folderRoot, setFolderRoot] = useState(null);
  const [fileTree, setFileTree] = useState([]);
  const [childrenMap, setChildrenMap] = useState({});
  const [expanded, setExpanded] = useState(() => new Set());
  const [recentFiles, setRecentFiles] = useState([]);
  const [search, setSearch] = useState({
    open: false,
    mode: 'find',
    query: '',
    replace: '',
    caseSensitive: false,
    matches: [],
    index: -1,
  });
  const [focusModeOn, setFocusModeOn] = useState(false);
  const [typewriterModeOn, setTypewriterModeOn] = useState(false);
  const [activeFormats, setActiveFormats] = useState({});
  // 文件操作输入弹窗：{ title, placeholder, defaultValue, onConfirm }
  const [filePrompt, setFilePrompt] = useState(null);
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  const [filePromptValue, setFilePromptValue] = useState('');

  const editorRef = useRef(null);
  const suppressRef = useRef(false);
  const saveTimerRef = useRef(null);

  // 镜像最新状态供事件回调读取，避免闭包陈旧
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const aiDiffRef = useRef(aiDiff);
  aiDiffRef.current = aiDiff;
  const aiScopeRef = useRef(aiScope);
  aiScopeRef.current = aiScope;
  // 「整个文件夹」作用域下读到的文件缓存，避免每次发送都重新遍历磁盘
  const aiFolderDocsCacheRef = useRef({ key: null, files: [] });
  const folderRootRef = useRef(folderRoot);
  folderRootRef.current = folderRoot;

  // 选区菜单按视口坐标固定定位，滚动/缩放后位置会失真，直接隐藏。
  useEffect(() => {
    const close = () => setAiSelMenu(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, []);

  const theme = settings.theme;
  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  const outline = useMemo(() => extractOutline(activeTab?.markdown || ''), [activeTab?.markdown]);
  const stats = useMemo(() => countWords(activeTab?.markdown || ''), [activeTab?.markdown]);

  // 同步主题到根元素，让 CSS 的 [data-theme='dark'] 变量生效
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 启动时加载持久化设置（主题、标题编号等）
  useEffect(() => {
    api.getSettings().then((s) => {
      if (s && typeof s === 'object') {
        setSettings((prev) => {
          const merged = { ...prev, ...s };
          // 防御：fontSize 必须是 12–32 的有效数字，否则回退默认 13
          const fs = Number(merged.fontSize);
          merged.fontSize = Number.isFinite(fs) && fs >= 12 && fs <= 32 ? fs : 13;
          return merged;
        });
      }
    });
  }, []);

  // ---------- 基础工具 ----------
  const updateTab = useCallback((id, patch) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const addRecent = useCallback(async (p) => {
    if (!p) return;
    const list = await api.addRecentFile(p);
    setRecentFiles(list || []);
  }, []);

  // 惰性加载某目录的一层子项
  const loadChildren = useCallback(async (dirPath) => {
    const res = await api.listTree(dirPath);
    if (res.ok) {
      setChildrenMap((prev) => ({ ...prev, [dirPath]: res.tree || [] }));
    }
  }, []);

  // 刷新整个文件树（顶层 + 所有已展开目录）
  const refreshTree = useCallback(async () => {
    if (!folderRoot) return;
    const treeRes = await api.listTree(folderRoot);
    if (treeRes.ok) setFileTree(treeRes.tree || []);
    const dirs = Array.from(expandedRef.current);
    const newMap = {};
    await Promise.all(
      dirs.map(async (dir) => {
        const res = await api.listTree(dir);
        if (res.ok) newMap[dir] = res.tree || [];
      })
    );
    setChildrenMap((prev) => ({ ...prev, ...newMap }));
  }, [folderRoot]);

  // ---------- 打开 / 新建 ----------
  const createTab = useCallback((payload) => {
    const id = nextId();
    const tab = { id, path: null, name: '未命名', markdown: '', dirty: false, savedAt: null, ...payload };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(id);
    return id;
  }, []);

  // 按路径打开文件夹（拖放目录时复用，不弹系统对话框）
  const openFolderByPath = useCallback(async (folderPath) => {
    if (!folderPath) return;
    setFolderRoot(folderPath);
    // 重置展开/子项缓存，避免残留上一个文件夹的数据
    setExpanded(new Set());
    setChildrenMap({});
    const treeRes = await api.listTree(folderPath);
    setFileTree(treeRes.ok ? treeRes.tree || [] : []);
    setSidebarOpen(true);
    setSidebarMode('files');
    api.setSettings({ lastOpenedFolder: folderPath });
  }, []);

  // 按路径智能打开：文件→右侧 tab；目录→打开文件夹
  const openPath = useCallback(
    async (p) => {
      if (!p) return;
      const res = await api.openPath(p);
      if (!res || res.ok === false || res.error) {
        if (res && res.error) setToast(`无法打开：${res.error}`);
        return;
      }
      if (res.isDirectory) {
        await openFolderByPath(res.filePath);
        return;
      }
      const existing = tabsRef.current.find((t) => t.path === res.filePath);
      if (existing) {
        setActiveTabId(existing.id);
        return;
      }
      createTab({
        path: res.filePath,
        name: baseName(res.filePath),
        markdown: res.content || '',
        dirty: false,
        savedAt: new Date().toISOString(),
      });
      addRecent(res.filePath);
    },
    [createTab, addRecent, openFolderByPath]
  );

  const openFileDialog = useCallback(async () => {
    const res = await api.openFileDialog();
    if (res.canceled) return;
    const existing = tabsRef.current.find((t) => t.path === res.filePath);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    createTab({ path: res.filePath, name: baseName(res.filePath), markdown: res.content || '', dirty: false });
    addRecent(res.filePath);
  }, [createTab, addRecent]);

  const openFolderDialog = useCallback(async () => {
    const res = await api.openFolderDialog();
    if (res.canceled || !res.folderPath) return;
    await openFolderByPath(res.folderPath);
  }, [openFolderByPath]);

  // 从桌面/文件夹拖放文件或目录进窗口直接打开。
  // 用 window 捕获阶段监听，确保不被编辑器（CodeMirror）内部的 drop 处理截断冒泡；
  // 仅当 dataTransfer 含 Files（外部文件拖拽）才拦截，内部文本拖拽不受影响。
  useEffect(() => {
    const hasFiles = (dt) =>
      !!(dt && (Array.from(dt.items || []).some((i) => i.kind === 'file') || (dt.files && dt.files.length > 0)));
    const onDragOver = (e) => {
      // 必须无条件阻止 dragover 默认行为，drop 事件才会触发
      // （dragover 阶段 dataTransfer.items/files 可能尚未填充，不能据此判定）
      e.preventDefault();
    };
    const onDrop = async (e) => {
      const dt = e.dataTransfer;
      if (!hasFiles(dt)) return; // 内部文本拖拽不拦截
      e.preventDefault();
      const paths = [];
      if (dt.files) {
        for (const f of dt.files) if (f && f.path) paths.push(f.path);
      }
      // 回退：部分环境下 files[].path 为空，改从 items 取
      if (!paths.length && dt.items) {
        for (const it of dt.items) {
          if (it.kind === 'file') {
            const f = it.getAsFile();
            if (f && f.path) paths.push(f.path);
          }
        }
      }
      const valid = paths.filter(Boolean);
      if (!valid.length) {
        setToast('无法读取拖放的文件路径');
        return;
      }
      for (const p of valid) {
        await openPath(p);
      }
    };
    window.addEventListener('dragover', onDragOver, true);
    window.addEventListener('drop', onDrop, true);
    return () => {
      window.removeEventListener('dragover', onDragOver, true);
      window.removeEventListener('drop', onDrop, true);
    };
  }, [openPath]);

  const newTab = useCallback(() => {
    createTab({});
  }, [createTab]);

  const selectFile = useCallback(
    async (p) => {
      if (/\.(md|markdown|mdown|txt)$/i.test(p)) {
        await openPath(p);
        return;
      }
      // 非 Markdown 文本文件：像 md 一样开成右侧 tab（可编辑 + 轻量高亮），其余弹提示
      const ext = p.split(/[\\/]/).pop().split('.').pop().toLowerCase();
      const previewable = [
        'yaml', 'yml', 'json', 'js', 'ts', 'jsx', 'tsx', 'css', 'scss',
        'html', 'csv', 'toml', 'ini', 'conf', 'log', 'xml', 'sh', 'py', 'java', 'c', 'cpp', 'go', 'rs',
      ];
      if (previewable.includes(ext)) {
        try {
          // api.readFile 经 IPC safe() 包装，返回 { ok, content }，需取 .content
          const res = await api.readFile(p);
          if (!res || res.ok === false) {
            setToast(`无法读取文件：${res?.error || '未知错误'}`);
            return;
          }
          let content = res.content;
          if (ext === 'json') {
            try {
              content = JSON.stringify(JSON.parse(content), null, 2);
            } catch {
              /* 非标准 JSON 直接展示原文 */
            }
          }
          const existing = tabsRef.current.find((t) => t.path === p);
          if (existing) {
            setActiveTabId(existing.id);
            return;
          }
          createTab({
            path: p,
            name: baseName(p),
            markdown: content || '',
            dirty: false,
            savedAt: new Date().toISOString(),
            kind: 'code',
            lang: ext,
          });
          addRecent(p);
        } catch (e) {
          setToast(`无法读取文件：${e?.message || e}`);
        }
      } else {
        setToast(`暂不支持预览该文件类型：.${ext}`);
      }
    },
    [openPath]
  );

  // ---------- 文件树操作：新建文件/文件夹、重命名、删除 ----------
  const newFileInDir = useCallback(
    (dirPath) => {
      const dir = dirPath || folderRoot;
      if (!dir) return openFolderDialog();
      setFilePromptValue('untitled.md');
      setFilePrompt({
        title: '新建 Markdown 文件',
        placeholder: '文件名（自动补 .md 后缀）',
        onConfirm: async (name) => {
          let finalName = name.trim();
          if (!finalName) return;
          if (!/\.(md|markdown|mdown|txt)$/i.test(finalName)) finalName += '.md';
          const res = await api.createFile(dir, finalName);
          if (res.ok) {
            await loadChildren(dir);
            if (dir === folderRoot) {
              const treeRes = await api.listTree(dir);
              if (treeRes.ok) setFileTree(treeRes.tree || []);
            }
            if (/\.(md|markdown|mdown|txt)$/i.test(res.path)) {
              await openPath(res.path);
            }
          }
        },
      });
    },
    [folderRoot, openFolderDialog, loadChildren, openPath]
  );

  const newFolderInDir = useCallback(
    (dirPath) => {
      const dir = dirPath || folderRoot;
      if (!dir) return openFolderDialog();
      setFilePromptValue('');
      setFilePrompt({
        title: '新建文件夹',
        placeholder: '文件夹名',
        onConfirm: async (name) => {
          const finalName = name.trim();
          if (!finalName) return;
          const res = await api.createFolder(dir, finalName);
          if (res.ok) {
            await loadChildren(dir);
            if (dir === folderRoot) {
              const treeRes = await api.listTree(dir);
              if (treeRes.ok) setFileTree(treeRes.tree || []);
            }
            setExpanded((prev) => new Set(prev).add(dir));
          }
        },
      });
    },
    [folderRoot, openFolderDialog, loadChildren]
  );

  const renamePath = useCallback(
    (p, isDir) => {
      const oldName = p.split('/').pop();
      setFilePromptValue(oldName);
      setFilePrompt({
        title: '重命名',
        placeholder: '新名称',
        onConfirm: async (name) => {
          const finalName = name.trim();
          if (!finalName || finalName === oldName) return;
          const dir = p.slice(0, p.lastIndexOf('/'));
          const newPath = dir + '/' + finalName;
          const res = await api.rename(p, newPath);
          if (res.ok) {
            await loadChildren(dir);
            if (dir === folderRoot) {
              const treeRes = await api.listTree(dir);
              if (treeRes.ok) setFileTree(treeRes.tree || []);
            }
            setTabs((prev) => prev.map((t) => (t.path === p ? { ...t, path: newPath, name: finalName } : t)));
          }
        },
      });
    },
    [folderRoot, loadChildren]
  );

  // 拖拽：把文件移动到目标文件夹（改变其所在目录）
  const moveFile = useCallback(
    async (srcPath, destDir) => {
      const name = srcPath.split(/[\\/]/).pop();
      const dest = (destDir.endsWith('/') ? destDir : destDir + '/') + name;
      if (srcPath === dest) return;
      try {
        const res = await api.rename(srcPath, dest);
        if (res.ok) {
          const srcDir = srcPath.replace(/[\\/][^\\/]*$/, '');
          await loadChildren(srcDir);
          await loadChildren(destDir);
          if (srcDir === folderRoot || destDir === folderRoot) {
            const treeRes = await api.listTree(folderRoot);
            if (treeRes.ok) setFileTree(treeRes.tree || []);
          }
          setTabs((prev) => prev.map((t) => (t.path === srcPath ? { ...t, path: dest } : t)));
        }
      } catch (e) {
        setToast(`移动失败：${e?.message || e}`);
      }
    },
    [folderRoot, loadChildren]
  );

  // header 上「重命名」：有路径走文件系统重命名；未保存的新文件改标签名。
  const promptRenameTab = useCallback(() => {
    const t = tabsRef.current.find((x) => x.id === activeTabIdRef.current);
    if (!t) return;
    if (t.path) {
      renamePath(t.path, false);
      return;
    }
    // 未保存文件：只改标签名（不涉及磁盘）
    setFilePromptValue(t.name || '未命名');
    setFilePrompt({
      title: '重命名',
      placeholder: '新名称',
      onConfirm: (name) => {
        const finalName = name.trim();
        if (!finalName) return;
        updateTab(t.id, { name: finalName });
      },
    });
  }, [renamePath, updateTab]);

  const revealPath = useCallback(async (p) => {
    if (!p) return;
    await api.revealInFinder(p);
  }, []);

  const deletePath = useCallback(
    async (p, isDir) => {
      const confirmText = isDir
        ? `确定删除文件夹「${p.split('/').pop()}」及其所有内容吗？此操作不可撤销。`
        : `确定删除文件「${p.split('/').pop()}」吗？此操作不可撤销。`;
      if (!window.confirm(confirmText)) return;
      const res = await api.deletePath(p);
      if (res.ok) {
        const dir = p.slice(0, p.lastIndexOf('/'));
        await loadChildren(dir);
        if (dir === folderRoot) {
          const treeRes = await api.listTree(dir);
          if (treeRes.ok) setFileTree(treeRes.tree || []);
        }
        // 关闭被删除文件的标签
        setTabs((prev) => prev.filter((t) => t.path !== p));
      }
    },
    [folderRoot, loadChildren]
  );

  // ---------- 关闭 / 切换标签 ----------
  const closeTab = useCallback(async (id) => {
    const t = tabsRef.current.find((x) => x.id === id);
    if (!t) return;

    // 未保存时，弹「保存/不保存/取消」确认框
    if (t.dirty) {
      const res = await api.confirmClose(t.name || '未命名');
      if (res.response === 2) return; // 取消：不关闭
      if (res.response === 0) {
        // 保存后再关闭
        if (t.path) {
          const w = await api.writeFile(t.path, t.markdown);
          if (!w.ok) return; // 保存失败则不关闭
        } else {
          // 无路径：弹另存为
          const name = (t.name || '未命名') + '.md';
          const sv = await api.saveFileDialog(name);
          if (sv.canceled || !sv.filePath) return;
          const w = await api.writeFile(sv.filePath, t.markdown);
          if (!w.ok) return;
          addRecent(sv.filePath);
        }
      }
      // response === 1 表示「不保存」，直接继续关闭
    }

    const idx = tabsRef.current.findIndex((x) => x.id === id);
    const remaining = tabsRef.current.filter((x) => x.id !== id);
    setTabs(remaining);
    if (activeTabIdRef.current === id) {
      const nextActive = remaining[Math.min(idx, remaining.length - 1)];
      setActiveTabId(nextActive ? nextActive.id : null);
    }
  }, [addRecent]);

  const switchTab = useCallback((id) => {
    if (id !== activeTabIdRef.current) setActiveTabId(id);
  }, []);

  // ---------- 编辑 ----------
  const handleEditorChange = useCallback(
    (md) => {
      if (suppressRef.current) return;
      const id = activeTabIdRef.current;
      if (!id) return;
      // 剔除空行字号用的零宽占位字符，保存到 .md 时文件保持干净
      updateTab(id, { markdown: md.replace(/\u200B/g, ''), dirty: true });
    },
    [updateTab]
  );

  // 代码视图（yaml/json 等）的内容变更：直接写入 tab.markdown，复用自动保存
  const handleCodeChange = useCallback(
    (v) => {
      const id = activeTabIdRef.current;
      if (!id) return;
      updateTab(id, { markdown: v, dirty: true });
    },
    [updateTab]
  );

  // ---------- 保存 ----------
  const saveAs = useCallback(
    async (id) => {
      const t = tabsRef.current.find((x) => x.id === id);
      if (!t) return;
      const name = (t.path ? baseName(t.path) : t.name || '未命名') + '.md';
      const res = await api.saveFileDialog(name);
      if (res.canceled || !res.filePath) return;
      const w = await api.writeFile(res.filePath, t.markdown);
      if (!w.ok) {
        // 保存失败：明确提示，不静默吞错
        window.alert(`保存失败：${w.error || '未知错误'}`);
        return;
      }
      updateTab(id, { path: res.filePath, name: baseName(res.filePath), dirty: false, savedAt: w.savedAt });
      addRecent(res.filePath);
      // 保存后刷新文件树，让新文件立即显示
      await refreshTree();
    },
    [updateTab, addRecent, refreshTree]
  );

  const doSave = useCallback(
    async (id) => {
      const t = tabsRef.current.find((x) => x.id === id);
      if (!t) return;
      if (t.path) {
        const res = await api.writeFile(t.path, t.markdown);
        if (res.ok) {
          updateTab(id, { dirty: false, savedAt: res.savedAt });
          api.setDocumentEdited(false);
        } else {
          window.alert(`保存失败：${res.error || '未知错误'}`);
        }
      } else {
        await saveAs(id);
      }
    },
    [updateTab, saveAs]
  );

  // ---------- 自动保存 ----------
  useEffect(() => {
    if (!activeTab || !activeTab.dirty || !activeTab.path) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const res = await api.writeFile(activeTab.path, activeTab.markdown);
      if (res.ok) {
        updateTab(activeTab.id, { dirty: false, savedAt: res.savedAt });
        api.setDocumentEdited(false);
      }
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [activeTab?.markdown, activeTab?.dirty, activeTab?.path, activeTab?.id, updateTab]);

  // ---------- 窗口标题 / 未保存标记 ----------
  useEffect(() => {
    const title = activeTab ? `${activeTab.name}${activeTab.dirty ? ' ●' : ''} - Margin-AI` : 'Margin-AI';
    api.setWindowTitle(title);
    api.setDocumentEdited(!!(activeTab && activeTab.dirty));
  }, [activeTab?.name, activeTab?.dirty]);

  // ---------- 导出 ----------
  const doExport = useCallback(
    async (type) => {
      const t = tabsRef.current.find((x) => x.id === activeTabIdRef.current);
      if (!t) return;
      const title = t.name || 'Untitled';
      const html = buildExportHtml(t.markdown, { title, theme });
      const name = title.replace(/\.(md|markdown|mdown|txt)$/i, '');
      if (type === 'html') await api.exportHtml(html, name + '.html');
      else await api.exportPdf(html, name + '.pdf');
    },
    [theme]
  );

  // ---------- 查找 / 替换 ----------
  const runSearch = useCallback((query, caseSensitive) => {
    const t = tabsRef.current.find((x) => x.id === activeTabIdRef.current);
    const matches = findInMarkdown(t?.markdown || '', query, caseSensitive);
    setSearch((s) => ({ ...s, matches, index: matches.length ? 0 : -1 }));
  }, []);

  // 统一维护编辑器内高亮：搜索框关闭时清除高亮，否则按当前 query/index 高亮（当前项更突出）。
  useEffect(() => {
    if (!search.open) {
      editorRef.current?.setSearchHighlight('', false, 0);
      return;
    }
    editorRef.current?.setSearchHighlight(search.query, search.caseSensitive, search.index);
  }, [search.open, search.query, search.caseSensitive, search.index]);

  // 在查找对话框内切换「替换」模式
  const toggleSearchMode = useCallback(() => {
    setSearch((s) => ({ ...s, mode: s.mode === 'replace' ? 'find' : 'replace' }));
  }, []);

  const doReplace = useCallback(
    (all) => {
      const t = tabsRef.current.find((x) => x.id === activeTabIdRef.current);
      if (!t) return;
      const { query, replace, caseSensitive, matches, index } = searchRef.current;
      if (!query) return;
      let newMarkdown = t.markdown;
      let count = 0;
      if (all) {
        const r = replaceAllInMarkdown(t.markdown, query, replace, caseSensitive);
        newMarkdown = r.text;
        count = r.count;
      } else if (matches[index]) {
        const m = matches[index];
        newMarkdown = t.markdown.slice(0, m.from) + replace + t.markdown.slice(m.to);
        count = 1;
      }
      if (!count) return;
      suppressRef.current = true;
      editorRef.current?.setMarkdown(newMarkdown);
      suppressRef.current = false;
      updateTab(t.id, { markdown: newMarkdown, dirty: true });
      runSearch(query, caseSensitive);
    },
    [updateTab, runSearch]
  );

  // 用 ref 镜像 search，供 doReplace 读取最新值
  const searchRef = useRef(search);
  searchRef.current = search;

  // ---------- AI 面板 ----------
  // 这些回调都用 refs 读取最新状态并保持引用稳定：AiPanel 会把 getSelection
  // 注册到 selectionchange 监听上，函数引用每次渲染都变会导致反复解绑重绑。
  const aiGetDocument = useCallback(() => {
    const t = tabsRef.current.find((x) => x.id === activeTabIdRef.current);
    return t ? t.markdown || '' : '';
  }, []);

  const aiGetSelection = useCallback(() => {
    const t = tabsRef.current.find((x) => x.id === activeTabIdRef.current);
    // 代码视图没有 Milkdown 实例，取不到结构化选区。
    if (!t || t.kind === 'code') return { empty: true, text: '' };
    return editorRef.current?.getSelectionMarkdown() || { empty: true, text: '' };
  }, []);

  const aiGetTabId = useCallback(() => activeTabIdRef.current, []);
  const aiGetMaxChars = useCallback(() => settingsApi.get().aiMaxContextChars || 60000, []);
  const aiGetCanRewrite = useCallback(() => {
    // 工作区作用域按文件名定位目标，不受当前激活标签类型限制
    if ((aiScopeRef.current || 'doc') !== 'doc') return true;
    const t = tabsRef.current.find((x) => x.id === activeTabIdRef.current);
    return !!t && t.kind !== 'code';
  }, []);
  const aiGetScope = useCallback(() => aiScopeRef.current || 'doc', []);
  const aiGetWorkspaceDocs = useCallback(async (scope) => {
    if (scope === 'folder') {
      const root = folderRootRef.current;
      if (!root) return [];
      if (aiFolderDocsCacheRef.current.key === root && aiFolderDocsCacheRef.current.files) {
        return aiFolderDocsCacheRef.current.files;
      }
      const files = await collectFolderMdFiles(api, root);
      aiFolderDocsCacheRef.current = { key: root, files };
      return files;
    }
    // 'tabs'：所有已打开的标签（md 与代码都纳入上下文，但只有 md 可改写）
    return tabsRef.current.map((t) => ({
      name: t.name,
      path: t.path || '',
      markdown: t.markdown || '',
      kind: t.kind || 'md',
    }));
  }, []);
  // 工作区改写后跳到其中一个被改的文件，让用户看到高亮 / 结果
  const aiOnRewritten = useCallback((tabId) => {
    if (tabId) switchTab(tabId);
  }, [switchTab]);
  // 这些 getter 必须读 settingsApi 的同步缓存，而非 settingsRef.current：
  // AiSettingsDialog 通过 settingsApi.set 写入，读 settingsRef 会拿到启动时的旧值，
  // 导致系统提示词等改了却"不生效"。
  const aiGetSystemPrompt = useCallback(() => settingsApi.get().aiSystemPrompt || '', []);
  const aiGetPrice = useCallback(() => {
    const s = settingsApi.get();
    return {
      priceIn: s.aiPriceIn || 0,
      priceOut: s.aiPriceOut || 0,
      priceCached: s.aiPriceCached || 0,
      currency: s.aiCurrency || '¥',
    };
  }, []);

  /**
   * 把 AI 改写结果写入文档，并在正文里标注改动位置。
   *
   * 两个必须拒绝写入的情况（都会返回 ok:false 并说明原因，绝不写错地方）：
   * 1. 请求完成时用户已切到别的文档 —— 结果属于原文档，不能落到当前文档上；
   * 2. 基于选区的改写，但文档在等待期间已被改动 —— 记录的位置可能已错位。
   */
  const applyAiRewrite = useCallback(
    async ({ tabId, target, text, range, docSnapshot, cleared }) => {
      // 工作区改写：模型指名目标文件，按文件名 / 路径定位（可能改写多个文件之一）
      if (target) {
        const tname = target.replace(/\s*\(.*\)$/, '').trim();
        const tab = tabsRef.current.find(
          (x) =>
            x.path === target ||
            x.name === tname ||
            (x.path && (baseName(x.path) === tname || x.path.endsWith('/' + tname) || x.path.endsWith('\\' + tname)))
        );
        if (tab) {
          if (tab.kind === 'code') return { ok: false, reason: `${tab.name} 是代码视图，暂不支持改写` };
          // 文件名在 buildWorkspaceContext 里可能以 `name (path)` 展示，去掉后缀再匹配
          if (tab.id === activeTabIdRef.current) {
            const res = editorRef.current?.applyMarkdownWithDiff(text, {});
            if (!res || !res.ok) return { ok: false, reason: '写入失败，请重试' };
            setAiDiff({
              tabId: tab.id,
              snapshot: tab.markdown,
              added: res.added,
              changed: res.changed,
              removed: res.removed,
              coarse: !!res.coarse,
              cleared: !!cleared,
            });
            return {
              tabId: tab.id,
              ok: true,
              added: res.added,
              changed: res.changed,
              removed: res.removed,
              coarse: !!res.coarse,
              cleared: !!cleared,
            };
          }
          // 打开但非激活：直接更新内容 + 落盘（实例未挂载，不显示高亮）
          updateTab(tab.id, { markdown: text, dirty: true });
          if (tab.path) await api.writeFile(tab.path, text);
          return { tabId: tab.id, ok: true, coarse: true, reason: '已写入（切到该文件查看）' };
        }
        // 未打开：尝试按完整路径或文件夹缓存解析后直接写磁盘
        let diskPath = target.includes('/') || target.includes('\\') ? target : null;
        if (!diskPath) {
          const cache = aiFolderDocsCacheRef.current.files || [];
          const f = cache.find((x) => x.name === tname);
          if (f) diskPath = f.path;
        }
        if (!diskPath) return { ok: false, reason: `未找到文件：${target}` };
        const w = await api.writeFile(diskPath, text);
        return { tabId: null, ok: !!w.ok, reason: w.ok ? '已写入磁盘文件' : w.error || '写入失败', coarse: true };
      }

      // 当前文档改写（doc 作用域）
      // 无文档会话（NO_DOC_KEY）不对应任何标签，理论上模型已被告知不能改写，
      // 但仍要防住它硬输出改写标记的情况。
      if (tabId === NO_DOC_KEY) return { ok: false, reason: '没有打开的文档，未写入' };
      const t = tabsRef.current.find((x) => x.id === tabId);
      if (!t) return { ok: false, reason: '文档已关闭，未写入' };
      if (tabId !== activeTabIdRef.current) {
        return { ok: false, reason: '文档已切换，未写入（请切回后重新改写）' };
      }
      if (t.kind === 'code') return { ok: false, reason: '代码视图不支持改写' };
      if (range && (t.markdown || '') !== docSnapshot) {
        return { ok: false, reason: '文档在改写期间已变动，未写入（请重新选中后再试）' };
      }

      const res = editorRef.current?.applyMarkdownWithDiff(text, { range });
      if (!res || !res.ok) return { ok: false, reason: '写入失败，请重试' };

      // 记录改写前内容，供「撤销」一键恢复——比依赖 undo 栈更可预期
      // （用户在确认前可能已经手动编辑过若干次）。
      setAiDiff({
        tabId,
        snapshot: docSnapshot,
        added: res.added,
        changed: res.changed,
        removed: res.removed,
        coarse: !!res.coarse,
        cleared: !!cleared,
      });
      return {
        ok: true,
        added: res.added,
        changed: res.changed,
        removed: res.removed,
        coarse: !!res.coarse,
        cleared: !!cleared,
      };
    },
    []
  );

  const ai = useAiChat({
    getTabId: aiGetTabId,
    getDocument: aiGetDocument,
    getSelection: aiGetSelection,
    getMaxChars: aiGetMaxChars,
    getCanRewrite: aiGetCanRewrite,
    getSystemPrompt: aiGetSystemPrompt,
    getPrice: aiGetPrice,
    applyRewrite: applyAiRewrite,
    aliveTabIds: tabs.map((t) => t.id),
    getScope: aiGetScope,
    getWorkspaceDocs: aiGetWorkspaceDocs,
    onRewritten: aiOnRewritten,
    setScope: setAiScope,
  });

  // 保留改动：仅清除标注，内容维持不变。
  const keepAiDiff = useCallback(() => {
    editorRef.current?.clearDiffHighlight();
    setAiDiff(null);
  }, []);

  // 撤销改动：用改写前的快照整篇恢复，并清除标注。
  const revertAiDiff = useCallback(() => {
    const d = aiDiffRef.current;
    if (!d) return;
    suppressRef.current = true;
    editorRef.current?.setMarkdown(d.snapshot);
    suppressRef.current = false;
    editorRef.current?.clearDiffHighlight();
    updateTab(d.tabId, { markdown: d.snapshot, dirty: true });
    setAiDiff(null);
  }, [updateTab]);

  const saveAiSettings = useCallback((patch) => {
    setSettings((s) => ({ ...s, ...patch }));
    api.setSettings(patch);
    setAiSettingsOpen(false);
  }, []);

  const aiConfigured = !!(settings.aiBaseUrl && settings.aiModel && settings.aiApiKey);

  // 切换文档时结束待确认状态：编辑器实例会随标签重建、标注无法延续，
  // 而改动本身已经写进文档，因此「切走」等同于默认保留（仍可用 ⌘Z 回退）。
  useEffect(() => {
    if (aiDiff && aiDiff.tabId !== activeTabId) setAiDiff(null);
  }, [activeTabId, aiDiff]);



  // ---------- 主题 ----------
  const toggleTheme = useCallback(() => {
    setSettings((s) => {
      const next = { ...s, theme: s.theme === 'dark' ? 'light' : 'dark' };
      api.setSettings({ theme: next.theme });
      return next;
    });
  }, []);

  const toggleHeadingNumbering = useCallback(() => {
    setSettings((s) => {
      const next = { ...s, headingNumbering: !s.headingNumbering };
      api.setSettings({ headingNumbering: next.headingNumbering });
      return next;
    });
  }, []);

  // ---------- 正文字号（12–32px，步进 1px，持久化） ----------
  // 字号调整：有选区时只改选区字号（fontSize 标记）；
  // 无选区时只改「光标所在段落」的字号，而不是整篇文档。
  const applyFontSizeDelta = useCallback(
    (delta) => {
      const editor = editorRef.current?.getEditor();
      if (!editor) return;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const { from, to, empty } = state.selection;
        const markType = state.schema.marks.fontSize;
        if (!markType) return;
        const def = settings.fontSize || 13;
        const tr = state.tr;
        if (empty) {
          // 无选区：作用于光标所在块（段落）。
          // 空行（块内无内容，或仅含占位零宽字符）时，插入/更新一个不可见的零宽字符承载字号，
          // 使空行即时反映出字号（光标/行高变化）；保存 .md 时会剔除该零宽字符，文件保持干净。
          const ZWSP = '\u200B';
          const $from = state.doc.resolve(from);
          const depth = $from.depth;
          const start = $from.start(depth);
          const end = $from.end(depth);
          const textContent = state.doc.textBetween(start, end, '');
          const isPlaceholderLine = textContent === ZWSP;
          const probe = start === end ? from : start + 1;
          const at = state.doc.resolve(probe).marks().find((m) => m.type === markType);
          const cur = at ? Number(at.attrs.size) : def;
          const next = Math.min(96, Math.max(8, Math.round((cur || def) + delta)));
          if (next <= 8) {
            tr.removeMark(start, end, markType);
            tr.setStoredMarks([]);
            if (isPlaceholderLine) tr.delete(start, end); // 删掉占位字符，恢复真正空行
          } else if (isPlaceholderLine || start === end) {
            // 空块：用占位零宽字符承载字号，空行即时反映大小
            const mark = markType.create({ size: next });
            if (isPlaceholderLine) {
              tr.removeMark(start, end, markType);
              tr.addMark(start, end, mark);
            } else {
              tr.insert(from, state.schema.text(ZWSP, [mark]));
            }
            tr.setStoredMarks([mark]);
          } else {
            tr.addMark(start, end, markType.create({ size: next }));
          }
          view.dispatch(tr.scrollIntoView());
          return;
        }
        const at = state.doc.resolve(from + 1).marks().find((m) => m.type === markType);
        const cur = at ? Number(at.attrs.size) : def;
        const next = Math.min(96, Math.max(8, Math.round((cur || def) + delta)));
        if (next <= 8) tr.removeMark(from, to, markType);
        else tr.addMark(from, to, markType.create({ size: next }));
        view.dispatch(tr.scrollIntoView());
      });
    },
    [settings.fontSize]
  );

  // ---------- 极简模式 ----------
  const toggleLean = useCallback(() => {
    setSettings((s) => {
      const next = { ...s, leanMode: !s.leanMode };
      api.setSettings({ leanMode: next.leanMode });
      return next;
    });
    setTimeout(() => editorRef.current?.refresh(), 0);
  }, []);

  // ---------- 编辑模式（Focus / Typewriter） ----------
  const toggleFocusMode = useCallback(() => {
    setFocusModeOn((v) => {
      const next = !v;
      setFocusMode(next);
      setTimeout(() => editorRef.current?.refresh(), 0);
      return next;
    });
  }, []);

  const toggleTypewriterMode = useCallback(() => {
    setTypewriterModeOn((v) => {
      const next = !v;
      setTypewriterMode(next);
      return next;
    });
  }, []);

  // ---------- 大纲跳转 ----------
  const jumpToHeading = useCallback((index) => {
    const headings = document.querySelectorAll(
      '.milkdown h1, .milkdown h2, .milkdown h3, .milkdown h4, .milkdown h5, .milkdown h6'
    );
    headings[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // ---------- 工具栏动作 ----------
  const runToolbarAction = useCallback((name, ...args) => {
    const editor = editorRef.current?.getEditor();
    if (!editor) return;
    const fn = actions[name];
    if (fn) fn(editor, ...args);
    // 命令执行后重新聚焦编辑器，确保光标可见
    setTimeout(() => editorRef.current?.focus(), 0);
  }, []);

  // ---------- 菜单 ----------
  const handleMenu = useCallback(
    (action) => {
      switch (action) {
        case 'file:new': newTab(); break;
        case 'file:open': openFileDialog(); break;
        case 'file:open-folder': openFolderDialog(); break;
        case 'file:save': if (activeTabIdRef.current) doSave(activeTabIdRef.current); break;
        case 'file:save-as': if (activeTabIdRef.current) saveAs(activeTabIdRef.current); break;
        case 'file:close-tab': if (activeTabIdRef.current) closeTab(activeTabIdRef.current); break;
        case 'export:html': doExport('html'); break;
        case 'export:pdf': doExport('pdf'); break;
        case 'edit:undo': editorRef.current?.undo(); break;
        case 'edit:redo': editorRef.current?.redo(); break;
        case 'edit:find':
          setSearch((s) => ({ ...s, open: true, mode: 'find' }));
          // 打开时用当前查询词重新搜索，避免文档已更新却仍显示旧结果
          runSearch(searchRef.current.query, searchRef.current.caseSensitive);
          break;
        case 'edit:replace':
          setSearch((s) => ({ ...s, open: true, mode: 'replace' }));
          runSearch(searchRef.current.query, searchRef.current.caseSensitive);
          break;
        case 'view:toggle-sidebar': setSidebarOpen((v) => !v); break;
        case 'view:toggle-ai': setAiOpen((v) => !v); break;
        case 'view:toggle-outline':
          setSidebarOpen(true);
          setSidebarMode((m) => (m === 'outline' ? 'files' : 'outline'));
          break;
        case 'view:toggle-theme': toggleTheme(); break;
        case 'view:toggle-focus': toggleFocusMode(); break;
        case 'view:toggle-typewriter': toggleTypewriterMode(); break;
        case 'app:about':
          window.alert('Margin-AI v0.1.0\n极简的所见即所得 Markdown 编辑器（macOS Apple Silicon）');
          break;
        case 'app:preferences': toggleTheme(); break;
        default: break;
      }
    },
    [newTab, openFileDialog, openFolderDialog, doSave, saveAs, closeTab, doExport, toggleTheme, toggleFocusMode, toggleTypewriterMode, runSearch]
  );

  const handleMenuRef = useRef(handleMenu);
  handleMenuRef.current = handleMenu;
  const openPathRef = useRef(openPath);
  openPathRef.current = openPath;

  // 订阅菜单与 Finder 打开事件（仅一次）
  useEffect(() => {
    const offMenu = api.onMenu((a) => handleMenuRef.current(a));
    const offOpen = api.onOpenFile((p) => openPathRef.current(p));
    return () => {
      offMenu();
      offOpen();
    };
  }, []);

  // 关闭窗口前：逐个确认未保存文档，全部处理完后才真正关闭。
  // （极简模式 / 直接点红绿灯关闭时，未保存内容不应静默丢失。）
  const handleBeforeClose = useCallback(async () => {
    const dirtyTabs = tabsRef.current.filter((t) => t.dirty);
    for (const t of dirtyTabs) {
      const res = await api.confirmClose(t.name || '未命名');
      if (res.response === 2) return; // 取消：中止关闭
      if (res.response === 0) {
        // 保存后再关闭
        if (t.path) {
          const w = await api.writeFile(t.path, t.markdown);
          if (!w.ok) { window.alert(`保存失败：${w.error || '未知错误'}`); return; }
        } else {
          const name = (t.name || '未命名') + '.md';
          const sv = await api.saveFileDialog(name);
          if (sv.canceled || !sv.filePath) return; // 取消另存为 = 中止关闭
          const w = await api.writeFile(sv.filePath, t.markdown);
          if (!w.ok) { window.alert(`保存失败：${w.error || '未知错误'}`); return; }
        }
      }
      // response === 1（不保存）继续下一个
    }
    api.confirmAppClose();
  }, []);

  useEffect(() => {
    const off = api.onBeforeClose(() => handleBeforeClose());
    return off;
  }, [handleBeforeClose]);

  // 极简模式快捷键：Cmd+Shift+L（macOS）/ Ctrl+Shift+L（其他）
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        toggleLean();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleLean]);

  // 字号快捷键：Cmd/Ctrl + "+" 放大、Cmd/Ctrl + "-" 缩小
  // 有选区时作用于选区，无选区时调整整篇默认字号。
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.code === 'Equal') {
        e.preventDefault();
        e.stopPropagation();
        applyFontSizeDelta(1);
      } else if (e.code === 'Minus') {
        e.preventDefault();
        e.stopPropagation();
        applyFontSizeDelta(-1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [applyFontSizeDelta]);

  // ---------- 渲染 ----------
  const handleToggleExpand = useCallback(
    (p) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(p)) {
          next.delete(p);
        } else {
          next.add(p);
          // 展开时惰性加载子项
          if (childrenMap[p] == null) loadChildren(p);
        }
        return next;
      });
    },
    [childrenMap, loadChildren]
  );

  const sidebarContent =
    sidebarMode === 'files' ? (
      <FileTree
        tree={fileTree}
        expanded={expanded}
        childrenMap={childrenMap}
        activePath={activeTab?.path || null}
        onSelectFile={selectFile}
        onToggleExpand={handleToggleExpand}
        onOpenFolder={openFolderDialog}
        onNewFile={newFileInDir}
        onNewFolder={newFolderInDir}
        onRename={renamePath}
        onDelete={deletePath}
        onRefresh={refreshTree}
        onReveal={revealPath}
        onMoveFile={moveFile}
        rootName={folderRoot ? folderRoot.split('/').pop() : null}
      />
    ) : (
      <Outline
        items={outline}
        activeIndex={-1}
        onJump={jumpToHeading}
        headingNumbering={!!settings.headingNumbering}
      />
    );

  return (
    <div className={'app' + (settings.leanMode ? ' lean-mode' : '')}>
      <TitleBar
        title={activeTab ? activeTab.name : 'Margin-AI'}
        hasDocument={!!activeTab}
        sidebarOpen={sidebarOpen}
        outlineOpen={sidebarMode === 'outline' && sidebarOpen}
        aiOpen={aiOpen}
        theme={theme}
        leanMode={!!settings.leanMode}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onToggleAi={() => setAiOpen((v) => !v)}
        onToggleOutline={() => {
          setSidebarOpen(true);
          setSidebarMode((m) => (m === 'outline' ? 'files' : 'outline'));
        }}
        onToggleTheme={toggleTheme}
        onToggleLean={toggleLean}
        onSave={activeTabId ? () => doSave(activeTabId) : null}
        onSaveAs={activeTabId ? () => saveAs(activeTabId) : null}
        onRename={promptRenameTab}
        onReveal={activeTab && activeTab.path ? () => revealPath(activeTab.path) : null}
        onClose={activeTabId ? () => closeTab(activeTabId) : null}
      />

      {/* 极简模式下标题栏操作被隐藏，这里放一个浮动「退出极简模式」按钮 */}
      {settings.leanMode && (
        <button className="lean-exit-btn" onClick={toggleLean} title="退出极简模式">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h12M2 8h12M2 13h12" />
          </svg>
        </button>
      )}

      <div className="app-body">
        {sidebarOpen && (
          <Sidebar mode={sidebarMode} onSetMode={setSidebarMode}>
            {sidebarContent}
          </Sidebar>
        )}

        <div className="main-area">
          {tabs.length > 0 && (
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={switchTab}
              onCloseTab={closeTab}
              onNewTab={newTab}
            />
          )}

          {tabs.length === 0 ? (
            <Welcome
              recentFiles={recentFiles}
              onOpenRecent={openPath}
              onNewFile={newTab}
              onOpenFile={openFileDialog}
              onOpenFolder={openFolderDialog}
              onClearRecent={async () => setRecentFiles(await api.clearRecentFiles())}
            />
          ) : (
            <div className="editor-wrap">
              {activeTab.kind !== 'code' && (
                <Toolbar
                  onAction={runToolbarAction}
                  activeFormats={activeFormats}
                  headingNumbering={!!settings.headingNumbering}
                  onToggleHeadingNumbering={toggleHeadingNumbering}
                  fontSize={activeFormats.fontSize != null ? activeFormats.fontSize : settings.fontSize || 13}
                  onChangeFontSize={applyFontSizeDelta}
                />
              )}
              {/* AI 改动确认条：紧贴正文上方，用户在文档里看着高亮做取舍 */}
              {aiDiff && aiDiff.tabId === activeTabId && (
                <DiffConfirmBar
                  added={aiDiff.added}
                  changed={aiDiff.changed}
                  removed={aiDiff.removed}
                  coarse={aiDiff.coarse}
                  cleared={aiDiff.cleared}
                  onKeep={keepAiDiff}
                  onRevert={revertAiDiff}
                  onLocate={() => editorRef.current?.scrollToFirstDiff()}
                />
              )}
              <div
                className={'editor-container' + (settings.headingNumbering ? ' heading-numbering' : '')}
                style={{ '--editor-font-size': (settings.fontSize || 13) + 'px' }}
              >
                {activeTab && activeTab.kind === 'code' ? (
                  <CodeView
                    key={activeTab.id}
                    value={activeTab.markdown}
                    onChange={handleCodeChange}
                  />
                ) : activeTab && (
                  <Editor
                    key={activeTab.id}
                    ref={editorRef}
                    initialValue={activeTab.markdown}
                    onChange={handleEditorChange}
                    onSelectionChange={setActiveFormats}
                    onSelectionRectChange={(rect) => setAiSelMenu(rect)}
                  />
                )}
              </div>
            </div>
          )}

          <StatusBar
            words={stats.words}
            characters={stats.characters}
            dirty={!!(activeTab && activeTab.dirty)}
            savedAt={activeTab?.savedAt}
          />
        </div>

        {/* AI 面板：极简模式下与其它 chrome 一同隐藏，保持纯净写作视图 */}
        {aiOpen && !settings.leanMode && (
          <AiPanel
            configured={aiConfigured}
            canRewrite={!!activeTab && activeTab.kind !== 'code'}
            hasDocument={!!activeTab}
            scope={aiScope}
            onScopeChange={setAiScope}
            session={ai.session}
            onSend={ai.send}
            onStop={ai.stop}
            onInputChange={ai.setInput}
            onClear={ai.clear}
            getSelection={aiGetSelection}
            onOpenSettings={() => setAiSettingsOpen(true)}
            onClose={() => setAiOpen(false)}
          />
        )}

        {/* 选区浮动 AI 菜单：选中文本时出现在选区上方，提供改写/翻译/生成图表等快捷动作 */}
        <SelectionAiMenu
          rect={aiSelMenu && aiConfigured ? aiSelMenu : null}
          onAction={(preset) => {
            // 浮动菜单的预设是「选区改写」：强制走改写协议、直接写进文档，
            // 不要在对话框里当成对话回复，也不要打开/抢占 AI 面板的焦点
            // （否则焦点跑到回复框、第二次选区就改写不动了）。
            // 改写结果由正文上方的 DiffConfirmBar 确认即可。
            ai.runPreset(preset.instruction);
            setAiSelMenu(null);
          }}
          onClose={() => setAiSelMenu(null)}
        />
      </div>

      <AiSettingsDialog
        open={aiSettingsOpen}
        onClose={() => setAiSettingsOpen(false)}
      />

      <SearchDialog
        open={search.open}
        mode={search.mode}
        query={search.query}
        replaceText={search.replace}
        caseSensitive={search.caseSensitive}
        matchCount={search.matches.length}
        currentIndex={search.index}
        onClose={() => setSearch((s) => ({ ...s, open: false }))}
        onQueryChange={(q) => {
          setSearch((s) => ({ ...s, query: q }));
          runSearch(q, searchRef.current.caseSensitive);
        }}
        onReplaceTextChange={(r) => setSearch((s) => ({ ...s, replace: r }))}
        onCaseSensitiveChange={(c) => {
          setSearch((s) => ({ ...s, caseSensitive: c }));
          runSearch(searchRef.current.query, c);
        }}
        onNext={() =>
          setSearch((s) => ({ ...s, index: s.matches.length ? (s.index + 1) % s.matches.length : -1 }))
        }
        onPrev={() =>
          setSearch((s) => ({
            ...s,
            index: s.matches.length ? (s.index - 1 + s.matches.length) % s.matches.length : -1,
          }))
        }
        onReplace={() => doReplace(false)}
        onReplaceAll={() => doReplace(true)}
        onToggleMode={toggleSearchMode}
      />

      {/* 文件操作输入弹窗（新建文件/文件夹、重命名） */}
      <InputDialog
        open={!!filePrompt}
        title={filePrompt?.title || ''}
        value={filePromptValue}
        placeholder={filePrompt?.placeholder || ''}
        onChange={setFilePromptValue}
        selectOnOpen
        onConfirm={() => {
          const fn = filePrompt?.onConfirm;
          const v = filePromptValue;
          setFilePrompt(null);
          if (fn) fn(v);
        }}
        onCancel={() => setFilePrompt(null)}
      />

      {/* 轻量提示（如不支持的文件类型） */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
