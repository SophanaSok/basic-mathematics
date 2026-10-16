/* The icon helper for page scripts: the inline SVG of an icon in src/data/icons.json
   (tools/gen-icons.js writes it), as markup. It is the same markup tools/lib/shell.js `icon()`
   writes for the static shell (src/ui/icon.test.ts holds the two byte for byte): class
   `icon icon-<name>` (the optional `cls` follows, for a page's own hook), the set's viewBox,
   aria-hidden and focusable off, every path filled in currentColor, so the icon takes the
   colour and size of the text it sits in (svg.icon in assets/game.css).

   An icon is always aria-hidden: where it stood for a word, the caller keeps the word as
   text. A name that is not in the set is a mistake the tests must see and a page must
   survive: it throws under Vitest and returns "" in the browser. assets/site.js falls
   back to its old glyph when window.BMIcon is missing or gives "". */
import data from "../data/icons.json";

const ICONS = data.icons as Record<string, { paths: string[] }>;

export function iconSvg(name: string, cls?: string): string {
  const e = Object.prototype.hasOwnProperty.call(ICONS, name) ? ICONS[name] : undefined;
  if (!e) {
    if ((import.meta as { env?: { MODE?: string } }).env?.MODE === "test") throw new Error("icon `" + name + "` is not in src/data/icons.json");
    return "";
  }
  return '<svg class="icon icon-' + name + (cls ? " " + cls : "") + '" viewBox="' + data.viewBox + '" aria-hidden="true" focusable="false">' +
    e.paths.map((d) => '<path d="' + d + '" fill="currentColor"/>').join("") + "</svg>";
}

/* What the page reaches through window.BMIcon: site.js (a script that cannot import this
   module) calls svg. */
export const api = { svg: iconSvg };

if (typeof window !== "undefined") window.BMIcon = api;
