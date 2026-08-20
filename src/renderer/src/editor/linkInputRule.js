import { InputRule } from '@milkdown/prose/inputrules';
import { $inputRule } from '@milkdown/utils';

// 输入 `[text](url)` 语法自动转成超链接节点。
// ProseMirror 的 link node 的 toDOM 是 <a href="...">text</a>，所以这里直接插入 text + link mark 的节点。
export const linkInputRule = $inputRule(
  (ctx) =>
    new InputRule(/\[([^\]]+)\]\(([^)\s]+)\)$/, (state, match, start, end) => {
      const [_, text, href] = match;
      const { link, text: textNode } = state.schema.marks;
      const linkMark = link.create({ href });
      return state.tr
        .insertTextAt(end, ' ', textNode.create()) // 占位空格
        .replaceWith(start, end, textNode.create(text, [linkMark]));
    })
);
