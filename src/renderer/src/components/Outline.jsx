import React from 'react';

export default function Outline({ items, activeIndex, onJump }) {
  if (!items || items.length === 0) {
    return <div className="outline-empty">无标题</div>;
  }

  return (
    <div className="outline">
      {items.map((item, index) => (
        <div
          key={index}
          className={'outline-item' + (index === activeIndex ? ' active' : '')}
          style={{ paddingLeft: 10 + (item.level - 1) * 16 }}
          onClick={() => onJump(index)}
        >
          {item.text || '（无标题）'}
        </div>
      ))}
    </div>
  );
}
