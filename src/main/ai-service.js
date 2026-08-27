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
// 拉模型列表只是辅助操作，超时要短——用户在设置弹窗里等不了两分钟。
const LIST_TIMEOUT_MS = 15000;

// 把用户可能填写的多种形式统一成基础地址：去掉末尾斜杠，
// 并剥掉已经带上的具体端点路径（有人会直接粘贴完整的 /chat/completions 地址）。
function normalizeBase(baseUrl) {
  return String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '')
    .replace(/\/+$/, '');
}

function buildChatUrl(baseUrl) {
  return normalizeBase(baseUrl) + '/chat/completions';
}

function buildModelsUrl(baseUrl) {
  return normalizeBase(baseUrl) + '/models';
}

// 错误响应也可能是 JSON，尽量取出可读的 error.message；
// 取不到就用原文（截断）兜底，避免把整段 HTML 抛给用户。
function toHttpError(status, raw) {
  let msg = String(raw || '').slice(0, 300);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.error && parsed.error.message) msg = parsed.error.message;
  } catch {}
  return new Error(`AI 请求失败（${status}）：${msg}`);
}

async function httpError(res) {
  return toHttpError(res.status, await res.text());
}

// 归一化 usage：各家字段名基本遵循 OpenAI，但 DeepSeek 等会额外给出缓存命中数。
// 只保留渲染层需要的字段，且全部转成数字，避免字符串混入后计算出 NaN。
function normalizeUsage(u) {
  if (!u || typeof u !== 'object') return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const prompt = num(u.prompt_tokens ?? u.input_tokens);
  const completion = num(u.completion_tokens ?? u.output_tokens);
  const total = num(u.total_tokens) || prompt + completion;
  if (!prompt && !completion && !total) return null;
  const out = { prompt, completion, total };
  // 缓存命中部分计费更低，单独带出来供费用估算使用。
  if (u.prompt_cache_hit_tokens != null) out.cacheHit = num(u.prompt_cache_hit_tokens);
  if (u.prompt_cache_miss_tokens != null) out.cacheMiss = num(u.prompt_cache_miss_tokens);
  // 思考模型会单列推理 token（已包含在 completion 内，仅作展示）。
  const reasoning = u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens;
  if (reasoning != null) out.reasoning = num(reasoning);
  return out;
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
  let reasoning = '';
  let usage = null;
  try {
    const url = buildChatUrl(s.aiBaseUrl);

    // 单条 SSE 事件的处理逻辑。抽成闭包供主循环与末尾残留 buffer 复用，
    // 避免两处解析逻辑漂移（早先版本就因此漏处理过 reasoning 字段）。
    const handleData = (data) => {
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        // 部分服务会在数据行之间插入注释或非标准行，单条解析失败要静默跳过，
        // 不能因为一行脏数据就让整个流崩溃。
        return;
      }
      // usage 通常只在最后一个 chunk 出现（需 stream_options.include_usage）；
      // 少数服务每个 chunk 都带，后到的更完整，直接覆盖即可。
      if (json.usage) usage = json.usage;

      const choice = json.choices && json.choices[0];
      const delta = choice && choice.delta;
      if (!delta) return;

      // 思考过程的字段名各家不同：DeepSeek 用 reasoning_content，
      // OpenRouter 等用 reasoning。两者都取，谁有取谁。
      const rd = delta.reasoning_content || delta.reasoning;
      if (rd) {
        reasoning += rd;
        if (typeof onDelta === 'function') onDelta({ reasoning: rd });
      }
      if (delta.content) {
        content += delta.content;
        if (typeof onDelta === 'function') onDelta({ content: delta.content });
      }
    };

    const doFetch = (withUsage) => {
      const body = {
        model: s.aiModel,
        messages,
        temperature: s.aiTemperature,
        stream: true,
      };
      // 流式响应默认不含 usage，必须显式要求；但部分兼容端点不认识这个参数，
      // 因此失败后会退回不带该参数重试（见下方 shouldRetryWithoutUsage）。
      if (withUsage) body.stream_options = { include_usage: true };
      return fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: 'Bearer ' + s.aiApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    };

    let res = await doFetch(true);
    if (!res.ok) {
      const raw = await res.text();
      // 端点不支持 stream_options 时通常返回 400 且错误里提到该参数名。
      // 这种情况静默重试一次（放弃 usage 统计），不让可选功能拖垮主流程。
      if (res.status === 400 && /stream_options|include_usage|unknown|unsupported|extra field/i.test(raw)) {
        res = await doFetch(false);
        if (!res.ok) throw await httpError(res);
      } else {
        throw toHttpError(res.status, raw);
      }
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
          handleData(data);
        }
        if (done) break;
      }
      if (done) break;
    }
    // 排空最后一段未以空行结尾的残留 buffer（流已正常收到 [DONE] 时无需再处理）。
    const tail = done ? '' : buffer.trim();
    if (tail.startsWith('data:')) {
      const data = tail.slice(5).trim();
      if (data && data !== '[DONE]') handleData(data);
    }

    return { content, reasoning, usage: normalizeUsage(usage) };
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

// 从各家 /models 响应里尽量抽出模型 ID 列表。
//
// 之所以写得这么宽容：OpenAI 规范是 { data: [{ id }] }，但兼容端点五花八门——
// 有的用 { models: [...] }，有的数组元素直接是字符串，本地部署（如 Ollama）
// 可能给的是 name/model 字段。解析不出来不算致命错误，UI 会退回手动填写。
function extractModelIds(json) {
  const arr = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.models)
      ? json.models
      : Array.isArray(json)
        ? json
        : [];
  const ids = [];
  for (const item of arr) {
    const id =
      typeof item === 'string' ? item : item && (item.id || item.name || item.model || item.model_name);
    if (typeof id === 'string' && id.trim()) ids.push(id.trim());
  }
  // 去重并排序，让下拉列表稳定可预期。
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

/**
 * 拉取可用模型列表。
 *
 * 允许传入尚未保存的 baseUrl/apiKey：用户在设置弹窗里填完地址就想看列表，
 * 此时配置还没落盘，必须用弹窗里的当前值去请求。
 *
 * @param {{ baseUrl?: string, apiKey?: string }} override
 * @returns {Promise<{ models: string[] }>}
 */
async function listModels(override = {}) {
  const s = settingsStore.get();
  const baseUrl = (override.baseUrl || s.aiBaseUrl || '').trim();
  const apiKey = (override.apiKey || s.aiApiKey || '').trim();
  if (!baseUrl) throw new Error('请先填写 API 地址');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS);
  try {
    const headers = { Accept: 'application/json' };
    // 本地部署（如 Ollama）通常不需要 key，没填也允许尝试。
    if (apiKey) headers.Authorization = 'Bearer ' + apiKey;

    const res = await fetch(buildModelsUrl(baseUrl), { method: 'GET', headers, signal: controller.signal });
    const raw = await res.text();
    if (!res.ok) {
      let msg = raw.slice(0, 200);
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.error?.message) msg = parsed.error.message;
      } catch {}
      throw new Error(`获取模型列表失败（${res.status}）：${msg}`);
    }

    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error('该地址返回的不是 JSON，无法解析模型列表');
    }
    const models = extractModelIds(json);
    if (!models.length) throw new Error('该服务未返回可识别的模型列表');
    return { models };
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('获取模型列表超时（15 秒）');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chat, abort, listModels };
