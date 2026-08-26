'use strict';
// 为什么 AI 请求放主进程而不是渲染层：
// 渲染层的 CSP（Content-Security-Policy）connect-src 只放行 self 与 Vite dev server，
// 而 AI 的 API 地址由用户在设置里随意填写，无法预先写进白名单；
// 放主进程发请求可以既不放宽 CSP、又天然避开浏览器的 CORS 限制，
// 同时 API Key 只存在于主进程，不会进入渲染进程这一更暴露的运行环境。

const { settingsStore } = require('./store');

// 按 requestId 记录进行中的请求控制器，供 abort 调用后及时回收，避免泄漏。
const controllers = new Map();

const TIMEOUT_MS = 120000;

// 把用户可能填写的多种形式（带或不带末尾斜杠、甚至已带完整路径）
// 统一拼成 /chat/completions 端点，避免因为地址写法不同而请求失败。
function buildChatUrl(baseUrl) {
  let url = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (url.endsWith('/chat/completions')) return url;
  return url + '/chat/completions';
}

// 取消：主动 abort 与超时都要能被上层区分，便于 UI 呈现「已取消」而非「失败」。
function makeCanceledError() {
  const err = new Error('已取消');
  err.canceled = true;
  return err;
}

/**
 * 发起一次（流式）AI 对话。
 * @param {object} opts
 * @param {string} opts.requestId 用于取消与增量推送的标识
 * @param {Array}  opts.messages  OpenAI 兼容的 messages 数组
 * @param {function(string):void} opts.onDelta 每收到一段增量内容时回调
 * @returns {Promise<{content:string}>}
 */
async function chat({ requestId, messages, onDelta }) {
  const s = settingsStore.get();
  if (!s.aiBaseUrl || !s.aiModel) {
    throw new Error('请先在 AI 设置中填写 API 地址和模型名');
  }
  if (!s.aiApiKey) {
    throw new Error('请先在 AI 设置中填写 API Key');
  }

  const controller = new AbortController();
  controllers.set(requestId, controller);

  // 超时独立计时：即便网络挂起也不让请求无限占用，到点强制中止。
  // 用 timedOut 标记区分「超时」与「用户主动取消」——两者都会抛 AbortError，
  // 但上层提示文案不同（超时要明确告知 120 秒，取消则提示已取消）。
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);

  let content = '';
  try {
    const url = buildChatUrl(s.aiBaseUrl);
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: 'Bearer ' + s.aiApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: s.aiModel,
        messages,
        temperature: s.aiTemperature,
        stream: true,
      }),
    });

    if (!res.ok) {
      // 错误响应也可能是 JSON，尽量取出可读的 error.message；
      // 取不到就用原文（截断）兜底，避免把整段 HTML 抛给用户。
      const raw = await res.text();
      let msg = raw.slice(0, 300);
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.error && parsed.error.message) msg = parsed.error.message;
      } catch {}
      throw new Error(`AI 请求失败（${res.status}）：${msg}`);
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    // done 标记用于收到 [DONE] 后立刻停止读取整个流：内层 break 只能跳出行循环，
    // 少数服务在 [DONE] 之后还会附带心跳或空事件，继续解析没有意义。
    let done = false;
    // Electron 33 的 fetch body 是异步可迭代，逐块读取并增量解码；
    // buffer 缓存可能跨块被截断的事件，按空行切分后再处理每个 data 事件。
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of event.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') {
            done = true;
            break;
          }
          // 部分服务会在数据行之间插入注释或非标准行，单条解析失败要静默跳过，
          // 不能因为一行脏数据就让整个流崩溃。
          let json;
          try {
            json = JSON.parse(data);
          } catch {
            continue;
          }
          const delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
          if (delta) {
            content += delta;
            if (typeof onDelta === 'function') onDelta(delta);
          }
        }
        if (done) break;
      }
      if (done) break;
    }
    // 排空最后一段未以空行结尾的残留 buffer（流已正常收到 [DONE] 时无需再处理）。
    const tail = done ? '' : buffer.trim();
    if (tail.startsWith('data:')) {
      const data = tail.slice(5).trim();
      if (data && data !== '[DONE]') {
        try {
          const json = JSON.parse(data);
          const delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
          if (delta) {
            content += delta;
            if (typeof onDelta === 'function') onDelta(delta);
          }
        } catch {}
      }
    }

    return { content };
  } catch (err) {
    if (err && err.name === 'AbortError') {
      // fetch 无论被谁 abort 都会抛出 AbortError；这里区分触发来源：
      // 超时给出明确的时长提示，主动取消则挂 canceled 标记供上层判断。
      if (timedOut) throw new Error('AI 请求超时（120 秒）');
      throw makeCanceledError();
    }
    throw err;
  } finally {
    // 无论成功失败都必须清理，否则 Map 与 timer 会泄漏，影响后续同 requestId 的请求。
    clearTimeout(timer);
    controllers.delete(requestId);
  }
}

// 取消指定请求。找不到对应控制器（已结束或从未发起）时静默忽略。
function abort(requestId) {
  const controller = controllers.get(requestId);
  if (controller) {
    controller.abort();
    controllers.delete(requestId);
  }
}

module.exports = { chat, abort };
