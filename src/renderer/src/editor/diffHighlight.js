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
 * 收集参与 diff 的顶层块。
 *
 * **空段落一律跳过**：它在 Markdown 里没有对应表示，改写结果经 markdown 往返后
 * 必然丢失，若计入 diff 就会报出「删除 N 处」这种用户无法理解的虚假改动。
 * 指纹用整节点序列化，因此内容与格式（加粗、链接等）的任何变化都能被识别。
 *
 * 位置与指纹必须来自同一次遍历，否则块索引会与文档位置错位。
 */
function collectBlocks(doc) {
  const blocks = [];
  doc.forEach((node, offset) => {
    if (node.isTextblock && node.content.size === 0) return;
    blocks.push({ key: JSON.stringify(node.toJSON()), from: offset, to: offset + node.nodeSize });
  });
  return blocks;
}

export function topLevelKeys(doc) {
  return collectBlocks(doc).map((b) => b.key);
}

/**
 * 把块索引形式的差异结果换算成文档位置区间。
 * @param {import('@milkdown/prose/model').Node} doc
 * @param {{added:number[],changed:number[],removedAt:number[],removedCount:number}} diff
 */
export function diffToRanges(doc, diff) {
  const blocks = collectBlocks(doc);
  const docEnd = doc.content.size;

  const ranges = [];
  for (const i of diff.added) {
    if (blocks[i]) ranges.push({ from: blocks[i].from, to: blocks[i].to, kind: 'added' });
  }
  for (const i of diff.changed) {
    if (blocks[i]) ranges.push({ from: blocks[i].from, to: blocks[i].to, kind: 'changed' });
  }
  for (const i of diff.removedAt) {
    // 删除点可能落在文档末尾（索引越界）；文档被清空时连一个有效块都没有，
    // 此时贴到文档内部起点（位置 1）而不是 0——0 在节点之外，widget 无处附着。
    let at;
    if (blocks[i]) at = blocks[i].from;
    else if (blocks.length) at = blocks[blocks.length - 1].to;
    else at = Math.min(1, docEnd);
    ranges.push({ from: Math.max(0, Math.min(at, docEnd)), to: 0, kind: 'removed', count: diff.removedCount });
  }
  return ranges;
}
