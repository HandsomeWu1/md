import React from 'react';

export default function Welcome({
  recentFiles,
  onOpenRecent,
  onNewFile,
  onOpenFile,
  onOpenFolder,
  onClearRecent,
}) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1>Margin</h1>
        <div className="welcome-actions">
          <button type="button" onClick={onNewFile}>
            新建
          </button>
          <button type="button" onClick={onOpenFile}>
            打开
          </button>
          <button type="button" onClick={onOpenFolder}>
            打开文件夹
          </button>
        </div>

        <div className="welcome-recent">
          <div className="welcome-recent-head">
            <h2>最近打开</h2>
            {recentFiles && recentFiles.length > 0 && (
              <span className="welcome-clear" onClick={onClearRecent}>
                清空
              </span>
            )}
          </div>
          {!recentFiles || recentFiles.length === 0 ? (
            <div className="welcome-recent-empty">暂无最近打开的文件</div>
          ) : (
            <ul>
              {recentFiles.map((path, i) => (
                <li key={path + ':' + i} onClick={() => onOpenRecent(path)}>
                  <span className="p">{path.split('/').pop()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}