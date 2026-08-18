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

function listTree(root) {
  requireAllowed(root);
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.'))
    .map((d) => {
      const full = path.join(root, d.name);
      const isDir = d.isDirectory();
      const node = { name: d.name, path: full, type: isDir ? 'dir' : 'file' };
      if (isDir) node.children = listTree(full);
      return node;
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
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
