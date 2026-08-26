import MarkdownIt from 'markdown-it';

// AI 回复的 Markdown 渲染器。
// 安全要点：html 必须为 false —— 模型输出完全不可信，一旦允许 raw HTML 透传，
// 回复里的 <script>/<img onerror> 就会成为渲染进程内的 XSS 入口。
// 这与 utils/export.js 的既有约定保持一致。
const md = new MarkdownIt({
  html: false,
  linkify: false, // 不自动把裸 URL 变成链接，避免面板里出现可误点的外链
  breaks: true,
  typographer: false,
});

export function renderAiMarkdown(text) {
  return md.render(text || '');
}
