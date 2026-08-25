import React, { useState } from 'react';

function FolderIcon({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
      <path d="M1.75 3.5A1.75 1.75 0 0 1 3.5 1.75h2.6l1.3 1.3h4.85a1.75 1.75 0 0 1 1.75 1.75v7.7a1.75 1.75 0 0 1-1.75 1.75H3.5a1.75 1.75 0 0 1-1.75-1.75V3.5Z" />
      {open && <path d="M1.75 7.25h12.5" />}
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
      <path d="M4.25 1.5h5.25l4 4v7.25a1.75 1.75 0 0 1-1.75 1.75H4.25a1.75 1.75 0 0 1-1.75-1.75V3.25c0-.97.78-1.75 1.75-1.75Z" />
      <path d="M9.5 1.5v4h4" />
    </svg>
  );
}

function TreeNode({
  node,
  depth,
  expanded,
  childrenMap,
  activePath,
  onSelectFile,
  onToggleExpand,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onReveal,
  onContextMenu,
  onMoveFile,
}) {
  const isDir = node.type === 'dir';
  const isOpen = expanded.has(node.path);
  const isActive = !isDir && node.path === activePath;
  const children = isDir && isOpen ? childrenMap[node.path] : null;
  const [dropTarget, setDropTarget] = useState(false);

  const handleRowClick = () => {
    if (isDir) onToggleExpand(node.path);
    else onSelectFile(node.path);
  };

  const handleArrowClick = (e) => {
    e.stopPropagation();
    if (isDir) onToggleExpand(node.path);
  };

  const handleRowContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e.clientX, e.clientY, node.path, isDir);
  };

  // 拖拽：文件可拖出；文件夹可作为放置目标（把文件移入该文件夹）
  const handleDragStart = (e) => {
    if (isDir) return;
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e) => {
    if (!isDir) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dropTarget) setDropTarget(true);
  };
  const handleDragLeave = () => {
    if (dropTarget) setDropTarget(false);
  };
  const handleDrop = (e) => {
    if (!isDir) return;
    e.preventDefault();
    setDropTarget(false);
    const src = e.dataTransfer.getData('text/plain');
    if (src && src !== node.path && onMoveFile) onMoveFile(src, node.path);
  };

  return (
    <div className="filetree-node">
      <div
        className={
          'filetree-row' +
          (isActive ? ' active' : '') +
          (dropTarget ? ' droptarget' : '')
        }
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable={!isDir}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleRowClick}
        onContextMenu={handleRowContextMenu}
      >
        <span className="filetree-arrow" onClick={handleArrowClick}>
          {isDir ? (isOpen ? '▾' : '▸') : ''}
        </span>
        <span className="filetree-icon">
          {isDir ? <FolderIcon open={isOpen} /> : <FileIcon />}
        </span>
        <span className="filetree-label">{node.name}</span>
      </div>

      {isDir && isOpen && (
        <div className="filetree-children">
          {children == null ? (
            <div className="filetree-loading">加载中…</div>
          ) : children.length === 0 ? (
            <div className="filetree-empty-dir">空文件夹</div>
          ) : (
            children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                childrenMap={childrenMap}
                activePath={activePath}
                onSelectFile={onSelectFile}
                onToggleExpand={onToggleExpand}
                onNewFile={onNewFile}
                onNewFolder={onNewFolder}
                onRename={onRename}
                onDelete={onDelete}
                onReveal={onReveal}
                onContextMenu={onContextMenu}
                onMoveFile={onMoveFile}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function FileTree({
  tree,
  expanded,
  childrenMap,
  activePath,
  onSelectFile,
  onToggleExpand,
  onOpenFolder,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onRefresh,
  onReveal,
  onMoveFile,
  rootName,
}) {
  // menu: { x, y, path, isDir }；path 为 null 表示空白处右键
  const [menu, setMenu] = useState(null);

  const isEmpty = !tree || tree.length === 0;

  const handleContextMenu = (x, y, path, isDir) => {
    setMenu({ x, y, path, isDir });
  };

  const handleBlankContextMenu = (e) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, path: null, isDir: null });
  };

  const closeMenu = () => setMenu(null);

  React.useEffect(() => {
    if (!menu) return;
    const onDown = () => closeMenu();
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menu]);

  if (isEmpty) {
    return (
      <div className="filetree-empty" onContextMenu={handleBlankContextMenu}>
        <button type="button" className="filetree-open-btn" onClick={onOpenFolder}>
          打开文件夹
        </button>
        {rootName && <div className="filetree-root">{rootName}</div>}
      </div>
    );
  }

  return (
    <div className="filetree" onContextMenu={handleBlankContextMenu}>
      {tree.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          expanded={expanded}
          childrenMap={childrenMap}
          activePath={activePath}
          onSelectFile={onSelectFile}
          onToggleExpand={onToggleExpand}
          onNewFile={onNewFile}
          onNewFolder={onNewFolder}
          onRename={onRename}
          onDelete={onDelete}
          onReveal={onReveal}
          onMoveFile={onMoveFile}
          onContextMenu={handleContextMenu}
        />
      ))}

      {/* 右键菜单 */}
      {menu && (
        <div
          className="filetree-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menu.path == null ? (
            // 空白处右键：新建 + 刷新
            <>
              <button type="button" onClick={() => { onNewFile(null); closeMenu(); }}>新建 Markdown 文件</button>
              <button type="button" onClick={() => { onNewFolder(null); closeMenu(); }}>新建文件夹</button>
              <div className="filetree-menu-sep" />
              <button type="button" onClick={() => { onRefresh(null); closeMenu(); }}>刷新</button>
            </>
          ) : menu.isDir ? (
            // 文件夹右键：新建 + 重命名/删除 + 刷新
            <>
              <button type="button" onClick={() => { onNewFile(menu.path); closeMenu(); }}>新建 Markdown 文件</button>
              <button type="button" onClick={() => { onNewFolder(menu.path); closeMenu(); }}>新建文件夹</button>
              <div className="filetree-menu-sep" />
              <button type="button" onClick={() => { onReveal(menu.path); closeMenu(); }}>在 Finder 中显示</button>
              <div className="filetree-menu-sep" />
              <button type="button" onClick={() => { onRename(menu.path, true); closeMenu(); }}>重命名</button>
              <button type="button" className="danger" onClick={() => { onDelete(menu.path, true); closeMenu(); }}>删除</button>
              <div className="filetree-menu-sep" />
              <button type="button" onClick={() => { onRefresh(menu.path); closeMenu(); }}>刷新</button>
            </>
          ) : (
            // 文件右键：打开 + Finder + 重命名/删除
            <>
              <button type="button" onClick={() => { onSelectFile(menu.path); closeMenu(); }}>打开</button>
              <button type="button" onClick={() => { onReveal(menu.path); closeMenu(); }}>在 Finder 中显示</button>
              <div className="filetree-menu-sep" />
              <button type="button" onClick={() => { onRename(menu.path, false); closeMenu(); }}>重命名</button>
              <button type="button" className="danger" onClick={() => { onDelete(menu.path, false); closeMenu(); }}>删除</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
