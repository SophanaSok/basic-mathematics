/* The model viewer's light: a room environment (soft, even, from three's own RoomEnvironment,
   prefiltered once) for the figure's materials to reflect, a key light that casts
   a shadow and a cool rim light that does not, and a ground that shows nothing but that shadow. Kept small on purpose: the
   shadow map is 512 on the low tier and 1024 above, and its camera is boxed around a
   figure a little over 2 m tall and no wider.

   The renderer's own settings (sRGB output, ACES tone mapping, the shadow map type) are the
   view's. attach() puts the environment, lights and ground into a scene, detach() takes them
   out, dispose() frees what was made. */
import type { Scene, WebGLRenderer, DirectionalLight, Mesh, Texture, PlaneGeometry, ShadowMaterial } from "three";
import type { Quality } from "../world/tiers.ts";
import type { ThreeModel } from "./three.ts";

export interface ModelEnv {
  readonly light: DirectionalLight;
  readonly rim: DirectionalLight;
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
  pmrem.dispose();   /* the generator's own shaders and buffers; the texture it made stays valid */

  const light = new M.DirectionalLight(0xffffff, 2.5);
  light.position.set(-2.6, 4.4, 2.2);
  light.target.position.set(0, 0.9, 0);   /* the shadow falls short, behind and to the figure's left as the viewer sees it */
  light.castShadow = true;
  const size = tier === "low" ? 512 : 1024;
  light.shadow.mapSize.set(size, size);
  const cam = light.shadow.camera;
  cam.left = -1.2; cam.right = 1.2; cam.top = 1.6; cam.bottom = -0.8;   /* covers a figure up to 2.05 m tall, feet at y = 0 */
  cam.near = 0.5; cam.far = 10;
  cam.updateProjectionMatrix();
  light.shadow.bias = -0.0005;

  const rim = new M.DirectionalLight(0xcfe0ff, 1.3);
  rim.position.set(2.8, 3.0, -3.0);
  rim.target.position.set(0, 1, 0);
  rim.castShadow = false;

  const geometry: PlaneGeometry = new M.PlaneGeometry(4, 4);
  const material: ShadowMaterial = new M.ShadowMaterial({ opacity: 0.3 });
  const ground: Mesh = new M.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;

  let scene: Scene | null = null;
  return {
    light,
    rim,
    ground,
    attach(s) {
      scene = s;
      s.environment = env;
      s.environmentIntensity = 0.75;
      s.add(light);
      s.add(light.target);
      s.add(rim);
      s.add(rim.target);
      s.add(ground);
    },
    detach() {
      if (!scene) return;
      if (scene.environment === env) scene.environment = null;
      scene.environmentIntensity = 1;
      scene.remove(light);
      scene.remove(light.target);
      scene.remove(rim);
      scene.remove(rim.target);
      scene.remove(ground);
      scene = null;
    },
    dispose() {
      this.detach();
      rt.dispose();
      env.dispose();
      light.shadow.dispose();
      light.shadow.map = null;
      light.dispose();
      rim.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
