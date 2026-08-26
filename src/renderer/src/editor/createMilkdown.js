import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { trailing } from '@milkdown/kit/plugin/trailing';
import { indent } from '@milkdown/kit/plugin/indent';
import { cursor } from '@milkdown/kit/plugin/cursor';
import { prism } from '@milkdown/plugin-prism';
import { remarkEmojiPlugin } from '@milkdown/plugin-emoji';
// 公式：不使用 plugin-math 打包好的 `math`，而是挑出其中的 remark 解析 / katex 配置 /
// 行内 schema，再换上自己的行间 schema 与输入规则（见 mathRules.js 的注释）。
import { remarkMathPlugin, katexOptionsCtx, mathInlineSchema } from '@milkdown/plugin-math';
import { mathBlock, mathInlineRule, mathBlockRule, mathBlockEdit } from './mathRules';
import { upload, uploadConfig } from '@milkdown/plugin-upload';
import { $nodeSchema, $inputRule } from '@milkdown/utils';
import { InputRule } from '@milkdown/prose/inputrules';
import { get as getEmoji } from 'node-emoji';
import { mermaidPreview } from './mermaidPreview';
import { focusMode, typewriterMode } from './modes';
import { slash, configureSlash } from './slashMenu';
import { taskListToggle } from './taskListToggle';
import { tableSignal } from './tableSignal';
import { searchHighlight } from './searchHighlight';
import { diffHighlight } from './diffHighlight';
import { codeBlockLanguage } from './codeBlockLanguage';
import { codeBlockBackspace } from './codeBlockBackspace';
import { headingBackspace } from './headingBackspace';
import { codeBlockEnter } from './codeBlockEnter';
import { fontSizeMark } from './fontSizeMark';
import { linkInputRule } from './linkInputRule';
import { linkBackspace } from './linkBackspace';
import { linkEnterRule } from './linkEnterRule';
import { nord } from '@milkdown/theme-nord';
import '@milkdown/theme-nord/style.css';
import '@milkdown/kit/prose/view/style/prosemirror.css';
import '@milkdown/kit/prose/gapcursor/style/gapcursor.css';
import '@milkdown/kit/prose/tables/style/tables.css';
import 'katex/dist/katex.min.css';

// 自定义 emoji schema：用原生 emoji 字符渲染（而非 twemoji 远程图片，避免 CSP 拦截与外部 CDN 依赖）。
const emojiSchema = $nodeSchema('emoji', () => ({
  group: 'inline',
  inline: true,
  attrs: { html: { default: '' } },
  parseDOM: [
    {
      tag: 'span[data-type="emoji"]',
      getAttrs: (dom) => ({ html: dom.textContent || '' }),
    },
  ],
  toDOM: (node) => {
    const span = document.createElement('span');
    span.setAttribute('data-type', 'emoji');
    span.textContent = node.attrs.html;
    return span;
  },
  parseMarkdown: {
    match: ({ type }) => type === 'emoji',
    runner: (state, node, type) => state.addNode(type, { html: node.value }),
  },
  toMarkdown: {
    match: (node) => node.type.name === 'emoji',
    runner: (state, node) => state.addNode('text', undefined, node.attrs.html),
  },
}));

// 自定义 emoji 输入规则：输入 :smile: 后自动转成原生 emoji 字符。
const emojiInputRule = $inputRule(
  (ctx) =>
    new InputRule(/(:([^:\s]+):)$/, (state, match, start, end) => {
      const content = match[0];
      if (!content) return null;
      const got = getEmoji(content);
      if (!got || content.includes(got)) return null;
      return state.tr
        .replaceRangeWith(start, end, emojiSchema.type(ctx).create({ html: got }))
        .scrollIntoView();
    })
);

const emojiPlugins = [remarkEmojiPlugin, emojiSchema, emojiInputRule].flat();

// 图片上传器：把拖拽/粘贴的图片保存到本地（通过 IPC），返回图片节点。
// 不用默认的 base64 内联（会导致文档臃肿）。
async function localImageUploader(files, schema) {
  const { image } = schema.nodes;
  if (!image) return [];
  const results = [];
  for (let i = 0; i < files.length; i++) {
    const file = files.item(i);
    if (!file || !file.type.startsWith('image/')) continue;
    try {
      const buf = await file.arrayBuffer();
      const res = await window.api.saveImage(new Uint8Array(buf), file.name);
      if (res.ok && res.url) {
        const node = image.createAndFill({ src: res.url, alt: file.name || '' });
        if (node) results.push(node);
      }
    } catch {
      // 单张图片失败不影响其他
    }
  }
  return results;
}

/**
 * 创建 Milkdown 编辑器构建器（不调用 create，交给 useEditor 管理生命周期）。
 * @param {HTMLElement} root 挂载节点
 * @param {{defaultValue?: string, onMarkdownUpdated?: (markdown:string)=>void, onSelectionUpdated?: (ctx:any)=>void}} options
 */
export function createMilkdown(root, { defaultValue = '', onMarkdownUpdated, onSelectionUpdated } = {}) {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, defaultValue);
      ctx.update(uploadConfig.key, (prev) => ({ ...prev, uploader: localImageUploader }));
      configureSlash(ctx);
      if (onMarkdownUpdated) {
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          onMarkdownUpdated(markdown);
        });
      }
      if (onSelectionUpdated) {
        // 光标/选区移动时（同步触发，Editor 侧会延迟一帧读取最新 state）
        ctx.get(listenerCtx).selectionUpdated((ctx2) => {
          onSelectionUpdated(ctx2);
        });
        // mark 类命令（加粗/斜体等）只改 doc 不改 selection，需额外监听 doc 变化
        ctx.get(listenerCtx).updated((ctx2) => {
          onSelectionUpdated(ctx2);
        });
      }
    })
    .use(codeBlockEnter)
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .use(clipboard)
    .use(trailing)
    .use(indent)
    .use(cursor)
    .use(prism)
    .use(emojiPlugins)
    .use(linkInputRule)
    .use(linkBackspace)
    .use(linkEnterRule)
    // 公式：remark 解析 + katex 配置 + 行内 schema 来自 plugin-math，
    // 行间 schema 与全部输入规则用自己的实现（修正 $$...$$ 被提前识别成行内公式的问题）
    .use([remarkMathPlugin, katexOptionsCtx, mathInlineSchema].flat())
    .use(mathBlock)
    .use(mathInlineRule)
    .use(mathBlockRule)
    .use(mathBlockEdit)
    .use(upload)
    .use(mermaidPreview)
    .use(focusMode)
    .use(typewriterMode)
    .use(taskListToggle)
    .use(tableSignal)
    .use(searchHighlight)
    .use(diffHighlight)
    .use(codeBlockLanguage)
    .use(codeBlockBackspace)
    .use(headingBackspace)
    .use(slash)
    .use(fontSizeMark)
    .use(nord);
}
