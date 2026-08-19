import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

// 任务列表 checkbox 点击区域宽度（与 CSS 的 padding-left 28px 对齐）
const CHECKBOX_WIDTH = 28;

/**
 * 任务列表点击切换：点击 checkbox 区域时切换 list_item 的 checked 属性。
 * gfm 无现成 toggle 命令，且 checkbox 由 CSS 伪元素渲染（无真实 DOM），
 * 因此通过 Plugin 的 handleDOMEvents.click 检测点击坐标，命中后 setNodeMarkup 切换 checked。
 *
 * 注意：不能用 props.handleClick —— ProseMirror 会把 <500ms 内的第二次点击
 * 识别为 doubleClick 而走 handleDoubleClick，导致快速连点第二个 checkbox 不生效。
 * handleDOMEvents.click 每次 DOM click 都会触发，不区分单击/双击。
 */
export const taskListToggle = $prose(
  () =>
    new Plugin({
      key: new PluginKey('task-list-toggle'),
      props: {
        handleDOMEvents: {
          click: (view, event) => {
            const target = event.target;
            if (!(target instanceof Element)) return false;
            const li = target.closest('li[data-item-type="task"]');
            if (!li) return false;

            // 判断点击是否落在 checkbox 区域（li 左侧 CHECKBOX_WIDTH 内）
            const rect = li.getBoundingClientRect();
            const x = event.clientX - rect.left;
            if (x < 0 || x > CHECKBOX_WIDTH) return false;

            // li 是包裹节点，posAtDOM(li, 0) 返回其内容起始位置（= li.pos + 1）
            const liPos = view.posAtDOM(li, 0) - 1;
            const node = view.state.doc.nodeAt(liPos);
            if (!node || node.type.name !== 'list_item') return false;

            const nextChecked = !node.attrs.checked;
            view.dispatch(
              view.state.tr.setNodeMarkup(liPos, null, { ...node.attrs, checked: nextChecked })
            );
            return true;
          },
        },
      },
    })
);
