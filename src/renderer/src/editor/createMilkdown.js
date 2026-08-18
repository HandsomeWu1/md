import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { trailing } from '@milkdown/kit/plugin/trailing';
import { indent } from '@milkdown/kit/plugin/indent';
import { cursor } from '@milkdown/kit/plugin/cursor';
import { nord } from '@milkdown/theme-nord';
import '@milkdown/theme-nord/style.css';
import '@milkdown/kit/prose/view/style/prosemirror.css';
import '@milkdown/kit/prose/gapcursor/style/gapcursor.css';
import '@milkdown/kit/prose/tables/style/tables.css';

/**
 * 创建 Milkdown 编辑器构建器（不调用 create，交给 useEditor 管理生命周期）。
 * @param {HTMLElement} root 挂载节点
 * @param {{defaultValue?: string, onMarkdownUpdated?: (markdown:string)=>void}} options
 */
export function createMilkdown(root, { defaultValue = '', onMarkdownUpdated } = {}) {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, defaultValue);
      if (onMarkdownUpdated) {
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          onMarkdownUpdated(markdown);
        });
      }
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .use(clipboard)
    .use(trailing)
    .use(indent)
    .use(cursor)
    .use(nord);
}
