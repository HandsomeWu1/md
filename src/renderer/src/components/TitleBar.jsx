import React, { useState, useRef, useEffect } from 'react';

/**
 * 极简 TitleBar：
 * 1. 文件名居中（不放在左侧）
 * 2. 文件名旁边有向下小箭头，点击下拉显示「保存 / 另存为 / 重命名 / 在 Finder 中显示 / 关闭」
 * 3. 整个 TitleBar 背景色 = 编辑器背景色，**无 border-bottom**，让用户视觉上感觉「没有 TitleBar」
 * 4. macOS 红绿灯区域（左侧 80px）始终留给系统，仅占位透明
 */
export default function TitleBar({
  title,
  hasDocument, // 是否有打开的文档/标签页；无文档时只显示 app 名，不渲染下拉菜单
  sidebarOpen,
  outlineOpen,
  theme,
  leanMode,
  onToggleSidebar,
  onToggleOutline,
  onToggleTheme,
  onToggleLean,
  // 文件级操作
  onSave,
  onSaveAs,
  onRename,
  onReveal,
  onClose,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const runAndClose = (fn) => () => {
    closeMenu();
    if (fn) fn();
  };

  return (
    <div className="titlebar">
      {/* macOS 红绿灯占位区（可拖动） */}
      <div className="titlebar-traffic" />

      {/* 中间：有文档时显示「文件名 + 下拉」；无文档时只显示 app 名（纯文本，不可点） */}
      <div className="titlebar-center" ref={menuRef}>
        {hasDocument ? (
          <>
            <button
              type="button"
              className="titlebar-title-btn"
              onClick={() => setMenuOpen((v) => !v)}
              title={title}
            >
              <span className="title">{title || '未命名'}</span>
              <svg className="caret" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5l3 3 3-3" />
              </svg>
            </button>
            {menuOpen && (
              <div className="titlebar-menu" onMouseDown={(e) => e.stopPropagation()}>
                <button type="button" onClick={runAndClose(onSave)}>保存</button>
                <button type="button" onClick={runAndClose(onSaveAs)}>另存为…</button>
                <button type="button" onClick={runAndClose(onRename)}>重命名…</button>
                <button type="button" onClick={runAndClose(onReveal)}>在 Finder 中显示</button>
                <div className="titlebar-menu-sep" />
                <button type="button" onClick={runAndClose(onClose)}>关闭</button>
              </div>
            )}
          </>
        ) : (
          <span className="titlebar-appname">{title}</span>
        )}
      </div>

      {/* 右侧：所有操作按钮统一放这里（侧栏 / 大纲 / 主题 / 极简） */}
      <div className="titlebar-actions">
        <button
          type="button"
          className={'tb-btn' + (sidebarOpen ? ' active' : '')}
          onClick={onToggleSidebar}
          title="侧栏"
          aria-label="切换侧栏"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
            <line x1="6" y1="2.5" x2="6" y2="13.5" />
          </svg>
        </button>
        <button
          type="button"
          className="tb-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? '切换到浅色' : '切换到深色'}
          aria-label="切换主题"
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="8" cy="8" r="3" />
              <line x1="8" y1="1" x2="8" y2="2.5" />
              <line x1="8" y1="13.5" x2="8" y2="15" />
              <line x1="1" y1="8" x2="2.5" y2="8" />
              <line x1="13.5" y1="8" x2="15" y2="8" />
              <line x1="3" y1="3" x2="4.2" y2="4.2" />
              <line x1="11.8" y1="11.8" x2="13" y2="13" />
              <line x1="13" y1="3" x2="11.8" y2="4.2" />
              <line x1="4.2" y1="11.8" x2="3" y2="13" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className={'tb-btn' + (leanMode ? ' active' : '')}
          onClick={onToggleLean}
          title={leanMode ? '退出极简模式' : '极简模式'}
          aria-label="极简模式"
        >
          {leanMode ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M2 3h12M2 8h12M2 13h12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
              <path d="M2 7h12M2 10h12" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
