import React from 'react';
import { computeHeadingNumbers } from '../utils/markdown';

export default function Outline({ items, activeIndex, onJump, headingNumbering = false }) {
  if (!items || items.length === 0) {
    return <div className="outline-empty">无标题</div>;
  }

  // 开启标题编号时，为每个大纲项计算多级编号前缀
  const numbers = headingNumbering ? computeHeadingNumbers(items) : null;

  return (
    <div className="outline">
      {items.map((item, index) => (
        <div
          key={index}
          className={'outline-item' + (index === activeIndex ? ' active' : '')}
          style={{ paddingLeft: 10 + (item.level - 1) * 16 }}
          onClick={() => onJump(index)}
        >
          {numbers && <span className="outline-number">{numbers[index]}</span>}
          {item.text || '（无标题）'}
        </div>
      ))}
    </div>
  );
}
