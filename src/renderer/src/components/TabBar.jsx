import React from 'react';

export default function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab }) {
  return (
    <div className="tabbar">
      <div className="tabbar-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={'tab' + (tab.id === activeTabId ? ' active' : '')}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className="tab-name">
              {tab.dirty && <span className="tab-dirty">●</span>}
              {tab.name}
            </span>
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              title="关闭"
              aria-label="关闭标签"
            >
              ×
            </span>
          </div>
        ))}
      </div>
      <button type="button" className="tabbar-new" onClick={onNewTab} title="新建标签" aria-label="新建标签">
        +
      </button>
    </div>
  );
}
