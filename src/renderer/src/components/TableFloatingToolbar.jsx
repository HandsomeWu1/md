import React, { useState, useEffect, useCallback } from 'react';
import { isInTable, selectedRect } from '@milkdown/prose/tables';
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

// 行/列/对齐/垃圾桶图标
const Icons = {
  addRow: (
    <Icon>
      <path d="M1.5 5.5h13M1.5 12h13" />
      <path d="M8 2v3M6.5 3.5h3" />
    </Icon>
  ),
  addCol: (
    <Icon>
      <path d="M5.5 1.5v13M12 1.5v13" />
      <path d="M2 8h3M3.5 6.5v3" />
    </Icon>
  ),
  delRow: (
    <Icon>
      <path d="M1.5 5.5h13M1.5 12h13" />
      <path d="M4 2.5h8" />
    </Icon>
  ),
  delCol: (
    <Icon>
      <path d="M5.5 1.5v13M12 1.5v13" />
      <path d="M2.5 4v8" />
    </Icon>
  ),
  delTable: (
    <Icon>
      <path d="M2.5 3.5h11M5.5 3.5l.5 9M10.5 3.5l-.5 9M6.5 7l3 3M9.5 7l-3 3" />
    </Icon>
  ),
  alignLeft: (
    <Icon>
      <path d="M1.5 2.5v11M1.5 5h9M1.5 8h13M1.5 11h9" />
    </Icon>
  ),
  alignCenter: (
    <Icon>
      <path d="M1.5 5h13M3 8h10M1.5 11h13" />
    </Icon>
  ),
  alignRight: (
    <Icon>
      <path d="M14.5 2.5v11M14.5 5h-9M14.5 8H1.5M14.5 11h-9" />
    </Icon>
  ),
};

export default function TableFloatingToolbar({ view }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [inHeader, setInHeader] = useState(false);
  const [openMenu, setOpenMenu] = useState(null); // null | 'row' | 'col'

  const updatePosition = useCallback(() => {
    if (!view) { setVisible(false); return; }
    try {
      const state = view.state;
      if (!isInTable(state)) { setVisible(false); return; }
      const from = state.selection.from;
      const coords = view.coordsAtPos(from);
      setPos({ top: coords.top - 42, left: coords.left });
      // 对齐只在表头行生效（keepTableAlignPlugin 会把表头对齐同步到整列），
      // 所以对齐按钮仅在光标位于表头行（第一行）时显示。
      try {
        setInHeader(selectedRect(state).top === 0);
      } catch {
        setInHeader(false);
      }
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
  };

  // prosemirror-tables 命令都是 (state, dispatch) => boolean 形式，直接传参执行。
  const run = (cmd) => {
    if (!view) return;
    cmd(view.state, dispatch);
    setOpenMenu(null);
  };

  const handleDeleteRow = () => {
    if (!view) return;
    // milkdown 表格 schema 要求「1 个表头行 + 至少 1 个正文行」。
    // 删除表头行/删到只剩表头行会破坏 schema，导致后续 fixTables 反复插入行（bug）。
    let rect;
    try {
      rect = selectedRect(view.state);
    } catch {
      return;
    }
    if (rect.top === 0) return; // 表头行不可删
    if (rect.map.height <= 2) return; // 只剩 1 表头 + 1 正文
    deleteRow(view.state, dispatch);
  };
  const handleDeleteCol = () => { if (view) deleteColumn(view.state, dispatch); };
  const handleDeleteTable = () => { if (view) deleteTable(view.state, dispatch); };
  const handleAlign = (align) => { if (view) setCellAttr('alignment', align)(view.state, dispatch); };

  if (!visible || !view) return null;

  return (
    <div
      className="table-floating-toolbar"
      style={{ position: 'fixed', top: pos.top, left: pos.left - 60, zIndex: 1500 }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* 添加行（合并，展开上/下） */}
      <div className="tft-group">
        <button
          type="button"
          title="添加行"
          className={'tft-btn' + (openMenu === 'row' ? ' active' : '')}
          onMouseDown={keepFocus}
          onClick={() => setOpenMenu((m) => (m === 'row' ? null : 'row'))}
        >
          {Icons.addRow}<span className="tft-label">添加行</span>
        </button>
        {openMenu === 'row' && (
          <div className="tft-submenu">
            <button type="button" onMouseDown={keepFocus} onClick={() => run(addRowBefore)}>上方</button>
            <button type="button" onMouseDown={keepFocus} onClick={() => run(addRowAfter)}>下方</button>
          </div>
        )}
      </div>

      {/* 添加列（合并，展开左/右） */}
      <div className="tft-group">
        <button
          type="button"
          title="添加列"
          className={'tft-btn' + (openMenu === 'col' ? ' active' : '')}
          onMouseDown={keepFocus}
          onClick={() => setOpenMenu((m) => (m === 'col' ? null : 'col'))}
        >
          {Icons.addCol}<span className="tft-label">添加列</span>
        </button>
        {openMenu === 'col' && (
          <div className="tft-submenu">
            <button type="button" onMouseDown={keepFocus} onClick={() => run(addColumnBefore)}>左侧</button>
            <button type="button" onMouseDown={keepFocus} onClick={() => run(addColumnAfter)}>右侧</button>
          </div>
        )}
      </div>

      <span className="tft-sep" />

      <button type="button" title="删除当前行" className="tft-btn" onMouseDown={keepFocus} onClick={handleDeleteRow}>{Icons.delRow}</button>
      <button type="button" title="删除当前列" className="tft-btn" onMouseDown={keepFocus} onClick={handleDeleteCol}>{Icons.delCol}</button>
      <button type="button" title="删除整个表格" className="tft-btn danger" onMouseDown={keepFocus} onClick={handleDeleteTable}>{Icons.delTable}</button>

      {/* 对齐仅在表头行显示 */}
      {inHeader && (
        <>
          <span className="tft-sep" />
          <button type="button" title="左对齐" className="tft-btn" onMouseDown={keepFocus} onClick={() => handleAlign('left')}>{Icons.alignLeft}</button>
          <button type="button" title="居中" className="tft-btn" onMouseDown={keepFocus} onClick={() => handleAlign('center')}>{Icons.alignCenter}</button>
          <button type="button" title="右对齐" className="tft-btn" onMouseDown={keepFocus} onClick={() => handleAlign('right')}>{Icons.alignRight}</button>
        </>
      )}
    </div>
  );
}
