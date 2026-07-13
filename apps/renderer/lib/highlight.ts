import Prism from 'prismjs';
// Language grammars, imported in dependency order (each mutates the global
// `Prism`). `markup`, `css`, `clike`, and `javascript` ship in Prism core; the
// rest are the languages we actually see in diffs and chat code blocks.
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-toml';

///////////////
// Constants //
///////////////

/** File-extension → Prism language id. Extensions not listed render unhighlighted. */
const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  scss: 'css',
  html: 'markup',
  htm: 'markup',
  xml: 'markup',
  svg: 'markup',
  vue: 'markup',
  md: 'markdown',
  markdown: 'markdown',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  py: 'python',
  go: 'go',
  rs: 'rust',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
  toml: 'toml',
};

/////////////
// Helpers //
/////////////

/** The Prism language id for a file path, or null when we can't highlight it. */
export function langForPath(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext ? (EXT_TO_LANG[ext] ?? null) : null;
}

/** The Prism language id for a markdown fence's `language-*` class, or null. */
export function langForFence(className: string | undefined): string | null {
  const match = /language-(\w+)/.exec(className ?? '');
  if (!match) return null;
  const id = match[1].toLowerCase();
  // Fences name a language directly; fall back through the extension map so
  // aliases like ```sh or ```yml resolve too.
  return Prism.languages[id] ? id : (EXT_TO_LANG[id] ?? null);
}

/**
 * Tokenize `code` into HTML `<span class="token …">`s for the given Prism
 * language. Returns null when the language is unknown or unloaded, so callers
 * can fall back to rendering the raw text. Prism escapes the markup it emits.
 */
export function highlightToHtml(code: string, lang: string | null): string | null {
  if (!lang) return null;
  const grammar = Prism.languages[lang];
  if (!grammar) return null;
  return Prism.highlight(code, grammar, lang);
}
