import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// 常用代码语言列表（第一个为「纯文本」）
const LANGUAGES = [
  '',
  'javascript',
  'typescript',
  'python',
  'java',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'ruby',
  'php',
  'swift',
  'kotlin',
  'html',
  'css',
  'scss',
  'json',
  'yaml',
  'xml',
  'sql',
  'bash',
  'shell',
  'markdown',
];

const key = new PluginKey('code-block-language');

// 语言选择浮层（全局单例）
let langMenu = null;

function hideLangMenu() {
  if (langMenu) {
    langMenu.remove();
    langMenu = null;
  }
  document.removeEventListener('mousedown', onOutsideDown, true);
}

function onOutsideDown(e) {
  if (langMenu && !langMenu.contains(e.target)) hideLangMenu();
}

function showLangMenu(anchorEl, currentLang, onSelect) {
  hideLangMenu();
  langMenu = document.createElement('div');
  langMenu.className = 'code-lang-menu';

  for (const lang of LANGUAGES) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'code-lang-item' + (lang === currentLang ? ' active' : '');
    item.textContent = lang || '纯文本';
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideLangMenu();
      onSelect(lang);
    });
    langMenu.appendChild(item);
  }

  document.body.appendChild(langMenu);
  const rect = anchorEl.getBoundingClientRect();
  langMenu.style.left = rect.left + 'px';
  langMenu.style.top = rect.bottom + 4 + 'px';
  document.addEventListener('mousedown', onOutsideDown, true);
}

function buildDecorations(doc) {
  const decos = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'code_block') {
      decos.push(
        Decoration.widget(
          pos,
          (view, getPos) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'code-lang-label';
            const render = () => {
              const p = getPos();
              const n = view.state.doc.nodeAt(p);
              const lang = (n && n.attrs.language) || '';
              btn.textContent = lang || 'text';
            };
            render();
            btn.addEventListener('mousedown', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const p = getPos();
              const n = view.state.doc.nodeAt(p);
              const lang = (n && n.attrs.language) || '';
              showLangMenu(btn, lang, (newLang) => {
                const pos2 = getPos();
                const node2 = view.state.doc.nodeAt(pos2);
                if (node2 && node2.type.name === 'code_block') {
                  view.dispatch(view.state.tr.setNodeMarkup(pos2, null, { language: newLang }));
                }
              });
            });
            return btn;
          },
          { side: -1 }
        )
      );
    }
  });
  return DecorationSet.create(doc, decos);
}

// 在代码块上方渲染语言标签，点击弹出语言选择菜单（参考 Typora 交互）。
export const codeBlockLanguage = $prose(
  () =>
    new Plugin({
      key,
      state: {
        init: (_, { doc }) => buildDecorations(doc),
        apply(tr, set) {
          if (!tr.docChanged) return set.map(tr.mapping, tr.doc);
          return buildDecorations(tr.doc);
        },
      },
      props: {
        decorations(state) {
          return this.getState(state);
        },
      },
    })
);
