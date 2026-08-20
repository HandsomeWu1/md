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
  secondField, // { value, placeholder, onChange }
}) {
  const firstRef = useRef(null);
  const secondRef = useRef(null);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => {
        if (secondField) {
          // 双字段时聚焦到第一个（显示文字）
          firstRef.current?.focus();
        } else {
          firstRef.current?.focus();
        }
      });
      return () => cancelAnimationFrame(id);
    }
  }, [open, secondField]);

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
