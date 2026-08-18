import MarkdownIt from 'markdown-it';

// 关闭 raw HTML 透传，防止用户 markdown 中的 HTML 被原样注入导出文件（XSS 防护）。
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
});

const LIGHT_CSS = `
body { font-family: -apple-system, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2328; background: #fff; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 48px 56px; }
h1,h2,h3,h4,h5,h6 { font-weight: 600; margin: 1.2em 0 0.6em; line-height: 1.25; }
h1 { font-size: 2em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
h3 { font-size: 1.25em; } h4 { font-size: 1.1em; } h5 { font-size: 1em; } h6 { font-size: 0.9em; color: #57606a; }
a { color: #0969da; text-decoration: none; } a:hover { text-decoration: underline; }
code { font-family: "SF Mono", Menlo, Consolas, monospace; background: rgba(175,184,193,0.2); padding: 0.2em 0.4em; border-radius: 4px; font-size: 0.9em; }
pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow: auto; } pre code { background: transparent; padding: 0; }
blockquote { margin: 0; padding: 0 1em; color: #57606a; border-left: 4px solid #d0d7de; }
table { border-collapse: collapse; margin: 1em 0; } th, td { border: 1px solid #d0d7de; padding: 6px 13px; } th { background: #f6f8fa; }
img { max-width: 100%; }
hr { border: none; border-top: 1px solid #d0d7de; margin: 2em 0; }
ul, ol { padding-left: 2em; }
li input[type="checkbox"] { margin-right: 0.4em; }
`;

const DARK_CSS = `
body { font-family: -apple-system, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif; color: #e6edf3; background: #0d1117; line-height: 1.7; max-width: 860px; margin: 0 auto; padding: 48px 56px; }
h1,h2,h3,h4,h5,h6 { font-weight: 600; margin: 1.2em 0 0.6em; line-height: 1.25; }
h1 { font-size: 2em; border-bottom: 1px solid #30363d; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #30363d; padding-bottom: 0.3em; }
h3 { font-size: 1.25em; } h4 { font-size: 1.1em; } h5 { font-size: 1em; } h6 { font-size: 0.9em; color: #adbac7; }
a { color: #58a6ff; text-decoration: none; } a:hover { text-decoration: underline; }
code { font-family: "SF Mono", Menlo, Consolas, monospace; background: rgba(110,118,129,0.4); padding: 0.2em 0.4em; border-radius: 4px; font-size: 0.9em; }
pre { background: #161b22; padding: 16px; border-radius: 6px; overflow: auto; } pre code { background: transparent; padding: 0; }
blockquote { margin: 0; padding: 0 1em; color: #adbac7; border-left: 4px solid #30363d; }
table { border-collapse: collapse; margin: 1em 0; } th, td { border: 1px solid #30363d; padding: 6px 13px; } th { background: #161b22; }
img { max-width: 100%; }
hr { border: none; border-top: 1px solid #30363d; margin: 2em 0; }
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
