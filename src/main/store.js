'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  theme: 'light',
  lastOpenedFolder: null,
  headingNumbering: false,
  leanMode: false,
  fontSize: 13,

  // AI 对话配置：baseUrl / apiKey / model 在设置弹窗里由用户填写，
  // temperature 控制发散程度，maxContextChars 限制拼进请求的历史长度，避免超长上下文。
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
  aiTemperature: 0.3,
  aiMaxContextChars: 60000,
  // 空字符串表示使用渲染层内置的默认提示词（默认值定义在 utils/aiPrompt.js，
  // 不在主进程重复一份，避免两处漂移）。
  aiSystemPrompt: '',
  // 每百万 token 单价，用于估算费用。API 不返回价格，各家定价也常变，
  // 因此由用户按需填写；为 0 时界面只显示 token 数、不显示金额。
  aiPriceIn: 0,
  aiPriceOut: 0,
  aiPriceCached: 0,
  aiCurrency: '¥',
  // —— 多模型配置：每条 entry 是一个可选模型（含 API 地址/Key/模型名），
  //   同一 API 可有多条 entry（如 DeepSeek Pro / Flash），下拉框里各显示一条。
  //   扁平 ai* 字段始终表示"当前选中模型"的配置，供主进程直接读取。
  aiModelEntries: [],
  aiActiveModelId: '',
  };

class SettingsStore {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'settings.json');
    this.recentFile = path.join(app.getPath('userData'), 'recent.json');
  }

  _read(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return fallback;
    }
  }

  _write(file, data) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('[store] write failed:', e.message);
    }
  }

  get() {
    return { ...DEFAULTS, ...this._read(this.file, {}) };
  }

  set(partial) {
    const next = { ...this.get(), ...partial };
    this._write(this.file, next);
    return next;
  }

  getRecent() {
    return this._read(this.recentFile, []);
  }

  addRecent(p) {
    const list = this.getRecent().filter((x) => x !== p);
    list.unshift(p);
    const trimmed = list.slice(0, 20);
    this._write(this.recentFile, trimmed);
    return trimmed;
  }

  clearRecent() {
    this._write(this.recentFile, []);
    return [];
  }
}

const settingsStore = new SettingsStore();
module.exports = { settingsStore };
