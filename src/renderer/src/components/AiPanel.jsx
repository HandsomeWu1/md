import React, { useCallback, useEffect, useRef, useState } from 'react';
import { renderAiMarkdown } from '../utils/aiMarkdown';
import { parseAiReply, splitThinking } from '../utils/aiPrompt';
import { formatUsage } from '../utils/aiUsage';
import { settingsApi } from '../utils/settings';
import ModelIcon from './ModelIcon';

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

// ── 模型选择器（对话框左下角内联下拉） ─────────────
function ModelSelector({ onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const [entries, setEntries] = useState([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    let alive = true;
    const apply = () => {
      if (!alive) return;
      const s = settingsApi.get();
      setEntries(s.aiModelEntries || []);
      setActiveId(s.aiActiveModelId || '');
    };
    settingsApi.ready.then(apply);
    // 订阅设置变更：在模型设置里新增/改名/删除后，面板即时刷新，避免停留在旧模型。
    const unsub = settingsApi.subscribe(apply);
    return () => {
      alive = false;
      if (unsub) unsub();
    };
  }, []);

  // 外部点击关闭
  useEffect(() => {
    if (!open) return;
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const active = entries.find((e) => e.id === activeId);

  function handleSelect(id) {
    setActiveId(id);
    settingsApi.set({ aiActiveModelId: id });
    // 同步扁平字段
    const e = entries.find((x) => x.id === id);
    if (e) {
      settingsApi.set({ aiBaseUrl: e.baseUrl, aiApiKey: e.apiKey, aiModel: e.model });
    }
    onSelect?.(id);
    setOpen(false);
  }

  return (
    <div className="ai-model-selector" ref={ref}>
      <button className="ai-model-selector-btn" onClick={() => setOpen((v) => !v)} title="切换模型">
        {active ? (
          <ModelIcon entry={active} size={18} />
        ) : (
          <span className="ai-model-selector-icon">?</span>
        )}
        <span className="ai-model-selector-name">{active?.model || '选择模型'}</span>
        <span className="ai-model-selector-arrow">▾</span>
      </button>
      {open && (
        <div className="ai-model-selector-dropdown">
          {entries.length === 0 ? (
            <div className="ai-model-selector-empty">暂无模型，请先在设置中添加</div>
          ) : (
            entries.map((e) => (
              <button
                key={e.id}
                className={`ai-model-sel-item ${e.id === activeId ? 'active' : ''}`}
                onClick={() => handleSelect(e.id)}
              >
                <ModelIcon entry={e} size={15} />
                <span className="ai-model-sel-name">{e.model}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// 改写结果的落地状态文案。改写内容直接写进正文，面板里只报告结果，
// 由用户在正文的高亮标注上确认取舍。
function applyNote(apply) {
  if (!apply) return null;
  // 工作区改写：一次可能改多个文件，逐个列出成败
  if (apply.files) {
    const parts = apply.files.map((f) => (f.ok ? f.target : `${f.target}（失败：${f.reason || ''}）`));
    return apply.ok
      ? `已改写 ${apply.files.length} 个文件：${parts.join('、')}`
      : `部分文件未写入：${parts.join('、')}`;
  }
  if (!apply.ok) return apply.reason || '未写入文档';
  if (apply.coarse) return '已改写文档（文档较大，未逐段标注）';
  const parts = [];
  if (apply.added) parts.push(`新增 ${apply.added}`);
  if (apply.changed) parts.push(`修改 ${apply.changed}`);
  if (apply.removed) parts.push(`删除 ${apply.removed}`);
  if (apply.cleared) {
    return parts.length ? `已清空文档（原有 ${apply.removed} 段），可在上方撤销` : '文档本来就是空的';
  }
  // 统计全为 0 说明模型把原文照原样返回了——如实说明，而不是含糊地说「已改写」。
  return parts.length
    ? `已改写文档：${parts.join(' · ')} 处，请在正文中确认`
    : '模型返回的内容与原文一致，文档未改动（可换个说法再试）';
}

/**
 * 思考过程折叠块。
 *
 * 生成中自动展开（能看到模型在想什么才有意义），生成结束后自动折叠
 * （思考过程通常很长，长期占据面板会把真正的回答挤出视野）。
 * 用户一旦手动点过，就尊重其选择，不再自动改变状态。
 */
function ThinkingBlock({ text, streaming }) {
  const [expanded, setExpanded] = useState(streaming);
  const touchedRef = useRef(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!touchedRef.current) setExpanded(streaming);
  }, [streaming]);

  // 展开且流式进行中时保持贴底，让最新的思考可见。
  useEffect(() => {
    if (expanded && streaming && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [text, expanded, streaming]);

  return (
    <div className="ai-think">
      <button
        type="button"
        className="ai-think-toggle"
        onClick={() => {
          touchedRef.current = true;
          setExpanded((v) => !v);
        }}
        aria-expanded={expanded}
      >
        <svg
          className={'ai-think-caret' + (expanded ? ' open' : '')}
          width="9"
          height="9"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 2.5l4 3.5-4 3.5" />
        </svg>
        {streaming ? <span className="ai-thinking">思考中</span> : `已深度思考（${text.length} 字）`}
      </button>
      {expanded && (
        <div className="ai-think-body" ref={bodyRef}>
          {text}
        </div>
      )}
    </div>
  );
}

/**
 * 流式期间的呈现：意图未明时只显示等待态，避免先闪出半个协议标记。
 * 思考过程可能来自独立字段，也可能嵌在正文的 <think> 块里，两者都要能显示。
 */
function StreamingBody({ content, reasoning }) {
  const split = splitThinking(content);
  const thinking = (reasoning || '').trim() || split.thinking;
  const body = reasoning ? content : split.rest;
  const parsed = parseAiReply(body);

  return (
    <>
      {!!thinking.trim() && <ThinkingBlock text={thinking} streaming />}
      {parsed.kind === 'rewrite' ? (
        <div className="ai-rewrite-status">
          <span>正在改写文档…（已生成 {parsed.text.length} 字）</span>
          <span className="ai-caret" />
        </div>
      ) : parsed.kind === 'chat' && parsed.text ? (
        <>
          <div className="ai-md" dangerouslySetInnerHTML={{ __html: renderAiMarkdown(parsed.text) }} />
          <span className="ai-caret" />
        </>
      ) : (
        // 已经在输出思考时就不必再显示一个「思考中」，避免重复。
        !thinking.trim() && (
          <div className="ai-rewrite-status">
            <span className="ai-thinking">思考中</span>
            <span className="ai-caret" />
          </div>
        )
      )}
    </>
  );
}

/**
 * 右侧 AI 面板（受控组件）。
 * 会话状态由 useAiChat 按文档持有，本组件只负责呈现与输入。
 *
 * 没有「对话 / 改写」模式开关：由模型自行判断意图，只有它明确要求改写时才动文档。
 * 没有打开文档时同样可以对话，此时模型已被告知不能改写。
 */
export default function AiPanel({
  configured,
  canRewrite,
  hasDocument,
  scope,
  onScopeChange,
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
  // 工作区作用域按文件名定位改写目标，选区不是改写目标，因此不提示。
  const hasSelection = scope === 'doc' && canRewrite && !selectionInfo.empty && !!selectionInfo.text;

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
        <button type="button" className="ai-icon-btn" onClick={onClear} title="清空当前对话" disabled={!messages.length}>
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
            {!configured ? (
              <>
                <p>尚未配置模型。</p>
                <button type="button" className="ai-link-btn" onClick={onOpenSettings}>
                  填写 API 地址与 Key
                </button>
              </>
            ) : hasDocument ? (
              <>
                <p>提问，或直接让 AI 修改文档。</p>
                <p className="ai-empty-hint">
                  只有你明确要求修改时（如「改简洁些」「加个小标题」）才会改动正文，改动会标注出来供你确认；
                  先选中文字则只改选中部分。
                </p>
              </>
            ) : (
              <>
                <p>可以直接开始提问。</p>
                <p className="ai-empty-hint">当前没有打开文档，AI 只会对话；打开或新建文档后即可让它帮你修改内容。</p>
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
                <StreamingBody content={m.content} reasoning={m.reasoning} />
              ) : (
                <>
                  {!!(m.reasoning || '').trim() && <ThinkingBlock text={m.reasoning.trim()} streaming={false} />}
                  {m.kind === 'rewrite' ? (
                    <>
                      {m.content ? (
                        <div className="ai-md" dangerouslySetInnerHTML={{ __html: renderAiMarkdown(m.content) }} />
                      ) : null}
                      <div className="ai-rewrite-status">
                        <span className={m.apply && !m.apply.ok ? 'ai-note error' : undefined}>{applyNote(m.apply)}</span>
                      </div>
                    </>
                  ) : m.content ? (
                    <div className="ai-md" dangerouslySetInnerHTML={{ __html: renderAiMarkdown(m.content) }} />
                  ) : null}
                </>
              )}
              {m.error && <div className="ai-note error">{m.error}</div>}
              {/* 用量：服务端返回 usage 才显示；金额需在设置里填过单价 */}
              {!m.pending && m.usage && (
                <div className="ai-usage">{formatUsage(m.usage, m.price, m.price && m.price.currency)}</div>
              )}
            </div>
          )
        )}
      </div>

      <div className="ai-scope-switch">
        <button type="button" className={scope === 'doc' ? 'active' : ''} onClick={() => onScopeChange('doc')}>
          当前文档
        </button>
        <button type="button" className={scope === 'tabs' ? 'active' : ''} onClick={() => onScopeChange('tabs')}>
          已打开文件
        </button>
        <button type="button" className={scope === 'folder' ? 'active' : ''} onClick={() => onScopeChange('folder')}>
          整个文件夹
        </button>
      </div>

      <div className="ai-composer">
        <textarea
          className="ai-input"
          rows={3}
          value={input}
          placeholder={
            scope === 'doc'
              ? hasDocument
                ? '提问，或要求修改文档（如：把这段改简洁）'
                : '提问…'
              : '基于工作区文件提问，或要求修改其中某个文件'
          }
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
          <ModelSelector />
          {hasSelection && (
            <span className="ai-scope">仅改写选中的 {selectionInfo.text.length} 字</span>
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
