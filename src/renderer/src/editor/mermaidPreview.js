import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import mermaid from 'mermaid';

// 安全级别 strict，阻止 mermaid 图中的脚本/点击事件（防 XSS）。
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'default',
});

const key = new PluginKey('mermaid-preview');
let counter = 0;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderInto(el, code) {
  const id = `mmd-${Date.now()}-${++counter}`;
  mermaid
    .render(id, code)
    .then(({ svg }) => {
      el.innerHTML = svg;
    })
    .catch((err) => {
      el.innerHTML = `<div class="diagram-error">Mermaid 渲染失败：${escapeHtml(err?.message || '未知错误')}</div>`;
    });
}

function buildDecorations(doc) {
  const decos = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'code_block' && node.attrs.language === 'mermaid') {
      const code = node.textContent;
      decos.push(
        Decoration.widget(
          pos + node.nodeSize,
          () => {
            const div = document.createElement('div');
            div.className = 'mermaid-preview';
            div.dataset.code = code;
            return div;
          },
          { side: 1, key: `mermaid:${code}` }
        )
      );
    }
  });
  return DecorationSet.create(doc, decos);
}

// 在 language 为 mermaid 的代码块下方渲染 SVG 预览。
// 代码块本身保持可编辑（普通 code_block），prism 负责语法高亮。
export const mermaidPreview = $prose((ctx) => {
  return new Plugin({
    key,
    state: {
      init: (_, { doc }) => buildDecorations(doc),
      apply: (tr, set) => {
        if (!tr.docChanged) return set.map(tr.mapping, tr.doc);
        return buildDecorations(tr.doc);
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
    view: (editorView) => {
      const renderAll = () => {
        const els = editorView.dom.querySelectorAll('.mermaid-preview:not(.rendered)');
        els.forEach((el) => {
          el.classList.add('rendered');
          renderInto(el, el.dataset.code);
        });
      };
      // widget 挂载后再渲染（此时 DOM 已进入文档）
      setTimeout(renderAll, 0);
      return {
        update() {
          setTimeout(renderAll, 0);
        },
      };
    },
  });
});
