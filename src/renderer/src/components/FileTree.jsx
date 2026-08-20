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
}) {
  const isDir = node.type === 'dir';
  const isOpen = expanded.has(node.path);
  const isActive = !isDir && node.path === activePath;
  const children = isDir && isOpen ? childrenMap[node.path] : null;

  const handleRowClick = () => {
    if (isDir) onToggleExpand(node.path);
    else onSelectFile(node.path);
  };

  const handleArrowClick = (e) => {
    e.stopPropagation();
    if (isDir) onToggleExpand(node.path);
  };

  return (
    <div className="filetree-node">
      <div
        className={'filetree-row' + (isActive ? ' active' : '')}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={handleRowClick}
      >
        <span className="filetree-arrow" onClick={handleArrowClick}>
          {isDir ? (isOpen ? '▾' : '▸') : ''}
        </span>
        <span className="filetree-icon">
          {isDir ? <FolderIcon open={isOpen} /> : <FileIcon />}
        </span>
        <span className="filetree-label">{node.name}</span>
        {isDir && (
          <span className="filetree-actions">
            <button
              type="button"
              title="新建文件"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onNewFile(node.path); }}
            >
              ＋
            </button>
          </span>
        )}
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
  rootName,
}) {
  const [menu, setMenu] = useState(null); // { x, y, path, isDir }

  const isEmpty = !tree || tree.length === 0;

  const handleContextMenu = (e, path, isDir) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, path, isDir });
  };

  // 根节点右键菜单
  const handleRootContextMenu = (e) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, path: null, isDir: true });
  };

  const closeMenu = () => setMenu(null);

  // 点击其他区域关闭菜单
  React.useEffect(() => {
    if (!menu) return;
    const onDown = () => closeMenu();
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menu]);

  if (isEmpty) {
    return (
      <div className="filetree-empty" onContextMenu={handleRootContextMenu}>
        <button type="button" className="filetree-open-btn" onClick={onOpenFolder}>
          打开文件夹
        </button>
        {rootName && <div className="filetree-root">{rootName}</div>}
      </div>
    );
  }

  return (
    <div className="filetree" onContextMenu={handleRootContextMenu}>
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
        />
      ))}

      {/* 右键菜单 */}
      {menu && (
        <div
          className="filetree-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menu.path != null ? (
            <>
              {menu.isDir && (
                <>
                  <button type="button" onClick={() => { onNewFile(menu.path); closeMenu(); }}>创建 md 文件</button>
                  <button type="button" onClick={() => { onNewFolder(menu.path); closeMenu(); }}>创建文件夹</button>
                  <div className="filetree-menu-sep" />
                </>
              )}
              <button type="button" onClick={() => { onRefresh(menu.path); closeMenu(); }}>刷新</button>
              <button type="button" onClick={() => { onRename(menu.path, menu.isDir); closeMenu(); }}>重命名</button>
              <button type="button" className="danger" onClick={() => { onDelete(menu.path, menu.isDir); closeMenu(); }}>删除</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { onNewFile(rootName || null); closeMenu(); }}>创建 md 文件</button>
              <button type="button" onClick={() => { onNewFolder(rootName || null); closeMenu(); }}>创建文件夹</button>
              <button type="button" onClick={() => { onRefresh(rootName || null); closeMenu(); }}>刷新</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
