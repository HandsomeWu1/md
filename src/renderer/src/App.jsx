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
import Editor from './editor/Editor';
import { extractOutline, countWords, findInMarkdown, replaceAllInMarkdown } from './utils/markdown';
import { buildExportHtml } from './utils/export';
import { setFocusMode, setTypewriterMode } from './editor/modes';
import { actions } from './editor/commands';

let uid = 0;
const nextId = () => `tab-${++uid}`;
const baseName = (p) => (p ? p.split('/').pop() : '未命名');

export default function App() {
  // 在组件体内取 api，避免模块顶层固化 window.api（preload/mock 注入时机更晚时会拿到 undefined）。
  const api = window.api;
  const [settings, setSettings] = useState({ theme: 'light', headingNumbering: false, leanMode: false, fontSize: 13 });
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState('files');
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
      if (s && typeof s === 'object') setSettings((prev) => ({ ...prev, ...s }));
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

  const openPath = useCallback(
    async (p) => {
      if (!p) return;
      const res = await api.openPath(p);
      if (!res || res.ok === false || res.error) return;
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
    [createTab, addRecent]
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
    setFolderRoot(res.folderPath);
    // 重置展开/子项缓存，避免残留上一个文件夹的数据
    setExpanded(new Set());
    setChildrenMap({});
    const treeRes = await api.listTree(res.folderPath);
    console.error('[openFolder] folderPath =', res.folderPath, '| listTree 结果 =', JSON.stringify(treeRes));
    setFileTree(treeRes.ok ? treeRes.tree || [] : []);
    setSidebarOpen(true);
    setSidebarMode('files');
    api.setSettings({ lastOpenedFolder: res.folderPath });
  }, []);

  const newTab = useCallback(() => {
    createTab({});
  }, [createTab]);

  const selectFile = useCallback(
    async (p) => {
      if (/\.(md|markdown|mdown|txt)$/i.test(p)) {
        await openPath(p);
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
      updateTab(id, { markdown: md, dirty: true });
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
    const title = activeTab ? `${activeTab.name}${activeTab.dirty ? ' ●' : ''} - Margin` : 'Margin';
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
  const changeFontSize = useCallback((delta) => {
    setSettings((s) => {
      const cur = s.fontSize || 13;
      const next = Math.min(32, Math.max(12, cur + delta));
      if (next === cur) return s;
      api.setSettings({ fontSize: next });
      return { ...s, fontSize: next };
    });
  }, []);

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
        case 'view:toggle-outline':
          setSidebarOpen(true);
          setSidebarMode((m) => (m === 'outline' ? 'files' : 'outline'));
          break;
        case 'view:toggle-theme': toggleTheme(); break;
        case 'view:toggle-focus': toggleFocusMode(); break;
        case 'view:toggle-typewriter': toggleTypewriterMode(); break;
        case 'app:about':
          window.alert('Margin v0.1.0\n极简的所见即所得 Markdown 编辑器（macOS Apple Silicon）');
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
  // macOS 上 "+" 在 "=" 键上（需 Shift），因此同时匹配 '=' 与 '+'（以及 '-/' 的 '_' 兼容）
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        changeFontSize(1);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        changeFontSize(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changeFontSize]);

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
        title={activeTab ? activeTab.name : 'Margin'}
        hasDocument={!!activeTab}
        sidebarOpen={sidebarOpen}
        outlineOpen={sidebarMode === 'outline' && sidebarOpen}
        theme={theme}
        leanMode={!!settings.leanMode}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
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
              <Toolbar
                onAction={runToolbarAction}
                activeFormats={activeFormats}
                headingNumbering={!!settings.headingNumbering}
                onToggleHeadingNumbering={toggleHeadingNumbering}
                fontSize={settings.fontSize || 13}
                onChangeFontSize={changeFontSize}
              />
              <div
                className={'editor-container' + (settings.headingNumbering ? ' heading-numbering' : '')}
                style={{ '--editor-font-size': (settings.fontSize || 13) + 'px' }}
              >
                {activeTab && (
                  <Editor
                    key={activeTab.id}
                    ref={editorRef}
                    initialValue={activeTab.markdown}
                    onChange={handleEditorChange}
                    onSelectionChange={setActiveFormats}
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
      </div>

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
    </div>
  );
}
