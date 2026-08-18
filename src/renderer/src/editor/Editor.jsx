import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { createMilkdown } from './createMilkdown';
import { getMarkdown as getMarkdownAction, replaceAll as replaceAllAction } from '@milkdown/kit/utils';
import { editorViewCtx } from '@milkdown/kit/core';
import { undo, redo } from '@milkdown/kit/prose/history';

function runWithView(editor, fn) {
  if (!editor) return;
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    if (view) fn(view);
  });
}

const InnerEditor = forwardRef(function InnerEditor({ initialValue, onChange }, ref) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialValueRef = useRef(initialValue);

  const { get, loading } = useEditor(
    (root) =>
      createMilkdown(root, {
        defaultValue: initialValueRef.current,
        onMarkdownUpdated: (md) => {
          if (onChangeRef.current) onChangeRef.current(md);
        },
      }),
    []
  );

  useImperativeHandle(
    ref,
    () => ({
      loading: () => loading,
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
