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

  const dispatch = (tr) => {
    if (!view) return;
    view.dispatch(tr);
    view.focus();
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
      <button type="button" title="在上方插入行" onClick={handleAddRowBefore}>行上</button>
      <button type="button" title="在下方插入行" onClick={handleAddRowAfter}>行下</button>
      <span className="tft-sep" />
      <button type="button" title="在左侧插入列" onClick={handleAddColBefore}>列左</button>
      <button type="button" title="在右侧插入列" onClick={handleAddColAfter}>列右</button>
      <span className="tft-sep" />
      <button type="button" title="删除当前行" onClick={handleDeleteRow}>删行</button>
      <button type="button" title="删除当前列" onClick={handleDeleteCol}>删列</button>
      <button type="button" title="删除整个表格" onClick={handleDeleteTable} className="danger">删表</button>
      <span className="tft-sep" />
      <button type="button" title="左对齐" onClick={() => handleAlign('left')}>左</button>
      <button type="button" title="居中" onClick={() => handleAlign('center')}>中</button>
      <button type="button" title="右对齐" onClick={() => handleAlign('right')}>右</button>
    </div>
  );
}
