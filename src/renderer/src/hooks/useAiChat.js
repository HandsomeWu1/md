import { useCallback, useEffect, useRef, useState } from 'react';
import { buildMessages, parseAiReply, parseMultiRewrite, splitThinking } from '../utils/aiPrompt';

// 作用域 → 会话 key。
// - 'doc'：每个文档独立会话，key = `doc:<tabId>`；无文档时 key = `doc:__no_document__`。
// - 'tabs' / 'folder'：整工作区共享一个会话，key 就是作用域名本身。
function scopeSessionKey(scope, tabId) {
  if (scope === 'doc') return 'doc:' + (tabId || NO_DOC_KEY);
  return scope;
}

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
  getScope,
  getWorkspaceDocs,
  onRewritten,
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

  // 实际发送逻辑。promptOverride 非空时直接用它作为本次指令（如选区快捷动作），
  // 否则读取该作用域会话里的输入框内容。scope/key 显式传入，便于选区动作强制使用 doc 作用域。
  const doSend = useCallback(
    async (scope, key, promptOverride, forceSelectionRewrite) => {
      const session = sessions[key] || emptySession();
      const prompt = (promptOverride != null ? promptOverride : session.input || '').trim();
      if (!prompt || session.busy) return;

    const isWorkspace = scope !== 'doc';
    const sel = getSelection() || { empty: true, text: '' };
    const docBefore = getDocument() || '';

    // 只把对话往来带进历史；改写结果是整篇文档，塞进历史会迅速撑爆上下文。
    const history = session.messages
      .filter((m) => !m.error && !m.pending && m.kind !== 'rewrite')
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    let payloadMessages;
    let truncated = false;
    if (isWorkspace) {
      // 工作区作用域：把多个文件作为上下文，改写需指名目标文件。
      const files = (getWorkspaceDocs ? await getWorkspaceDocs(scope) : []) || [];
      const built = buildMessages({
        prompt,
        document: '',
        selection: '',
        history,
        maxChars: getMaxChars(),
        canRewrite: getCanRewrite ? getCanRewrite() : true,
        systemPrompt: getSystemPrompt ? getSystemPrompt() : '',
        scope: 'workspace',
        workspaceFiles: files,
      });
      payloadMessages = built.messages;
      truncated = built.truncated;
    } else {
      const built = buildMessages({
        prompt,
        document: docBefore,
        selection: sel.empty ? '' : sel.text,
        history,
        maxChars: getMaxChars(),
        canRewrite: getCanRewrite ? getCanRewrite() : true,
        systemPrompt: getSystemPrompt ? getSystemPrompt() : '',
        scope: 'doc',
      });
      payloadMessages = built.messages;
      truncated = built.truncated;
    }

    const requestId = nextRequestId();
    ownerRef.current.set(requestId, key);

    // 记录发起时的选区位置与文档快照：等模型返回时选区大概率已经没了，
    // 必须靠这份快照判断「还能不能安全写回原位置」。工作区作用域不按选区改写。
    const target = isWorkspace || sel.empty ? null : { from: sel.from, to: sel.to };

    patchSession(key, (s) => ({
      busy: true,
      input: '',
      messages: [
        ...s.messages,
        { id: requestId + '-u', role: 'user', content: prompt },
        { id: requestId, role: 'assistant', content: '', reasoning: '', pending: true, truncated },
      ],
    }));

    try {
    const res = await api.aiChat({ requestId, messages: payloadMessages });
    ownerRef.current.delete(requestId);

    // 思考过程有两条来路：独立的 reasoning 字段，或正文里的 <think> 块。
    // 必须先剥离 <think> 再判断意图，否则 %%REWRITE%% 会被挤到思考之后而识别不到。
    const split = res && res.ok ? splitThinking(res.content || '') : null;
    const thinking = split ? split.thinking.trim() : '';
    const body = split ? split.rest : '';

    // 意图由模型的回复决定：只有明确声明改写时才动文档，其余一律当对话。
    let kind = 'chat';
    let chatText = '';
    let chars = 0;
    let applyInfo = null;
    const switchTo = [];

    if (isWorkspace) {
      const parsed = split ? parseMultiRewrite(body) : { chat: '', rewrites: [] };
      chatText = parsed.chat || '';
      const rewrites = parsed.rewrites || [];
      if (rewrites.length) {
        kind = 'rewrite';
        applyInfo = { ok: true, files: [] };
        for (const r of rewrites) {
          const info = await applyRewrite({ target: r.target, text: r.text });
          if (info && info.tabId) switchTo.push(info.tabId);
          applyInfo.files.push({ target: r.target, ok: info ? info.ok : false, reason: info ? info.reason : '未找到该文件' });
        }
        if (applyInfo.files.some((f) => !f.ok)) applyInfo.ok = false;
        chars = rewrites.reduce((a, r) => a + r.text.length, 0);
      } else {
        chatText = chatText || body;
      }
    } else {
      const parsed = split ? parseAiReply(body) : null;
      if (forceSelectionRewrite) {
        // 选区快捷动作：答复一律作为「改写选区」应用，不依赖模型是否输出标记。
        // 保留代码块围栏（如 ```mermaid），让编辑器按类型渲染图表；仅剔除改写标记前缀。
        if (!target) {
          kind = 'chat';
          chatText = body;
        } else {
          kind = 'rewrite';
          const text = body.replace(/^%%REWRITE%%\s*/i, '').trim();
          if (!text) {
            applyInfo = { ok: false, reason: '模型返回了空内容，未改动选中片段' };
          } else {
            applyInfo = await applyRewrite({
              tabId: getTabId(),
              text,
              range: target,
              docSnapshot: docBefore,
              cleared: false,
            });
          }
          if (applyInfo && applyInfo.tabId) switchTo.push(applyInfo.tabId);
          chars = text.length;
        }
      } else {
        const isRewrite = !!parsed && parsed.kind === 'rewrite';
        if (isRewrite) {
          kind = 'rewrite';
          const isClear = !parsed.text;
          // 空正文是**合法意图**（用户要求清空文档），不能当异常拒绝——
          // 模型既然输出了改写标记，就是有意改写。误清空由确认条的「撤销」兜底。
          // 但选区改写时清空选区的语义太容易出错（如模型只是漏输出），故仍要求非空。
          if (isClear && target) {
            applyInfo = { ok: false, reason: '模型返回了空内容，未改动选中片段' };
          } else {
            applyInfo = await applyRewrite({
              tabId: getTabId(),
              text: parsed.text,
              range: target,
              docSnapshot: docBefore,
              cleared: isClear,
            });
          }
          if (applyInfo && applyInfo.tabId) switchTo.push(applyInfo.tabId);
          chars = parsed.text.length;
        } else {
          chatText = parsed ? parsed.text : body;
        }
      }
    }

    const price = getPrice ? getPrice() : null;

    // 工作区改写后跳到其中一个被改的文件，让用户看到高亮 / 结果。
    if (isWorkspace && switchTo.length && onRewritten) onRewritten(switchTo[0]);

    patchSession(key, (s) => ({
      busy: false,
      messages: s.messages.map((m) => {
        if (m.id !== requestId) return m;
        if (res && res.ok) {
          // reasoning 字段优先；没有则用从正文剥出的 <think> 内容。
          const reasoning = (res.reasoning || '').trim() || thinking || m.reasoning || '';
          const common = { reasoning, usage: res.usage || null, price: price || null };
          if (kind === 'rewrite') {
            // 改写结果已写进文档，面板不再展示全文，只留长度——
            // 否则多轮改写会把若干份全文长期留在内存里。
            return {
              ...m,
              ...common,
              pending: false,
              kind: 'rewrite',
              content: chatText || '',
              chars,
              apply: applyInfo || undefined,
            };
          }
          return { ...m, ...common, pending: false, kind: 'chat', content: chatText || body || m.content };
        }
        return {
          ...m,
          pending: false,
          error: res && res.canceled ? '已取消' : (res && res.error) || '请求失败',
        };
      }),
    }));
    } catch (err) {
      // 任何一步（意图解析 / 改写落地 / 结果组装）抛错都不能让会话卡在「发送中」——
      // 否则停止按钮一直显示、无法继续对话。兜底把会话拉回空闲并记录错误。
      patchSession(key, (s) => ({
        busy: false,
        messages: s.messages.map((m) =>
          m.id === requestId ? { ...m, pending: false, error: (err && err.message) || 'AI 请求失败' } : m
        ),
      }));
    }
  }, [
    sessions,
    getScope,
    getWorkspaceDocs,
    getTabId,
    getDocument,
    getSelection,
    getMaxChars,
    getCanRewrite,
    getSystemPrompt,
    getPrice,
    applyRewrite,
    onRewritten,
    patchSession,
  ]);

  // 输入框发送：使用当前作用域会话。
  const send = useCallback(() => {
    const scope = getScope ? getScope() : 'doc';
    const key = scopeSessionKey(scope, getTabId() || NO_DOC_KEY);
    return doSend(scope, key);
  }, [doSend, getScope, getTabId]);

  // 选区快捷动作：强制 doc 作用域（结果作用在当前文档），复用实时选区上下文。
  const runPreset = useCallback(
    (instruction) => {
      const key = scopeSessionKey('doc', getTabId() || NO_DOC_KEY);
      return doSend('doc', key, instruction, true);
    },
    [doSend, getTabId]
  );

  const stop = useCallback(() => {
    const scope = getScope ? getScope() : 'doc';
    const key = scopeSessionKey(scope, getTabId() || NO_DOC_KEY);
    // 找出该会话正在进行的请求并中止。
    let found = false;
    for (const [requestId, owner] of ownerRef.current.entries()) {
      if (owner === key) {
        api.aiAbort(requestId);
        found = true;
      }
    }
    // 乐观复位：即便底层 abort 因端点差异延迟生效，也立即把会话拉回空闲，
    // 让停止按钮变回发送、用户可继续操作；进行中的消息标记为已取消。
    if (found) {
      patchSession(key, (s) => ({
        busy: false,
        messages: s.messages.map((m) => (m.pending ? { ...m, pending: false, error: '已取消' } : m)),
      }));
    }
  }, [getScope, getTabId, patchSession]);

  const setInput = useCallback(
    (v) => patchSession(scopeSessionKey(getScope ? getScope() : 'doc', getTabId() || NO_DOC_KEY), { input: v }),
    [getScope, getTabId, patchSession]
  );
  const clear = useCallback(
    () => patchSession(scopeSessionKey(getScope ? getScope() : 'doc', getTabId() || NO_DOC_KEY), { messages: [] }),
    [getScope, getTabId, patchSession]
  );

  // 标签关闭后回收其会话，避免长期占用内存。
  // 用存活标签集合被动回收，而不是让 closeTab 主动调用——后者会造成
  // App 里的定义顺序依赖（closeTab 定义在本 hook 之前）。
  // 工作区作用域（tabs / folder）与会话无关标签，始终保留；doc 作用域只保留存活标签。
  const aliveKey = (aliveTabIds || []).join('|');
  useEffect(() => {
    const alive = new Set(aliveTabIds || []);
    setSessions((prev) => {
      const next = {};
      let dropped = false;
      for (const id of Object.keys(prev)) {
        if (id === NO_DOC_KEY || id === 'tabs' || id === 'folder' || alive.has(id)) {
          next[id] = prev[id];
          continue;
        }
        if (id.startsWith('doc:')) {
          const suffix = id.slice(4);
          if (suffix === NO_DOC_KEY || alive.has(suffix)) {
            next[id] = prev[id];
            continue;
          }
        }
        dropped = true;
      }
      return dropped ? next : prev;
    });
  }, [aliveKey]);

  const current = sessions[scopeSessionKey(getScope ? getScope() : 'doc', getTabId() || NO_DOC_KEY)] || emptySession();
  return { session: current, send, stop, setInput, clear, runPreset };
}
