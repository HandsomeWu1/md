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
  el.innerHTML = '';
  mermaid
    .render(id, code)
    .then(({ svg }) => {
      el.innerHTML = svg;
    })
    .catch((err) => {
      el.innerHTML = `<div class="diagram-error">Mermaid 渲染失败：${escapeHtml(err?.message || '未知错误')}</div>`;
    });
}

// mermaid 块的 widget：默认显示 SVG，双击/点「编辑」按钮切到 textarea 源码编辑。
function makeWidget(getPos, view) {
  const wrapper = document.createElement('div');
  wrapper.className = 'mermaid-block';

  const preview = document.createElement('div');
  preview.className = 'mermaid-preview';

  const toolbar = document.createElement('div');
  toolbar.className = 'mermaid-toolbar';
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'mermaid-edit-btn';
  editBtn.textContent = '编辑源码';
  toolbar.appendChild(editBtn);

  const source = document.createElement('textarea');
  source.className = 'mermaid-source';
  source.spellcheck = false;
  source.rows = 6;

  const doneBar = document.createElement('div');
  doneBar.className = 'mermaid-done-bar';
  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'mermaid-done-btn';
  doneBtn.textContent = '完成';
  doneBar.appendChild(doneBtn);

  const render = () => {
    const pos = getPos();
    const node = view.state.doc.nodeAt(pos);
    const code = node ? node.textContent : '';
    source.value = code;
    wrapper.innerHTML = '';
    wrapper.appendChild(preview);
    wrapper.appendChild(toolbar);
    renderInto(preview, code);
  };

  editBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getPos();
    const node = view.state.doc.nodeAt(pos);
    if (!node) return;
    source.value = node.textContent;
    wrapper.innerHTML = '';
    wrapper.appendChild(source);
    wrapper.appendChild(doneBar);
    setTimeout(() => source.focus(), 0);
  });

  doneBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getPos();
    const node = view.state.doc.nodeAt(pos);
    if (!node) return render();
    const newCode = source.value;
    if (newCode === node.textContent) return render();
    // 用新代码替换原 code_block
    const newNode = node.copy(view.state.schema.text(newCode));
    view.dispatch(
      view.state.tr.replaceWith(pos, pos + node.nodeSize, newNode)
    );
    // 替换后原 decoration 会被 apply 重建，render() 由新 widget 触发
  });

  // 双击预览区进入编辑
  preview.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    editBtn.click();
  });

  render();
  return wrapper;
}

function buildDecorations(view) {
  const decos = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'code_block' && node.attrs.language === 'mermaid') {
      decos.push(
        Decoration.replace(
          pos,
          pos + node.nodeSize,
          (view2, getPos) => makeWidget(getPos, view2),
          { key: `mermaid:${pos}` }
        )
      );
    }
  });
  return DecorationSet.create(view.state.doc, decos);
}

export const mermaidPreview = $prose(
  () =>
    new Plugin({
      key,
      state: {
        init: (_, state) => DecorationSet.empty,
        apply(tr, set, oldState, newState) {
          if (!tr.docChanged) return set.map(tr.mapping, tr.doc);
          return set.map(tr.mapping, tr.doc);
        },
      },
      props: {
        decorations(state) {
          const view = this.view;
          if (!view) return DecorationSet.empty;
          return buildDecorations(view);
        },
      },
    })
);
