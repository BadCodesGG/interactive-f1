import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import sidecar from "@/data/fixture.sidecar.json";
import { Group } from "three";
import { disposeModel, loadModel, preloadModel, registerModelSource } from "./loader";

const glb = readFileSync(path.join(process.cwd(), "public", sidecar.model));

function stubFetch() {
  const fn = vi.fn(async () => new Response(new Uint8Array(glb)));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("loadModel", () => {
  it("parses the Meshopt fixture with every sidecar part as a named node", async () => {
    stubFetch();
    const root = await loadModel(`${sidecar.model}?parts`);
    for (const id of Object.keys(sidecar.parts)) expect(root.getObjectByName(id), id).toBeTruthy();
    disposeModel(root);
  });

  it("fetches a URL once, however often it is preloaded or loaded, and gives each caller its own scene", async () => {
    const fetchSpy = stubFetch();
    const url = `${sidecar.model}?once`;
    preloadModel(url);
    const [a, b] = await Promise.all([loadModel(url), loadModel(url)]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(a).not.toBe(b);
    disposeModel(a);
    expect(b.getObjectByName("gear_a")).toBeTruthy();
  });

  it("forgets a failed fetch so the next load retries", async () => {
    const url = `${sidecar.model}?retry`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    await expect(loadModel(url)).rejects.toThrow(/503/);
    stubFetch();
    await expect(loadModel(url)).resolves.toBeTruthy();
  });

  describe("model sources", () => {
    it("builds a URL under a registered prefix with its source, without fetching, fresh on every load", async () => {
      const fetchSpy = stubFetch();
      const load = vi.fn(async (name: string) => {
        const root = new Group();
        root.name = name;
        return root;
      });
      registerModelSource("gen:", { load });
      const [a, b] = await Promise.all([loadModel("gen:widget"), loadModel("gen:widget")]);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(load).toHaveBeenCalledWith("widget");
      expect(a.name).toBe("widget");
      expect(a).not.toBe(b);
    });

    it("lets the source's own error through, naming what it could not build", async () => {
      registerModelSource("gen-fail:", { load: async (name) => Promise.reject(new Error(`No generator "${name}"`)) });
      await expect(loadModel("gen-fail:nope")).rejects.toThrow(/generator "nope"/);
    });

    it("preloads through the source and swallows a failed warm-up", async () => {
      const fetchSpy = stubFetch();
      const preload = vi.fn(async () => {
        throw new Error("chunk failed");
      });
      registerModelSource("gen-warm:", { load: async () => new Group(), preload });
      preloadModel("gen-warm:widget");
      await Promise.resolve();
      expect(preload).toHaveBeenCalledWith("widget");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("replaces a source registered twice for one prefix, and leaves other URLs to fetch", async () => {
      stubFetch();
      registerModelSource("gen-twice:", { load: async () => Object.assign(new Group(), { name: "old" }) });
      registerModelSource("gen-twice:", { load: async () => Object.assign(new Group(), { name: "new" }) });
      expect((await loadModel("gen-twice:x")).name).toBe("new");
      const glbRoot = await loadModel(`${sidecar.model}?plain`);
      expect(glbRoot.getObjectByName("gear_a")).toBeTruthy();
      disposeModel(glbRoot);
    });
  });
});
