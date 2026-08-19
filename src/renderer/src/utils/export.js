import MarkdownIt from 'markdown-it';

// 关闭 raw HTML 透传，防止用户 markdown 中的 HTML 被原样注入导出文件（XSS 防护）。
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
});

const LIGHT_CSS = `
body { font-family: -apple-system, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif; color: #333333; background: #fff; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 48px 56px; }
h1,h2,h3,h4,h5,h6 { font-weight: 600; margin: 1.4em 0 0.65em; line-height: 1.3; color: #1f1f1f; }
h1 { font-size: 1.75em; border-bottom: 1px solid #e3e3e5; padding-bottom: 0.32em; }
h2 { font-size: 1.4em; border-bottom: 1px solid #e3e3e5; padding-bottom: 0.32em; }
h3 { font-size: 1.2em; } h4 { font-size: 1.05em; } h5 { font-size: 1em; } h6 { font-size: 0.9em; color: #9a9a9a; }
a { color: #4183c4; text-decoration: none; } a:hover { text-decoration: underline; }
code { font-family: "SF Mono", Menlo, Consolas, monospace; background: #f0f1f2; padding: 0.18em 0.42em; border-radius: 4px; font-size: 0.9em; color: #d73a49; }
pre { background: #f6f7f8; padding: 16px; border-radius: 6px; border: 1px solid #e3e3e5; overflow: auto; } pre code { background: transparent; padding: 0; color: #333; }
blockquote { margin: 1em 0; padding: 0.5em 1em; color: #555; background: #f7f8f9; border-left: 3px solid #dfe2e5; border-radius: 0 6px 6px 0; }
table { border-collapse: collapse; margin: 1em 0; } th, td { border: 1px solid #e3e3e5; padding: 7px 14px; } th { background: #f6f7f8; }
img { max-width: 100%; }
hr { border: none; border-top: 1px solid #e3e3e5; margin: 2em 0; }
ul, ol { padding-left: 2em; }
li input[type="checkbox"] { margin-right: 0.4em; }
`;

const DARK_CSS = `
body { font-family: -apple-system, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif; color: #d4d4d4; background: #1f1f1f; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 48px 56px; }
h1,h2,h3,h4,h5,h6 { font-weight: 600; margin: 1.4em 0 0.65em; line-height: 1.3; color: #e6e6e6; }
h1 { font-size: 1.75em; border-bottom: 1px solid #3a3a3c; padding-bottom: 0.32em; }
h2 { font-size: 1.4em; border-bottom: 1px solid #3a3a3c; padding-bottom: 0.32em; }
h3 { font-size: 1.2em; } h4 { font-size: 1.05em; } h5 { font-size: 1em; } h6 { font-size: 0.9em; color: #777; }
a { color: #569cd6; text-decoration: none; } a:hover { text-decoration: underline; }
code { font-family: "SF Mono", Menlo, Consolas, monospace; background: #333334; padding: 0.18em 0.42em; border-radius: 4px; font-size: 0.9em; color: #ce9178; }
pre { background: #2a2a2b; padding: 16px; border-radius: 6px; border: 1px solid #3a3a3c; overflow: auto; } pre code { background: transparent; padding: 0; color: #d4d4d4; }
blockquote { margin: 1em 0; padding: 0.5em 1em; color: #b0b0b0; background: #262627; border-left: 3px solid #3f3f40; border-radius: 0 6px 6px 0; }
table { border-collapse: collapse; margin: 1em 0; } th, td { border: 1px solid #3a3a3c; padding: 7px 14px; } th { background: #2a2a2b; }
img { max-width: 100%; }
hr { border: none; border-top: 1px solid #3a3a3c; margin: 2em 0; }
ul, ol { padding-left: 2em; }
li input[type="checkbox"] { margin-right: 0.4em; }
`;

export function renderMarkdown(markdown) {
  return md.render(markdown || '');
}

// 构建可直接保存为 .html 的完整文档（内嵌样式，用于 HTML 导出与 PDF 打印）。
export function buildExportHtml(markdown, { title = 'Untitled', theme = 'light' } = {}) {
  const body = renderMarkdown(markdown);
  const css = theme === 'dark' ? DARK_CSS : LIGHT_CSS;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>`;
}
