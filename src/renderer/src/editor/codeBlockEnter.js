import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

/**
 * 代码块末尾的「空行」按 Enter → 退出代码块，在其下方新建一个普通段落。
 * 这样在「连续两个代码块」之间可以插入文字：把光标放到上一个代码块末尾的空行，回车即可。
 *
 * 必须注册在 commonmark 之前（更早的插件 handleKeyDown 优先），
 * 否则会被基础 keymap 的 newlineInCode 抢先处理。
 */
export const codeBlockEnter = $prose(
  () =>
    new Plugin({
      key: new PluginKey('code-block-enter'),
      props: {
        handleKeyDown(view, event) {
          if (event.key !== 'Enter') return false;

          const { state } = view;
          const { selection, schema } = state;
          const { $from, empty } = selection;
          if (!empty) return false;

          // 找到光标所在的 code_block
          let depth = -1;
          for (let d = $from.depth; d >= 1; d--) {
            if ($from.node(d).type.name === 'code_block') {
              depth = d;
              break;
            }
          }
          if (depth < 0) return false;

          const codeBlock = $from.node(depth);
          const textBefore = codeBlock.textContent.slice(0, $from.parentOffset);
          const lastNewline = textBefore.lastIndexOf('\n');
          const currentLine = textBefore.slice(lastNewline + 1);
          const atEnd = $from.parentOffset === codeBlock.textContent.length;

          // 仅在「位于代码块末尾 且 当前行为空」时退出，避免打断正常换行
          if (!(atEnd && currentLine.trim() === '')) return false;

          const after = $from.after(depth);
          const paragraph = schema.nodes.paragraph.createAndFill();
          if (!paragraph) return false;
          const tr = state.tr.insert(after, paragraph);
          tr.setSelection(TextSelection.create(tr.doc, after + 1));
          view.dispatch(tr.scrollIntoView());
          return true;
        },
      },
    })
);
