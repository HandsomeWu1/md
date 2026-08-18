import React from 'react';

export default function Sidebar({ mode, onSetMode, children }) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button
          type="button"
          className={mode === 'files' ? 'active' : ''}
          onClick={() => onSetMode('files')}
        >
          文件
        </button>
        <button
          type="button"
          className={mode === 'outline' ? 'active' : ''}
          onClick={() => onSetMode('outline')}
        >
          大纲
        </button>
      </div>
      <div className="sidebar-content">{children}</div>
    </div>
  );
}
