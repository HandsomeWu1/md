import { $view } from '@milkdown/utils';
import { codeBlockSchema } from '@milkdown/kit/preset/commonmark';
import mermaid from 'mermaid';

// 安全级别 strict，阻止 mermaid 图中的脚本/点击事件（防 XSS）。
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'default',
});

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

/**
 * mermaid 代码块 NodeView：
 *  - 预览模式：显示 SVG 渲染图 + 右上角「编辑源码」按钮（代码隐藏）
 *  - 编辑模式：显示可编辑源码输入区（contentDOM）+「完成」按钮
 *  - 双击预览图 / 点「编辑源码」→ 编辑模式；点「完成」→ 预览模式
 *  - 刚插入的空 mermaid 块直接进入编辑模式
 */
class MermaidBlockView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement('div');
    this.dom.className = 'mermaid-block';

    // 预览区（SVG）
    this.preview = document.createElement('div');
    this.preview.className = 'mermaid-preview';

    // 工具栏（编辑源码按钮）
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'mermaid-toolbar';
    this.editBtn = document.createElement('button');
    this.editBtn.type = 'button';
    this.editBtn.className = 'mermaid-edit-btn';
    this.editBtn.textContent = '编辑源码';
    this.toolbar.appendChild(this.editBtn);

    // 编辑区（contentDOM，ProseMirror 管理内容）
    this.editor = document.createElement('div');
    this.editor.className = 'mermaid-editor';
    this.editor.contentEditable = 'true';
    this.editor.setAttribute('data-gramm', 'false');
    this.editor.spellcheck = false;

    // 完成按钮
    this.doneBar = document.createElement('div');
    this.doneBar.className = 'mermaid-done-bar';
    this.doneBtn = document.createElement('button');
    this.doneBtn.type = 'button';
    this.doneBtn.className = 'mermaid-done-btn';
    this.doneBtn.textContent = '完成';
    this.doneBar.appendChild(this.doneBtn);

    this.dom.appendChild(this.preview);
    this.dom.appendChild(this.toolbar);
    this.dom.appendChild(this.editor);
    this.dom.appendChild(this.doneBar);

    this.mode = 'preview';
    this.editBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showEditor(true);
    });
    this.preview.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showEditor(true);
    });
    this.doneBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showPreview();
    });

    // 初始状态
    if (node.textContent.trim() === '') {
      this.showEditor(true);
    } else {
      this.showPreview();
    }
  }

  // contentDOM：ProseMirror 用它编辑 code_block 的文本内容
  get contentDOM() {
    return this.editor;
  }

  showPreview() {
    this.mode = 'preview';
    this.dom.dataset.mode = 'preview';
    this.preview.style.display = '';
    this.toolbar.style.display = '';
    this.editor.style.display = 'none';
    this.doneBar.style.display = 'none';
    renderInto(this.preview, this.node.textContent);
  }

  showEditor(focus) {
    this.mode = 'edit';
    this.dom.dataset.mode = 'edit';
    this.preview.style.display = 'none';
    this.toolbar.style.display = 'none';
    this.editor.style.display = '';
    this.doneBar.style.display = '';
    if (focus) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.editor.focus();
        });
      });
    }
  }

  update(node) {
    this.node = node;
    // 预览模式下代码变化（如撤销）时重新渲染
    if (this.mode === 'preview') {
      renderInto(this.preview, node.textContent);
    }
    return true;
  }

  destroy() {
    this.dom.remove();
  }
}

// 注册 mermaid code_block 的 NodeView；非 mermaid 返回 null（走默认渲染 + prism 高亮）
export const mermaidPreview = $view(
  codeBlockSchema.node,
  () => (node, view, getPos) => {
    if (node.attrs.language !== 'mermaid') return null;
    return new MermaidBlockView(node, view, getPos);
  }
);
