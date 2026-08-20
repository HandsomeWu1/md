import React from 'react';

export default function TitleBar({
  title,
  sidebarOpen,
  outlineOpen,
  theme,
  leanMode,
  onToggleSidebar,
  onToggleOutline,
  onToggleTheme,
  onToggleLean,
}) {
  return (
    <div className="titlebar">
      <span className="title">{title}</span>
      <span className="spacer" />
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
        className={'tb-btn' + (outlineOpen ? ' active' : '')}
        onClick={onToggleOutline}
        title="大纲"
        aria-label="切换大纲"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <line x1="3" y1="4" x2="13" y2="4" />
          <line x1="6" y1="8" x2="13" y2="8" />
          <line x1="6" y1="12" x2="13" y2="12" />
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
  );
}
