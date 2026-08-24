import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// ===== Focus 模式：当前段落正常，其他段落变暗 =====
const focusKey = new PluginKey('focus-mode');
let focusEnabled = false;

export function setFocusMode(v) {
  focusEnabled = !!v;
}

function findCurrentBlockPos($pos) {
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (node.type.isBlock && node.type.name !== 'doc') {
      return $pos.before(d);
    }
  }
  return null;
}

function buildFocusDecorations(doc, selection) {
  if (!focusEnabled) return DecorationSet.empty;
  const currentBlockPos = findCurrentBlockPos(selection.$from);
  if (currentBlockPos === null) return DecorationSet.empty;
  const decos = [];
  doc.descendants((node, pos) => {
    if (node.isBlock && pos !== currentBlockPos && node.type.name !== 'code_block') {
      // Decoration.node(from, to, ...) 的 to 必须是节点结束位置，而非节点大小
      decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'focus-dimmed' }));
    }
  });
  return DecorationSet.create(doc, decos);
}

export const focusMode = $prose(
  () =>
    new Plugin({
      key: focusKey,
      state: {
        init: (_, { doc, selection }) => buildFocusDecorations(doc, selection),
        apply(tr, set) {
          if (tr.docChanged || tr.selectionSet) {
            return buildFocusDecorations(tr.doc, tr.selection);
          }
          return set;
        },
      },
      props: {
        // 注意：ProseMirror 调用 props.decorations 时不会把 this 绑定到 plugin，
        // 写成 `this.getState(state)` 会因 this 为 undefined 而抛错、导致整个 Focus 模式高亮失效。
        // 必须改用 PluginKey 读取状态（与 searchHighlight 插件一致）。
        decorations(state) {
          return focusKey.getState(state);
        },
      },
    })
);

// ===== Typewriter 模式：光标始终保持在视口垂直居中 =====
const typewriterKey = new PluginKey('typewriter-mode');
let typewriterEnabled = false;

export function setTypewriterMode(v) {
  typewriterEnabled = !!v;
}

export const typewriterMode = $prose(
  () =>
    new Plugin({
      key: typewriterKey,
      view(editorView) {
        const scrollToCenter = () => {
          if (!typewriterEnabled) return;
          const head = editorView.state.selection.head;
          const scroller = editorView.dom.closest('.editor-container');
          if (!scroller) return;
          const coords = editorView.coordsAtPos(head);
          if (!coords) return;
          const rect = scroller.getBoundingClientRect();
          const offset = coords.top - rect.top;
          scroller.scrollTop += offset - rect.height / 2;
        };
        const onKey = () => scrollToCenter();
        const onMouse = () => scrollToCenter();
        editorView.dom.addEventListener('keyup', onKey);
        editorView.dom.addEventListener('mouseup', onMouse);
        return {
          update(view) {
            if (typewriterEnabled) scrollToCenter();
          },
          destroy() {
            editorView.dom.removeEventListener('keyup', onKey);
            editorView.dom.removeEventListener('mouseup', onMouse);
          },
        };
      },
    })
);
