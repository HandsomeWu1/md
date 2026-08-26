// 块级差异比较（纯函数，不依赖 ProseMirror）。
//
// 为什么按「块」而不是按行/字符比较：AI 改写返回的是整篇或整段 Markdown，
// 而编辑器里真正能定位高亮的最小稳定单位是顶层块节点（段落、标题、列表、代码块…）。
// 按块比较能直接映射到节点位置，避免「Markdown 源码行 ↔ 编辑器位置」的换算误差。

// LCS 动态规划的规模上限。超过则放弃精细比较（返回 null），由调用方降级处理，
// 避免超大文档在主线程上跑出几秒的卡顿。
const MAX_DP_CELLS = 4000000;

/**
 * 比较两组块指纹，得出新文档中哪些块是新增/修改的。
 *
 * @param {string[]} oldKeys 旧文档的块指纹
 * @param {string[]} newKeys 新文档的块指纹
 * @returns {null | { added: number[], changed: number[], removedAt: number[], removedCount: number }}
 *   added   — 新文档中纯新增的块索引
 *   changed — 新文档中替换掉旧块的块索引
 *   removedAt — 发生纯删除的位置（新文档中的块索引，表示「此处之前有内容被删掉」）
 *   返回 null 表示文档过大、未做精细比较
 */
export function diffBlocks(oldKeys, newKeys) {
  // 先剥离公共前后缀。AI 通常只改动局部，剥离后待比较规模往往从上百降到几个，
  // 这是让 LCS 在真实场景下足够快的关键一步。
  let start = 0;
  while (start < oldKeys.length && start < newKeys.length && oldKeys[start] === newKeys[start]) {
    start += 1;
  }
  let endOld = oldKeys.length;
  let endNew = newKeys.length;
  while (endOld > start && endNew > start && oldKeys[endOld - 1] === newKeys[endNew - 1]) {
    endOld -= 1;
    endNew -= 1;
  }

  const oldMid = oldKeys.slice(start, endOld);
  const newMid = newKeys.slice(start, endNew);

  const added = [];
  const changed = [];
  const removedAt = [];

  if (!oldMid.length && !newMid.length) {
    return { added, changed, removedAt, removedCount: 0 };
  }
  // 只增不删：中间段全是新增内容。
  if (!oldMid.length) {
    for (let i = 0; i < newMid.length; i++) added.push(start + i);
    return { added, changed, removedAt, removedCount: 0 };
  }
  // 只删不增：新文档里没有对应块，只能在删除位置留一个标记。
  if (!newMid.length) {
    removedAt.push(start);
    return { added, changed, removedAt, removedCount: oldMid.length };
  }

  if (oldMid.length * newMid.length > MAX_DP_CELLS) return null;

  // LCS 长度表：dp[i][j] = oldMid[i..] 与 newMid[j..] 的最长公共子序列长度。
  const m = oldMid.length;
  const n = newMid.length;
  const dp = new Int32Array((m + 1) * (n + 1));
  const at = (i, j) => i * (n + 1) + j;
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[at(i, j)] =
        oldMid[i] === newMid[j]
          ? dp[at(i + 1, j + 1)] + 1
          : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }

  // 回溯生成编辑脚本，并把「连续的删除 + 紧随的新增」合并成「修改」——
  // 这更贴近用户认知：一段话被重写了，是修改而不是删一段再插一段。
  let i = 0;
  let j = 0;
  let removedCount = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldMid[i] === newMid[j]) {
      i += 1;
      j += 1;
      continue;
    }
    let dels = 0;
    while (i < m && (j >= n || (oldMid[i] !== newMid[j] && dp[at(i + 1, j)] >= dp[at(i, j + 1)]))) {
      i += 1;
      dels += 1;
    }
    let ins = 0;
    const insStart = j;
    while (j < n && (i >= m || (oldMid[i] !== newMid[j] && dp[at(i, j + 1)] > dp[at(i + 1, j)]))) {
      j += 1;
      ins += 1;
    }
    for (let k = 0; k < ins; k++) {
      const idx = start + insStart + k;
      // 有删除相抵的部分算「修改」，多出来的部分算「新增」。
      if (k < dels) changed.push(idx);
      else added.push(idx);
    }
    if (dels > ins) {
      removedCount += dels - ins;
      removedAt.push(start + insStart + ins);
    }
    // 防御：两侧都没推进说明回溯条件异常，直接跳出避免死循环。
    if (dels === 0 && ins === 0) break;
  }

  return { added, changed, removedAt, removedCount };
}
