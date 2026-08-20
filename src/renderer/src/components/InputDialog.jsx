import React, { useEffect, useRef } from 'react';

/**
 * 通用输入弹窗（替代 window.prompt）。
 * 支持单字段（value/placeholder）或双字段（secondField），用于链接（显示文字 + URL）。
 */
export default function InputDialog({
  open,
  title,
  value,
  placeholder,
  onChange,
  onConfirm,
  onCancel,
  extra,
  selectOnOpen = false, // 打开时全选已有内容（用于重命名/新建等「覆盖式」输入）
  secondField, // { value, placeholder, onChange }
}) {
  const firstRef = useRef(null);
  const secondRef = useRef(null);

  useEffect(() => {
    // 只在弹窗打开时聚焦一次，不依赖 secondField（否则每次渲染都会重新抢焦点，
    // 导致在第二个输入框输入时，焦点被强行拉回第一个输入框）。
    if (open) {
      const id = requestAnimationFrame(() => {
        const el = firstRef.current;
        if (el) {
          el.focus();
          if (selectOnOpen) el.select();
        }
      });
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
          ref={firstRef}
          className="modal-input"
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (secondField) secondRef.current?.focus();
              else onConfirm();
            } else if (e.key === 'Escape') onCancel();
          }}
        />
        {secondField && (
          <input
            ref={secondRef}
            className="modal-input"
            type="text"
            value={secondField.value}
            placeholder={secondField.placeholder}
            onChange={(e) => secondField.onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConfirm();
              else if (e.key === 'Escape') onCancel();
            }}
          />
        )}
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
