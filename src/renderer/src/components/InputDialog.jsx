import React, { useEffect, useRef } from 'react';

/**
 * 通用输入弹窗（替代 window.prompt），用于链接/图片地址输入。
 * @param {object} props
 * @param {boolean} open 是否显示
 * @param {string} title 标题
 * @param {string} value 输入值
 * @param {string} placeholder 占位提示
 * @param {(v:string)=>void} onChange 输入变化
 * @param {()=>void} onConfirm 确定
 * @param {()=>void} onCancel 取消
 * @param {ReactNode} extra 底部额外按钮（如「本地文件」）
 */
export default function InputDialog({ open, title, value, placeholder, onChange, onConfirm, onCancel, extra }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      // 弹窗打开后聚焦输入框
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="modal">
        <div className="modal-title">{title}</div>
        <input
          ref={inputRef}
          className="modal-input"
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirm();
            else if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="modal-actions">
          {extra}
          <div className="modal-spacer" />
          <button type="button" className="modal-btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="modal-btn primary" onClick={onConfirm}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
