import React, { useEffect, useRef, useState } from 'react';

// AI 模型配置弹窗。复用全局 .modal 样式，保持与「新建文件/重命名」一致的观感。
//
// 只支持 OpenAI 兼容的 /chat/completions 协议：地址填到 /v1 即可，
// 也接受用户直接粘贴完整端点（主进程侧会做归一化）。
export default function AiSettingsDialog({ open, settings, onSave, onCancel }) {
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState('0.3');
  const [showKey, setShowKey] = useState(false);
  const firstRef = useRef(null);

  // 每次打开时从已保存设置回填，避免上次编辑的中间状态残留。
  useEffect(() => {
    if (!open) return;
    setBaseUrl(settings.aiBaseUrl || '');
    setApiKey(settings.aiApiKey || '');
    setModel(settings.aiModel || '');
    setTemperature(String(settings.aiTemperature ?? 0.3));
    setShowKey(false);
    const id = requestAnimationFrame(() => firstRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const t = Number(temperature);
    onSave({
      aiBaseUrl: baseUrl.trim(),
      aiApiKey: apiKey.trim(),
      aiModel: model.trim(),
      // 防御非法输入：非数字或超出 0–2 时回退到 0.3，避免请求被服务端拒绝。
      aiTemperature: Number.isFinite(t) && t >= 0 && t <= 2 ? t : 0.3,
    });
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    else if (e.key === 'Escape') onCancel();
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

        <label className="ai-field">
          <span>模型</span>
          <input
            className="modal-input"
            type="text"
            value={model}
            placeholder="gpt-4o-mini / deepseek-chat / qwen-plus …"
            onChange={(e) => setModel(e.target.value)}
          />
        </label>

        <label className="ai-field">
          <span>温度</span>
          <input
            className="modal-input narrow"
            type="number"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
          />
        </label>

        <div className="ai-field-hint">
          仅支持 OpenAI 兼容接口（/chat/completions）。密钥以明文保存在本机设置文件中。
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
