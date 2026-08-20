import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

const LINK = 'link';

/**
 * 光标紧邻超链接末尾按 Backspace 时，把链接还原成 "[text](url)" 源码（未编辑状态），
 * 而不是删除链接文本；光标在链接中间按 Backspace 仍正常删除字符。
 * 用 handleKeyDown（优先级高于 keymap），覆盖默认的 joinTextblockBackward 删除行为。
 */
export const linkBackspace = $prose(
  () =>
    new Plugin({
      key: new PluginKey('link-backspace'),
      props: {
        handleKeyDown(view, event) {
          if (event.key !== 'Backspace') return false;

          const { selection } = view.state;
          const { $from, empty } = selection;
          if (!empty) return false;

          const doc = view.state.doc;
          const pos = $from.pos;
          const linkType = view.state.schema.marks.link;
          if (!linkType) return false;

          // 光标前一个字符带 link、光标后不再带 link —— 即光标在链接末尾
          const hasBefore = pos > 0 && doc.rangeHasMark(pos - 1, pos, linkType);
          const hasAfter =
            pos < doc.content.size && doc.rangeHasMark(pos, pos + 1, linkType);
          if (!hasBefore || hasAfter) return false;

          const linkMark = doc
            .resolve(pos - 1)
            .marks()
            .find((m) => m.type.name === LINK);
          const href = (linkMark && linkMark.attrs.href) || '';

          // 向前找到链接覆盖范围的起点
          let start = pos;
          while (start > 0 && doc.rangeHasMark(start - 1, start, linkType)) {
            start--;
          }

          const text = doc.textBetween(start, pos);
          const src = `[${text}](${href})`;
          view.dispatch(
            view.state.tr
              .replaceWith(start, pos, view.state.schema.text(src))
              .scrollIntoView()
          );
          return true;
        },
      },
    })
);
