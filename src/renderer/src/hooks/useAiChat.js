import { useCallback, useEffect, useRef, useState } from 'react';
import { buildMessages, parseAiReply, splitThinking } from '../utils/aiPrompt';

let seq = 0;
const nextRequestId = () => `ai-${Date.now()}-${++seq}`;

// 没有打开任何文档时也允许对话，此时会话挂在这个固定 key 上。
// 用常量而非 null：会话状态的读写都以 key 为索引，null 会让 patchSession 无处落地。
export const NO_DOC_KEY = '__no_document__';

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
  getSystemPrompt,
  getPrice,
  applyRewrite,
  aliveTabIds,
}) {
  const api = window.api;
  const [sessions, setSessions] = useState({});

  // requestId → 发起它的会话 key。跨标签路由增量与结果都依赖这张表。
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
  // reasoning 与 content 分开累加：思考过程要独立折叠展示，混在一起就没法区分了。
  useEffect(() => {
    const off = api.onAiChunk(({ requestId, content, reasoning }) => {
      const tabId = ownerRef.current.get(requestId);
      if (!tabId) return;
      patchSession(tabId, (s) => ({
        messages: s.messages.map((m) =>
          m.id === requestId
            ? {
                ...m,
                content: content ? m.content + content : m.content,
                reasoning: reasoning ? (m.reasoning || '') + reasoning : m.reasoning,
              }
            : m
        ),
      }));
    });
    return off;
  }, [patchSession]);

  const send = useCallback(async () => {
    // 没有打开文档时用固定 key，让「先聊天再决定要不要建文档」成为可能。
    const tabId = getTabId() || NO_DOC_KEY;
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
      systemPrompt: getSystemPrompt ? getSystemPrompt() : '',
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
        { id: requestId, role: 'assistant', content: '', reasoning: '', pending: true, truncated },
      ],
    }));

    const res = await api.aiChat({ requestId, messages: payloadMessages });
    ownerRef.current.delete(requestId);

    // 思考过程有两条来路：独立的 reasoning 字段，或正文里的 <think> 块。
    // 必须先剥离 <think> 再判断意图，否则 %%REWRITE%% 会被挤到思考之后而识别不到。
    const split = res && res.ok ? splitThinking(res.content || '') : null;
    const thinking = split ? split.thinking.trim() : '';
    const body = split ? split.rest : '';

    // 意图由模型的回复决定：只有明确声明改写时才动文档，其余一律当对话。
    const parsed = split ? parseAiReply(body) : null;
    const isRewrite = !!parsed && parsed.kind === 'rewrite';
    let applyInfo = null;
    if (isRewrite) {
      // 空正文是**合法意图**（用户要求清空文档），不能当异常拒绝——
      // 模型既然输出了改写标记，就是有意改写。误清空由确认条的「撤销」兜底。
      // 但选区改写时清空选区的语义太容易出错（如模型只是漏输出），故仍要求非空。
      const isClear = !parsed.text;
      if (isClear && target) {
        applyInfo = { ok: false, reason: '模型返回了空内容，未改动选中片段' };
      } else {
        applyInfo = applyRewrite({
          tabId,
          text: parsed.text,
          range: target,
          docSnapshot: docBefore,
          cleared: isClear,
        });
      }
    }

    const price = getPrice ? getPrice() : null;

    patchSession(tabId, (s) => ({
      busy: false,
      messages: s.messages.map((m) => {
        if (m.id !== requestId) return m;
        if (res && res.ok) {
          // reasoning 字段优先；没有则用从正文剥出的 <think> 内容。
          const reasoning = (res.reasoning || '').trim() || thinking || m.reasoning || '';
          const common = { reasoning, usage: res.usage || null, price: price || null };
          if (isRewrite) {
            // 改写结果已写进文档，面板不再展示全文，只留长度——
            // 否则多轮改写会把若干份全文长期留在内存里。
            return {
              ...m,
              ...common,
              pending: false,
              kind: 'rewrite',
              content: '',
              chars: parsed.text.length,
              apply: applyInfo || undefined,
            };
          }
          return { ...m, ...common, pending: false, kind: 'chat', content: parsed.text || body || m.content };
        }
        return {
          ...m,
          pending: false,
          error: res && res.canceled ? '已取消' : (res && res.error) || '请求失败',
        };
      }),
    }));
  }, [
    sessions,
    getTabId,
    getDocument,
    getSelection,
    getMaxChars,
    getCanRewrite,
    getSystemPrompt,
    getPrice,
    applyRewrite,
    patchSession,
  ]);

  const stop = useCallback(() => {
    const tabId = getTabId() || NO_DOC_KEY;
    // 找出该会话正在进行的请求并中止。
    for (const [requestId, owner] of ownerRef.current.entries()) {
      if (owner === tabId) api.aiAbort(requestId);
    }
  }, [getTabId]);

  const setInput = useCallback(
    (v) => patchSession(getTabId() || NO_DOC_KEY, { input: v }),
    [getTabId, patchSession]
  );
  const clear = useCallback(
    () => patchSession(getTabId() || NO_DOC_KEY, { messages: [] }),
    [getTabId, patchSession]
  );

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
        // 无文档会话不属于任何标签，必须显式保留，否则一打开文档就被清掉。
        if (id === NO_DOC_KEY || alive.has(id)) next[id] = prev[id];
        else dropped = true;
      }
      return dropped ? next : prev;
    });
  }, [aliveKey]);

  const current = sessions[getTabId() || NO_DOC_KEY] || emptySession();
  return { session: current, send, stop, setInput, clear };
}
