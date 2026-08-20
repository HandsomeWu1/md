import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

// 编辑器事务广播：通过 window 派发 'editor:tx' 事件。
// 让外部 React 组件（如表格浮动工具条）能感知选区/文档变化，无需监听 DOM。
// ProseMirror EditorView 本身没有 on/off 事件 API，所以走「插件 view.update + 全局事件」的间接方案。
const TX_EVENT = 'editor:tx';

export const tableSignal = $prose(
  () =>
    new Plugin({
      key: new PluginKey('table-signal'),
      view(editorView) {
        // 第一次挂载时也派发一次，触发订阅者初始计算
        queueMicrotask(() => window.dispatchEvent(new CustomEvent(TX_EVENT)));
        return {
          update() {
            window.dispatchEvent(new CustomEvent(TX_EVENT));
          },
        };
      },
    })
);
