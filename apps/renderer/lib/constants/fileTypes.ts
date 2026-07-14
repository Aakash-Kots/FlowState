import {
  Database,
  File,
  FileCode,
  FileCog,
  FileImage,
  FileJson,
  FileTerminal,
  FileText,
  type LucideIcon,
} from 'lucide-react';

///////////
// Types //
///////////

/** The leading-icon presentation for a file: its family glyph and tint. */
type FileType = { icon: LucideIcon; color: string };

///////////////
// Constants //
///////////////

/** File-extension → family glyph + Tailwind text-color, in a VS Code / Seti
 * style. Extensions not listed fall back to a neutral file in `fileTypeForPath`.
 * Sibling to `EXT_TO_LANG` in `highlight.ts`. */
const EXT_TO_FILE_TYPE: Record<string, FileType> = {
  ts: { icon: FileCode, color: 'text-blue-400' },
  mts: { icon: FileCode, color: 'text-blue-400' },
  cts: { icon: FileCode, color: 'text-blue-400' },
  tsx: { icon: FileCode, color: 'text-blue-400' },
  js: { icon: FileCode, color: 'text-yellow-400' },
  mjs: { icon: FileCode, color: 'text-yellow-400' },
  cjs: { icon: FileCode, color: 'text-yellow-400' },
  jsx: { icon: FileCode, color: 'text-yellow-400' },
  json: { icon: FileJson, color: 'text-amber-400' },
  md: { icon: FileText, color: 'text-sky-300' },
  markdown: { icon: FileText, color: 'text-sky-300' },
  css: { icon: FileCode, color: 'text-sky-400' },
  scss: { icon: FileCode, color: 'text-sky-400' },
  html: { icon: FileCode, color: 'text-orange-400' },
  htm: { icon: FileCode, color: 'text-orange-400' },
  xml: { icon: FileCode, color: 'text-orange-400' },
  svg: { icon: FileImage, color: 'text-orange-400' },
  vue: { icon: FileCode, color: 'text-orange-400' },
  py: { icon: FileCode, color: 'text-yellow-300' },
  go: { icon: FileCode, color: 'text-cyan-400' },
  rs: { icon: FileCode, color: 'text-orange-400' },
  yml: { icon: FileCog, color: 'text-purple-300' },
  yaml: { icon: FileCog, color: 'text-purple-300' },
  toml: { icon: FileCog, color: 'text-stone-300' },
  sql: { icon: Database, color: 'text-teal-300' },
  sh: { icon: FileTerminal, color: 'text-green-400' },
  bash: { icon: FileTerminal, color: 'text-green-400' },
  zsh: { icon: FileTerminal, color: 'text-green-400' },
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

/** The family glyph + tint for a file path, or a neutral default when the
 * extension is unknown. Mirrors `langForPath`. */
export function fileTypeForPath(path: string): { Icon: LucideIcon; color: string } {
  const ext = path.split('.').pop()?.toLowerCase();
  const { icon, color } = (ext && EXT_TO_FILE_TYPE[ext]) || DEFAULT_FILE_TYPE;
  return { Icon: icon, color };
}
