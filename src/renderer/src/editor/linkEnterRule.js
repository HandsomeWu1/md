import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

// 匹配 [text](url)，同时兼容全角 【text】（url）。
// URL 中的全角符号（：。／）在转换时归一化为半角（:.／）。
const LINK_RE = /[\[【]([^\]】]+)[\]】][(（]([^)）\s]+)[)）]$/;

function normalizeHref(href) {
  return href
    .replace(/：/g, ':')
    .replace(/。/g, '.')
    .replace(/／/g, '/');
}

/**
 * 尝试把光标前的 "[text](url)" 源码转换成超链接。
 * 返回 true 表示已转换（调用方据此阻止默认换行）。
 */
function tryConvertLink(view) {
  const { selection } = view.state;
  if (!selection.empty) return false;

  const { $from } = selection;
  const pos = $from.pos;
  const linkType = view.state.schema.marks.link;
  if (!linkType) return false;

  // 取光标前最多 500 字符，匹配末尾的链接语法。
  const textBefore = $from.parent.textBetween(
    Math.max(0, $from.parentOffset - 500),
    $from.parentOffset
  );
  const match = LINK_RE.exec(textBefore);
  if (!match) return false;

  const text = match[1];
  const href = normalizeHref(match[2]);
  // 正确的起始位置：光标往前回退「匹配文本的长度」。
  const start = pos - match[0].length;

  const linkMark = linkType.create({ href });
  const textNode = view.state.schema.text(text, [linkMark]);
  view.dispatch(
    view.state.tr.replaceWith(start, pos, textNode).scrollIntoView()
  );
  return true;
}

/**
 * 处理「输入 [text](url) 后按回车」无法渲染的场景。
 *
 * milkdown 自带的 input rule 在 Enter 键路径下，起始位置会把「待插入的换行 \n」
 * 也计入匹配长度，导致 start 多偏移 1，链接还原后残留一个 "["，无法正确渲染。
 * 这里在 Enter 时用正确的位置手动转换，并在中文输入法上屏（compositionend）后兜底。
 */
export const linkEnterRule = $prose(
  () =>
    new Plugin({
      key: new PluginKey('link-enter-rule'),
      props: {
        handleKeyDown(view, event) {
          if (event.key !== 'Enter') return false;
          return tryConvertLink(view);
        },
        handleDOMEvents: {
          compositionend(view) {
            // 中文输入法上屏后，文档已包含完整文本，异步兜底转换一次。
            setTimeout(() => {
              tryConvertLink(view);
            });
            return false;
          },
        },
      },
    })
);
