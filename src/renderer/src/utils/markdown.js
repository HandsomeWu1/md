// 纯函数：从 markdown 文本提取大纲、统计字数、执行查找/替换。

// 去除行内 markdown 格式符号，让大纲显示纯文本（如 `DescribeTrainingTaskPod` → DescribeTrainingTaskPod）。
export function stripInlineMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/`([^`]*)`/g, '$1') // 行内代码
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接
    .replace(/\*\*([^*]+)\*\*/g, '$1') // 加粗
    .replace(/__([^_]+)__/g, '$1') // 加粗（下划线）
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2') // 斜体
    .replace(/(^|[^_])_([^_]+)_/g, '$1$2') // 斜体（下划线）
    .replace(/~~([^~]+)~~/g, '$1') // 删除线
    .replace(/\\([\\`*{}[\]()#+\-.!_>])/g, '$1') // 转义字符
    .trim();
}

export function extractOutline(markdown) {
  const outline = [];
  if (!markdown) return outline;
  const lines = markdown.split('\n');
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      outline.push({ level: m[1].length, text: stripInlineMarkdown(m[2]) });
    }
  }
  return outline;
}

export function countWords(markdown) {
  const text = (markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, ' ')
    .replace(/[*_~>`|#\-\[\]()]/g, ' ');

  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const latin = (text.match(/[A-Za-z0-9]+/g) || []).length;
  return { words: cjk + latin, characters: (markdown || '').length };
}

// 在 markdown 源码层面执行查找，返回匹配项（字符区间），用于计数与替换。
export function findInMarkdown(markdown, query, caseSensitive = false) {
  const matches = [];
  if (!query) return matches;
  const hay = caseSensitive ? markdown : markdown.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  let idx = hay.indexOf(needle);
  while (idx !== -1) {
    matches.push({ from: idx, to: idx + query.length });
    idx = hay.indexOf(needle, idx + query.length);
  }
  return matches;
}

export function replaceInMarkdown(markdown, from, to, replacement) {
  return markdown.slice(0, from) + replacement + markdown.slice(to);
}

export function replaceAllInMarkdown(markdown, query, replacement, caseSensitive = false) {
  const matches = findInMarkdown(markdown, query, caseSensitive);
  if (!matches.length) return { text: markdown, count: 0 };
  let result = '';
  let cursor = 0;
  for (const m of matches) {
    result += markdown.slice(cursor, m.from) + replacement;
    cursor = m.to;
  }
  result += markdown.slice(cursor);
  return { text: result, count: matches.length };
}
