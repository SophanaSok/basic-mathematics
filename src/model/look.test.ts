/* The model look built in Node with the Three.js package itself, from a synthetic figure
   (a skinned box with an accent material and a map, a glowing plain mesh, five clips named
   as the forms' are): tinting never compounds, a clip plays and finishes and says so, a
   missing clip is refused, the idle loop starts and parks, `still` keeps it off, and
   dispose frees geometry, material, map and bone texture. */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CLIPS } from "../data/form-models.ts";
import { makeLook } from "./look.ts";
import type { ModelAsset } from "./index.ts";
import type { ThreeModel } from "./three.ts";

const M = THREE as unknown as ThreeModel;

function figure(clips: readonly string[] = CLIPS) {
  const root = new THREE.Bone(), tip = new THREE.Bone();
  root.name = "root"; tip.name = "tip";
  root.add(tip);
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  const n = geometry.attributes.position.count;
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.82, 0.82, 0.82), map });
  accent.name = "accent";
  const skinned = new THREE.SkinnedMesh(geometry, accent);
  skinned.add(root);
  skinned.bind(new THREE.Skeleton([root, tip]));
  const glow = new THREE.MeshStandardMaterial({ emissive: new THREE.Color(1, 1, 0) });
  glow.name = "glow";
  const plain = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), glow);
  const scene = new THREE.Group();
  scene.add(skinned, plain);
  const tracks = [new THREE.QuaternionKeyframeTrack("root.quaternion", [0, 1], [0, 0, 0, 1, 0, 0.3, 0, 0.954])];
  const asset: ModelAsset = { stage: 3, scene, clips: clips.map((c) => new THREE.AnimationClip(c, 1, tracks)), triangles: 12 };
  return { asset, geometry, accent, map, skinned };
}

function events(target: { addEventListener(t: "dispose", f: () => void): void }): () => number {
  let n = 0;
  target.addEventListener("dispose", () => { n++; });
  return () => n;
}

describe("a model look", () => {
  it("tints the accent from the file's colour, never on top of the last tint", () => {
    const { asset, accent } = figure();
    const look = makeLook(M, asset, false);
    look.tint(new THREE.Color(0.5, 1, 0.25));
    expect(accent.color.r).toBeCloseTo(0.41, 5);
    expect(accent.color.g).toBeCloseTo(0.82, 5);
    look.tint(new THREE.Color(0.5, 1, 0.25));
    expect(accent.color.r).toBeCloseTo(0.41, 5);
    expect(accent.color.b).toBeCloseTo(0.205, 5);
    look.dispose();
  });

  it("casts shadows, does not receive them, and reports a height and triangles", () => {
    const { asset, skinned } = figure();
    const look = makeLook(M, asset, false);
    expect(skinned.castShadow).toBe(true);
    expect(skinned.receiveShadow).toBe(false);
    expect(look.kind).toBe("model");
    expect(look.height).toBeGreaterThan(0);
    expect(look.triangles).toBe(12);
    look.dispose();
  });

  it("plays a clip, cross-fading from idle, and says when it has finished", () => {
    const { asset } = figure();
    const look = makeLook(M, asset, false);
    const done: string[] = [];
    look.onFinished((c) => done.push(c));
    look.setIdle(true);
    expect(look.run({ type: "play", clip: "wave", from: "idle", ms: 200 })).toBe(true);
    expect(look.active()).toBe(true);
    for (let i = 0; i < 13; i++) look.tick(100);
    expect(done).toEqual(["wave"]);
    look.dispose();
  });

  it("stays active through a fade and goes quiet when the emote and fade are done and idle is off", () => {
    const { asset } = figure();
    const look = makeLook(M, asset, false);
    look.run({ type: "play", clip: "bow", from: null, ms: 0 });
    expect(look.active()).toBe(true);
    for (let i = 0; i < 12; i++) look.tick(100);
    expect(look.active()).toBe(false);
    look.dispose();
  });

  it("refuses a clip the file does not have", () => {
    const { asset } = figure(["idle"]);
    const look = makeLook(M, asset, false);
    expect(look.run({ type: "play", clip: "wave", from: "idle", ms: 200 })).toBe(false);
    expect(look.active()).toBe(false);
    look.dispose();
    const bare = makeLook(M, figure([]).asset, false);
    expect(bare.run({ type: "play", clip: "idle", from: null, ms: 0 })).toBe(false);
    bare.setIdle(true);
    expect(bare.active()).toBe(false);
    bare.dispose();
  });

  it("runs the idle loop while awake and parks it when off", () => {
    const { asset } = figure();
    const look = makeLook(M, asset, false);
    expect(look.active()).toBe(false);
    look.setIdle(true);
    expect(look.active()).toBe(true);
    look.tick(300);
    look.setIdle(false);
    expect(look.active()).toBe(false);
    look.dispose();
  });

  it("with still on, never starts the idle loop but still plays an emote", () => {
    const { asset } = figure();
    const look = makeLook(M, asset, true);
    look.setIdle(true);
    expect(look.active()).toBe(false);
    const done: string[] = [];
    look.onFinished((c) => done.push(c));
    expect(look.run({ type: "play", clip: "spin", from: null, ms: 0 })).toBe(true);
    expect(look.active()).toBe(true);
    for (let i = 0; i < 12; i++) look.tick(100);
    expect(done).toEqual(["spin"]);
    look.dispose();
  });

  it("an unsubscribed listener hears nothing", () => {
    const { asset } = figure();
    const look = makeLook(M, asset, false);
    const done: string[] = [];
    const off = look.onFinished((c) => done.push(c));
    off();
    look.run({ type: "play", clip: "flex", from: null, ms: 0 });
    for (let i = 0; i < 12; i++) look.tick(100);
    expect(done).toEqual([]);
    look.dispose();
  });

  it("dispose frees the geometry, the material, the map and the bone texture, and leaves the parent", () => {
    const { asset, geometry, accent, map, skinned } = figure();
    const parent = new THREE.Scene();
    parent.add(asset.scene);
    skinned.skeleton.computeBoneTexture();
    const bone = skinned.skeleton.boneTexture;
    const g = events(geometry), m = events(accent), t = events(map);
    const b = bone ? events(bone) : () => 0;
    const look = makeLook(M, asset, false);
    look.dispose();
    expect([g(), m(), t()]).toEqual([1, 1, 1]);
    if (bone) expect(b()).toBeGreaterThan(0);
    expect(asset.scene.parent).toBeNull();
  });
});
