import { Plugin, PluginKey } from '@milkdown/prose/state';
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

// 全局单例：语言 tag（左上角小标签）与语言选择浮层
let langTag = null;
let langMenu = null;

function hideTag() {
  if (langTag) {
    langTag.remove();
    langTag = null;
  }
  hideLangMenu();
}

function hideLangMenu() {
  if (langMenu) {
    langMenu.remove();
    langMenu = null;
  }
  document.removeEventListener('mousedown', onOutsideDown, true);
}

function onOutsideDown(e) {
  if (langMenu && !langMenu.contains(e.target) && !(langTag && langTag.contains(e.target))) {
    hideLangMenu();
  }
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

// 在代码块左上角显示语言 tag（浮层，不占文档流位置）
function showTag(view, codeBlockPos, codeBlock) {
  hideLangMenu();
  const dom = view.nodeDOM(codeBlockPos);
  if (!dom) {
    hideTag();
    return;
  }
  const rect = dom.getBoundingClientRect();
  const lang = codeBlock.attrs.language || '';

  if (!langTag) {
    langTag = document.createElement('button');
    langTag.type = 'button';
    langTag.className = 'code-lang-tag';
    document.body.appendChild(langTag);
  }
  langTag.textContent = lang || 'text';
  langTag.style.left = rect.left + 6 + 'px';
  langTag.style.top = rect.top + 6 + 'px';
  langTag.style.display = 'block';
  langTag.onmousedown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    showLangMenu(langTag, lang, (newLang) => {
      const node = view.state.doc.nodeAt(codeBlockPos);
      if (node && node.type.name === 'code_block') {
        view.dispatch(view.state.tr.setNodeMarkup(codeBlockPos, null, { language: newLang }));
        langTag.textContent = newLang || 'text';
      }
    });
  };
}

// 判断当前光标所在 code_block，返回 { pos, node } 或 null
function findCodeBlockAtCursor(view) {
  const { selection } = view.state;
  const { $head } = selection;
  for (let d = $head.depth; d >= 1; d--) {
    if ($head.node(d).type.name === 'code_block') {
      return { pos: $head.before(d), node: $head.node(d) };
    }
  }
  return null;
}

export const codeBlockLanguage = $prose(
  () =>
    new Plugin({
      key,
      props: {
        handleClick(view) {
          // 点击后延迟到下一帧，等 selection 更新
          setTimeout(() => updateTag(view), 0);
          return false;
        },
        handleKeyDown(view) {
          // 键盘移动光标后也更新
          setTimeout(() => updateTag(view), 0);
          return false;
        },
      },
      view(editorView) {
        return {
          update(view, prevState) {
            if (view.state.selection.eq(prevState.selection)) return;
            updateTag(view);
          },
          destroy() {
            hideTag();
          },
        };
      },
    })
);

function updateTag(view) {
  const found = findCodeBlockAtCursor(view);
  if (!found) {
    hideTag();
    return;
  }
  showTag(view, found.pos, found.node);
}
