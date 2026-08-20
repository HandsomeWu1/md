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
 * mermaid 代码块 NodeView。
 *  - 预览模式（默认）：显示 SVG 渲染图 + 右上角「编辑源码」按钮，源码（contentDOM）移出视野隐藏
 *  - 编辑模式：显示源码输入区（contentDOM）+「完成」按钮，预览图隐藏
 *  - 双击预览图 / 点「编辑源码」→ 编辑模式；点「完成」→ 预览模式
 *  - 刚插入的空 mermaid 块直接进入编辑模式
 *
 * 关键实现点（ProseMirror 自定义 NodeView 踩坑总结）：
 *  1. contentDOM 绝不能用 display:none 隐藏，否则 ProseMirror 无法维护其内容/选区，
 *     切回编辑时源码会丢失。这里用 position:absolute + left:-99999px 移出视野。
 *  2. 必须实现 ignoreMutation，忽略 contentDOM 之外的 DOM 变化（renderInto 改 preview 会
 *     被 MutationObserver 捕获，否则触发「mutation→重渲染→renderInto→mutation」死循环）。
 *  3. 必须实现 stopEvent，让按钮上的事件不冒泡给 ProseMirror。
 */
class MermaidBlockView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement('div');
    this.dom.className = 'mermaid-block';
    this.dom.dataset.mode = 'preview';

    // 源码编辑区（contentDOM，ProseMirror 管理内容）
    this.editor = document.createElement('div');
    this.editor.className = 'mermaid-editor';
    this.editor.spellcheck = false;

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

    // 完成按钮
    this.doneBar = document.createElement('div');
    this.doneBar.className = 'mermaid-done-bar';
    this.doneBtn = document.createElement('button');
    this.doneBtn.type = 'button';
    this.doneBtn.className = 'mermaid-done-btn';
    this.doneBtn.textContent = '完成';
    this.doneBar.appendChild(this.doneBtn);

    this.dom.appendChild(this.editor);
    this.dom.appendChild(this.preview);
    this.dom.appendChild(this.toolbar);
    this.dom.appendChild(this.doneBar);

    this.renderTimer = null;

    this.editBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showEditor();
    });
    this.preview.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showEditor();
    });
    this.doneBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showPreview();
    });

    // 初始状态：空则编辑模式，非空则预览模式
    if (node.textContent.trim() === '') {
      this.showEditor();
    } else {
      this.showPreview();
    }
  }

  get contentDOM() {
    return this.editor;
  }

  // 按钮上的事件不冒泡给 ProseMirror
  stopEvent(event) {
    return this.editBtn.contains(event.target) || this.doneBtn.contains(event.target);
  }

  // 忽略 contentDOM（editor）之外的 DOM 变化，避免 renderInto 触发死循环
  ignoreMutation(mutation) {
    return !this.editor.contains(mutation.target);
  }

  showPreview() {
    this.dom.dataset.mode = 'preview';
    renderInto(this.preview, this.node.textContent);
  }

  showEditor() {
    this.dom.dataset.mode = 'edit';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.editor.focus();
      });
    });
  }

  update(node) {
    this.node = node;
    if (this.dom.dataset.mode === 'preview') {
      if (this.renderTimer) clearTimeout(this.renderTimer);
      this.renderTimer = setTimeout(() => {
        renderInto(this.preview, this.node.textContent);
      }, 200);
    }
    return true;
  }

  destroy() {
    if (this.renderTimer) clearTimeout(this.renderTimer);
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
