'use strict';
const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

// 授权模型：渲染进程只能访问用户通过「打开文件/打开文件夹」显式授权的路径。
// 任意路径的读写都会被拒绝，防止被劫持后的渲染进程越权访问磁盘。
const grantedRoots = new Set();
const grantedFiles = new Set();

function normalize(p) {
  return path.normalize(p);
}

function isWithin(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isAllowed(target) {
  const t = normalize(target);
  if (grantedFiles.has(t)) return true;
  for (const root of grantedRoots) {
    if (isWithin(root, t)) return true;
  }
  return false;
}

function requireAllowed(target) {
  if (!isAllowed(target)) {
    throw new Error(`拒绝访问路径（未授权）: ${target}`);
  }
}

function grantFolder(root) {
  grantedRoots.add(normalize(root));
}

function grantFile(file) {
  grantedFiles.add(normalize(file));
}

// 惰性加载：只列出一层目录内容（不递归）。
// 之前递归遍历整个树（包括 node_modules 等大目录）会导致打开文件夹时卡死或权限错误。
function listTree(root) {
  requireAllowed(root);
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (err) {
    console.error('[file-service] readdirSync 失败:', root, '-', err.message);
    throw err;
  }
  try {
    return entries
      .filter((d) => !d.name.startsWith('.'))
      .map((d) => {
        const full = path.join(root, d.name);
        const isDir = d.isDirectory();
        return { name: d.name, path: full, type: isDir ? 'dir' : 'file' };
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        // 不指定 locale，避免部分环境 ICU 不支持 zh-Hans-CN 导致 RangeError
        return a.name.localeCompare(b.name);
      });
  } catch (err) {
    console.error('[file-service] listTree 处理失败:', root, '-', err && err.stack ? err.stack : err);
    throw err;
  }
}

function readFile(p) {
  requireAllowed(p);
  return fs.readFileSync(p, 'utf8');
}

function writeFile(p, content) {
  requireAllowed(p);
  fs.writeFileSync(p, content, 'utf8');
  return fs.statSync(p).mtime.toISOString();
}

function createFile(dir, name) {
  requireAllowed(dir);
  const full = path.join(dir, name);
  if (fs.existsSync(full)) throw new Error('文件已存在');
  fs.writeFileSync(full, '', 'utf8');
  return full;
}

function createFolder(dir, name) {
  requireAllowed(dir);
  const full = path.join(dir, name);
  fs.mkdirSync(full);
  return full;
}

function rename(oldP, newP) {
  requireAllowed(oldP);
  requireAllowed(path.dirname(newP));
  fs.renameSync(oldP, newP);
  return newP;
}

function deletePath(p) {
  requireAllowed(p);
  fs.rmSync(p, { recursive: true, force: true });
}

function reveal(p) {
  requireAllowed(p);
  shell.showItemInFolder(p);
}

module.exports = {
  grantFolder,
  grantFile,
  isAllowed,
  listTree,
  readFile,
  writeFile,
  createFile,
  createFolder,
  rename,
  deletePath,
  reveal,
};
