import React from 'react';

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

function TreeNode({ node, depth, expanded, activePath, onSelectFile, onToggleExpand }) {
  const isDir = node.type === 'dir';
  const isOpen = expanded.has(node.path);
  const isActive = !isDir && node.path === activePath;

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
      </div>
      {isDir && isOpen && node.children && (
        <div className="filetree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              activePath={activePath}
              onSelectFile={onSelectFile}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree({
  tree,
  expanded,
  activePath,
  onSelectFile,
  onToggleExpand,
  onOpenFolder,
  rootName,
}) {
  const isEmpty = !tree || tree.length === 0;

  if (isEmpty) {
    return (
      <div className="filetree-empty">
        <button type="button" className="filetree-open-btn" onClick={onOpenFolder}>
          打开文件夹
        </button>
        {rootName && <div className="filetree-root">{rootName}</div>}
      </div>
    );
  }

  return (
    <div className="filetree">
      {tree.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          expanded={expanded}
          activePath={activePath}
          onSelectFile={onSelectFile}
          onToggleExpand={onToggleExpand}
        />
      ))}
    </div>
  );
}
