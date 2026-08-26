import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

export const diffHighlightKey = new PluginKey('ai-diff-highlight');

/**
 * AI 改动标注。
 *
 * 与 searchHighlight 的关键区别：搜索高亮可以随时按查询词重建，而「这些块是 AI 改的」
 * 是一次性的历史事实，无法从当前文档反推。因此这里**不重建**，而是把 DecorationSet
 * 通过 tr.mapping 映射下去——用户在待确认期间继续打字，标注也能跟着内容移动。
 */
export const diffHighlight = $prose(
  () =>
    new Plugin({
      key: diffHighlightKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, set) {
          const meta = tr.getMeta(diffHighlightKey);
          if (meta) {
            if (meta.type === 'clear') return DecorationSet.empty;
            if (meta.type === 'set') {
              const decos = (meta.ranges || []).map((r) =>
                r.kind === 'removed'
                  ? // 删除处没有对应内容可标，用一个零宽 widget 提示「此处有内容被删除」
                    Decoration.widget(
                      r.from,
                      () => {
                        const el = document.createElement('span');
                        el.className = 'ai-diff-removed-mark';
                        el.title = `AI 在此处删除了 ${r.count} 个段落`;
                        return el;
                      },
                      { side: -1 }
                    )
                  : Decoration.node(r.from, r.to, {
                      class: r.kind === 'added' ? 'ai-diff-added' : 'ai-diff-changed',
                    })
              );
              return DecorationSet.create(tr.doc, decos);
            }
          }
          // 文档变化时只做位置映射，保留原有标注。
          return tr.docChanged ? set.map(tr.mapping, tr.doc) : set;
        },
      },
      props: {
        decorations(state) {
          return diffHighlightKey.getState(state);
        },
      },
    })
);

/**
 * 把块索引形式的差异结果换算成文档位置区间。
 * @param {import('@milkdown/prose/model').Node} doc
 * @param {{added:number[],changed:number[],removedAt:number[],removedCount:number}} diff
 */
export function diffToRanges(doc, diff) {
  // 顶层块的起始位置：doc.forEach 给出的 offset 就是该块的绝对起点。
  const blocks = [];
  doc.forEach((node, offset) => {
    blocks.push({ from: offset, to: offset + node.nodeSize });
  });

  const ranges = [];
  for (const i of diff.added) {
    if (blocks[i]) ranges.push({ ...blocks[i], kind: 'added' });
  }
  for (const i of diff.changed) {
    if (blocks[i]) ranges.push({ ...blocks[i], kind: 'changed' });
  }
  for (const i of diff.removedAt) {
    // 删除点可能落在文档末尾（索引越界），此时贴到最后一个块的末尾。
    const at = blocks[i] ? blocks[i].from : blocks.length ? blocks[blocks.length - 1].to : 0;
    ranges.push({ from: at, to: at, kind: 'removed', count: diff.removedCount });
  }
  return ranges;
}

// 顶层块指纹：序列化整个节点，使内容与格式（加粗、链接等）的任何变化都能被识别。
export function topLevelKeys(doc) {
  const keys = [];
  doc.forEach((node) => {
    keys.push(JSON.stringify(node.toJSON()));
  });
  return keys;
}
