import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SYSTEM_PROMPT, REWRITE_MARKER } from '../utils/aiPrompt';

// AI 模型配置弹窗。复用全局 .modal 样式，保持与「新建文件/重命名」一致的观感。
//
// 只支持 OpenAI 兼容的 /chat/completions 协议：地址填到 /v1 即可，
// 也接受用户直接粘贴完整端点（主进程侧会做归一化）。

// Temperature 用滑块而非数字输入：这个参数没人记得住 0.3 和 0.9 的差别，
// 但「偏严谨 ↔ 偏发散」是直觉可感的。滑块范围收在 0–1.2：
// 再高的取值对改写文档只会带来不可控的胡编，没有实用价值。
const TEMP_MIN = 0;
const TEMP_MAX = 1.2;
const TEMP_STEP = 0.1;

function tempHint(v) {
  if (v <= 0.2) return '几乎每次结果一致，最忠实执行指令';
  if (v <= 0.5) return '稳定为主，适合改写与校对';
  if (v <= 0.8) return '略有变化，适合润色与扩写';
  return '更自由发挥，可能偏离原意';
}

export default function AiSettingsDialog({ open, settings, onSave, onCancel }) {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0.3);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState([]);
  const [listState, setListState] = useState({ loading: false, error: '' });
  const [listOpen, setListOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [priceIn, setPriceIn] = useState('');
  const [priceOut, setPriceOut] = useState('');
  const [priceCached, setPriceCached] = useState('');
  const [currency, setCurrency] = useState('¥');
  // —— 多模型配置档案 ——
  const [name, setName] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [activeId, setActiveId] = useState('');
  const firstRef = useRef(null);
  const modelBoxRef = useRef(null);
  // 单价用 parseFloat 宽容解析：用户可能粘贴带货币符号或空格的数字。
  const num = (v) => {
    const n = parseFloat(String(v).replace(/[^\d.eE+-]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  // 每次打开时从已保存设置回填，避免上次编辑的中间状态残留。
  useEffect(() => {
    if (!open) return;
    setBaseUrl(settings.aiBaseUrl || '');
    setApiKey(settings.aiApiKey || '');
    setModel(settings.aiModel || '');
    const t = Number(settings.aiTemperature);
    setTemperature(Number.isFinite(t) ? Math.min(TEMP_MAX, Math.max(TEMP_MIN, t)) : 0.3);
    // 空值意味着"沿用默认"，此处展开成完整文本，让用户看到实际生效的内容再改。
    setSystemPrompt(settings.aiSystemPrompt || DEFAULT_SYSTEM_PROMPT);
    // 单价为 0 时显示空串而不是 "0"，让「未设置」和「免费」在视觉上有区别。
    setPriceIn(settings.aiPriceIn ? String(settings.aiPriceIn) : '');
    setPriceOut(settings.aiPriceOut ? String(settings.aiPriceOut) : '');
    setPriceCached(settings.aiPriceCached ? String(settings.aiPriceCached) : '');
    setCurrency(settings.aiCurrency || '¥');
    setProfiles(settings.aiProfiles || []);
    setActiveId(settings.aiActiveProfile || '');
    const ap = (settings.aiProfiles || []).find((p) => p.id === settings.aiActiveProfile);
    setName(ap ? ap.name || '' : '');
    setShowKey(false);
    setModels([]);
    setListState({ loading: false, error: '' });
    setListOpen(false);
    setAdvancedOpen(false);
    const id = requestAnimationFrame(() => firstRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // 点击外部收起模型下拉。
  useEffect(() => {
    if (!listOpen) return;
    const onDown = (e) => {
      if (modelBoxRef.current && !modelBoxRef.current.contains(e.target)) setListOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [listOpen]);

  // 拉取模型列表。用弹窗里的当前值（而非已保存值）去请求，
  // 这样填完地址就能立刻看到列表，不必先保存再重新打开。
  const fetchModels = useCallback(async () => {
    if (!baseUrl.trim()) {
      setListState({ loading: false, error: '请先填写 API 地址' });
      return;
    }
    setListState({ loading: true, error: '' });
    const res = await window.api.aiListModels({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() });
    if (res && res.ok) {
      setModels(res.models || []);
      setListState({ loading: false, error: '' });
      setListOpen(true);
    } else {
      // 拉取失败不阻塞配置：提示原因，用户仍可手动填写模型名。
      setModels([]);
      setListState({ loading: false, error: (res && res.error) || '获取失败，可手动填写模型名' });
      setListOpen(false);
    }
  }, [baseUrl, apiKey]);

  if (!open) return null;

  const promptTrimmed = systemPrompt.trim();
  // 与默认完全一致时存空串，这样将来内置默认改进了用户能自动跟上；
  // 只有真正自定义过才固化到设置里。
  const promptIsDefault = promptTrimmed === DEFAULT_SYSTEM_PROMPT.trim();
  const promptMissingMarker = !!promptTrimmed && !promptTrimmed.includes(REWRITE_MARKER);

  // 把一条配置写入扁平字段并同步档案列表；关闭弹窗即对整个应用生效。
  const applySave = (nextProfiles, nextActiveId, prof) => {
    onSave({
      aiBaseUrl: prof.baseUrl,
      aiApiKey: prof.apiKey,
      aiModel: prof.model,
      aiTemperature: prof.temperature,
      aiSystemPrompt: prof.systemPrompt,
      aiPriceIn: prof.priceIn,
      aiPriceOut: prof.priceOut,
      aiPriceCached: prof.priceCached,
      aiCurrency: prof.currency,
      aiProfiles: nextProfiles,
      aiActiveProfile: nextActiveId,
    });
  };

  // 点击档案：立即切换为该配置（载入表单 + 设为生效 + 关闭窗口）。
  const onPick = (p) => {
    setBaseUrl(p.baseUrl);
    setApiKey(p.apiKey);
    setModel(p.model);
    setTemperature(p.temperature ?? 0.3);
    setSystemPrompt(p.systemPrompt || DEFAULT_SYSTEM_PROMPT);
    setPriceIn(p.priceIn ? String(p.priceIn) : '');
    setPriceOut(p.priceOut ? String(p.priceOut) : '');
    setPriceCached(p.priceCached ? String(p.priceCached) : '');
    setCurrency(p.currency || '¥');
    setName(p.name || '');
    setActiveId(p.id);
    applySave(profiles, p.id, p);
  };

  // 新建空白配置：清空表单，下次「保存」会作为新档案写入。
  const onNew = () => {
    setActiveId('');
    setName('');
    setBaseUrl('');
    setApiKey('');
    setModel('');
    setTemperature(0.3);
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setPriceIn('');
    setPriceOut('');
    setPriceCached('');
    setCurrency('¥');
    setListOpen(false);
  };

  // 删除当前档案：删除后若仍有剩余则切到第一条，否则保留当前表单为临时配置。
  const onDelete = () => {
    if (!activeId) return;
    const next = profiles.filter((p) => p.id !== activeId);
    if (next.length) {
      const p = next[0];
      setBaseUrl(p.baseUrl);
      setApiKey(p.apiKey);
      setModel(p.model);
      setTemperature(p.temperature ?? 0.3);
      setSystemPrompt(p.systemPrompt || DEFAULT_SYSTEM_PROMPT);
      setPriceIn(p.priceIn ? String(p.priceIn) : '');
      setPriceOut(p.priceOut ? String(p.priceOut) : '');
      setPriceCached(p.priceCached ? String(p.priceCached) : '');
      setCurrency(p.currency || '¥');
      setName(p.name || '');
      setActiveId(p.id);
      applySave(next, p.id, p);
    } else {
      setActiveId('');
      applySave(next, '', {
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        model: model.trim(),
        temperature,
        systemPrompt: promptIsDefault ? '' : systemPrompt,
        priceIn: num(priceIn),
        priceOut: num(priceOut),
        priceCached: num(priceCached),
        currency: currency.trim() || '¥',
      });
    }
  };

  // 主保存：把当前表单存为档案（新建或更新当前），并设为生效配置。
  const submit = () => {
    const prof = {
      id: activeId || `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || model.trim() || '未命名配置',
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      temperature,
      systemPrompt: promptIsDefault ? '' : systemPrompt,
      priceIn: num(priceIn),
      priceOut: num(priceOut),
      priceCached: num(priceCached),
      currency: currency.trim() || '¥',
    };
    const next = profiles.slice();
    const idx = next.findIndex((p) => p.id === prof.id);
    if (idx >= 0) next[idx] = prof;
    else next.push(prof);
    applySave(next, prof.id, prof);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    else if (e.key === 'Escape') {
      if (listOpen) setListOpen(false);
      else onCancel();
    }
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="modal ai-settings" onKeyDown={onKeyDown}>
        <div className="modal-title">AI 设置</div>

        {/* 多模型配置档案：可保存多个，点击档案即切换到该配置 */}
        <div className="ai-profiles">
          <div className="ai-profiles-head">
            <span className="ai-profiles-title">配置档案</span>
            <button type="button" className="ai-profile-new" onClick={onNew}>
              + 新建
            </button>
          </div>
          <div className="ai-profiles-list">
            {profiles.length === 0 && (
              <span className="ai-profiles-empty">还没有保存的配置，填好后点「保存」即可留存。</span>
            )}
            {profiles.map((p) => (
              <button
                type="button"
                key={p.id}
                className={'ai-profile-chip' + (p.id === activeId ? ' active' : '')}
                onClick={() => onPick(p)}
                title="点击切换到该配置"
              >
                {p.name || p.model || '未命名'}
              </button>
            ))}
          </div>
          {activeId && (
            <button type="button" className="ai-profile-del" onClick={onDelete}>
              删除当前
            </button>
          )}
        </div>

        <label className="ai-field">
          <span>配置名称（可选）</span>
          <input
            className="modal-input"
            type="text"
            value={name}
            placeholder="留空则使用模型名"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="ai-field">
          <span>API 地址</span>
          <input
            ref={firstRef}
            className="modal-input"
            type="text"
            value={baseUrl}
            placeholder="https://api.openai.com/v1"
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>

        <label className="ai-field">
          <span>API Key</span>
          <div className="ai-key-row">
            <input
              className="modal-input"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              placeholder="sk-…"
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button type="button" className="ai-btn" onClick={() => setShowKey((v) => !v)}>
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
        </label>

        {/* 模型：可从服务端拉取的列表里选，也可直接手填——
            各家 /models 返回格式不统一，拉不到时手填必须仍然可用。 */}
        <div className="ai-field">
          <span>模型</span>
          <div className="ai-model-box" ref={modelBoxRef}>
            <div className="ai-key-row">
              <input
                className="modal-input"
                type="text"
                value={model}
                placeholder="可点右侧「获取」选择，或直接填写"
                onChange={(e) => setModel(e.target.value)}
                onFocus={() => models.length && setListOpen(true)}
              />
              <button type="button" className="ai-btn" onClick={fetchModels} disabled={listState.loading}>
                {listState.loading ? '获取中…' : models.length ? '重新获取' : '获取'}
              </button>
            </div>
            {listOpen && !!models.length && (
              <div className="ai-model-list">
                {models.map((m) => (
                  <button
                    type="button"
                    key={m}
                    className={'ai-model-item' + (m === model ? ' active' : '')}
                    onClick={() => {
                      setModel(m);
                      setListOpen(false);
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
          {listState.error ? (
            <div className="ai-field-note error">{listState.error}</div>
          ) : models.length ? (
            <div className="ai-field-note">已获取 {models.length} 个模型，也可手动修改。</div>
          ) : null}
        </div>

        <div className="ai-field">
          <span>
            Temperature
            <span className="ai-temp-value">{temperature.toFixed(1)}</span>
          </span>
          <div className="ai-temp-row">
            <span className="ai-temp-label">严谨</span>
            <input
              className="ai-temp-slider"
              type="range"
              min={TEMP_MIN}
              max={TEMP_MAX}
              step={TEMP_STEP}
              value={temperature}
              aria-label="Temperature"
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
            <span className="ai-temp-label">发散</span>
          </div>
          <div className="ai-field-note">{tempHint(temperature)}</div>
        </div>

        <div className="ai-field-hint">
          仅支持 OpenAI 兼容接口（/chat/completions）。密钥以明文保存在本机设置文件中。
        </div>

        {/* 提示词属于高级选项，默认收起，保持配置界面清爽 */}
        <div className="ai-advanced">
          <button
            type="button"
            className="ai-advanced-toggle"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
          >
            <svg
              className={'ai-advanced-caret' + (advancedOpen ? ' open' : '')}
              width="10"
              height="10"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 2.5l4 3.5-4 3.5" />
            </svg>
            高级：System 提示词与计费
            {!promptIsDefault && <span className="ai-advanced-badge">已自定义</span>}
          </button>

          {advancedOpen && (
            <div className="ai-advanced-body">
              <textarea
                className="ai-prompt-input"
                rows={7}
                value={systemPrompt}
                spellCheck={false}
                onChange={(e) => setSystemPrompt(e.target.value)}
                aria-label="System 提示词"
              />
              <div className="ai-prompt-bar">
                <span className="ai-field-note">{systemPrompt.length} 字</span>
                <div className="modal-spacer" />
                <button
                  type="button"
                  className="ai-btn"
                  onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                  disabled={promptIsDefault}
                >
                  恢复默认
                </button>
              </div>
              {promptMissingMarker ? (
                // 不阻止保存：用户可能就只想要一个纯对话助手。但必须让他知道后果。
                <div className="ai-field-note error">
                  提示词中没有 {REWRITE_MARKER} 的说明，AI 将无法改写文档（只能对话）。
                </div>
              ) : (
                <div className="ai-field-note">
                  决定 AI 如何判断「对话」还是「改写文档」。改写协议依赖首行的 {REWRITE_MARKER} 标记，
                  自定义时请保留相关说明。留空保存则恢复为默认。
                </div>
              )}

              {/* 单价：用于把 token 用量折算成金额。API 不返回价格，只能手填 */}
              <div className="ai-price">
                <div className="ai-price-title">
                  计费单价
                  <span className="ai-price-unit">每百万 token</span>
                </div>
                <div className="ai-price-grid">
                  <label>
                    <span>输入</span>
                    <input
                      className="modal-input"
                      type="text"
                      inputMode="decimal"
                      value={priceIn}
                      placeholder="0"
                      onChange={(e) => setPriceIn(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>输出</span>
                    <input
                      className="modal-input"
                      type="text"
                      inputMode="decimal"
                      value={priceOut}
                      placeholder="0"
                      onChange={(e) => setPriceOut(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>缓存命中</span>
                    <input
                      className="modal-input"
                      type="text"
                      inputMode="decimal"
                      value={priceCached}
                      placeholder="可选"
                      onChange={(e) => setPriceCached(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>货币</span>
                    <input
                      className="modal-input"
                      type="text"
                      value={currency}
                      maxLength={4}
                      onChange={(e) => setCurrency(e.target.value)}
                    />
                  </label>
                </div>
                <div className="ai-field-note">
                  留空则只显示 token 数、不换算金额。各家定价常有调整，故不内置价格表，请按服务商页面填写。
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <div className="modal-spacer" />
          <button type="button" className="modal-btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="modal-btn primary" onClick={submit}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
