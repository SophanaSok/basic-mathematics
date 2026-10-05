/* The types of shell.js, for vite.config.ts: without them TypeScript takes everything
   imported from a CommonJS .js file as `any`, and `npm run typecheck` would pass a call
   with the wrong arguments. Keep the two files in step. */

/** a script of a page kind: a path from the site root or a whole URL, deferred unless it says otherwise */
export type ShellScript = string | { src: string; defer: boolean } | { scenes: true };

export interface PageKind {
  /** the site's own stylesheets, as paths from the site root, in cascade order */
  styles: string[];
  /** every script, in the order it runs */
  scripts: ShellScript[];
}

export interface PageInfo {
  depth: number;
  prefix: string;
  kind: string;
  chapter: string | null;
  scenes: string[];
  nav: string;
}

export const HEAD_MARK: string;
export const TOPBAR_MARK: string;
export const BODY_INPUTS: string[];
export const PAGE_KINDS: Record<"home" | "page" | "dashboard" | "arena" | "chapter", PageKind>;
export const NAVS: Record<string, [file: string, text: string][]>;

/** true for a page written with either marker */
export function isMarked(src: string): boolean;
/** what a marked page says about itself on its body tag; throws when that is not valid */
export function pageInfo(src: string, relPath: string): PageInfo;
/** the document for a source page, and the source line each of its lines came from; throws for a page it cannot write */
export function expand(src: string, relPath: string): { html: string; lineOf(line: number): number };
/** the document a reader gets for a source page; throws for a page it cannot write */
export function renderShell(src: string, relPath: string): string;
