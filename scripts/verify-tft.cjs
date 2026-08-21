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
  await page.locator('.toolbar button[title="插入表格"]').click();
  await page.waitForTimeout(300);
  await page.locator('.table-picker-cell').nth(2 * 10 + 2).click();
  await page.waitForTimeout(400);

  const table = page.locator('.ProseMirror table').first();
  const rows = () => table.locator('tr').count();

  // 表头行：对齐按钮显示
  await table.locator('tr').first().locator('th, td').first().click();
  await page.waitForTimeout(400);
  const ft = page.locator('.table-floating-toolbar');
  const titles = await ft.locator('button').evaluateAll((els) => els.map((e) => e.title));
  console.log('表头行按钮:', JSON.stringify(titles));

  // 添加行 → 下方
  await ft.locator('button[title="添加行"]').click();
  await page.waitForTimeout(300);
  await page.locator('.tft-submenu button', { hasText: '下方' }).click();
  await page.waitForTimeout(400);
  console.log('下方加行后 rows:', await rows());

  // 添加列 → 右侧
  await ft.locator('button[title="添加列"]').click();
  await page.waitForTimeout(300);
  await page.locator('.tft-submenu button', { hasText: '右侧' }).click();
  await page.waitForTimeout(400);
  const cols = await table.locator('tr').first().locator('th, td').count();
  console.log('右侧加列后 cols:', cols);

  // 正文行：无对齐按钮
  await table.locator('tr').nth(1).locator('th, td').first().click();
  await page.waitForTimeout(400);
  const titlesBody = await ft.locator('button').evaluateAll((els) => els.map((e) => e.title));
  console.log('正文行按钮:', JSON.stringify(titlesBody));
  console.log('正文行无对齐:', !titlesBody.includes('左对齐'));

  // 删除表格（垃圾桶图标）
  await ft.locator('button[title="删除整个表格"]').click();
  await page.waitForTimeout(400);
  console.log('删表后 table 数量:', await page.locator('.ProseMirror table').count());

  await browser.close();
})();
