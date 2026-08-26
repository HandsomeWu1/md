import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderAiMarkdown } from '../utils/aiMarkdown';
import { parseAiReply } from '../utils/aiPrompt';

const ICONS = {
  // 滑块式设置图标（齿轮容易被误认成太阳，改用调节滑块更清晰）
  settings: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2.5 4.5h11M2.5 11.5h11" />
      <circle cx="6" cy="4.5" r="1.6" fill="var(--bg)" />
      <circle cx="10.5" cy="11.5" r="1.6" fill="var(--bg)" />
    </svg>
  ),
  clear: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h10M6.5 5V3.5h3V5M5 5l.6 8h4.8L11 5" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 8h9M8 4.5L11.5 8 8 11.5" />
    </svg>
  ),
  stop: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" />
    </svg>
  ),
};

// 改写结果的落地状态文案。改写内容直接写进正文，面板里只报告结果，
// 由用户在正文的高亮标注上确认取舍。
function applyNote(apply) {
  if (!apply) return null;
  if (apply.ok) {
    if (apply.coarse) return '已改写文档（文档较大，未逐段标注）';
    const parts = [];
    if (apply.added) parts.push(`新增 ${apply.added}`);
    if (apply.changed) parts.push(`修改 ${apply.changed}`);
    if (apply.removed) parts.push(`删除 ${apply.removed}`);
    return parts.length ? `已改写文档：${parts.join(' · ')} 处，请在正文中确认` : '模型未产生实际改动';
  }
  return apply.reason || '未写入文档';
}

// 流式期间的呈现：意图未明时只显示「思考中」，避免先闪出半个协议标记。
function StreamingBody({ content }) {
  const parsed = parseAiReply(content);
  if (parsed.kind === 'rewrite') {
    return (
      <div className="ai-rewrite-status">
        <span>正在改写文档…（已生成 {parsed.text.length} 字）</span>
        <span className="ai-caret" />
      </div>
    );
  }
  if (parsed.kind === 'chat' && parsed.text) {
    return (
      <>
        <div className="ai-md" dangerouslySetInnerHTML={{ __html: renderAiMarkdown(parsed.text) }} />
        <span className="ai-caret" />
      </>
    );
  }
  return (
    <div className="ai-rewrite-status">
      <span className="ai-thinking">思考中</span>
      <span className="ai-caret" />
    </div>
  );
}

/**
 * 右侧 AI 面板（受控组件）。
 * 会话状态由 useAiChat 按文档持有，本组件只负责呈现与输入。
 *
 * 没有「对话 / 改写」模式开关：由模型自行判断意图，只有它明确要求改写时才动文档。
 */
export default function AiPanel({
  configured,
  canRewrite,
  session,
  onSend,
  onStop,
  onInputChange,
  onClear,
  getSelection,
  onOpenSettings,
  onClose,
}) {
  const { messages, input, busy } = session;
  const [selectionInfo, setSelectionInfo] = useState({ empty: true, text: '' });
  const listRef = useRef(null);
  // 输入法组字状态。中文拼音输入法在候选未确认时按回车是「确认选字」，
  // 此时不能当成发送——否则打英文单词或选词时会把半成品直接发出去。
  const composingRef = useRef(false);

  // 新消息或流式增量时自动贴底。
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // 选区变化时更新范围提示。面板内选字同样会触发事件，
  // 因此结果相同时保持原引用，避免无谓重渲染。
  //
  // 延迟一帧再读：ProseMirror 自己也监听 selectionchange，同步读取时它的 state
  // 可能还是变化前的旧选区（Editor.jsx 的 selectionUpdated 处有同样的时序问题）。
  useEffect(() => {
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = getSelection() || { empty: true, text: '' };
        setSelectionInfo((prev) => (prev.empty === next.empty && prev.text === next.text ? prev : next));
      });
    };
    sync();
    document.addEventListener('selectionchange', sync);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('selectionchange', sync);
    };
  }, [getSelection]);

  // 有选区时提示改写将被限制在选区内——这会实际改变发给模型的指令，值得显式告知。
  const hasSelection = canRewrite && !selectionInfo.empty && !!selectionInfo.text;

  const onKeyDown = useCallback(
    (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey) return;
      // isComposing 覆盖主流输入法；keyCode 229 是部分 IME 在组字期间上报的兜底值。
      if (composingRef.current || e.nativeEvent?.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      onSend();
    },
    [onSend]
  );

  return (
    <div className="ai-panel">
      <div className="ai-header">
        <span className="ai-title">AI</span>
        <div className="spacer" />
        <button type="button" className="ai-icon-btn" onClick={onClear} title="清空当前文档的对话" disabled={!messages.length}>
          {ICONS.clear}
        </button>
        <button type="button" className="ai-icon-btn" onClick={onOpenSettings} title="AI 设置">
          {ICONS.settings}
        </button>
        <button type="button" className="ai-icon-btn" onClick={onClose} title="关闭面板">
          {ICONS.close}
        </button>
      </div>

      <div className="ai-messages" ref={listRef}>
        {!messages.length && (
          <div className="ai-empty">
            {configured ? (
              <>
                <p>提问，或直接让 AI 修改文档。</p>
                <p className="ai-empty-hint">
                  只有你明确要求修改时（如「改简洁些」「加个小标题」）才会改动正文，改动会标注出来供你确认；
                  先选中文字则只改选中部分。
                </p>
              </>
            ) : (
              <>
                <p>尚未配置模型。</p>
                <button type="button" className="ai-link-btn" onClick={onOpenSettings}>
                  填写 API 地址与 Key
                </button>
              </>
            )}
          </div>
        )}

        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="ai-msg ai-msg-user">
              <div className="ai-bubble">{m.content}</div>
            </div>
          ) : (
            <div key={m.id} className="ai-msg ai-msg-assistant">
              {m.truncated && <div className="ai-note">文档过长，已省略中间部分后发送。</div>}
              {m.pending ? (
                <StreamingBody content={m.content} />
              ) : m.kind === 'rewrite' ? (
                <div className="ai-rewrite-status">
                  <span className={m.apply && !m.apply.ok ? 'ai-note error' : undefined}>{applyNote(m.apply)}</span>
                </div>
              ) : m.content ? (
                <div className="ai-md" dangerouslySetInnerHTML={{ __html: renderAiMarkdown(m.content) }} />
              ) : null}
              {m.error && <div className="ai-note error">{m.error}</div>}
            </div>
          )
        )}
      </div>

      <div className="ai-composer">
        <textarea
          className="ai-input"
          rows={3}
          value={input}
          placeholder="提问，或要求修改文档（如：把这段改简洁）"
          onChange={(e) => onInputChange(e.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={onKeyDown}
        />
        <div className="ai-composer-bar">
          {hasSelection ? (
            <span className="ai-scope">仅改写选中的 {selectionInfo.text.length} 字</span>
          ) : (
            <span className="ai-scope ai-scope-muted">Enter 发送 · Shift+Enter 换行</span>
          )}
          <div className="spacer" />
          {busy ? (
            <button type="button" className="ai-send" onClick={onStop} title="停止生成">
              {ICONS.stop}
            </button>
          ) : (
            <button type="button" className="ai-send" onClick={onSend} disabled={!input.trim()} title="发送（Enter）">
              {ICONS.send}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
