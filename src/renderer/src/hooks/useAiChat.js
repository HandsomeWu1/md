import { useCallback, useEffect, useRef, useState } from 'react';
import { buildMessages, parseAiReply } from '../utils/aiPrompt';

let seq = 0;
const nextRequestId = () => `ai-${Date.now()}-${++seq}`;

// 每个文档一个独立会话。
const emptySession = () => ({ messages: [], input: '', busy: false });

/**
 * AI 会话管理。
 *
 * 为什么把会话状态与请求收发都放在这里、而不是 AiPanel 内部：
 * 1. 会话要按文档隔离并在切标签后保留，状态必须活在 AiPanel 之外；
 * 2. 请求可能跨标签完成（发起后用户切走），流式增量必须能路由回**发起它的那个会话**，
 *    而不是当前显示的会话。
 *
 * 对话与改写是同一个入口：由模型在回复里自行声明意图（见 utils/aiPrompt 的标记协议），
 * 只有明确声明改写时才会动文档。
 */
export function useAiChat({
  getTabId,
  getDocument,
  getSelection,
  getMaxChars,
  getCanRewrite,
  applyRewrite,
  aliveTabIds,
}) {
  const api = window.api;
  const [sessions, setSessions] = useState({});

  // requestId → 发起它的 tabId。跨标签路由增量与结果都依赖这张表。
  const ownerRef = useRef(new Map());

  const patchSession = useCallback((tabId, patch) => {
    if (!tabId) return;
    setSessions((prev) => {
      const cur = prev[tabId] || emptySession();
      return { ...prev, [tabId]: { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) } };
    });
  }, []);

  // 流式增量：按 requestId 找到所属会话再累加，因此用户切换标签时
  // 后台请求的内容不会串到别的文档里。
  useEffect(() => {
    const off = api.onAiChunk(({ requestId, delta }) => {
      const tabId = ownerRef.current.get(requestId);
      if (!tabId) return;
      patchSession(tabId, (s) => ({
        messages: s.messages.map((m) => (m.id === requestId ? { ...m, content: m.content + delta } : m)),
      }));
    });
    return off;
  }, [patchSession]);

  const send = useCallback(async () => {
    const tabId = getTabId();
    if (!tabId) return;
    const session = sessions[tabId] || emptySession();
    const prompt = (session.input || '').trim();
    if (!prompt || session.busy) return;

    const sel = getSelection() || { empty: true, text: '' };
    const docBefore = getDocument() || '';
    const { messages: payloadMessages, truncated } = buildMessages({
      prompt,
      document: docBefore,
      selection: sel.empty ? '' : sel.text,
      // 只把对话往来带进历史；改写结果是整篇文档，塞进历史会迅速撑爆上下文。
      history: session.messages
        .filter((m) => !m.error && !m.pending && m.kind !== 'rewrite')
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content })),
      maxChars: getMaxChars(),
      canRewrite: getCanRewrite ? getCanRewrite() : true,
    });

    const requestId = nextRequestId();
    ownerRef.current.set(requestId, tabId);

    // 记录发起时的选区位置与文档快照：等模型返回时选区大概率已经没了，
    // 必须靠这份快照判断「还能不能安全写回原位置」。
    const target = sel.empty ? null : { from: sel.from, to: sel.to };

    patchSession(tabId, (s) => ({
      busy: true,
      input: '',
      messages: [
        ...s.messages,
        { id: requestId + '-u', role: 'user', content: prompt },
        { id: requestId, role: 'assistant', content: '', pending: true, truncated },
      ],
    }));

    const res = await api.aiChat({ requestId, messages: payloadMessages });
    ownerRef.current.delete(requestId);

    // 意图由模型的回复决定：只有明确声明改写时才动文档，其余一律当对话。
    const parsed = res && res.ok ? parseAiReply(res.content || '') : null;
    const isRewrite = !!parsed && parsed.kind === 'rewrite';
    let applyInfo = null;
    if (isRewrite) {
      applyInfo = parsed.text
        ? applyRewrite({ tabId, text: parsed.text, range: target, docSnapshot: docBefore })
        : { ok: false, reason: '模型返回了空的改写内容' };
    }

    patchSession(tabId, (s) => ({
      busy: false,
      messages: s.messages.map((m) => {
        if (m.id !== requestId) return m;
        if (res && res.ok) {
          if (isRewrite) {
            // 改写结果已写进文档，面板不再展示全文，只留长度——
            // 否则多轮改写会把若干份全文长期留在内存里。
            return {
              ...m,
              pending: false,
              kind: 'rewrite',
              content: '',
              chars: parsed.text.length,
              apply: applyInfo || undefined,
            };
          }
          return { ...m, pending: false, kind: 'chat', content: parsed.text || res.content || m.content };
        }
        return {
          ...m,
          pending: false,
          error: res && res.canceled ? '已取消' : (res && res.error) || '请求失败',
        };
      }),
    }));
  }, [sessions, getTabId, getDocument, getSelection, getMaxChars, getCanRewrite, applyRewrite, patchSession]);

  const stop = useCallback(() => {
    const tabId = getTabId();
    if (!tabId) return;
    // 找出该会话正在进行的请求并中止。
    for (const [requestId, owner] of ownerRef.current.entries()) {
      if (owner === tabId) api.aiAbort(requestId);
    }
  }, [getTabId]);

  const setInput = useCallback((v) => patchSession(getTabId(), { input: v }), [getTabId, patchSession]);
  const clear = useCallback(() => patchSession(getTabId(), { messages: [] }), [getTabId, patchSession]);

  // 标签关闭后回收其会话，避免长期占用内存。
  // 用存活标签集合被动回收，而不是让 closeTab 主动调用——后者会造成
  // App 里的定义顺序依赖（closeTab 定义在本 hook 之前）。
  const aliveKey = (aliveTabIds || []).join('|');
  useEffect(() => {
    const alive = new Set(aliveTabIds || []);
    setSessions((prev) => {
      const next = {};
      let dropped = false;
      for (const id of Object.keys(prev)) {
        if (alive.has(id)) next[id] = prev[id];
        else dropped = true;
      }
      return dropped ? next : prev;
    });
  }, [aliveKey]);

  const current = sessions[getTabId()] || emptySession();
  return { session: current, send, stop, setInput, clear };
}
