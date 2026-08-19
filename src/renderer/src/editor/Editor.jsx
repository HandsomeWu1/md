import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { createMilkdown } from './createMilkdown';
import { getMarkdown as getMarkdownAction, replaceAll as replaceAllAction } from '@milkdown/kit/utils';
import { editorViewCtx } from '@milkdown/kit/core';
import { undo, redo } from '@milkdown/kit/prose/history';
import { getActiveFormats } from './selection';

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

  // 编辑器异步创建完成后自动聚焦，确保新建/切换标签后光标可见（Typora 行为）。
  useEffect(() => {
    if (loading) return;
    const ed = get();
    if (!ed) return;
    // 等编辑器 DOM 真正挂载后再聚焦
    const id = requestAnimationFrame(() => {
      runWithView(ed, (view) => view.focus());
    });
    return () => cancelAnimationFrame(id);
  }, [loading, get]);

  useImperativeHandle(
    ref,
    () => ({
      loading: () => loading,
      getEditor: () => get(),
      getMarkdown: () => {
        const ed = get();
        return ed ? ed.action(getMarkdownAction()) : '';
      },
      setMarkdown: (md) => {
        const ed = get();
        if (ed) ed.action(replaceAllAction(md || ''));
      },
      undo: () => runWithView(get(), (view) => undo(view.state, view.dispatch)),
      redo: () => runWithView(get(), (view) => redo(view.state, view.dispatch)),
      focus: () => runWithView(get(), (view) => view.focus()),
      // 触发一次 selection 事务，用于让 Focus/Typewriter 等依赖 selection 的插件重算
      refresh: () =>
        runWithView(get(), (view) => {
          const { tr, selection } = view.state;
          view.dispatch(tr.setSelection(selection));
        }),
    }),
    [get, loading]
  );

  return <Milkdown />;
});

export default forwardRef(function Editor(props, ref) {
  return (
    <MilkdownProvider>
      <InnerEditor {...props} ref={ref} />
    </MilkdownProvider>
  );
});
