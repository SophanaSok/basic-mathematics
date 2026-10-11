/* KaTeX from npm: the typesetter and its auto-render extension. package.json pins katex
   at exactly 0.16.47 (it was 0.16.11, the version the pages loaded from its CDN, until
   advisory GHSA-cg87-wmx4-v546 moved it along the 0.16 line; the low advisory
   GHSA-238p-pmpm-9mq7 left open is fixed from 0.18.2 and only matters with the trust
   option on, which assets/site.js never sets); its stylesheet is src/vendor/katex.css,
   which the shell links.
   Every entry imports this file first, so window.renderMathInElement is there when
   site.js runs (renderMath in assets/site.js reads it and nothing else of KaTeX), as it
   was when KaTeX's two deferred CDN tags came before the module script. window.katex
   stays what it was too: a console handle, and what the browser checks look for. */
import katex from "katex";
import renderMathInElement from "katex/contrib/auto-render";

window.katex = katex;
window.renderMathInElement = renderMathInElement;
