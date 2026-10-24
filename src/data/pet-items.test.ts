import { describe, expect, it } from "vitest";
import { MOCHI_ACCESSORIES } from "./mochi-model.ts";
import { ACC_SLOT } from "../learn/pet.ts";
import { itemOf, PET_ITEMS, priceOf } from "./pet-items.ts";

describe("accessory items", () => {
  it("every manifest accessory has an item with its socket, file and name", () => {
    MOCHI_ACCESSORIES.forEach((a) => {
      const i = itemOf("acc:" + a.id);
      expect(i, a.id).toBeDefined();
      expect(i!.kind).toBe("acc");
      expect(i!.socket).toBe(a.socket);
      expect(i!.file).toBe(a.file);
      expect(i!.name).toBe(a.name);
    });
    expect(PET_ITEMS.filter((i) => i.kind === "acc").length).toBe(MOCHI_ACCESSORIES.length);
  });
  it("every accessory's file and socket follow the rule the companion builds them by", () => {
    PET_ITEMS.filter((i) => i.kind === "acc").forEach((i) => {
      expect(i.file, i.id).toBe("models/mochi/acc/" + i.id.slice(4) + ".glb");
      expect(i.socket, i.id).toBe("socket_" + ACC_SLOT[i.id]);
    });
  });
  it("the prices are fixed", () => {
    expect(["party-hat", "crown", "flower", "backpack", "ribbon", "bell"].map((id) => priceOf("acc:" + id))).toEqual([50, 90, 35, 60, 30, 45]);
  });
});
