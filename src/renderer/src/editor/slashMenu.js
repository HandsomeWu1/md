import { SlashProvider, slashFactory } from '@milkdown/plugin-slash';
import { setBlockType, wrapIn } from '@milkdown/prose/commands';
import { wrapInList } from '@milkdown/prose/schema-list';

// 创建 slash 插件实例：[slashSpec, slashPlugin]
export const slash = slashFactory('slash');

// 在当前块中删除已输入的 "/xxx" 查询文本，然后执行块级命令。
function runBlockCommand(view, command) {
  const { state } = view;
  const { selection } = state;
  const $from = selection.$from;
  const blockStart = $from.before($from.depth);
  // 先删除 "/xxx" 查询文本（光标落到块首），再执行块级命令
  if ($from.parent.textContent.startsWith('/')) {
    view.dispatch(state.tr.delete(blockStart, $from.pos));
  }
  command(view.state, view.dispatch);
}

class SlashMenuView {
  constructor(ctx, view) {
    this.view = view;
    this.element = document.createElement('div');
    this.element.className = 'slash-menu';
    this.provider = new SlashProvider({
      content: this.element,
      debounce: 20,
      offset: 8,
      shouldShow: (v) => {
        const text = this.provider.getContent(v);
        return !!text && text.startsWith('/');
      },
    });
    this.provider.onShow = () => this.render();
    this.provider.onHide = () => {
      this.element.innerHTML = '';
    };
    this.update(view);
  }

  getItems() {
    const { nodes } = this.view.state.schema;
    const items = [
      { label: '正文', icon: '¶', run: () => runBlockCommand(this.view, setBlockType(nodes.paragraph)) },
      { label: '一级标题', icon: 'H1', run: () => runBlockCommand(this.view, setBlockType(nodes.heading, { level: 1 })) },
      { label: '二级标题', icon: 'H2', run: () => runBlockCommand(this.view, setBlockType(nodes.heading, { level: 2 })) },
      { label: '三级标题', icon: 'H3', run: () => runBlockCommand(this.view, setBlockType(nodes.heading, { level: 3 })) },
    ];
    if (nodes.bullet_list) {
      items.push({ label: '无序列表', icon: '•', run: () => runBlockCommand(this.view, wrapInList(nodes.bullet_list)) });
    }
    if (nodes.ordered_list) {
      items.push({ label: '有序列表', icon: '1.', run: () => runBlockCommand(this.view, wrapInList(nodes.ordered_list)) });
    }
    if (nodes.blockquote) {
      items.push({ label: '引用', icon: '❝', run: () => runBlockCommand(this.view, wrapIn(nodes.blockquote)) });
    }
    if (nodes.code_block) {
      items.push({ label: '代码块', icon: '</>', run: () => runBlockCommand(this.view, setBlockType(nodes.code_block)) });
    }
    return items;
  }

  render() {
    this.element.innerHTML = '';
    for (const item of this.getItems()) {
      const btn = document.createElement('button');
      btn.className = 'slash-item';
      btn.type = 'button';
      const icon = document.createElement('span');
      icon.className = 'slash-icon';
      icon.textContent = item.icon;
      const label = document.createElement('span');
      label.textContent = item.label;
      btn.appendChild(icon);
      btn.appendChild(label);
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        item.run();
        this.provider.hide();
      });
      this.element.appendChild(btn);
    }
  }

  update(view) {
    this.view = view;
    this.provider.update(view);
  }

  destroy() {
    this.provider.destroy();
    this.element.remove();
  }
}

// 配置 slashSpec：把 view 指向自定义菜单，使 slashPlugin 挂载它。
export function configureSlash(ctx) {
  ctx.set(slash.key, {
    view: (view) => new SlashMenuView(ctx, view),
  });
}
