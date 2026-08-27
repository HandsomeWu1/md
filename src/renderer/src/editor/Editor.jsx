import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { createMilkdown } from './createMilkdown';
import { getMarkdown as getMarkdownAction, replaceAll as replaceAllAction } from '@milkdown/kit/utils';
import { editorViewCtx, serializerCtx, parserCtx } from '@milkdown/kit/core';
import { undo, redo } from '@milkdown/kit/prose/history';
import { TextSelection } from '@milkdown/prose/state';
import { getActiveFormats } from './selection';
import { searchHighlightKey, setSearchQuery } from './searchHighlight';
import { diffHighlightKey, diffToRanges, topLevelKeys } from './diffHighlight';
import { diffBlocks } from '../utils/blockDiff';
import TableFloatingToolbar from '../components/TableFloatingToolbar';

function runWithView(editor, fn) {
  if (!editor) return;
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    if (view) fn(view);
  });
}

const InnerEditor = forwardRef(function InnerEditor({ initialValue, onChange, onSelectionChange, onSelectionRectChange }, ref) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onSelectionRectRef = useRef(onSelectionRectChange);
  onSelectionRectRef.current = onSelectionRectChange;
  // 浮动 AI 菜单的定位防抖：拖动选区过程中选区不断变化，等停下（松开鼠标/键盘停顿）再显示，
  // 避免选中过程中菜单一直抖动/提前出现。
  const selectionRectTimerRef = useRef(null);
  const initialValueRef = useRef(initialValue);
  const [pmView, setPmView] = useState(null);

  const { get, loading } = useEditor(
    (root) =>
      createMilkdown(root, {
        defaultValue: initialValueRef.current,
        onMarkdownUpdated: (md) => {
          if (onChangeRef.current) onChangeRef.current(md);
        },
        onSelectionUpdated: (ctx) => {
          // listener 的 selectionUpdated 在 transaction 应用阶段触发，此时 view.state 还是旧值。
          // 延迟到下一帧（view.state 已更新）再计算激活格式。
          requestAnimationFrame(() => {
            if (onSelectionChangeRef.current) {
              onSelectionChangeRef.current(getActiveFormats(ctx));
            }
            // 选区矩形：供浮动 AI 菜单定位。折叠 / 空选区时立即隐藏菜单。
            const view = ctx.get(editorViewCtx);
            if (!view) return;
            const { from, to, empty } = view.state.selection;
            if (empty || from === to) {
              clearTimeout(selectionRectTimerRef.current);
              if (onSelectionRectRef.current) onSelectionRectRef.current(null);
              return;
            }
            // 拖动选区时本回调会频繁触发，用防抖等选区稳定后再显示：
            // 鼠标拖动中每次变化都重置计时器，松开后才真正计算并定位。
            clearTimeout(selectionRectTimerRef.current);
            selectionRectTimerRef.current = setTimeout(() => {
              try {
                const a = view.coordsAtPos(from);
                const b = view.coordsAtPos(to);
                const left = Math.round((a.left + b.left) / 2);
                const top = Math.round(Math.min(a.top, b.top));
                if (onSelectionRectRef.current) onSelectionRectRef.current({ left, top });
              } catch {
                if (onSelectionRectRef.current) onSelectionRectRef.current(null);
              }
            }, 200);
          });
        },
      }),
    []
  );

  // useEditor 返回的 get 是 `() => editorInfo.editor.current`，每次渲染都是新引用。
  // 用 ref 缓存，避免 effect/回调因 get 变化而重复执行（否则每次父组件重渲染都会
  // 重新 view.focus()，抢走重命名等输入框的焦点）。
  const getRef = useRef(get);
  getRef.current = get;

  // 卸载时取消未触发的浮动菜单定位计时器，避免回调落到已销毁的编辑器上。
  useEffect(() => () => clearTimeout(selectionRectTimerRef.current), []);

  // 编辑器异步创建完成后自动聚焦，确保新建/切换标签后光标可见。
  // 只依赖 loading：编辑器仅在创建完成（loading 由 true→false）时聚焦一次。
  useEffect(() => {
    if (loading) return;
    const ed = getRef.current();
    if (!ed) return;
    // 获取 ProseMirror view 实例供 TableFloatingToolbar 使用
    ed.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (view) setPmView(view);
    });
    // 等编辑器 DOM 真正挂载后再聚焦
    const id = requestAnimationFrame(() => {
      runWithView(ed, (view) => view.focus());
    });
    return () => cancelAnimationFrame(id);
  }, [loading]);

  // 点击编辑器容器空白区域（ProseMirror 内容之外）时：
  //   - 空文档（无任何内容）→ 光标定位到第一行（开头）
  //   - 有内容的文档 → 光标定位到末尾（最后一行），而不是跳回页头
  // Milkdown 空文档只有一个空段落，contentDOM 高度只有一行，导致下方大片空白不可点击。
  const handleContainerClick = useCallback(
    (e) => {
      const pm = e.currentTarget.querySelector('.ProseMirror');
      if (pm && pm.contains(e.target)) return; // 点在正文内，交给编辑器处理
      const ed = getRef.current();
      if (!ed) return;
      ed.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        if (!view) return;
        view.focus();
        const { doc } = view.state;
        const isEmpty = doc.textContent.trim() === '';
        let sel;
        if (isEmpty) {
          // 空文档：定位到开头（第一行）
          sel = TextSelection.create(doc, 1);
        } else {
          // 有内容：定位到文档末尾（最后一行），点击下方空白不应跳回页头
          sel = TextSelection.near(doc.resolve(doc.content.size), 1);
        }
        view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
      });
    },
    []
  );

  useImperativeHandle(
    ref,
    () => ({
      loading: () => loading,
      getEditor: () => getRef.current(),
      getMarkdown: () => {
        const ed = getRef.current();
        return ed ? ed.action(getMarkdownAction()) : '';
      },
      setMarkdown: (md) => {
        const ed = getRef.current();
        if (ed) ed.action(replaceAllAction(md || ''));
      },
      // 读取当前选区的 Markdown 源码，供 AI 只改写选中片段。
      // 选区跨越块边界时 slice 的 openStart/openEnd 不为 0，直接塞进 topNode 可能
      // 构造出非法文档，因此序列化失败时退回纯文本，保证功能不中断。
      getSelectionMarkdown: () => {
        const ed = getRef.current();
        if (!ed) return { empty: true, text: '' };
        let out = { empty: true, text: '' };
        ed.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          if (!view) return;
          const { state } = view;
          let { from, to, empty } = state.selection;
          // 编辑器未聚焦时（例如刚在 AI 对话框里聊完天），ProseMirror 的 state.selection
          // 可能没跟上真实 DOM 选区，导致「先对话、再选区改写」时选区读出来是空。
          // 此时回退读取实时 DOM 选区并映射回 PM 坐标，保证把选中内容交给模型。
          if (empty || from === to) {
            try {
              const domSel = view.dom.ownerDocument.getSelection();
              if (domSel && !domSel.isCollapsed && domSel.rangeCount > 0) {
                const r = domSel.getRangeAt(0);
                if (view.dom.contains(r.startContainer) && view.dom.contains(r.endContainer)) {
                  from = view.posAtDOM(r.startContainer, r.startOffset);
                  to = view.posAtDOM(r.endContainer, r.endOffset);
                  empty = from === to;
                }
              }
            } catch {
              /* 映射失败则保持 empty */
            }
          }
          if (empty || from === to) return;
          let text = '';
          try {
            const serializer = ctx.get(serializerCtx);
            const slice = state.doc.slice(from, to);
            text = serializer(state.schema.topNodeType.create(null, slice.content));
          } catch {
            text = state.doc.textBetween(from, to, '\n\n');
          }
          out = { empty: false, text: (text || '').trim(), from, to };
        });
        return out;
      },
      // 用 Markdown 文本替换当前选区。整个替换是**单个 ProseMirror 事务**，
      // 因此 AI 改写后按一次 Cmd+Z 即可整体回退。
      replaceSelectionMarkdown: (md) => {
        const ed = getRef.current();
        if (!ed) return false;
        let done = false;
        ed.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          if (!view) return;
          const { state } = view;
          const { from, to, empty } = state.selection;
          if (empty || from === to) return;
          const parser = ctx.get(parserCtx);
          const doc = parser(md || '');
          if (!doc) return;
          view.dispatch(state.tr.replaceWith(from, to, doc.content).scrollIntoView());
          done = true;
        });
        return done;
      },
      /**
       * 应用 AI 改写并在正文中标注改动位置。
       *
       * 先记录旧文档的块指纹，写入后再比对，从而知道「哪些块是这次改出来的」——
       * 这个信息无法从结果文档反推，必须在应用前后各取一次快照。
       *
       * @param {string} md 改写后的 Markdown
       * @param {{ range?: {from:number,to:number} }} opts
       *   range 存在时只替换该区间（用发起请求时记录的位置，而非实时选区：
       *   模型返回往往要等几秒，期间用户点一下正文选区就没了）。
       * @returns {{ ok: boolean, added: number, changed: number, removed: number, coarse?: boolean }}
       */
      applyMarkdownWithDiff: (md, { range = null } = {}) => {
        const ed = getRef.current();
        const fail = { ok: false, added: 0, changed: 0, removed: 0 };
        if (!ed) return fail;

        let oldKeys = null;
        ed.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          if (view) oldKeys = topLevelKeys(view.state.doc);
        });
        if (!oldKeys) return fail;

        // 写入：区间改写只动该区间，整篇改写走 replaceAll（两者都是单事务）。
        let written = false;
        if (range) {
          ed.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            if (!view) return;
            const { state } = view;
            const size = state.doc.content.size;
            // 位置越界说明文档已被改动过，宁可失败也不能写错地方。
            if (range.from < 0 || range.to > size || range.from >= range.to) return;
            const parser = ctx.get(parserCtx);
            const doc = parser(md || '');
            if (!doc) return;

            // 插入粒度要与选区所处的层级匹配，否则会撑出多余的空段落：
            // 选区完全落在同一个文本块内（最常见：选中一段话里的若干字，或三击选整段）
            // 且改写结果只有一个文本块时，只插入其 inline 内容；
            // 否则（跨块选区、或结果含多个块）才按块替换。
            const $from = state.doc.resolve(range.from);
            const $to = state.doc.resolve(range.to);
            const inSameTextblock = $from.sameParent($to) && $from.parent.isTextblock;
            const singleTextblockResult = doc.childCount === 1 && doc.firstChild.isTextblock;
            const content =
              inSameTextblock && singleTextblockResult ? doc.firstChild.content : doc.content;

            view.dispatch(state.tr.replaceWith(range.from, range.to, content).scrollIntoView());
            written = true;
          });
        } else {
          ed.action(replaceAllAction(md || ''));
          written = true;
        }
        if (!written) return fail;

        // 比对并下发标注。文档过大时 diffBlocks 返回 null，此时不标注具体位置，
        // 但仍要告知调用方「已应用、只是未标注」，避免用户以为没生效。
        let result = { ok: true, added: 0, changed: 0, removed: 0, coarse: false };
        ed.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          if (!view) return;
          const diff = diffBlocks(oldKeys, topLevelKeys(view.state.doc));
          if (!diff) {
            result.coarse = true;
            return;
          }
          const ranges = diffToRanges(view.state.doc, diff);
          view.dispatch(view.state.tr.setMeta(diffHighlightKey, { type: 'set', ranges }));
          result.added = diff.added.length;
          result.changed = diff.changed.length;
          result.removed = diff.removedCount;
        });
        return result;
      },
      // 清除 AI 改动标注（用户点「保留」或撤销后调用）
      clearDiffHighlight: () => {
        runWithView(getRef.current(), (view) => {
          view.dispatch(view.state.tr.setMeta(diffHighlightKey, { type: 'clear' }));
        });
      },
      // 滚动到第一处 AI 改动，便于用户从改动处开始检查
      scrollToFirstDiff: () => {
        runWithView(getRef.current(), (view) => {
          const set = diffHighlightKey.getState(view.state);
          if (!set) return;
          const found = set.find();
          if (!found.length) return;
          const first = found.reduce((min, d) => (d.from < min.from ? d : min), found[0]);
          const dom = view.domAtPos(first.from);
          const el = dom && dom.node && dom.node.nodeType === 1 ? dom.node : dom?.node?.parentElement;
          if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      },
      undo: () => runWithView(getRef.current(), (view) => undo(view.state, view.dispatch)),
      redo: () => runWithView(getRef.current(), (view) => redo(view.state, view.dispatch)),
      focus: () => runWithView(getRef.current(), (view) => view.focus()),
      // 触发一次 selection 事务，用于让 Focus/Typewriter 等依赖 selection 的插件重算
      refresh: () =>
        runWithView(getRef.current(), (view) => {
          const { tr, selection } = view.state;
          view.dispatch(tr.setSelection(selection));
        }),
      // 更新搜索结果高亮：设置全局查询词 + 当前项，dispatch 带 meta 的事务触发 decoration 重算
      setSearchHighlight: (query, caseSensitive, index) => {
        setSearchQuery(query, caseSensitive, index);
        runWithView(getRef.current(), (view) => {
          view.dispatch(view.state.tr.setMeta(searchHighlightKey, { type: 'search-highlight-update' }));
        });
      },
    }),
    [loading]
  );

  return (
    <div className="editor-click-area" onClick={handleContainerClick}>
      <Milkdown />
      {pmView && <TableFloatingToolbar view={pmView} />}
    </div>
  );
});

export default forwardRef(function Editor(props, ref) {
  return (
    <MilkdownProvider>
      <InnerEditor {...props} ref={ref} />
    </MilkdownProvider>
  );
});
