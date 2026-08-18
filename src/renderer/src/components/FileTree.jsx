import React from 'react';

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
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={handleRowClick}
      >
        <span
          className="filetree-arrow"
          onClick={handleArrowClick}
        >
          {isDir ? (isOpen ? '▾' : '▸') : ''}
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
