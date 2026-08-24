import { editorViewCtx } from '@milkdown/kit/core';

/**
 * 计算当前光标/选区处的激活格式，用于工具栏按钮高亮。
 * 返回：
 * {
 *   bold, italic, strikethrough, inlineCode, link,          // mark 激活
 *   heading: level|null, paragraph, bulletList, orderedList,
 *   taskList, blockquote, codeBlock                            // 块类型
 * }
 */
export function getActiveFormats(ctx) {
  const view = ctx.get(editorViewCtx);
  if (!view) return {};
  const { state } = view;
  const { selection } = state;
  const { $from, empty, from, to } = selection;

  const result = {
    bold: false,
    italic: false,
    strikethrough: false,
    inlineCode: false,
    link: false,
    heading: null,
    paragraph: false,
    bulletList: false,
    orderedList: false,
    taskList: false,
    blockquote: false,
    codeBlock: false,
    mathInline: false,
    mathBlock: false,
  };

  const markActive = (markName) => {
    const markType = state.schema.marks[markName];
    if (!markType) return false;
    if (empty) {
      if (state.storedMarks) {
        return state.storedMarks.some((m) => m.type === markType);
      }
      return $from.marks().some((m) => m.type === markType);
    }
    return state.doc.rangeHasMark(from, to, markType);
  };

  result.bold = markActive('strong');
  result.italic = markActive('emphasis');
  result.strikethrough = markActive('strike_through');
  result.inlineCode = markActive('inline_code');
  result.link = markActive('link');

  // 块类型：从最内层父节点向上遍历
  for (let d = $from.depth; d >= 1; d--) {
    const node = $from.node(d);
    const name = node.type.name;
    if (name === 'heading') {
      result.heading = node.attrs.level;
    } else if (name === 'bullet_list') {
      result.bulletList = true;
    } else if (name === 'ordered_list') {
      result.orderedList = true;
    } else if (name === 'blockquote') {
      result.blockquote = true;
    } else if (name === 'code_block') {
      result.codeBlock = true;
    } else if (name === 'list_item' && node.attrs.checked != null) {
      result.taskList = true;
    } else if (name === 'math_inline') {
      result.mathInline = true;
    } else if (name === 'math_block') {
      result.mathBlock = true;
    }
  }

  // 公式是 atom 节点，选中它时是 NodeSelection，不在上面的祖先链里，需单独判断
  const selectedNode = selection.node;
  if (selectedNode) {
    if (selectedNode.type.name === 'math_inline') result.mathInline = true;
    else if (selectedNode.type.name === 'math_block') result.mathBlock = true;
  }

  // 段落：无任何块级格式时的默认态
  if (
    !result.heading &&
    !result.bulletList &&
    !result.orderedList &&
    !result.taskList &&
    !result.blockquote &&
    !result.codeBlock &&
    !result.mathBlock
  ) {
    result.paragraph = true;
  }

  return result;
}
