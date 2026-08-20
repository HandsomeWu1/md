const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.locator('.welcome-actions button.primary').click();
  await page.waitForTimeout(2500);
  const pm = page.locator('.ProseMirror').first();

  // 插入代码块
  await pm.click();
  await page.locator('.tool-btn[title="代码块"]').click();
  await page.waitForTimeout(600);
  const preCount = await page.locator('.ProseMirror pre').count();
  console.log('插入代码块后 pre 数量:', preCount);

  // 在代码块内输入文字
  await page.keyboard.type('console.log("hi")');
  await page.waitForTimeout(400);

  // 模拟「点击代码块」：点击 pre 元素内部
  const pre = page.locator('.ProseMirror pre').first();
  await pre.click();
  await page.waitForTimeout(400);

  const tagCount = await page.locator('.code-lang-tag').count();
  const tagVisible = await page.locator('.code-lang-tag').isVisible().catch(() => false);
  const tagText = await page.locator('.code-lang-tag').textContent().catch(() => '');
  console.log('点击代码块后 tag 数量:', tagCount, '| 可见:', tagVisible, '| 文字:', JSON.stringify(tagText));

  // 点击编辑器空白处（正文），tag 应隐藏
  await page.keyboard.press('Control+Home');
  await page.waitForTimeout(300);
  const tagVisible2 = await page.locator('.code-lang-tag').isVisible().catch(() => false);
  console.log('光标离开代码块后 tag 可见:', tagVisible2);

  console.log('\n== code-lang 日志 ==');
  logs.filter((l) => l.includes('[code-lang]')).forEach((l) => console.log(l));

  await browser.close();
})().catch((e) => { console.error('失败:', e); process.exit(1); });
