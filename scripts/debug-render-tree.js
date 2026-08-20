const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

  // 覆盖 window.api，模拟真实打开文件夹的返回
  await page.evaluate(() => {
    const fakeTree = [
      { name: 'docs', path: '/fake/root/docs', type: 'dir' },
      { name: 'a.md', path: '/fake/root/a.md', type: 'file' },
      { name: 'b.txt', path: '/fake/root/b.txt', type: 'file' },
    ];
    window.api.openFolderDialog = async () => ({ canceled: false, folderPath: '/fake/root' });
    window.api.listTree = async () => ({ ok: true, tree: fakeTree });
    window.api.setSettings = async () => ({});
  });

  // 点欢迎页「打开文件夹」按钮
  await page.locator('.welcome-actions button', { hasText: '打开文件夹' }).click();
  await page.waitForTimeout(800);

  // 检查文件树是否渲染了条目
  const filetreeRows = await page.locator('.filetree-row').count();
  const labels = await page.locator('.filetree-label').allTextContents();
  console.log('文件树行数:', filetreeRows);
  console.log('文件树标签:', labels.join(', '));

  console.log('\n== 错误 ==', errors.length ? errors.join('\n') : '(无)');
  await browser.close();
})().catch((e) => { console.error('失败:', e); process.exit(1); });
