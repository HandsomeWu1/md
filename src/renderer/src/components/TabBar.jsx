import React from 'react';

// 关闭 / 新建的线框图标：比字符 × + 更精致，且描边粗细可控
const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M2 2l6 6M8 2l-6 6" />
  </svg>
);

const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M7 2.5v9M2.5 7h9" />
  </svg>
);

/**
 * 胶囊式标签栏：
 * 标签是独立的圆角 chip（彼此之间留 gap，不画分割线），
 * 激活态用「浅底 + 深色文字」表达，不用强调色下划线，保持极简无突兀色。
 */
export default function TabBar({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab }) {
  return (
    <div className="tabbar">
      <div className="tabbar-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={'tab' + (tab.id === activeTabId ? ' active' : '') + (tab.dirty ? ' dirty' : '')}
            onClick={() => onSelectTab(tab.id)}
            title={tab.path || tab.name}
          >
            <span className="tab-name">{tab.name}</span>
            <button
              type="button"
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              title="关闭"
              aria-label="关闭标签"
            >
              {/* 未保存时默认显示圆点，hover 到关闭区域才变成 ×（Typora / VS Code 常见做法） */}
              <span className="tab-dot" aria-hidden="true" />
              <span className="tab-cross" aria-hidden="true">
                <CloseIcon />
              </span>
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="tabbar-new" onClick={onNewTab} title="新建标签" aria-label="新建标签">
        <PlusIcon />
      </button>
    </div>
  );
}
