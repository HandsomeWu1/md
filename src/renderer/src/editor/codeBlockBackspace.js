import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

/**
 * 空代码块按 Backspace 时，把代码块恢复成 ``` 文本（退出代码块模式）。
 * 例如空代码块（语言 java）按删除 → 变回 ```java 纯文本。
 * 用 handleKeyDown（优先级高于 keymap），避免被默认的 joinTextblockBackward 抢占。
 */
export const codeBlockBackspace = $prose(
  () =>
    new Plugin({
      key: new PluginKey('code-block-backspace'),
      props: {
        handleKeyDown(view, event) {
          if (event.key !== 'Backspace') return false;

          const { selection } = view.state;
          const { $from, empty } = selection;
          if (!empty) return false;

          // 找到光标所在的 code_block（若在）
          let codeBlock = null;
          let codeBlockPos = -1;
          for (let d = $from.depth; d >= 1; d--) {
            if ($from.node(d).type.name === 'code_block') {
              codeBlock = $from.node(d);
              codeBlockPos = $from.before(d);
              break;
            }
          }
          if (!codeBlock) return false;

          // 仅当代码块为空、且光标在开头时触发
          if (codeBlock.textContent !== '' || $from.parentOffset !== 0) return false;

          const language = codeBlock.attrs.language || '';
          const fence = '```' + language;

          const paragraphType = view.state.schema.nodes.paragraph;
          const textNode = view.state.schema.text(fence);
          const para = paragraphType.createChecked(null, textNode);

          view.dispatch(
            view.state.tr.replaceWith(codeBlockPos, codeBlockPos + codeBlock.nodeSize, para)
          );
          return true;
        },
      },
    })
);
