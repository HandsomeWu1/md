import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderAiMarkdown } from '../utils/aiMarkdown';

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
// 由用户在正文的高亮标注上确认取舍——因此这里不再提供「应用」按钮。
function applyNote(apply) {
  if (!apply) return null;
  if (apply.ok) {
    const parts = [];
    if (apply.added) parts.push(`新增 ${apply.added}`);
    if (apply.changed) parts.push(`修改 ${apply.changed}`);
    if (apply.removed) parts.push(`删除 ${apply.removed}`);
    if (apply.coarse) return '已写入文档（文档较大，未逐段标注）';
    return parts.length ? `已写入文档：${parts.join(' · ')} 处，请在正文中确认` : '模型未产生实际改动';
  }
  return apply.reason || '未写入文档';
}

/**
 * 右侧 AI 面板（受控组件）。
 * 会话状态由 useAiChat 按文档持有，本组件只负责呈现与输入。
 */
export default function AiPanel({
  configured,
  canRewrite,
  session,
  onSend,
  onStop,
  onInputChange,
  onModeChange,
  onClear,
  getSelection,
  onOpenSettings,
  onClose,
}) {
  const { messages, input, mode, busy } = session;
  const [selectionInfo, setSelectionInfo] = useState({ empty: true, text: '' });
  const listRef = useRef(null);
  // 输入法组字状态。中文拼音输入法在候选未确认时按回车是「确认选字」，
  // 此时不能当成发送——否则打英文单词或选词时会把半成品直接发出去。
  const composingRef = useRef(false);

  // 代码视图没有 Milkdown 实例，无法安全写回，改写模式在此不可用。
  useEffect(() => {
    if (!canRewrite && mode === 'rewrite') onModeChange('chat');
  }, [canRewrite, mode, onModeChange]);

  // 新消息或流式增量时自动贴底。
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // 选区变化时更新「改写范围」提示。面板内选字同样会触发事件，
  // 因此结果相同时保持原引用，避免无谓重渲染。
  useEffect(() => {
    const sync = () => {
      const next = getSelection() || { empty: true, text: '' };
      setSelectionInfo((prev) => (prev.empty === next.empty && prev.text === next.text ? prev : next));
    };
    sync();
    document.addEventListener('selectionchange', sync);
    return () => document.removeEventListener('selectionchange', sync);
  }, [getSelection]);

  const scopeLabel = useMemo(
    () => (selectionInfo.empty || !selectionInfo.text ? '整篇文档' : `选中 ${selectionInfo.text.length} 字`),
    [selectionInfo]
  );

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
                <p>让 AI 改写当前文档，或切到「对话」提问。</p>
                <p className="ai-empty-hint">改写前先选中文字，即可只改选中部分；改动会直接标注在正文里。</p>
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
              {m.mode === 'rewrite' && <span className="ai-scope-tag">改写 · {m.scope}</span>}
              <div className="ai-bubble">{m.content}</div>
            </div>
          ) : (
            <div key={m.id} className="ai-msg ai-msg-assistant">
              {m.truncated && <div className="ai-note">文档过长，已省略中间部分后发送。</div>}
              {m.mode === 'rewrite' ? (
                // 改写内容已进正文，面板不再重复展示全文，只显示进度与落地结果。
                <div className="ai-rewrite-status">
                  {m.pending ? (
                    <>
                      <span>正在改写…（已接收 {m.content.length} 字）</span>
                      <span className="ai-caret" />
                    </>
                  ) : m.error ? null : (
                    <span className={m.apply && !m.apply.ok ? 'ai-note error' : undefined}>{applyNote(m.apply)}</span>
                  )}
                </div>
              ) : (
                <>
                  {m.content ? (
                    <div className="ai-md" dangerouslySetInnerHTML={{ __html: renderAiMarkdown(m.content) }} />
                  ) : null}
                  {m.pending && <span className="ai-caret" />}
                </>
              )}
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
          placeholder={mode === 'rewrite' ? '描述如何改写，例如：精简语言、补充小标题' : '提问，或让 AI 解释文档内容'}
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
          <div className="ai-mode">
            <button
              type="button"
              className={mode === 'rewrite' ? 'active' : ''}
              onClick={() => onModeChange('rewrite')}
              disabled={!canRewrite}
              title={canRewrite ? '让 AI 改写文档' : '当前视图不支持改写'}
            >
              改写
            </button>
            <button type="button" className={mode === 'chat' ? 'active' : ''} onClick={() => onModeChange('chat')}>
              对话
            </button>
          </div>
          {mode === 'rewrite' && <span className="ai-scope">{scopeLabel}</span>}
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
