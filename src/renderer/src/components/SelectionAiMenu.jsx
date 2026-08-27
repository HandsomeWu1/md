import { createPortal } from 'react-dom';

// 选区浮动 AI 菜单的快捷动作。指令都要求模型「只输出改写后的选中内容」，
// 由 useAiChat 的 runPreset 强制按选区改写应用（保留 ```mermaid 围栏以渲染图表）。
export const AI_SELECTION_PRESETS = [
  {
    key: 'polish',
    label: '润色',
    instruction: '请润色下面的选中内容，使其更通顺、准确、得体，保留原意，直接输出改写后的选中内容（不要使用代码块包裹）：',
  },
  {
    key: 'expand',
    label: '扩写',
    instruction: '请基于下面的选中内容扩写，补充合理的细节与展开，直接输出改写后的选中内容（不要使用代码块包裹）：',
  },
  {
    key: 'condense',
    label: '精简',
    instruction: '请把下面的选中内容改得更简洁，去掉冗余，保留关键信息，直接输出改写后的选中内容（不要使用代码块包裹）：',
  },
  {
    key: 'translate',
    label: '翻译',
    instruction: '请把下面的选中内容翻译（若原文是中文则译为英文，否则译为中文），直接输出译文（不要使用代码块包裹）：',
  },
  {
    key: 'summarize',
    label: '总结',
    instruction: '请用一两句话总结下面的选中内容，直接输出总结（不要使用代码块包裹）：',
  },
  {
    key: 'mermaid',
    label: '生成图表',
    instruction: '请把下面的内容转化为一个 Mermaid 图（优先用流程图，必要时用结构图/时序图），用 ```mermaid 代码块输出，直接作为改写结果替换选中内容：',
  },
];

export default function SelectionAiMenu({ rect, onAction, onClose }) {
  if (!rect) return null;
  const menu = (
    <div
      className="ai-sel-menu"
      style={{ position: 'fixed', left: rect.left, top: rect.top }}
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
