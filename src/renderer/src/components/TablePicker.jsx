import React, { useState, useRef, useEffect, useCallback } from 'react';

const ROWS = 6;
const COLS = 10;

export default function TablePicker({ open, anchorRect, onPick, onClose }) {
  const [hover, setHover] = useState({ row: 0, col: 0 });
  const ref = useRef(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    // 使用 mousedown 以便在 click 之前捕获
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  const handlePick = useCallback(() => {
    if (hover.row > 0 && hover.col > 0) {
      onPick(hover.row, hover.col);
      onClose();
    }
  }, [hover, onPick, onClose]);

  if (!open) return null;

  // 计算位置：在按钮下方居中
  let style = {};
  if (anchorRect) {
    const left = anchorRect.left + anchorRect.width / 2 - 120; // 网格约 240px 宽，居中
    style = {
      position: 'fixed',
      left: Math.max(8, left),
      top: anchorRect.bottom + 6,
      zIndex: 2000,
    };
  }

  const cells = [];
  for (let r = 1; r <= ROWS; r++) {
    for (let c = 1; c <= COLS; c++) {
      const active = r <= hover.row && c <= hover.col;
      cells.push(
        <span
          key={`${r}-${c}`}
          className={'table-picker-cell' + (active ? ' active' : '')}
          onMouseEnter={() => setHover({ row: r, col: c })}
          onClick={() => { onPick(r, c); onClose(); }}
        />
      );
    }
  }

  return (
    <div ref={ref} className="table-picker" style={style}>
      <div className="table-picker-grid">
        {cells}
      </div>
      <div className="table-picker-info">
        <span className="table-picker-size">{hover.row} X {hover.col}</span>
        <button
          type="button"
          className="table-picker-ok"
          disabled={hover.row === 0 || hover.col === 0}
          onClick={handlePick}
        >
          确定
        </button>
        <button
          type="button"
          className="table-picker-cancel"
          onClick={onClose}
        >
          取消
        </button>
      </div>
    </div>
  );
}
