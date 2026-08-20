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

// 插入一个 row x col 的表格（与 gfm insertTableCommand 相同效果，但不依赖命令注册/ctx）。
// 直接用 schema 节点构造，避免引入 @milkdown/kit/preset/gfm 的 $command 运行期依赖。
function insertTable(state, dispatch, row = 3, col = 3) {
  const { table, table_header_row, table_row, table_header, table_cell } = state.schema.nodes;
  if (!table || !table_header_row || !table_row) return false;

  const makeCell = () => table_cell.createAndFill();
  const makeHeader = () => table_header.createAndFill();
  const headerRow = table_header_row.create(null, Array.from({ length: col }, makeHeader));
  const bodyRows = Array.from({ length: row - 1 }, () =>
    table_row.create(null, Array.from({ length: col }, makeCell))
  );
  const tableNode = table.create(null, [headerRow, ...bodyRows]);

  dispatch?.(state.tr.replaceSelectionWith(tableNode).scrollIntoView());
  return true;
}

class SlashMenuView {
  constructor(ctx, view) {
    this.ctx = ctx;
    this.view = view;
    this.element = document.createElement('div');
    this.element.className = 'slash-menu';
    this.selectedIndex = 0;
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
      this.selectedIndex = 0;
    };
    this.onKeyDown = this.onKeyDown.bind(this);
    this.bindKeys();
    this.update(view);
  }

  bindKeys() {
    // capture 阶段监听：在 ProseMirror 处理按键前拦截，阻止上下键移动光标
    this.view.dom.addEventListener('keydown', this.onKeyDown, true);
  }

  unbindKeys() {
    this.view.dom.removeEventListener('keydown', this.onKeyDown, true);
  }

  onKeyDown(e) {
    // 只有菜单显示时才拦截按键
    if (this.element.dataset.show !== 'true') return;
    const items = this.getItems();
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      this.setSelected((this.selectedIndex + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      this.setSelected((this.selectedIndex - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const item = items[this.selectedIndex];
      if (item) {
        item.run();
        this.provider.hide();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.provider.hide();
    }
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
    if (nodes.table) {
      items.push({
        label: '表格',
        icon: '⊞',
        run: () => runBlockCommand(this.view, (state, dispatch) => insertTable(state, dispatch, 3, 3)),
      });
    }
    return items;
  }

  // 更新选中项并刷新高亮（不重建 DOM，避免 hover 抖动）
  setSelected(index) {
    this.selectedIndex = index;
    const btns = this.element.querySelectorAll('.slash-item');
    btns.forEach((btn, i) => {
      btn.classList.toggle('selected', i === index);
    });
  }

  render() {
    this.element.innerHTML = '';
    const items = this.getItems();
    items.forEach((item, index) => {
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
      btn.addEventListener('mouseenter', () => this.setSelected(index));
      this.element.appendChild(btn);
    });
    this.setSelected(this.selectedIndex);
  }

  update(view) {
    if (this.view && this.view.dom !== view.dom) {
      this.unbindKeys();
      this.view = view;
      this.bindKeys();
    } else {
      this.view = view;
    }
    this.provider.update(view);
  }

  destroy() {
    this.unbindKeys();
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
