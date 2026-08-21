import React, { useState, useEffect, useCallback } from 'react';
import { isInTable, selectedRect, findTable } from '@milkdown/prose/tables';
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

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const Icon = ({ children }) => (
  <svg width="15" height="15" viewBox="0 0 16 16" {...strokeProps}>
    {children}
  </svg>
);

const Icons = {
  grip: (
    <Icon>
      <circle cx="5" cy="3.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="3.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="3.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="12.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="12.5" r="1" fill="currentColor" stroke="none" />
    </Icon>
  ),
  addRowAbove: (
    <Icon>
      <path d="M2 3.5h12M8 1.5v2M6.8 2.5h2.4" />
      <path d="M2 8h12M2 12.5h12" />
    </Icon>
  ),
  addRowBelow: (
    <Icon>
      <path d="M2 8h12M2 12.5h12" />
      <path d="M8 14v2M6.8 15h2.4" />
    </Icon>
  ),
  addColLeft: (
    <Icon>
      <path d="M5.5 2v12M11 2v12" />
      <path d="M2 8h3M3.5 6.8v2.4" />
    </Icon>
  ),
  addColRight: (
    <Icon>
      <path d="M5.5 2v12M11 2v12" />
      <path d="M14 8h-3M12.5 6.8v2.4" />
    </Icon>
  ),
  delRow: (
    <Icon>
      <path d="M2 5h12M2 11h12" />
    </Icon>
  ),
  delCol: (
    <Icon>
      <path d="M5.5 2v12M11 2v12" />
    </Icon>
  ),
  delTable: (
    <Icon>
      <path d="M2.5 3.5h11M5.5 3.5l.5 9M10.5 3.5l-.5 9M6.5 7l3 3M9.5 7l-3 3" />
    </Icon>
  ),
  alignLeft: (
    <Icon>
      <path d="M2 2v12M2 6h12M2 10h8" />
    </Icon>
  ),
  alignCenter: (
    <Icon>
      <path d="M2 6h12M4 10h8" />
    </Icon>
  ),
  alignRight: (
    <Icon>
      <path d="M14 2v12M14 6H2M14 10H6" />
    </Icon>
  ),
};

/**
 * 表格浮动操作入口：光标进入表格后，在表格左上角显示一个极小的「⋮」把手（不遮挡数据）。
 * 点击把手才展开完整操作面板（面板也定位在表格上方，不覆盖单元格内容）。
 * 光标离开表格时把手与面板一起消失。
 */
export default function TableFloatingToolbar({ view }) {
  const [anchor, setAnchor] = useState(null); // { left, top, inHeader, tablePos }
  const [panelOpen, setPanelOpen] = useState(false);

  const updatePosition = useCallback(() => {
    if (!view) { setAnchor(null); setPanelOpen(false); return; }
    try {
      const state = view.state;
      if (!isInTable(state)) { setAnchor(null); setPanelOpen(false); return; }
      const table = findTable(state.selection.$head);
      if (!table) { setAnchor(null); setPanelOpen(false); return; }
      const dom = view.nodeDOM(table.pos);
      if (!dom || !(dom instanceof HTMLElement)) { setAnchor(null); setPanelOpen(false); return; }
      const rect = dom.getBoundingClientRect();
      let inHeader = false;
      try {
        inHeader = selectedRect(state).top === 0;
      } catch {
        inHeader = false;
      }
      setAnchor({ left: rect.left, top: rect.top - 30, inHeader, tablePos: table.pos });
    } catch {
      setAnchor(null);
      setPanelOpen(false);
    }
  }, [view]);

  useEffect(() => {
    if (!view) return;
    const handler = () => requestAnimationFrame(updatePosition);
    window.addEventListener(TX_EVENT, handler);
    updatePosition();
    return () => window.removeEventListener(TX_EVENT, handler);
  }, [view, updatePosition]);

  const keepFocus = (e) => e.preventDefault();

  const dispatch = (tr) => { if (view) view.dispatch(tr); };

  const run = (cmd) => {
    if (!view) return;
    cmd(view.state, dispatch);
    setPanelOpen(false);
    // 结构变化后重新定位把手
    setTimeout(() => updatePosition(), 0);
  };

  const handleDeleteRow = () => {
    if (!view) return;
    let rect;
    try {
      rect = selectedRect(view.state);
    } catch {
      return;
    }
    // milkdown schema 要求「1 表头行 + 至少 1 正文行」，表头行不可删、删到只剩表头不可
    if (rect.top === 0) return;
    if (rect.map.height <= 2) return;
    run(deleteRow);
  };
  const handleDeleteCol = () => { if (view) run(deleteColumn); };
  const handleDeleteTable = () => { if (view) run(deleteTable); };
  const handleAlign = (align) => { if (view) run((s, d) => setCellAttr('alignment', align)(s, d)); };

  if (!anchor) return null;

  return (
    <div
      className="table-grip"
      style={{ position: 'fixed', left: anchor.left, top: anchor.top, zIndex: 1500 }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={'table-grip-btn' + (panelOpen ? ' active' : '')}
        title="表格操作"
        onMouseDown={keepFocus}
        onClick={() => setPanelOpen((v) => !v)}
      >
        {Icons.grip}
      </button>

      {panelOpen && (
        <div className="table-grip-panel">
          <button type="button" title="上方插入行" disabled={anchor.inHeader} onMouseDown={keepFocus} onClick={() => run(addRowBefore)}>
            {Icons.addRowAbove}<span>上方加行</span>
          </button>
          <button type="button" title="下方插入行" onMouseDown={keepFocus} onClick={() => run(addRowAfter)}>
            {Icons.addRowBelow}<span>下方加行</span>
          </button>
          <button type="button" title="左侧插入列" onMouseDown={keepFocus} onClick={() => run(addColumnBefore)}>
            {Icons.addColLeft}<span>左侧加列</span>
          </button>
          <button type="button" title="右侧插入列" onMouseDown={keepFocus} onClick={() => run(addColumnAfter)}>
            {Icons.addColRight}<span>右侧加列</span>
          </button>

          <div className="table-grip-sep" />

          <button type="button" title="删除当前行" onMouseDown={keepFocus} onClick={handleDeleteRow}>
            {Icons.delRow}<span>删除行</span>
          </button>
          <button type="button" title="删除当前列" onMouseDown={keepFocus} onClick={handleDeleteCol}>
            {Icons.delCol}<span>删除列</span>
          </button>
          <button type="button" title="删除整个表格" className="danger" onMouseDown={keepFocus} onClick={handleDeleteTable}>
            {Icons.delTable}<span>删除表格</span>
          </button>

          {anchor.inHeader && (
            <>
              <div className="table-grip-sep" />
              <button type="button" title="左对齐" onMouseDown={keepFocus} onClick={() => handleAlign('left')}>
                {Icons.alignLeft}<span>左对齐</span>
              </button>
              <button type="button" title="居中" onMouseDown={keepFocus} onClick={() => handleAlign('center')}>
                {Icons.alignCenter}<span>居中</span>
              </button>
              <button type="button" title="右对齐" onMouseDown={keepFocus} onClick={() => handleAlign('right')}>
                {Icons.alignRight}<span>右对齐</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
