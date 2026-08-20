import React, { useState, useEffect, useCallback } from 'react';
import { isInTable } from '@milkdown/prose/tables';
import {
  addRowBefore,
  addRowAfter,
  addColumnBefore,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
  setCellAttr,
} from '@milkdown/prose/tables';

// 编辑器事务广播事件名（与 editor/tableSignal.js 保持一致）
const TX_EVENT = 'editor:tx';

export default function TableFloatingToolbar({ view }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!view) { setVisible(false); return; }
    try {
      const state = view.state;
      if (!isInTable(state)) { setVisible(false); return; }
      const from = state.selection.from;
      const coords = view.coordsAtPos(from);
      setPos({ top: coords.top - 42, left: coords.left });
      setVisible(true);
    } catch {
      setVisible(false);
    }
  }, [view]);

  // 订阅全局编辑器事务事件（由 editor/tableSignal.js 插件派发）
  useEffect(() => {
    if (!view) return;
    const handler = () => requestAnimationFrame(updatePosition);
    window.addEventListener(TX_EVENT, handler);
    // 初始化
    updatePosition();
    return () => {
      window.removeEventListener(TX_EVENT, handler);
    };
  }, [view, updatePosition]);

  // 阻止 mousedown 默认行为：避免点击按钮时编辑器失焦（失焦会破坏选区、
  // 并在重新 focus 时把滚动位置跳回顶部）。点击按钮全程保持编辑器焦点。
  const keepFocus = (e) => e.preventDefault();

  const dispatch = (tr) => {
    if (!view) return;
    view.dispatch(tr);
    // 不调用 view.focus()：编辑器从未失焦，无需重新聚焦（否则会触发滚动跳动）。
  };

  const handleAddRowBefore = () => { if (view) addRowBefore(view.state, dispatch); };
  const handleAddRowAfter = () => { if (view) addRowAfter(view.state, dispatch); };
  const handleAddColBefore = () => { if (view) addColumnBefore(view.state, dispatch); };
  const handleAddColAfter = () => { if (view) addColumnAfter(view.state, dispatch); };
  const handleDeleteRow = () => { if (view) deleteRow(view.state, dispatch); };
  const handleDeleteCol = () => { if (view) deleteColumn(view.state, dispatch); };
  const handleDeleteTable = () => { if (view) deleteTable(view.state, dispatch); };
  const handleAlign = (align) => { if (view) setCellAttr('alignment', align)(view.state, dispatch); };

  if (!visible || !view) return null;

  return (
    <div className="table-floating-toolbar" style={{ position: 'fixed', top: pos.top, left: pos.left - 60, zIndex: 1500 }}>
      <button type="button" title="在当前行上方插入一行" onMouseDown={keepFocus} onClick={handleAddRowBefore}>上方加行</button>
      <button type="button" title="在当前行下方插入一行" onMouseDown={keepFocus} onClick={handleAddRowAfter}>下方加行</button>
      <span className="tft-sep" />
      <button type="button" title="在当前列左侧插入一列" onMouseDown={keepFocus} onClick={handleAddColBefore}>左侧加列</button>
      <button type="button" title="在当前列右侧插入一列" onMouseDown={keepFocus} onClick={handleAddColAfter}>右侧加列</button>
      <span className="tft-sep" />
      <button type="button" title="删除当前行" onMouseDown={keepFocus} onClick={handleDeleteRow}>删除行</button>
      <button type="button" title="删除当前列" onMouseDown={keepFocus} onClick={handleDeleteCol}>删除列</button>
      <button type="button" title="删除整个表格" onMouseDown={keepFocus} onClick={handleDeleteTable} className="danger">删除表格</button>
      <span className="tft-sep" />
      <button type="button" title="左对齐" onMouseDown={keepFocus} onClick={() => handleAlign('left')}>左对齐</button>
      <button type="button" title="居中" onMouseDown={keepFocus} onClick={() => handleAlign('center')}>居中</button>
      <button type="button" title="右对齐" onMouseDown={keepFocus} onClick={() => handleAlign('right')}>右对齐</button>
    </div>
  );
}
