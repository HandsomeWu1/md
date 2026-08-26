import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildMessages, stripCodeFence } from '../utils/aiPrompt';
import { renderAiMarkdown } from '../utils/aiMarkdown';

let seq = 0;
const nextRequestId = () => `ai-${Date.now()}-${++seq}`;

const ICONS = {
  settings: (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.6v1.6M8 12.8v1.6M2.4 8H1M15 8h-1.4M4 4l-1-1M13 13l-1-1M12 4l1-1M3 13l1-1" />
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

/**
 * 右侧 AI 面板。
 *
 * 两种模式：
 * - 对话：普通问答，把当前文档作为只读上下文
 * - 改写：要求模型输出改写后的 Markdown；结果**不自动写入文档**，
 *   而是在消息下方给出「应用到文档 / 放弃」，由用户确认（避免 AI 意外破坏正文）
 */
export default function AiPanel({
  configured,
  canRewrite,
  maxContextChars,
  getDocument,
  getSelection,
  onApply,
  onOpenSettings,
  onClose,
}) {
  const api = window.api;
  const [messages, setMessages] = useState([]); // { id, role, content, mode, pending, error, applied, discarded }
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('chat');
  const [busy, setBusy] = useState(false);
  const [selectionInfo, setSelectionInfo] = useState({ empty: true, text: '' });

  const requestIdRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  // 代码视图（yaml/json 等）没有 Milkdown 实例，无法安全写回，改写模式在此不可用；
  // 若正处于改写模式则自动退回对话，避免用户白跑一次请求。
  useEffect(() => {
    if (!canRewrite && mode === 'rewrite') setMode('chat');
  }, [canRewrite, mode]);

  // 流式增量：按 requestId 累加到对应消息。订阅只建立一次，避免重复注册监听。
  useEffect(() => {
    const off = api.onAiChunk(({ requestId, delta }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === requestId ? { ...m, content: m.content + delta } : m))
      );
    });
    return off;
  }, []);

  // 新消息或流式增量时自动贴底，保持最新内容可见。
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // 面板打开时刷新一次选区状态；之后靠 document 的 selectionchange 事件跟随，
  // 这样「改写范围」提示能实时反映用户在编辑器里的选择。
  // 在面板输入框里选字同样会触发 selectionchange，因此结果相同时保持原引用，
  // 避免无谓的重渲染。
  useEffect(() => {
    const sync = () => {
      const next = getSelection() || { empty: true, text: '' };
      setSelectionInfo((prev) => (prev.empty === next.empty && prev.text === next.text ? prev : next));
    };
    sync();
    document.addEventListener('selectionchange', sync);
    return () => document.removeEventListener('selectionchange', sync);
  }, [getSelection]);

  const scopeLabel = useMemo(() => {
    if (selectionInfo.empty || !selectionInfo.text) return '整篇文档';
    const n = selectionInfo.text.length;
    return `选中 ${n} 字`;
  }, [selectionInfo]);

  const send = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || busy) return;
    if (!configured) {
      onOpenSettings();
      return;
    }

    const sel = getSelection() || { empty: true, text: '' };
    const currentMode = mode;
    const { messages: payloadMessages, truncated } = buildMessages({
      mode: currentMode,
      prompt,
      document: getDocument() || '',
      selection: sel.empty ? '' : sel.text,
      // 只把既往的问答带进上下文；改写结果动辄整篇文档，塞进历史会迅速撑爆上下文。
      history:
        currentMode === 'chat'
          ? messages
              .filter((m) => !m.error && !m.pending && m.mode !== 'rewrite')
              .slice(-6)
              .map((m) => ({ role: m.role, content: m.content }))
          : [],
      maxChars: maxContextChars,
    });

    const requestId = nextRequestId();
    requestIdRef.current = requestId;
    setMessages((prev) => [
      ...prev,
      { id: requestId + '-u', role: 'user', content: prompt, mode: currentMode, scope: currentMode === 'rewrite' ? (sel.empty ? '整篇文档' : '选中片段') : null },
      { id: requestId, role: 'assistant', content: '', mode: currentMode, pending: true, truncated, targetWasSelection: !sel.empty },
    ]);
    setInput('');
    setBusy(true);

    const res = await api.aiChat({ requestId, messages: payloadMessages });
    setBusy(false);
    requestIdRef.current = null;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== requestId) return m;
        if (res && res.ok) {
          return { ...m, pending: false, content: res.content || m.content };
        }
        // 取消时保留已收到的部分内容，用户可能仍想用；纯失败则给出错误提示。
        return {
          ...m,
          pending: false,
          error: res && res.canceled ? '已取消' : (res && res.error) || '请求失败',
        };
      })
    );
  }, [input, busy, configured, mode, messages, getDocument, getSelection, maxContextChars, onOpenSettings]);

  const stop = useCallback(() => {
    const id = requestIdRef.current;
    if (id) api.aiAbort(id);
  }, []);

  const applyRewrite = useCallback(
    (msg) => {
      const text = stripCodeFence(msg.content);
      if (!text) return;
      const ok = onApply(text, msg.targetWasSelection);
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, applied: ok, applyFailed: !ok } : m)));
    },
    [onApply]
  );

  const discardRewrite = useCallback((msg) => {
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, discarded: true } : m)));
  }, []);

  const onKeyDown = (e) => {
    // Enter 发送、Shift+Enter 换行：与常见对话框一致，减少学习成本。
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="ai-panel">
      <div className="ai-header">
        <span className="ai-title">AI</span>
        <div className="spacer" />
        <button type="button" className="ai-icon-btn" onClick={() => setMessages([])} title="清空对话" disabled={!messages.length}>
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
                <p>向 AI 提问，或让它改写当前文档。</p>
                <p className="ai-empty-hint">改写前先选中文字，即可只改选中部分。</p>
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
                <div className="ai-rewrite">
                  <pre className="ai-rewrite-preview">{stripCodeFence(m.content) || (m.pending ? '' : '（空结果）')}</pre>
                  {m.pending && <span className="ai-caret" />}
                  {!m.pending && !m.error && !m.applied && !m.discarded && (
                    <div className="ai-actions">
                      <button type="button" className="ai-btn primary" onClick={() => applyRewrite(m)}>
                        应用到文档
                      </button>
                      <button type="button" className="ai-btn" onClick={() => discardRewrite(m)}>
                        放弃
                      </button>
                    </div>
                  )}
                  {m.applied && <div className="ai-note">已应用到文档（按 ⌘Z 可撤销）。</div>}
                  {m.applyFailed && <div className="ai-note error">应用失败：选区已变化，请重新选择后再试。</div>}
                  {m.discarded && <div className="ai-note">已放弃。</div>}
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
          ref={inputRef}
          className="ai-input"
          rows={3}
          value={input}
          placeholder={mode === 'rewrite' ? '描述如何改写，例如：精简语言、补充小标题' : '提问，或让 AI 解释文档内容'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="ai-composer-bar">
          <div className="ai-mode">
            <button
              type="button"
              className={mode === 'chat' ? 'active' : ''}
              onClick={() => setMode('chat')}
            >
              对话
            </button>
            <button
              type="button"
              className={mode === 'rewrite' ? 'active' : ''}
              onClick={() => setMode('rewrite')}
              disabled={!canRewrite}
              title={canRewrite ? '让 AI 改写文档' : '当前视图不支持改写'}
            >
              改写
            </button>
          </div>
          {mode === 'rewrite' && <span className="ai-scope">{scopeLabel}</span>}
          <div className="spacer" />
          {busy ? (
            <button type="button" className="ai-send" onClick={stop} title="停止生成">
              {ICONS.stop}
            </button>
          ) : (
            <button type="button" className="ai-send" onClick={send} disabled={!input.trim()} title="发送（Enter）">
              {ICONS.send}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
