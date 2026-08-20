import React from 'react';

export default function StatusBar({ words, characters, dirty, savedAt }) {
  let savedLabel = dirty ? '未保存' : '已保存';
  if (!dirty && savedAt) {
    const d = new Date(savedAt);
    if (!Number.isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      savedLabel = `已保存 ${hh}:${mm}`;
    }
  }

  return (
    <div className="statusbar">
      <span className="status-item">{words} 字</span>
      <span className="status-item">{characters} 字符</span>
      <span className="spacer" />
      <span className="status-item">{savedLabel}</span>
    </div>
  );
}
