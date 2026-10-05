/* The types of vendor.js, for vite.config.ts, as lib/shell.d.ts is for shell.js: a
   CommonJS .js import is `any` to TypeScript otherwise. Keep the two files in step
   (checks.test.js compares the names). */

export interface VendorModule {
  /** the file's path from the site root (src/vendor/<name>.js or .css) */
  file: string;
  /** the packages its import and export statements name */
  packages: string[];
  /** those packages and every package they depend on, by the installed package.json files */
  all: string[];
}

export interface VendorPackage {
  /** the package's name, as installed */
  name: string;
  version: string;
  /** the `license` field of its package.json */
  license: string;
  /** the vendor modules that bring it in */
  by: string[];
  /** the licence file it ships (LICENSE, LICENSE.md, …), or null */
  file: string | null;
  /** that file's text, or "" */
  text: string;
}

/** where the vendor modules live: "src/vendor" */
export const DIR: string;
/** the licence notice the build writes into dist: "bundle/LICENSES.txt" */
export const NOTICE: string;
/** "@scope/name/sub" -> "@scope/name"; "name/sub" -> "name" */
export function packageName(specifier: string): string;
/** the package a node_modules path is from, or null for a path not under node_modules */
export function packageOf(rel: string): string | null;
/** a package and every package it depends on, by the installed package.json files */
export function closure(pkg: string, out?: string[]): string[];
/** every src/vendor/*.js and *.css with the packages it brings in */
export function vendorModules(): VendorModule[];
/** the vendor module a node_modules file belongs to; throws when there is none or more than one */
export function vendorOf(rel: string): VendorModule;
/** every package the vendor modules bring in, with their dependencies, each once, with its licence */
export function packages(): VendorPackage[];
/** the text of bundle/LICENSES.txt, from the installed packages */
export function licenseNotice(): string;
