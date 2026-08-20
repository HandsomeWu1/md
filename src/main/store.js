'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  theme: 'light',
  lastOpenedFolder: null,
  headingNumbering: false,
  leanMode: false,
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
