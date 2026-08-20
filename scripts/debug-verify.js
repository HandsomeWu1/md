const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.locator('.welcome-actions button.primary').click();
  await page.waitForTimeout(2500);
  const pm = page.locator('.ProseMirror').first();

  // 需求 4：二级标题 Backspace 恢复 ## 文本
  await pm.click();
  await page.keyboard.type('## 标题');
  await page.waitForTimeout(500);
  console.log('4a. 输入 ## 标题 后 h2 数量:', await page.locator('.ProseMirror h2').count());

  // 光标移到标题开头（Home 键）
  await page.keyboard.press('Home');
  await page.waitForTimeout(200);
  // 按 Backspace
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(500);
  const h2After = await page.locator('.ProseMirror h2').count();
  const textAfter = await pm.textContent();
  console.log('4b. Backspace 后 h2 数量:', h2After, '| 文本:', JSON.stringify(textAfter.slice(0, 30)));

  // 需求 3：代码块 tag 点击才显示
  await pm.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await page.locator('.tool-btn[title="代码块"]').click();
  await page.waitForTimeout(500);

  // 初始（光标在代码块内）tag 应显示
  const tagDisplayed1 = await page.locator('.code-lang-tag').isVisible().catch(() => false);
  console.log('3a. 插入代码块后 tag 显示:', tagDisplayed1);

  // 点击代码块外（正文区域），tag 应隐藏
  await page.keyboard.press('Control+Home');
  await page.waitForTimeout(300);
  const tagDisplayed2 = await page.locator('.code-lang-tag').isVisible().catch(() => false);
  console.log('3b. 光标离开代码块后 tag 显示:', tagDisplayed2);

  console.log('\n== 错误 ==', errors.length ? errors.join('\n') : '(无)');
  await browser.close();
})().catch((e) => { console.error('失败:', e); process.exit(1); });
