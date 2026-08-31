import React, { useState, useEffect, useRef, useCallback } from 'react';
import { settingsApi } from '../utils/settings';

// ── 常量 ──────────────────────────────────────────────
const DEFAULT_TEMP = 0.3;

// ── 主组件 ────────────────────────────────────────────
export default function AiSettingsDialog({ open, onClose }) {
  const [entries, setEntries] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [temperature, setTemperature] = useState(DEFAULT_TEMP);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sysPrompt, setSysPrompt] = useState('');
  const [priceIn, setPriceIn] = useState('');
  const [priceOut, setPriceOut] = useState('');
  const [priceCached, setPriceCached] = useState('');
  const [currency, setCurrency] = useState('¥');

  // 详情编辑态（右侧面板）
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [editModel, setEditModel] = useState('');

  // 新增流程态
  const [adding, setAdding] = useState(false);       // 是否在"新增"模式
  const [addUrl, setAddUrl] = useState('');
  const [addKey, setAddKey] = useState('');
  const [addModelId, setAddModelId] = useState('');  // 手动填写的模型 ID（服务不支持列表接口时用）
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState('');
  const [fetchedModels, setFetchedModels] = useState([]);   // {id}[]
  const [selectedFetched, setSelectedFetched] = useState(new Set()); // 选中的模型 id

  const listRef = useRef(null);

  // ── 加载 / 持久化 ───────────────────────────────────
  const load = useCallback(async () => {
    await settingsApi.ready;
    const s = settingsApi.get();
    setEntries((s.aiModelEntries || []).map((e) => ({ ...e })));
    setActiveId(s.aiActiveModelId || '');
    setTemperature(typeof s.aiTemperature === 'number' ? s.aiTemperature : DEFAULT_TEMP);
    setSysPrompt(s.aiSystemPrompt || '');
    setPriceIn(String(s.aiPriceIn ?? ''));
    setPriceOut(String(s.aiPriceOut ?? ''));
    setPriceCached(String(s.aiPriceCached ?? ''));
    setCurrency(s.aiCurrency || '¥');
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const save = useCallback(
    (patch = {}) => {
      const payload = {
        aiModelEntries: entries,
        aiActiveModelId: activeId,
        aiTemperature: temperature,
        aiSystemPrompt: sysPrompt,
        aiPriceIn: Number(priceIn) || 0,
        aiPriceOut: Number(priceOut) || 0,
        aiPriceCached: Number(priceCached) || 0,
        aiCurrency: currency,
        ...patch,
      };
      settingsApi.set(payload);
      // 必须用 patch 之后的最终值同步扁平字段。若沿用闭包里的旧 entries/activeId，
      // 修改模型后扁平字段会被旧数据覆盖，导致对话仍走旧模型。
      syncFlatFields(payload.aiModelEntries, payload.aiActiveModelId);
    },
    [entries, activeId, temperature, sysPrompt, priceIn, priceOut, priceCached, currency]
  );

  // 把当前选中模型的配置同步到扁平字段（aiBaseUrl/aiApiKey/aiModel），
  // 让主进程 chat() 无需改动就能用。
  function syncFlatFields(all, aid) {
    const e = all.find((x) => x.id === aid);
    settingsApi.set({
      aiBaseUrl: e?.baseUrl || '',
      aiApiKey: e?.apiKey || '',
      aiModel: e?.model || '',
    });
  }

  // ── 选中模型 → 填充右侧详情 ────────────────────────
  useEffect(() => {
    if (adding) return; // 新增模式下不跟随
    const e = entries.find((x) => x.id === activeId);
    if (e) {
      setEditBaseUrl(e.baseUrl || '');
      setEditApiKey(e.apiKey || '');
      setEditModel(e.model || '');
    } else {
      setEditBaseUrl('');
      setEditApiKey('');
      setEditModel('');
    }
  }, [activeId, entries, adding]);

  // ── 操作：新增模型（从 API 拉列表批量加） ─────────
  async function handleFetchModels() {
    const url = addUrl.trim();
    const key = addKey.trim();
    if (!url) return setFetchErr('请先填写 API 地址');
    setFetchErr('');
    setFetching(true);
    try {
      const result = await window.api.aiListModels({ baseUrl: url, apiKey: key });
      if (!result || !result.ok) throw new Error(result?.error || '获取模型列表失败');
      const models = result.models || [];
      if (!models.length) throw new Error('该服务未返回可识别的模型列表');
      setFetchedModels(models);
      setSelectedFetched(new Set(models)); // 默认全选
    } catch (err) {
      setFetchErr(err.message || String(err));
      setFetchedModels([]);
    } finally {
      setFetching(false);
    }
  }

  function handleAddSelected() {
    const url = addUrl.trim();
    const key = addKey.trim();
    if (!url || !selectedFetched.size) return;

    const now = Date.now();
    const newEntries = [...entries];
    let firstNewId = '';
    for (const mid of selectedFetched) {
      const id = `${now}-${mid.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}`;
      if (!firstNewId) firstNewId = id;
      newEntries.push({
        id,
        name: mid,
        model: mid,
        baseUrl: url,
        apiKey: key,
      });
    }
    setEntries(newEntries);
    setActiveId(firstNewId);
    setAdding(false);
    setAddUrl('');
    setAddKey('');
    setFetchedModels([]);
    setSelectedFetched(new Set());
    save({ aiModelEntries: newEntries, aiActiveModelId: firstNewId });
  }

  // 生成一个不与已有条目冲突的 id
  function makeId(model) {
    const base = `${Date.now()}-${(model || 'model').slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}`;
    let id = base;
    let n = 1;
    while (entries.some((e) => e.id === id)) id = `${base}-${n++}`;
    return id;
  }

  function resetAddForm() {
    setAddUrl('');
    setAddKey('');
    setAddModelId('');
    setFetchedModels([]);
    setSelectedFetched(new Set());
    setFetchErr('');
  }

  // 手动填写模型 ID 直接添加：用于服务不提供 /models 列表接口的情况
  function handleAddManual() {
    const url = addUrl.trim();
    const model = addModelId.trim();
    const key = addKey.trim();
    if (!url || !model) return;

    const id = makeId(model);
    const newEntries = [...entries, { id, name: model, model, baseUrl: url, apiKey: key }];
    setEntries(newEntries);
    setActiveId(id);
    setAdding(false);
    resetAddForm();
    save({ aiModelEntries: newEntries, aiActiveModelId: id });
  }

  function toggleFetched(mid) {
    setSelectedFetched((prev) => {
      const next = new Set(prev);
      next.has(mid) ? next.delete(mid) : next.add(mid);
      return next;
    });
  }

  // ── 操作：保存详情编辑 ─────────────────────────────
  function handleSaveDetail() {
    const baseUrl = editBaseUrl.trim();
    const model = editModel.trim();
    if (!baseUrl || !model) return;

    const updated = entries.map((e) =>
      e.id === activeId ? { ...e, baseUrl, apiKey: editApiKey.trim(), model } : e
    );
    setEntries(updated);
    save({ aiModelEntries: updated });
  }

  // ── 操作：删除模型 ──────────────────────────────────
  function handleDelete(id) {
    const next = entries.filter((e) => e.id !== id);
    setEntries(next);
    if (activeId === id) {
      const newActive = next[0]?.id || '';
      setActiveId(newActive);
      save({ aiModelEntries: next, aiActiveModelId: newActive });
    } else {
      save({ aiModelEntries: next });
    }
  }

  // ── 操作：切换活跃模型 ──────────────────────────────
  function handleSelect(id) {
    setActiveId(id);
    setAdding(false);
    save({ aiActiveModelId: id });
  }

  // ── 渲染 ────────────────────────────────────────────
  if (!open) return null;

  const hasEntries = entries.length > 0;
  const activeEntry = entries.find((e) => e.id === activeId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ai-settings" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* 标题栏 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 className="modal-title" style={{ margin: 0 }}>AI 模型</h2>
          <button className="ai-icon-btn" onClick={onClose} title="关闭" aria-label="关闭">
            ✕
          </button>
        </div>

        {/* 双栏布局：左侧模型列表 + 右侧详情/新增 */}
        <div style={{ display: 'flex', gap: 12, minHeight: 300 }}>
          {/* ── 左侧：模型列表 ── */}
          <div
            ref={listRef}
            style={{
              flex: '0 0 160px',
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 7,
              background: 'var(--bg-sidebar)',
              padding: 4,
            }}
          >
            {hasEntries ? (
              entries.map((e) => (
                <div
                  key={e.id}
                  className={`ai-model-entry ${e.id === activeId ? 'active' : ''}`}
                  onClick={() => handleSelect(e.id)}
                  title={`${e.model}\n${e.baseUrl?.slice(0, 40)}`}
                >
                  <span className="ai-model-entry-name">{e.model}</span>
                  {e.id === activeId && (
                    <span className="ai-model-entry-check">✓</span>
                  )}
                  <button
                    className="ai-model-entry-del"
                    title="删除此模型"
                    onClick={(ev) => { ev.stopPropagation(); handleDelete(e.id); }}
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div className="ai-model-empty">暂无模型</div>
            )}
            {/* 添加按钮 */}
            <button
              className={`ai-model-add ${adding ? 'active' : ''}`}
              onClick={() => { setAdding(true); setActiveId(''); }}
            >
              + 添加模型
            </button>
          </div>

          {/* ── 右侧：详情面板 / 新增表单 ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {adding ? (
              /* 新增模式：填 URL+Key → 拉列表 → 勾选模型 */
              <div>
                <label className="ai-field">
                  <span>API 地址</span>
                  <input
                    className="modal-input"
                    value={addUrl}
                    onChange={(e) => setAddUrl(e.target.value)}
                    placeholder="https://api.openai.com"
                    onKeyDown={(e) => { if (e.key === 'Enter' && addUrl.trim()) handleFetchModels(); }}
                  />
                </label>
                <label className="ai-field">
                  <span>API Key</span>
                  <div className="ai-key-row">
                    <input
                      className="modal-input"
                      type="password"
                      value={addKey}
                      onChange={(e) => setAddKey(e.target.value)}
                      placeholder="sk-..."
                      onKeyDown={(e) => { if (e.key === 'Enter' && addUrl.trim()) handleFetchModels(); }}
                    />
                    <button
                      className={`modal-btn ${fetching ? 'disabled' : ''}`}
                      onClick={handleFetchModels}
                      disabled={fetching || !addUrl.trim()}
                      style={{ flex: '0 0 auto', fontSize: 11.5, padding: '6px 12px' }}
                    >
                      {fetching ? '获取中…' : '获取模型'}
                    </button>
                  </div>
                </label>

                <label className="ai-field">
                  <span>模型 ID（手动添加）</span>
                  <div className="ai-key-row">
                    <input
                      className="modal-input"
                      value={addModelId}
                      onChange={(e) => setAddModelId(e.target.value)}
                      placeholder="gpt-4o / deepseek-chat / hunyuan-pro"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && addUrl.trim() && addModelId.trim()) handleAddManual();
                      }}
                    />
                    <button
                      className={`modal-btn ${!addUrl.trim() || !addModelId.trim() ? 'disabled' : ''}`}
                      onClick={handleAddManual}
                      disabled={!addUrl.trim() || !addModelId.trim()}
                      style={{ flex: '0 0 auto', fontSize: 11.5, padding: '6px 12px' }}
                    >
                      直接添加
                    </button>
                  </div>
                  <span className="ai-field-hint">服务不支持模型列表时，可直接填写模型 ID 后点「直接添加」</span>
                </label>

                {fetchErr && <p className="ai-field-note error">{fetchErr}</p>}

                {fetchedModels.length > 0 && (
                  <div className="ai-field">
                    <span>选择要添加的模型（已选 {selectedFetched.size}/{fetchedModels.length}）</span>
                    <div className="ai-fetch-list">
                      {fetchedModels.map((mid) => (
                        <label key={mid} className="ai-fetch-item">
                          <input
                            type="checkbox"
                            checked={selectedFetched.has(mid)}
                            onChange={() => toggleFetched(mid)}
                          />
                          <span>{mid}</span>
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="modal-btn primary" onClick={handleAddSelected}>
                        添加选中（{selectedFetched.size}）
                      </button>
                      <button className="modal-btn" onClick={() => { setFetchedModels([]); setSelectedFetched(new Set()); }}>
                        取消
                      </button>
                    </div>
                  </div>
                )}

                {!fetchedModels.length && !fetching && (
                  <p className="ai-field-hint">
                    填写 API 地址和 Key，可点「获取模型」批量添加该服务下的模型；若服务不提供模型列表，可直接在「模型 ID」里填写后点「直接添加」。
                  </p>
                )}
              </div>
            ) : activeEntry ? (
              /* 编辑已有模型的详情 */
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{activeEntry.model}</span>
                </div>
                <label className="ai-field">
                  <span>API 地址</span>
                  <input
                    className="modal-input"
                    value={editBaseUrl}
                    onChange={(e) => setEditBaseUrl(e.target.value)}
                    onBlur={handleSaveDetail}
                    placeholder="https://api.openai.com"
                  />
                </label>
                <label className="ai-field">
                  <span>API Key</span>
                  <input
                    className="modal-input"
                    type="password"
                    value={editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                    onBlur={handleSaveDetail}
                    placeholder="sk-..."
                  />
                </label>
                <label className="ai-field">
                  <span>模型 ID</span>
                  <input
                    className="modal-input"
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    onBlur={handleSaveDetail}
                    placeholder="gpt-4o / deepseek-chat / …"
                  />
                  <span className="ai-field-hint">API 调用时使用的模型标识符，通常与获取到的模型名一致</span>
                </label>
              </div>
            ) : (
              /* 未选中任何模型 */
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12.5 }}>
                选择一个模型或添加新模型
              </div>
            )}
          </div>
        </div>

        {/* ── 底部：Temperature + 高级设置 ── */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div className="ai-temp-row">
            <span className="ai-temp-label">Temperature</span>
            <input
              className="ai-temp-slider"
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => { setTemperature(Number(e.target.value)); }}
              onMouseUp={() => save()}
              onTouchEnd={() => save()}
            />
            <span className="ai-temp-value">{temperature.toFixed(1)}</span>
          </div>

          <button
            className="ai-adv-toggle"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? '▼' : '▶'} 高级设置
          </button>

          {showAdvanced && (
            <div className="ai-adv-body">
              <label className="ai-field">
                <span>系统提示词（留空使用默认）</span>
                <textarea
                  className="modal-input"
                  rows={3}
                  value={sysPrompt}
                  onChange={(e) => setSysPrompt(e.target.value)}
                  onBlur={() => save()}
                  placeholder="自定义系统提示词，控制 AI 的行为风格与能力边界"
                  style={{ resize: 'vertical', fontFamily: 'var(--editor-font)', fontSize: 12.5 }}
                />
              </label>

              <div className="ai-price-grid">
                <label className="ai-field" style={{ marginBottom: 0 }}>
                  <span>输入单价（每百万 token）</span>
                  <input
                    className="modal-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceIn}
                    onChange={(e) => setPriceIn(e.target.value)}
                    onBlur={() => save()}
                    placeholder="如 OpenAI GPT-4o 约 $5"
                  />
                </label>
                <label className="ai-field" style={{ marginBottom: 0 }}>
                  <span>输出单价</span>
                  <input
                    className="modal-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceOut}
                    onChange={(e) => setPriceOut(e.target.value)}
                    onBlur={() => save()}
                  />
                </label>
                <label className="ai-field" style={{ marginBottom: 0 }}>
                  <span>缓存命中单价</span>
                  <input
                    className="modal-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceCached}
                    onChange={(e) => setPriceCached(e.target.value)}
                    onBlur={() => save()}
                  />
                </label>
                <label className="ai-field" style={{ marginBottom: 0 }}>
                  <span>货币符号</span>
                  <input
                    className="modal-input"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    onBlur={() => save()}
                    style={{ width: 56 }}
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
