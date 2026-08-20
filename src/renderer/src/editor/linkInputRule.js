import { InputRule } from '@milkdown/prose/inputrules';
import { $inputRule } from '@milkdown/utils';

// 输入 `[text](url)` 语法自动转成超链接（text 节点 + link mark）。
// 同时支持半角 `[]()` 和全角 `【】（）`（中文输入法「智能标点」常把半角转全角）。
// URL 中的全角符号（：。／）转回半角，保证链接地址可用。
export const linkInputRule = $inputRule(
  (ctx) =>
    new InputRule(/[\[【]([^\]】]+)[\]】][(（]([^)）\s]+)[)）]$/, (state, match, start, end) => {
      const text = match[1];
      let href = match[2];
      // 全角 → 半角（URL 常用符号）
      href = href
        .replace(/：/g, ':')
        .replace(/。/g, '.')
        .replace(/／/g, '/');
      const linkMarkType = state.schema.marks.link;
      if (!linkMarkType) return null;
      const linkMark = linkMarkType.create({ href });
      const textNode = state.schema.text(text, [linkMark]);
      return state.tr.replaceWith(start, end, textNode).scrollIntoView();
    })
);
