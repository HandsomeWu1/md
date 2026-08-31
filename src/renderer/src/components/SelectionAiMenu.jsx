import { createPortal } from 'react-dom';
import { useLayoutEffect, useRef, useState } from 'react';

// 选区浮动 AI 菜单的快捷动作。结果只作为「对话回复」展示在 AI 面板里，不直接改写文档——
// 因此指令要求模型以回复形式给出内容（不要用 %%REWRITE%% 改写标记）。
// 用户要落盘时自行在对话框说「改到文件里」，由模型输出改写标记再写入。
export const AI_SELECTION_PRESETS = [
  {
    key: 'polish',
    label: '润色',
    instruction: '请在回复中润色下面的选中内容，使其更通顺、准确、得体，保留原意，直接输出润色后的文本（不要使用代码块包裹，不要输出改写标记）：',
  },
  {
    key: 'expand',
    label: '扩写',
    instruction: '请在回复中基于下面的选中内容扩写，补充合理的细节与展开，直接输出扩写后的文本（不要使用代码块包裹，不要输出改写标记）：',
  },
  {
    key: 'condense',
    label: '精简',
    instruction: '请在回复中把下面的选中内容改得更简洁，去掉冗余，保留关键信息，直接输出精简后的文本（不要使用代码块包裹，不要输出改写标记）：',
  },
  {
    key: 'translate',
    label: '翻译',
    instruction: '请在回复中把下面的选中内容翻译（若原文是中文则译为英文，否则译为中文），直接给出译文（不要使用代码块包裹，不要输出改写标记）：',
  },
  {
    key: 'summarize',
    label: '总结',
    instruction: '请在回复中用一两句话总结下面的选中内容，直接给出总结（不要输出改写标记）：',
  },
  {
    key: 'mermaid',
    label: '生成图表',
    instruction: '请在回复中把下面的内容转化为一个 Mermaid 图（优先用流程图，必要时用结构图/时序图），用 ```mermaid 代码块输出（不要输出改写标记）：',
  },
];

export default function SelectionAiMenu({ rect, onAction, onClose }) {
  const menuRef = useRef(null);
  // 钳制到视口内：选中文本在边缘时，菜单可能超出界面导致看不到 / 点不到。
  // useLayoutEffect 在绘制前同步计算，避免先闪到越界位置。
  const [pos, setPos] = useState(rect);
  useLayoutEffect(() => {
    if (!rect) {
      setPos(null);
      return;
    }
    const el = menuRef.current;
    if (!el) {
      setPos(rect);
      return;
    }
    const m = el.getBoundingClientRect();
    const gap = 4; // 菜单与选区之间的间距
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.left;
    // 默认在选区**下方**弹出；下方空间不足时翻到上方。
    let top = rect.bottom + gap;
    if (top + m.height > vh - margin) {
      // 下方放不下：翻到选区上方
      top = rect.top - m.height - gap;
    }
    // 水平：右溢出则左移；仍放不下则贴左边界。
    if (left + m.width > vw - margin) left = Math.max(margin, vw - margin - m.width);
    if (left < margin) left = margin;
    // 垂直最终钳制：极端情况（视口太矮）至少不截断。
    if (top < margin) top = margin;
    if (top + m.height > vh - margin) top = vh - margin - m.height;
    setPos({ left, top });
  }, [rect]);

  if (!rect) return null;
  const menu = (
    <div
      ref={menuRef}
      className="ai-sel-menu"
      style={{ position: 'fixed', left: (pos || rect).left, top: (pos || rect).top }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {AI_SELECTION_PRESETS.map((p) => (
        <button key={p.key} type="button" onClick={() => onAction(p)}>
          {p.label}
        </button>
      ))}
    </div>
  );
  return createPortal(menu, document.body);
}
