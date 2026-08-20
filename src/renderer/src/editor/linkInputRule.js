import { InputRule } from '@milkdown/prose/inputrules';
import { $inputRule } from '@milkdown/utils';

// 输入 `[text](url)` 语法自动转成超链接（text 节点 + link mark）。
export const linkInputRule = $inputRule(
  (ctx) =>
    new InputRule(/\[([^\]]+)\]\(([^)\s]+)\)$/, (state, match, start, end) => {
      const text = match[1];
      const href = match[2];
      const linkMarkType = state.schema.marks.link;
      if (!linkMarkType) return null;
      const linkMark = linkMarkType.create({ href });
      const textNode = state.schema.text(text, [linkMark]);
      return state.tr.replaceWith(start, end, textNode).scrollIntoView();
    })
);
