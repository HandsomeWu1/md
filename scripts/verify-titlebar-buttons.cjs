const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '新建' }).click();
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const actions = document.querySelector('.titlebar-actions');
    const btns = actions ? Array.from(actions.querySelectorAll('.tb-btn')) : [];
    const center = document.querySelector('.titlebar-center');
    const cs = center ? getComputedStyle(center) : null;
    return {
      actionsExists: !!actions,
      actionsBtnTitles: btns.map((b) => b.title || b.getAttribute('aria-label')),
      actionsBtnCount: btns.length,
      // 是否还有 tb-btn 游离在 titlebar 直接子级（应该在 actions 内）
      directTbBtnCount: document.querySelectorAll('.titlebar > .tb-btn').length,
      centerAppRegion: cs ? (cs.webkitAppRegion || cs.appRegion || 'n/a') : 'n/a',
      centerDisplay: cs ? cs.display : 'n/a',
      // 中心容器的 rect
      centerRect: center ? JSON.stringify(center.getBoundingClientRect()) : 'n/a',
      trafficAppRegion: (() => {
        const t = document.querySelector('.titlebar-traffic');
        const tcs = t ? getComputedStyle(t) : null;
        return tcs ? (tcs.webkitAppRegion || tcs.appRegion || 'n/a') : 'n/a';
      })(),
    };
  });
  console.log(JSON.stringify(info, null, 2));

  // 截图标题栏
  await page.screenshot({ path: '/tmp/verify-titlebar-buttons.png', clip: { x: 0, y: 0, width: 1400, height: 60 } });

  // 极简模式下 actions 应隐藏
  await page.locator('.titlebar-actions button[title*="极简"]').first().click();
  await page.waitForTimeout(300);
  const leanInfo = await page.evaluate(() => {
    const actions = document.querySelector('.titlebar-actions');
    const acs = actions ? getComputedStyle(actions) : null;
    return {
      actionsDisplay: acs ? acs.display : 'n/a',
      leanClass: document.querySelector('.app').classList.contains('lean-mode'),
    };
  });
  console.log('lean:', JSON.stringify(leanInfo));
  await page.screenshot({ path: '/tmp/verify-titlebar-buttons-lean.png', clip: { x: 0, y: 0, width: 1400, height: 60 } });

  await browser.close();
})();
