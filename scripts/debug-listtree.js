// 直接测 file-service 的授权 + listTree 流程（mock electron）
const path = require('path');
const fs = require('fs');

// mock electron：file-service.js 里 require('electron') 只用了 shell，listTree 不用
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'electron') return path.join(__dirname, '../src/main/__mock_electron.js');
  return origResolve.call(this, request, ...rest);
};

// 创建 mock electron 模块
fs.writeFileSync(
  path.join(__dirname, '../src/main/__mock_electron.js'),
  'module.exports = { shell: { showItemInFolder() {} } };\n'
);

const fileService = require('../src/main/file-service');

// 准备测试目录
const root = '/tmp/typora-folder-test';
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root + '/sub', { recursive: true });
fs.writeFileSync(root + '/a.md', 'hello');
fs.writeFileSync(root + '/b.txt', 'world');
fs.writeFileSync(root + '/sub/c.md', 'deep');
fs.writeFileSync(root + '/.hidden', 'hidden');

console.log('=== 测试 1：未授权时 listTree ===');
try {
  fileService.listTree(root);
  console.log('❌ 未授权却成功了');
} catch (e) {
  console.log('✅ 未授权被拒绝:', e.message);
}

console.log('\n=== 测试 2：授权后 listTree ===');
fileService.grantFolder(root);
const tree = fileService.listTree(root);
console.log('✅ 返回条目数:', tree.length);
tree.forEach((n) => console.log('  -', n.type, n.name, n.path));

// 清理
fs.rmSync(root, { recursive: true, force: true });
fs.unlinkSync(path.join(__dirname, '../src/main/__mock_electron.js'));
console.log('\n测试完成');
