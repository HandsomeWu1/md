import React, { useEffect, useRef } from 'react';

export default function SearchDialog({
  open,
  mode,
  query,
  replaceText,
  caseSensitive,
  matchCount,
  currentIndex,
  onClose,
  onQueryChange,
  onReplaceTextChange,
  onCaseSensitiveChange,
  onNext,
  onPrev,
  onReplace,
  onReplaceAll,
  onToggleMode,
}) {
  const queryRef = useRef(null);

  useEffect(() => {
    if (open && queryRef.current) {
      queryRef.current.focus();
      queryRef.current.select();
    }
  }, [open]);

  if (!open) return null;

  const handleQueryKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onNext();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleReplaceKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onReplace();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const countLabel = matchCount > 0 ? `${currentIndex + 1}/${matchCount}` : '无匹配';

  return (
    <div className="search-overlay" onMouseDown={onClose}>
      <div className="search-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="search-row">
          <input
            ref={queryRef}
            type="text"
            className="search-input"
            placeholder="查找"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleQueryKeyDown}
          />
          {mode === 'replace' && (
            <input
              type="text"
              className="search-input"
              placeholder="替换为"
              value={replaceText}
              onChange={(e) => onReplaceTextChange(e.target.value)}
              onKeyDown={handleReplaceKeyDown}
            />
          )}
        </div>

        <div className="search-row search-options">
          <button
            type="button"
            className={`search-btn ${mode === 'replace' ? 'search-btn-active' : ''}`}
            onClick={onToggleMode}
            title="切换替换模式"
          >
            替换
          </button>
          <label className="search-case">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => onCaseSensitiveChange(e.target.checked)}
            />
            区分大小写
          </label>
          <span className="search-count">{countLabel}</span>
          <span className="spacer" />
          <button type="button" className="search-btn" onClick={onPrev} title="上一个">
            ↑
          </button>
          <button type="button" className="search-btn" onClick={onNext} title="下一个">
            ↓
          </button>
          {mode === 'replace' && (
            <>
              <button type="button" className="search-btn" onClick={onReplace} title="替换">
                替换
              </button>
              <button type="button" className="search-btn" onClick={onReplaceAll} title="全部替换">
                全部替换
              </button>
            </>
          )}
          <button type="button" className="search-btn search-close" onClick={onClose} title="关闭">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
