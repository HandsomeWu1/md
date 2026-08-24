import { callCommand, insert } from '@milkdown/utils';
import { editorViewCtx } from '@milkdown/kit/core';
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  wrapInHeadingCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  createCodeBlockCommand,
  insertHrCommand,
  insertImageCommand,
} from '@milkdown/kit/preset/commonmark';
import { toggleStrikethroughCommand, insertTableCommand } from '@milkdown/kit/preset/gfm';

/**
 * 工具栏动作：把 Milkdown 命令映射为「新手可点击」的操作。
 * 每个 action 接收 editor 实例，执行对应命令。
 */
export const actions = {
  bold: (editor) => editor.action(callCommand(toggleStrongCommand.key)),
  italic: (editor) => editor.action(callCommand(toggleEmphasisCommand.key)),
  strikethrough: (editor) => editor.action(callCommand(toggleStrikethroughCommand.key)),
  inlineCode: (editor) => editor.action(callCommand(toggleInlineCodeCommand.key)),

  heading: (editor, level) => editor.action(callCommand(wrapInHeadingCommand.key, level)),
  paragraph: (editor) => editor.action(callCommand(turnIntoTextCommand.key)),

  bulletList: (editor) => editor.action(callCommand(wrapInBulletListCommand.key)),
  orderedList: (editor) => editor.action(callCommand(wrapInOrderedListCommand.key)),
  // 任务列表：gfm 无现成命令，且 markdown parser 不解析空的 "- [ ]"，需手动创建节点。
  taskList: (editor) =>
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { list_item, bullet_list, paragraph } = view.state.schema.nodes;
      const para = paragraph.create();
      const li = list_item.create({ label: '•', listType: 'bullet', spread: true, checked: false }, para);
      const list = bullet_list.create({ spread: false }, li);
      view.dispatch(view.state.tr.replaceSelectionWith(list).scrollIntoView());
      return true;
    }),
  blockquote: (editor) => editor.action(callCommand(wrapInBlockquoteCommand.key)),

  codeBlock: (editor) => editor.action(callCommand(createCodeBlockCommand.key)),
  table: (editor, { row = 3, col = 3 } = {}) => editor.action(callCommand(insertTableCommand.key, { row, col })),
  tableInsert: (editor, { row = 3, col = 3 } = {}) => editor.action(callCommand(insertTableCommand.key, { row, col })),
  hr: (editor) => editor.action(callCommand(insertHrCommand.key)),

  // 链接：
  //  - 有选区时给选区加链接
  //  - 无选区时插入 [text](url) 文本（text 可由 Toolbar 传入）
  link: (editor, href, text) =>
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { empty } = view.state.selection;
      const label = text || href;
      if (empty) {
        insert(`[${label}](${href})`)(ctx);
      } else {
        callCommand(toggleLinkCommand.key, { href })(ctx);
      }
    }),
  image: (editor, src) => editor.action(callCommand(insertImageCommand.key, { src, alt: '' })),

  // 字号：对当前选区施加/移除 fontSize 标记（size 为 null 或 < MIN 时移除）。
  // 仅作用于选区，不影响整篇文档。
  fontSize: (editor, size) =>
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const markType = view.state.schema.marks.fontSize;
      if (!markType) return;
      const { state } = view;
      const { from, to, empty } = state.selection;
      if (empty) return; // 无选区时由全局逻辑处理（见 App.applyFontSizeDelta）
      const tr = state.tr;
      if (!size || size < 8) {
        tr.removeMark(from, to, markType);
      } else {
        tr.addMark(from, to, markType.create({ size }));
      }
      view.dispatch(tr.scrollIntoView());
    }),

  // 行内公式：把 LaTeX 包成 math_inline 节点插到光标处
  mathInline: (editor, latex) =>
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const type = view.state.schema.nodes.math_inline;
      const value = (latex || '').trim();
      if (!type || !value) return;
      const node = type.create(null, view.state.schema.text(value));
      view.dispatch(view.state.tr.replaceSelectionWith(node, false).scrollIntoView());
    }),

  // 行间（独立成行）公式：math_block 是 atom 节点，公式内容存在 value 属性里
  mathBlock: (editor, latex) =>
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const type = view.state.schema.nodes.math_block;
      const value = (latex || '').trim();
      if (!type || !value) return;
      view.dispatch(view.state.tr.replaceSelectionWith(type.create({ value })).scrollIntoView());
    }),
};
