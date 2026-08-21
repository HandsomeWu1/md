import React, { useRef, useState } from 'react';
import InputDialog from './InputDialog';
import TablePicker from './TablePicker';

// ===== 简洁线框 SVG 图标 =====
const I = ({ children, viewBox = '0 0 16 16' }) => (
  <svg width="16" height="16" viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const ICONS = {
  bold: <I><path d="M4 2.5h4.2a2.5 2.5 0 0 1 0 5H4z" /><path d="M4 7.5h5a2.5 2.5 0 0 1 0 5H4z" /></I>,
  italic: <I><path d="M6 2.5h4" /><path d="M6 13.5h4" /><path d="M8 2.5l-2 11" /></I>,
  strikethrough: <I><path d="M3 5h10" /><path d="M4 4c0-1 .8-1.5 2-1.5h4c1.2 0 2 .5 2 1.5 0 2-3 1.5-3 4.5" /><path d="M2.5 8h11" /><path d="M7 12c0 1 .8 1.5 2 1.5 1 0 1.7-.4 1.7-1.2" /></I>,
  inlineCode: <I><path d="M6 5 3 8l3 3" /><path d="M10 5l3 3-3 3" /></I>,
  bulletList: <I><circle cx="3" cy="4.5" r="0.9" fill="currentColor" stroke="none" /><circle cx="3" cy="8" r="0.9" fill="currentColor" stroke="none" /><circle cx="3" cy="11.5" r="0.9" fill="currentColor" stroke="none" /><path d="M6 4.5h7" /><path d="M6 8h7" /><path d="M6 11.5h7" /></I>,
  orderedList: <I><path d="M3 2.5h1.5v2" /><path d="M2.5 4.5H5" /><path d="M3 6.5 2 8h2.5" /><path d="M6 4.5h7" /><path d="M6 8h7" /><path d="M6 11.5h7" /><path d="M3 11.5h2.5v1.5L3 14h2.5" /></I>,
  taskList: <I><rect x="2" y="3.5" width="3" height="3" rx="0.5" /><rect x="2" y="10.5" width="3" height="3" rx="0.5" /><path d="M8 5h5" /><path d="M8 12h5" /></I>,
  blockquote: <I><path d="M3 4v3" /><path d="M3 4h3v5" /><path d="M3 13h3" /><path d="M9 5h4" /><path d="M9 8h4" /><path d="M9 11h3" /></I>,
  codeBlock: <I><path d="M2.5 5 5.5 8l-3 3" /><path d="M8 3.5h5.5" /><path d="M13.5 12 10.5 9l3-3" /><path d="M8 13.5h2" /></I>,
  table: <I><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M2 6.5h12" /><path d="M6 3v10" /><path d="M10 3v10" /></I>,
  hr: <I><path d="M2.5 8h11" /><path d="M4.5 4.5v7" /><path d="M11.5 4.5v7" /></I>,
  link: <I><path d="M6.5 9.5 9.5 6.5" /><path d="M7.5 3.5 9 2a2.8 2.8 0 0 1 4 4l-2 2" /><path d="M8.5 12.5 7 14a2.8 2.8 0 0 1-4-4l2-2" /></I>,
  image: <I><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><circle cx="5.5" cy="6" r="1.1" /><path d="M2.5 11.5 6 8l3 3 2-2 2.5 2.5" /></I>,
  paragraph: <I><path d="M3 3h6.5a2.5 2.5 0 0 1 0 5H3z" /><path d="M3 8h8.5a2.5 2.5 0 0 1 0 5H3z" /></I>,
  headingNumbering: <I><path d="M3 2.5h3.5" /><path d="M3 7.5h3.5" /><path d="M3 12.5h3.5" /><path d="M3 2.5v5M3 7.5v5" /><path d="M9.5 4h3.5" /><path d="M9.5 9h3.5" /><path d="M9.5 14h3.5" /></I>,
};

const ToolButton = React.forwardRef(function ToolButton({ title, icon, onClick, active }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={'tool-btn' + (active ? ' active' : '')}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
    </button>
  );
});

function Divider() {
  return <span className="tool-divider" />;
}

export default function Toolbar({ onAction, activeFormats = {}, headingNumbering = false, onToggleHeadingNumbering, fontSize = 13, onChangeFontSize }) {
  const fileInputRef = useRef(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkHref, setLinkHref] = useState('');
  // 表格选择器状态
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const tableBtnRef = useRef(null);

  // 段落下拉的受控值：反映当前光标所在段落类型
  const headingValue = activeFormats.heading
    ? String(activeFormats.heading)
    : activeFormats.paragraph
      ? 'p'
      : '';

  const handleHeading = (e) => {
    const v = e.target.value;
    if (!v) return;
    if (v === 'p') onAction('paragraph');
    else onAction('heading', Number(v));
  };

  const confirmLink = () => {
    if (linkHref.trim()) {
      // 把 URL 作为 href，显示文字用用户填的（缺省回退为 URL）
      onAction('link', linkHref.trim(), linkText.trim() || linkHref.trim());
    }
    setLinkOpen(false);
    setLinkHref('');
    setLinkText('');
  };

  // 本地文件选择 → 保存到本地 → 插入
  const handleLocalImage = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const buf = await file.arrayBuffer();
      const res = await window.api.saveImage(new Uint8Array(buf), file.name);
      if (res.ok && res.url) {
        onAction('image', res.url);
      }
    } catch {
      // 忽略单张图片失败
    }
  };

  return (
    <div className="toolbar">
      <select
        className="toolbar-select"
        value={headingValue}
        onChange={handleHeading}
        title="段落格式"
      >
        <option value="" disabled>
          段落
        </option>
        <option value="p">正文</option>
        <option value="1">标题 1</option>
        <option value="2">标题 2</option>
        <option value="3">标题 3</option>
        <option value="4">标题 4</option>
        <option value="5">标题 5</option>
        <option value="6">标题 6</option>
      </select>

      <Divider />

      <ToolButton title="加粗 (⌘B)" icon={ICONS.bold} active={activeFormats.bold} onClick={() => onAction('bold')} />
      <ToolButton title="斜体 (⌘I)" icon={ICONS.italic} active={activeFormats.italic} onClick={() => onAction('italic')} />
      <ToolButton title="删除线" icon={ICONS.strikethrough} active={activeFormats.strikethrough} onClick={() => onAction('strikethrough')} />
      <ToolButton title="行内代码" icon={ICONS.inlineCode} active={activeFormats.inlineCode} onClick={() => onAction('inlineCode')} />

      <Divider />

      <ToolButton title="无序列表" icon={ICONS.bulletList} active={activeFormats.bulletList} onClick={() => onAction('bulletList')} />
      <ToolButton title="有序列表" icon={ICONS.orderedList} active={activeFormats.orderedList} onClick={() => onAction('orderedList')} />
      <ToolButton title="任务列表" icon={ICONS.taskList} active={activeFormats.taskList} onClick={() => onAction('taskList')} />
      <ToolButton title="引用" icon={ICONS.blockquote} active={activeFormats.blockquote} onClick={() => onAction('blockquote')} />

      <Divider />

      <ToolButton title="代码块" icon={ICONS.codeBlock} active={activeFormats.codeBlock} onClick={() => onAction('codeBlock')} />
      <ToolButton
        title="插入表格"
        icon={ICONS.table}
        onClick={() => setTablePickerOpen(true)}
        ref={tableBtnRef}
      />
      <ToolButton title="分割线" icon={ICONS.hr} onClick={() => onAction('hr')} />

      <Divider />

      <ToolButton
        title="插入链接"
        icon={ICONS.link}
        active={activeFormats.link}
        onClick={() => {
          setLinkHref('');
          setLinkText('');
          setLinkOpen(true);
        }}
      />
      <ToolButton
        title="插入图片（选择本地文件）"
        icon={ICONS.image}
        onClick={() => fileInputRef.current?.click()}
      />

      <Divider />

      <ToolButton
        title={headingNumbering ? '关闭标题编号' : '开启标题编号'}
        icon={ICONS.headingNumbering}
        active={headingNumbering}
        onClick={() => onToggleHeadingNumbering && onToggleHeadingNumbering()}
      />

      <Divider />

      <div className="fontsize-control" title="调整正文字号（⌘+ / ⌘-）">
        <button type="button" aria-label="缩小字号" onClick={() => onChangeFontSize && onChangeFontSize(-1)}>−</button>
        <span className="fontsize-value">{fontSize}</span>
        <button type="button" aria-label="放大字号" onClick={() => onChangeFontSize && onChangeFontSize(1)}>+</button>
      </div>

      {/* 隐藏的本地图片选择 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files && e.target.files[0];
          if (file) handleLocalImage(file);
          e.target.value = '';
        }}
      />

      {/* 链接弹窗：显示文字 + URL */}
      <InputDialog
        open={linkOpen}
        title="插入链接"
        value={linkText}
        placeholder="显示文字（如 百度）"
        onChange={setLinkText}
        onConfirm={confirmLink}
        onCancel={() => { setLinkOpen(false); setLinkHref(''); setLinkText(''); }}
        secondField={{
          value: linkHref,
          placeholder: '链接地址（如 https://example.com）',
          onChange: setLinkHref,
        }}
      />

      {/* 表格网格选择器 */}
      <TablePicker
        open={tablePickerOpen}
        anchorRect={tableBtnRef.current?.getBoundingClientRect()}
        onPick={(row, col) => onAction('tableInsert', { row, col })}
        onClose={() => setTablePickerOpen(false)}
      />

    </div>
  );
}
