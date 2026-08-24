import { $markSchema } from '@milkdown/utils';

// 把 "24px" / "1.5em"? 这里只认 px，统一成整数
function parseSize(value) {
  if (!value) return null;
  const m = /(\d+(?:\.\d+)?)\s*px/i.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 96;

/**
 * 字号标记：选中文字后调整字号时，只作用于选区（而非整篇文档）。
 *
 * 注意：markdown 没有“字号”概念，且 Milkdown 的 markdown 解析会把内联 HTML 当作
 * 字面量（不会走 mark 的 parseMarkdown），所以这里【不】把字号写入 .md，
 * 仅作用于当前编辑会话（复制/粘贴、DOM 内都正常）。保存后再打开会回到默认字号，
 * 但正文文字不会被破坏。整篇默认字号仍通过 settings.json 持久化。
 */
export const fontSizeMark = $markSchema('fontSize', () => ({
  attrs: {
    size: { default: null },
  },
  // 在选区末端继续输入时延续当前字号
  inclusive: true,
  parseDOM: [
    {
      tag: 'span',
      getAttrs: (dom) => {
        const style = dom.style && dom.style.fontSize ? dom.style.fontSize : '';
        const size = parseSize(style);
        return size ? { size } : false;
      },
    },
    {
      style: 'font-size',
      getAttrs: (value) => {
        const size = parseSize(value);
        return size ? { size } : false;
      },
    },
  ],
  toDOM: (mark) => ['span', { style: `font-size:${mark.attrs.size}px` }],
  // markdown 序列化：不输出字号（避免把 <span> 写进文件导致重开显示成原始标签）。
  // 提供一个 no-op 的 toMarkdown 匹配，确保序列化不会因找不到规则而报错。
  toMarkdown: {
    match: (mark) => mark.type.name === 'fontSize',
    runner: () => false,
  },
}));
