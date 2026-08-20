import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

/**
 * 标题开头按 Backspace 时，把标题恢复成 "## 文本" 纯文本段落（而非 Milkdown 默认的降级 h2→h1）。
 * 用户可继续编辑 # 符号。用 handleKeyDown 优先级高于 keymap，覆盖 downgradeHeadingCommand。
 */
export const headingBackspace = $prose(
  () =>
    new Plugin({
      key: new PluginKey('heading-backspace'),
      props: {
        handleKeyDown(view, event) {
          if (event.key !== 'Backspace') return false;

          const { selection } = view.state;
          const { $from, empty } = selection;
          if (!empty) return false;

          // 光标在 heading 开头（parentOffset === 0）
          const parent = $from.parent;
          if (parent.type.name !== 'heading') return false;
          if ($from.parentOffset !== 0) return false;

          const level = parent.attrs.level;
          const fence = '#'.repeat(level) + ' ';
          const headingText = parent.textContent;

          const paragraphType = view.state.schema.nodes.paragraph;
          const textNode = view.state.schema.text(fence + headingText);
          const para = paragraphType.createChecked(null, textNode);

          const pos = $from.before($from.depth);
          view.dispatch(
            view.state.tr.replaceWith(pos, pos + parent.nodeSize, para)
          );
          return true;
        },
      },
    })
);
