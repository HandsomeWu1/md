import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

export const searchHighlightKey = new PluginKey('search-highlight');

// 当前搜索词（全局，由 App 通过 setSearchQuery 更新，插件 apply 时读取重建 decoration）
let currentQuery = '';
let currentCaseSensitive = false;
let currentIndex = 0; // 当前选中的匹配项（从 0 开始），用于加「当前项」高亮

export function setSearchQuery(query, caseSensitive, index) {
  currentQuery = query || '';
  currentCaseSensitive = !!caseSensitive;
  currentIndex = index || 0;
}

// 在 doc 的所有 text node 里查找 query，返回 Decoration 集合。
// 第 currentIndex 个匹配用 find-match-current（更突出），其余用 find-match。
function buildDecorations(doc) {
  const q = currentQuery;
  if (!q) return DecorationSet.empty;
  const decos = [];
  const needle = currentCaseSensitive ? q : q.toLowerCase();
  let matchIndex = 0;
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const text = node.text || '';
    const hay = currentCaseSensitive ? text : text.toLowerCase();
    let idx = hay.indexOf(needle);
    while (idx !== -1) {
      const isCurrent = matchIndex === currentIndex;
      decos.push(
        Decoration.inline(pos + idx, pos + idx + q.length, {
          class: isCurrent ? 'find-match find-match-current' : 'find-match',
        })
      );
      matchIndex += 1;
      idx = hay.indexOf(needle, idx + q.length);
    }
  });
  return DecorationSet.create(doc, decos);
}

export const searchHighlight = $prose(
  () =>
    new Plugin({
      key: searchHighlightKey,
      state: {
        init: (_, { doc }) => buildDecorations(doc),
        apply(tr, set) {
          // 搜索词更新（带 meta 的事务）或文档变化时，重新构建高亮
          if (tr.getMeta(searchHighlightKey) !== undefined || tr.docChanged) {
            return buildDecorations(tr.doc);
          }
          return set;
        },
      },
      props: {
        decorations(state) {
          return searchHighlightKey.getState(state);
        },
      },
    })
);
