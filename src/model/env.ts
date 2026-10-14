/* The model viewer's light: a room environment (soft, even, from three's own RoomEnvironment,
   prefiltered once) for the figure's materials to reflect, one directional light that casts
   a shadow, and a ground that shows nothing but that shadow. Kept small on purpose: the
   shadow map is 512 on the low tier and 1024 above, and its camera is boxed around a
   figure 2 m tall and no wider.

   The renderer's own settings (sRGB output, ACES tone mapping, the shadow map type) are the
   view's. attach() puts the environment, light and ground into a scene, detach() takes them
   out, dispose() frees what was made. */
import type { Scene, WebGLRenderer, DirectionalLight, Mesh, Texture, PlaneGeometry, ShadowMaterial } from "three";
import type { Quality } from "../world/tiers.ts";
import type { ThreeModel } from "./three.ts";

export interface ModelEnv {
  readonly light: DirectionalLight;
  readonly ground: Mesh;
  attach(scene: Scene): void;
  detach(): void;
  dispose(): void;
}

export function makeEnv(M: ThreeModel, renderer: WebGLRenderer, tier: Quality): ModelEnv {
  const pmrem = new M.PMREMGenerator(renderer);
  const room = new M.RoomEnvironment();
  const rt = pmrem.fromScene(room, 0.04);
  const env: Texture = rt.texture;
  room.dispose();

  const light = new M.DirectionalLight(0xffffff, 2.5);
  light.position.set(2, 4, 3);
  light.castShadow = true;
  const size = tier === "low" ? 512 : 1024;
  light.shadow.mapSize.set(size, size);
  const cam = light.shadow.camera;
  cam.left = -1.2; cam.right = 1.2; cam.top = 1.2; cam.bottom = -1.2;
  cam.near = 0.5; cam.far = 10;
  cam.updateProjectionMatrix();
  light.shadow.bias = -0.0005;

  const geometry: PlaneGeometry = new M.PlaneGeometry(4, 4);
  const material: ShadowMaterial = new M.ShadowMaterial({ opacity: 0.25 });
  const ground: Mesh = new M.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;

  let scene: Scene | null = null;
  return {
    light,
    ground,
    attach(s) {
      scene = s;
      s.environment = env;
      s.add(light);
      s.add(ground);
    },
    detach() {
      if (!scene) return;
      if (scene.environment === env) scene.environment = null;
      scene.remove(light);
      scene.remove(ground);
      scene = null;
    },
    dispose() {
      this.detach();
      pmrem.dispose();
      rt.dispose();
      env.dispose();
      light.shadow.map?.dispose();
      light.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
