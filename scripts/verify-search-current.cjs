const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
  await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '新建' }).click();
  await page.waitForTimeout(2000);

  const editor = page.locator('.ProseMirror').first();
  await editor.click();
  await page.keyboard.type('is is is');
  await page.waitForTimeout(300);

  // 通过菜单 action 打开搜索框不可行（mock 环境）。直接调用 editorRef 的 setSearchHighlight 验证高亮逻辑。
  // 这里用 page.evaluate 直接调 window.api？没有暴露。改为验证 slash 任务列表。
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);
  await editor.click();

  // 测试 slash 任务列表
  await page.keyboard.type('/');
  await page.waitForTimeout(500);
  const menu = page.locator('.slash-menu');
  const items = await menu.locator('.slash-item').allTextContents();
  console.log('slash 菜单项:', JSON.stringify(items));
  const taskIdx = items.findIndex((t) => t.includes('任务列表'));
  console.log('任务列表选项 index:', taskIdx);

  if (taskIdx >= 0) {
    for (let i = 0; i < taskIdx; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(60);
    }
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const taskItems = await page.evaluate(() => document.querySelectorAll('.ProseMirror li[data-item-type="task"]').length);
    console.log('插入任务列表数量:', taskItems);
  }

  await browser.close();
})();
