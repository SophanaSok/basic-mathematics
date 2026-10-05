/* The types of shell.js, for vite.config.ts: without them TypeScript takes everything
   imported from a CommonJS .js file as `any`, and `npm run typecheck` would pass a call
   with the wrong arguments. Keep the two files in step. */

export interface PageKind {
  /** the site's own stylesheets, as paths from the site root, in cascade order */
  styles: string[];
  /** the one module script of the kind, a path from the site root (src/entries/<kind>.js) */
  entry: string;
}

export interface PageInfo {
  depth: number;
  prefix: string;
  kind: string;
  chapter: string | null;
  nav: string;
}

export const HEAD_MARK: string;
export const TOPBAR_MARK: string;
export const BODY_INPUTS: string[];
/** the path of the boot script, which goes into every page inline */
export const BOOT: string;
/** the stylesheets every page links before its kind's own, in cascade order (src/vendor/*.css) */
export const VENDOR_STYLES: string[];
export const PAGE_KINDS: Record<"home" | "page" | "dashboard" | "arena" | "chapter", PageKind>;
export const NAVS: Record<string, [file: string, text: string][]>;
/** the modules whose text is the HUD script, in order (src/hud/*.js) */
export const HUD_MODULES: string[];

/** true for a page written with either marker */
export function isMarked(src: string): boolean;
/** what a marked page says about itself on its body tag; throws when that is not valid */
export function pageInfo(src: string, relPath: string): PageInfo;
/** read source files (the boot script) through fn instead of from the tree beside this file */
export function useSource(fn: (rel: string) => string): void;
/** the boot script's text as it is written into every page */
export function bootScript(): string;
/** the HUD script's text as it is written into every page after the top bar: window.BMHud, then the prefill */
export function hudScript(): string;
/** the HUD script without the prefill: window.BMHud alone, for a test with no page */
export function hudLibrary(): string;
/** the document for a source page, and the source line each of its lines came from; throws for a page it cannot write */
export function expand(src: string, relPath: string): { html: string; lineOf(line: number): number };
/** the document a reader gets for a source page; throws for a page it cannot write */
export function renderShell(src: string, relPath: string): string;
