import React from 'react';

/**
 * AI 改动确认条。
 *
 * 出现在正文区域内（而不是 AI 面板里）—— 因为用户是在文档中查看高亮、决定取舍，
 * 确认动作理应就在视线所在的位置。
 */
export default function DiffConfirmBar({ added, changed, removed, coarse, onKeep, onRevert, onLocate }) {
  const parts = [];
  if (added) parts.push(`新增 ${added}`);
  if (changed) parts.push(`修改 ${changed}`);
  if (removed) parts.push(`删除 ${removed}`);

  return (
    <div className="diff-bar">
      <span className="diff-bar-text">
        {coarse
          ? 'AI 已改写全文（文档较大，未逐段标注）'
          : parts.length
            ? `AI 改动 ${parts.join(' · ')} 处`
            : 'AI 未产生实际改动'}
      </span>
      <div className="spacer" />
      {!coarse && !!(added || changed) && (
        <button type="button" className="diff-bar-btn" onClick={onLocate} title="跳到第一处改动">
          定位
        </button>
      )}
      <button type="button" className="diff-bar-btn" onClick={onRevert} title="放弃本次 AI 改动，恢复改写前内容">
        撤销
      </button>
      <button type="button" className="diff-bar-btn primary" onClick={onKeep} title="保留改动并清除标注">
        保留
      </button>
    </div>
  );
}
