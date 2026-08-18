import React, { useState } from 'react';

function WelcomeLogo() {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <svg className="welcome-logo" viewBox="0 0 72 72" aria-label="logo">
        <rect x="6" y="6" width="60" height="60" rx="14" fill="var(--accent)" />
        <text x="36" y="46" textAnchor="middle" fontSize="30" fontWeight="700" fill="#fff">
          T
        </text>
      </svg>
    );
  }
  return (
    <img
      className="welcome-logo"
      src="logo.png"
      alt="Typora Dev"
      onError={() => setBroken(true)}
    />
  );
}

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
        <WelcomeLogo />
        <h1>Typora Dev</h1>
        <p>所见即所得的 Markdown 编辑器</p>
        <div className="welcome-actions">
          <button type="button" className="primary" onClick={onNewFile}>
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
