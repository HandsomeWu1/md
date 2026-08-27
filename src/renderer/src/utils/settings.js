'use strict';
// 渲染层设置读写封装：
// - 维持一份内存缓存，get() 同步返回（供 React useEffect 直接读取）
// - set() 同步更新缓存并异步持久化到主进程 store（app:set-settings 会合并写入）
// - ready 是一个 Promise，缓存从主进程（或浏览器预览的 mock）加载完成后 resolve，
//   避免首屏打开设置弹窗时读到空值。

let cache = null;
let readyPromise = null;

function startLoad() {
  if (readyPromise) return;
  readyPromise = new Promise((resolve) => {
    const tryLoad = () => {
      if (window.api && window.api.getSettings) {
        window.api
          .getSettings()
          .then((s) => {
            cache = { ...(s || {}) };
            resolve(cache);
          })
          .catch(() => {
            cache = {};
            resolve(cache);
          });
      } else {
        // window.api 尚未注入（纯浏览器预览或注入时机更晚），稍后重试
        setTimeout(tryLoad, 30);
      }
    };
    tryLoad();
  });
}

// 模块加载即开始预热
startLoad();

export const settingsApi = {
  // 缓存未加载完时返回空对象（组件用 await settingsApi.ready 等待后再读即可）
  get() {
    return cache || {};
  },
  set(partial) {
    if (!cache) cache = {};
    Object.assign(cache, partial);
    if (window.api && window.api.setSettings) {
      // 异步持久化；缓存已同步更新，失败静默处理
      window.api.setSettings(partial).catch(() => {});
    }
    return cache;
  },
  // 缓存加载完成的 Promise
  get ready() {
    return readyPromise;
  },
};
