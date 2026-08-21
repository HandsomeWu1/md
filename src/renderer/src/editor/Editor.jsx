import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { createMilkdown } from './createMilkdown';
import { getMarkdown as getMarkdownAction, replaceAll as replaceAllAction } from '@milkdown/kit/utils';
import { editorViewCtx } from '@milkdown/kit/core';
import { undo, redo } from '@milkdown/kit/prose/history';
import { TextSelection } from '@milkdown/prose/state';
import { getActiveFormats } from './selection';
import { searchHighlightKey, setSearchQuery } from './searchHighlight';
import TableFloatingToolbar from '../components/TableFloatingToolbar';

function runWithView(editor, fn) {
  if (!editor) return;
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    if (view) fn(view);
  });
}

const InnerEditor = forwardRef(function InnerEditor({ initialValue, onChange, onSelectionChange }, ref) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
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
