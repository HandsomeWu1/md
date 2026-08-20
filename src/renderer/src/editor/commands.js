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
  table: (editor) => editor.action(callCommand(insertTableCommand.key, { row: 3, col: 3 })),
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
};
