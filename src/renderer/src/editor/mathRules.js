import katex from 'katex';
import { $nodeSchema, $inputRule, $prose } from '@milkdown/utils';
import { InputRule } from '@milkdown/prose/inputrules';
import { nodeRule } from '@milkdown/prose';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { TextSelection } from '@milkdown/prose/state';
import { katexOptionsCtx, mathInlineSchema } from '@milkdown/plugin-math';

const BLOCK_TYPE = 'math_block';

/**
 * 自定义 math_block schema，替代 @milkdown/plugin-math 自带的版本。
 *
 * 与自带版本的两点差异：
 * 1. `displayMode: true` —— 行间公式使用 KaTeX 的「展示模式」排版：自动居中，
 *    且求和/积分/极限等符号使用大号写法、上下标排在符号上下方（自带版本用的是
 *    行内模式，公式既不居中、排版也偏小）。
 * 2. `throwOnError: false` —— 用户输入非法 LaTeX 时以红色提示文本呈现，而不是
 *    在 toDOM 阶段抛异常导致整个文档渲染中断。
 */
export const mathBlock = $nodeSchema(BLOCK_TYPE, (ctx) => ({
  content: 'text*',
  group: 'block',
  marks: '',
  defining: true,
  atom: true,
  isolating: true,
  attrs: {
    value: { default: '' },
  },
  parseDOM: [
    {
      tag: `div[data-type="${BLOCK_TYPE}"]`,
      preserveWhitespace: 'full',
      getAttrs: (dom) => ({ value: dom.dataset.value ?? '' }),
    },
  ],
  toDOM: (node) => {
    const value = node.attrs.value ?? '';
    const dom = document.createElement('div');
    dom.dataset.type = BLOCK_TYPE;
    dom.dataset.value = value;
    try {
      katex.render(value, dom, {
        ...ctx.get(katexOptionsCtx.key),
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      // KaTeX 仍可能对极端输入抛错，退化为纯文本，保证编辑器不崩
      dom.textContent = value;
    }
    return dom;
  },
  parseMarkdown: {
    match: ({ type }) => type === 'math',
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value ?? '' });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === BLOCK_TYPE,
    runner: (state, node) => {
      state.addNode('math', undefined, node.attrs.value ?? '');
    },
  },
}));

/**
 * 行内公式输入规则：`$公式$`
 *
 * 关键点是开头的负向后行断言 `(?<!\$)`。
 * plugin-math 自带规则是 /(?:\$)([^$]+)(?:\$)$/，在输入行间公式 `$$test$$` 的过程中，
 * 当输入到 `$$test$` 时，该正则会从第 2 个 `$` 开始匹配出 `$test$`，于是提前把它转成
 * 行内公式，只在前面剩下一个孤立的 `$` —— 这就是「输入到 $$test$ 就直接变成公式」的根因。
 * 加上 `(?<!\$)` 后，紧跟在另一个 `$` 之后的 `$` 不会被当作行内公式的起始符，
 * 输入过程得以继续，直到补齐 `$$test$$` 由下面的行间规则接管。
 */
export const mathInlineRule = $inputRule((ctx) =>
  nodeRule(/(?<!\$)\$([^$\n]+)\$$/, mathInlineSchema.type(ctx), {
    beforeDispatch: ({ tr, match, start }) => {
      tr.insertText(match[1] ?? '', start + 1);
    },
  })
);

/**
 * 行间（独立成行）公式输入规则：整行 `$$公式$$`
 * 用 `^` 锚定行首，确保只有「独立成行」时才转成 math_block；
 * 段落中间出现的 `$$...$$` 保持为普通文本，交给 markdown 解析层处理。
 */
export const mathBlockRule = $inputRule((ctx) =>
  nodeRule(/^\$\$([^$\n]+)\$\$$/, mathBlock.type(ctx), {
    getAttr: (match) => ({ value: (match[1] ?? '').trim() }),
  })
);

/**
 * 行间公式是 atom 节点（内部无法直接放光标），所以提供「双击还原成源码」的编辑入口：
 * 双击公式 → 变回 `$$公式$$` 纯文本，光标停在结尾 `$$` 之前，直接改。
 * 改完把光标移出该段落（点别处 / 回车 / 方向键）即自动重新渲染，见下方 appendTransaction。
 * 与项目里 linkBackspace / codeBlockBackspace 的「还原成源码再编辑」思路保持一致。
 */
const BLOCK_SOURCE_RE = /^\$\$([^$]+)\$\$$/;

export const mathBlockEdit = $prose(
  () =>
    new Plugin({
      key: new PluginKey('math-block-edit'),
      props: {
        handleDoubleClickOn(view, _pos, node, nodePos) {
          if (node.type.name !== BLOCK_TYPE) return false;
          const paragraphType = view.state.schema.nodes.paragraph;
          if (!paragraphType) return false;

          const value = node.attrs.value ?? '';
          const source = `$$${value}$$`;
          const para = paragraphType.createChecked(null, view.state.schema.text(source));

          const tr = view.state.tr.replaceWith(nodePos, nodePos + node.nodeSize, para);
          // 光标落在结尾的 `$$` 之前：nodePos + 1（进入段落）+ 2（跳过开头 $$）+ 公式长度
          const cursor = Math.min(nodePos + 3 + value.length, tr.doc.content.size);
          tr.setSelection(TextSelection.create(tr.doc, cursor));
          view.dispatch(tr.scrollIntoView());
          return true;
        },
      },

      /**
       * 「离开即提交」：当某个顶层段落的完整内容是 `$$公式$$`，且光标已不在该段落内时，
       * 把它转回渲染好的 math_block。
       *
       * 为什么需要它：输入规则只在「新输入的字符正好落在匹配末尾」时触发。双击还原后光标
       * 停在结尾 `$$` 之前，用户改完公式（如 `$$test$$` → `$$test2$$`）时新字符不在末尾，
       * 输入规则不会触发，公式就会一直停留在源码态。改完移开光标即渲染，符合直觉。
       */
      appendTransaction(transactions, _oldState, newState) {
        if (!transactions.some((tr) => tr.docChanged || tr.selectionSet)) return null;
        const type = newState.schema.nodes[BLOCK_TYPE];
        if (!type) return null;

        const { from, to } = newState.selection;
        const targets = [];
        newState.doc.descendants((node, pos, parent) => {
          if (node.type.name !== 'paragraph') return;
          // 只处理顶层段落：列表项 / 引用内部放不下块级公式节点
          if (parent !== newState.doc) return false;
          const match = BLOCK_SOURCE_RE.exec(node.textContent);
          if (!match) return false;
          const end = pos + node.nodeSize;
          // 光标还在这个段落里 → 用户正在编辑，先别动
          if (from >= pos && to <= end) return false;
          targets.push({ start: pos, end, value: (match[1] ?? '').trim() });
          return false;
        });
        if (targets.length === 0) return null;

        const tr = newState.tr;
        // 从后往前替换，避免前面的替换让后面的位置失效
        for (let i = targets.length - 1; i >= 0; i--) {
          const t = targets[i];
          tr.replaceWith(t.start, t.end, type.create({ value: t.value }));
        }
        return tr;
      },
    })
);
