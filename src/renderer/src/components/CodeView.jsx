import React, { useRef, useState, useMemo } from 'react';
import { highlightCode } from './highlight';

// 文本类文件（yaml/yml/json/js/ts…）的右侧代码视图：
// 可编辑 textarea + 背后高亮层（经典「透明文字 textarea 叠加高亮 pre」方案，零依赖）。
// 内部 state 为唯一文本源，仅在挂载（按 tab id 作为 key 重挂载）时从 value 初始化，
// 因此父组件因输入引起重渲染时不会打断光标。
export default function CodeView({ value, onChange }) {
  const taRef = useRef(null);
  const preRef = useRef(null);
  const [text, setText] = useState(value || '');

  const html = useMemo(() => highlightCode(text) + '\n', [text]);

  const handleChange = (e) => {
    const v = e.target.value;
    setText(v);
    if (onChange) onChange(v);
  };

  // 高亮层跟随 textarea 的滚动
  const syncScroll = () => {
    const ta = taRef.current;
    const pre = preRef.current;
    if (ta && pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
  };

  // Tab 键插入两个空格，而非切走焦点
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = taRef.current;
      const s = ta.selectionStart;
      const en = ta.selectionEnd;
      const v = text.slice(0, s) + '  ' + text.slice(en);
      setText(v);
      if (onChange) onChange(v);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = s + 2;
      });
    }
  };

  return (
    <div className="code-view">
      <pre className="code-highlight" ref={preRef} aria-hidden="true">
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
      <textarea
        ref={taRef}
        className="code-input"
        value={text}
        spellCheck={false}
        onChange={handleChange}
        onScroll={syncScroll}
        onKeyDown={handleKeyDown}
        wrap="soft"
      />
    </div>
  );
}
