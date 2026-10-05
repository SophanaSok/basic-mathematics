/* The world's colours and materials.

   Every colour is a token of src/styles/tokens.css, read at run time from probes inside
   the map (one per Part), so the per-Part blocks and the theme and panel blocks apply
   exactly as they do to the chapter list: the paper of the islands and the Parts' hues
   follow the reading panel (html[data-panel]), the regions' sky, fog, ground, rock and
   glow follow the theme (html[data-theme]). A theme or panel change reads them again.

   Colour handling is the scenes' (assets/scenes3d-gl.js): ColorManagement off and
   linear output, set by assets/map3d.js, so a token goes in and comes out as it is
   written, and the light below is tuned so that a face turned up shows its token
   exactly.

   Shading is toon: three bands of light from one key light (the ramp below), plus an
   even ambient term. Solid faces take their colour from their vertices (src/world/
   batch.ts), so one material draws every region, island and prop. */

import type { Three } from "./three.ts";
import type { Color, DataTexture, LineBasicMaterial, MeshBasicMaterial, MeshToonMaterial } from "three";

/* the three bands: faces turned from the key light, side-on, and facing it. With the
   light of src/world/lighting.ts a face in the top band shows its colour exactly, the
   middle band at 0.79 of it and the bottom at 0.62 (the 0.62 floor of the scenes'
   shading, assets/scenes3d.js) */
export const RAMP = [0.45, 0.7, 1];

export function toonRamp(T: Three): DataTexture {
  const data = new Uint8Array(RAMP.map((v) => Math.round(v * 255)));
  const tex = new T.DataTexture(data, RAMP.length, 1, T.RedFormat);
  tex.minFilter = T.NearestFilter;
  tex.magFilter = T.NearestFilter;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

export interface WorldMaterials {
  /** every solid of the world: vertex colours, toon shading, fog */
  solid: MeshToonMaterial;
  /** every ink edge: vertex colours */
  ink: LineBasicMaterial;
  /** the "you are here" marker */
  accent: MeshToonMaterial;
  /** the selection ring, unlit ink */
  inkFill: MeshBasicMaterial;
  /** the Foundry's smoke */
  puff: MeshToonMaterial;
  ramp: DataTexture;
  dispose(): void;
}

export function makeMaterials(T: Three): WorldMaterials {
  const ramp = toonRamp(T);
  const solid = new T.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
  const ink = new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72 });
  const accent = new T.MeshToonMaterial({ gradientMap: ramp });
  const inkFill = new T.MeshBasicMaterial();
  const puff = new T.MeshToonMaterial({ gradientMap: ramp });
  return {
    solid, ink, accent, inkFill, puff, ramp,
    dispose() { [solid, ink, accent, inkFill, puff, ramp].forEach((x) => x.dispose()); }
  };
}

/* The tokens read, and the colour names the batches use for them:
     paper under stone ok hot accent ink   the map's own (paper ones)
     part:<id> deep:<id> soft:<id>         the Part's hue (paper)
     ahead:<id>                            the cap of a chapter not started: the hue
                                           faded toward the ground (only a colour;
                                           nothing is locked)
     ground:<id> rock:<id> sky:<id> fog:<id> glow:<id> rink:<id>
                                           the region's (frame), rink its --region-ink */
const PAPER: Record<string, string> = {
  paper: "--surface", under: "--surface-2", stone: "--border-strong", ok: "--ok",
  hot: "--plot-hot", accent: "--accent", ink: "--plot-ink", plotGround: "--plot-ground"
};
const PART: Record<string, string> = {
  part: "--part", deep: "--part-deep", soft: "--part-soft",
  ground: "--region-ground", rock: "--region-rock", sky: "--region-sky", fog: "--region-fog",
  glow: "--region-glow", rink: "--region-ink"
};

export type PaletteMap = Map<string, Color>;

function tokenColour(T: Three, el: Element, name: string): Color {
  let v = window.getComputedStyle(el).getPropertyValue(name).trim();
  const c = new T.Color(0.5, 0.5, 0.5);
  if (/^#[0-9a-f]{3,8}$/i.test(v) || /^rgb/i.test(v)) {
    if (/^#[0-9a-f]{8}$/i.test(v)) v = v.slice(0, 7);
    c.setStyle(v);
  }
  return c;
}

/** every colour the world draws with, read from the probes in `probe` */
export function readPalette(T: Three, probe: Element): PaletteMap {
  const pal: PaletteMap = new Map();
  for (const k of Object.keys(PAPER)) pal.set(k, tokenColour(T, probe, PAPER[k]));
  probe.querySelectorAll("[data-part]").forEach((el) => {
    const id = el.getAttribute("data-part") || "";
    for (const k of Object.keys(PART)) pal.set(k + ":" + id, tokenColour(T, el, PART[k]));
    pal.set("ahead:" + id, pal.get("part:" + id)!.clone().lerp(pal.get("plotGround")!, 0.62));
  });
  return pal;
}

/** a lookup for the batches: an unknown name is the ink, so a typo shows rather than throws */
export function lookup(pal: PaletteMap): (key: string) => Color {
  return (key) => pal.get(key) || pal.get("ink")!;
}
