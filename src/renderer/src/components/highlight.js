// 零依赖的极简语法高亮：仅做安全转义 + 正则分词，覆盖注释/字符串/数字/布尔/键名/标点。
// 不引入任何体积较大的高亮库（如 prismjs/refractor/shiki），满足「基本高亮」即可。

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 每条规则用一个具名捕获组，避免「组合正则有多个捕获组时序号错位」的陷阱。
// 注意：pattern 用普通字符串（单引号）书写，不要写成模板字符串，否则其中的反引号会截断 JS。
const RULES = [
  { name: 'comment', cls: 'cv-comment', pat: '#.*$|\\/\\/.*$' },
  { name: 'string', cls: 'cv-string', pat: '"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`' },
  { name: 'boolean', cls: 'cv-boolean', pat: '\\b(?:true|false|null|yes|no|on|off|True|False|None|NULL)\\b' },
  { name: 'number', cls: 'cv-number', pat: '\\b-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b' },
  { name: 'key', cls: 'cv-key', pat: '[A-Za-z_][\\w.-]*(?=\\s*:)' },
  { name: 'punct', cls: 'cv-punct', pat: '[{}[\\](),:]' },
];

const COMBINED = new RegExp(
  RULES.map((r) => `(?<${r.name}>${r.pat})`).join('|'),
  'gm'
);

export function highlightCode(code) {
  if (!code) return '';
  let out = '';
  let last = 0;
  let m;
  while ((m = COMBINED.exec(code)) !== null) {
    if (m.index > last) out += esc(code.slice(last, m.index));
    let cls = null;
    for (const r of RULES) {
      if (m.groups[r.name]) {
        cls = r.cls;
        break;
      }
    }
    out += '<span class="' + cls + '">' + esc(m[0]) + '</span>';
    last = m.index + m[0].length;
    if (m[0].length === 0) COMBINED.lastIndex++; // 防止零宽匹配死循环
  }
  out += esc(code.slice(last));
  return out;
}
