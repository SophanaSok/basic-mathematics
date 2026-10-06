/* The types of headers.js, for vite.config.ts (see shell.d.ts for why). Keep the two
   files in step. */

export interface HeaderInputs {
  /** each built page's path in dist, and its HTML */
  pages: Record<string, string>;
  /** every file of dist, as paths relative to it */
  files: string[];
  /** the text of assets/config.js */
  config: string;
}

export const FILE: string;
export const NOT_FOUND: string;
export function render(opts: HeaderInputs): string;
export function notFoundPage(): string;
export function fromDist(dist: string, root: string): HeaderInputs;
