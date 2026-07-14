import type { ComponentType } from 'react';
import { Database, File, FileCog, FileImage, FileText } from 'lucide-react';
import {
  SiC,
  SiCplusplus,
  SiCss,
  SiElixir,
  SiGnubash,
  SiGo,
  SiGraphql,
  SiHtml5,
  SiJavascript,
  SiJson,
  SiKotlin,
  SiMarkdown,
  SiPhp,
  SiPython,
  SiReact,
  SiRuby,
  SiRust,
  SiSwift,
  SiTypescript,
  SiVuedotjs,
  SiYaml,
} from 'react-icons/si';

///////////
// Types //
///////////

/** Any icon component (lucide glyph or react-icons brand logo) rendered by
 * className-based sizing/tinting. */
type FileGlyph = ComponentType<{ className?: string }>;

/** The leading-icon presentation for a file: its glyph and tint. */
type FileType = { icon: FileGlyph; color: string };

///////////////
// Constants //
///////////////

/** Exact filename → glyph + tint, matched before the extension lookup so
 * dotfiles and extensionless config files (which have no useful extension)
 * resolve correctly. */
const FILENAME_TO_FILE_TYPE: Record<string, FileType> = {
  '.gitignore': { icon: FileCog, color: 'text-neutral-400' },
  '.gitattributes': { icon: FileCog, color: 'text-neutral-400' },
  dockerfile: { icon: FileCog, color: 'text-sky-400' },
};

/** File-extension → brand logo (react-icons) or family glyph (lucide) + Tailwind
 * text-color, in a VS Code / Seti style. Code files use their real language logo;
 * config/generic types fall back to a lucide glyph. Extensions not listed fall
 * back to a neutral file in `fileTypeForPath`. Sibling to `EXT_TO_LANG` in
 * `highlight.ts`. */
const EXT_TO_FILE_TYPE: Record<string, FileType> = {
  ts: { icon: SiTypescript, color: 'text-[#3178c6]' },
  mts: { icon: SiTypescript, color: 'text-[#3178c6]' },
  cts: { icon: SiTypescript, color: 'text-[#3178c6]' },
  tsx: { icon: SiReact, color: 'text-[#61dafb]' },
  js: { icon: SiJavascript, color: 'text-[#f7df1e]' },
  mjs: { icon: SiJavascript, color: 'text-[#f7df1e]' },
  cjs: { icon: SiJavascript, color: 'text-[#f7df1e]' },
  jsx: { icon: SiReact, color: 'text-[#61dafb]' },
  json: { icon: SiJson, color: 'text-amber-400' },
  md: { icon: SiMarkdown, color: 'text-sky-300' },
  markdown: { icon: SiMarkdown, color: 'text-sky-300' },
  css: { icon: SiCss, color: 'text-[#1572b6]' },
  scss: { icon: SiCss, color: 'text-[#cd6799]' },
  html: { icon: SiHtml5, color: 'text-[#e34f26]' },
  htm: { icon: SiHtml5, color: 'text-[#e34f26]' },
  xml: { icon: FileText, color: 'text-orange-400' },
  svg: { icon: FileImage, color: 'text-orange-400' },
  vue: { icon: SiVuedotjs, color: 'text-[#4fc08d]' },
  py: { icon: SiPython, color: 'text-[#3776ab]' },
  go: { icon: SiGo, color: 'text-[#00add8]' },
  rs: { icon: SiRust, color: 'text-orange-300' },
  rb: { icon: SiRuby, color: 'text-[#cc342d]' },
  php: { icon: SiPhp, color: 'text-[#777bb4]' },
  swift: { icon: SiSwift, color: 'text-[#f05138]' },
  kt: { icon: SiKotlin, color: 'text-[#7f52ff]' },
  cpp: { icon: SiCplusplus, color: 'text-[#00599c]' },
  cc: { icon: SiCplusplus, color: 'text-[#00599c]' },
  c: { icon: SiC, color: 'text-[#a8b9cc]' },
  ex: { icon: SiElixir, color: 'text-[#a06cc0]' },
  exs: { icon: SiElixir, color: 'text-[#a06cc0]' },
  graphql: { icon: SiGraphql, color: 'text-[#e10098]' },
  gql: { icon: SiGraphql, color: 'text-[#e10098]' },
  yml: { icon: SiYaml, color: 'text-red-300' },
  yaml: { icon: SiYaml, color: 'text-red-300' },
  toml: { icon: FileCog, color: 'text-stone-300' },
  sql: { icon: Database, color: 'text-teal-300' },
  sh: { icon: SiGnubash, color: 'text-green-400' },
  bash: { icon: SiGnubash, color: 'text-green-400' },
  zsh: { icon: SiGnubash, color: 'text-green-400' },
  env: { icon: FileCog, color: 'text-yellow-300' },
  png: { icon: FileImage, color: 'text-purple-300' },
  jpg: { icon: FileImage, color: 'text-purple-300' },
  jpeg: { icon: FileImage, color: 'text-purple-300' },
  gif: { icon: FileImage, color: 'text-purple-300' },
  webp: { icon: FileImage, color: 'text-purple-300' },
};

/** Neutral fallback for paths with no recognized extension. */
const DEFAULT_FILE_TYPE: FileType = { icon: File, color: 'text-neutral-400' };

/////////////
// Helpers //
/////////////

/** Trailing path segment (filename), lowercased for matching. */
function basename(path: string): string {
  const base = path.split('/').pop();
  return (base && base.length > 0 ? base : path).toLowerCase();
}

/** The glyph + tint for a file path: an exact-filename match (dotfiles, config)
 * first, then extension, then a neutral default. `.env`, `.env.local`, etc. all
 * resolve to the config glyph regardless of the trailing segment. */
export function fileTypeForPath(path: string): { Icon: FileGlyph; color: string } {
  const name = basename(path);
  const byName = FILENAME_TO_FILE_TYPE[name] ?? (name.startsWith('.env') ? EXT_TO_FILE_TYPE.env : undefined);
  const ext = name.split('.').pop();
  const byExt = ext ? EXT_TO_FILE_TYPE[ext] : undefined;
  const { icon, color } = byName ?? byExt ?? DEFAULT_FILE_TYPE;
  return { Icon: icon, color };
}
