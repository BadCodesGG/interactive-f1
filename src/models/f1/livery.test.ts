import { describe, expect, it } from "vitest";
import { BoxGeometry, Mesh, MeshStandardMaterial, Object3D, type WebGLProgramParametersWithUniforms } from "three";
import { applyShowroomLivery } from "./livery";

/** The fragment shader the pearl body compiles to: the include tokens the livery patches, run through its hook. */
function pearlShader() {
  const root = new Object3D();
  root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ name: "BodyLivery" })));
  applyShowroomLivery(root);
  const material = (root.children[0] as Mesh).material as MeshStandardMaterial;
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>",
    fragmentShader: "#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>",
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, null as never);
  return shader;
}

function pearlFragment(): string {
  return pearlShader().fragmentShader;
}

/** The body of one GLSL function, from its signature to the closing brace at column 0. */
function glslFunction(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `${signature} is in the shader`).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf("\n}\n", start));
}

describe("the showroom pearl livery shader", () => {
  const fragment = pearlFragment();
  const pearl = glslFunction(fragment, "vec3 livPearl(");

  it("draws every pearl and navy boundary as a hard antialiased step, not a blend over a distance", () => {
    for (const edge of ["livStep(abs(n.z)", "livStep(above, 0.0)", "livStep(p.x, -2.3)", "livStep(n.y, -0.475)"]) expect(pearl).toContain(edge);
    // The only soft ramps left: the undercut line rising toward the rear, and the roof-to-flank fade of the centreline stripe.
    const soft = [...pearl.matchAll(/smoothstep\(([^,]+),([^,]+),([^,)]+)\)/g)].map((m) => m.slice(1).join(",").replace(/\s/g, ""));
    expect(soft).toEqual(["-1.4,1.2,p.x", "0.55,0.8,n.y"]);
  });

  it("keeps the gold pinstripe a thin band", () => {
    expect(pearl).toContain("livBand(above, 0.012, 0.026)");
    expect(pearl).toContain("livBand(p.z, -0.012, 0.012)");
  });

  it("decides its paint regions from the continuous normal the build stores, falling back to the shading normal", () => {
    const vertex = pearlShader().vertexShader;
    expect(vertex).toContain("attribute vec3 _livnormal;");
    expect(vertex).toContain("if (dot(_livnormal, _livnormal) > 0.25) vLivNor = normalize(mat3(uRest) * _livnormal);");
    // Only the pearl reads it: a carbon part compiles without the attribute.
    const root = new Object3D();
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ name: "Carbon" })));
    applyShowroomLivery(root);
    const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "#include <common>" } as unknown as WebGLProgramParametersWithUniforms;
    ((root.children[0] as Mesh).material as MeshStandardMaterial).onBeforeCompile(shader, null as never);
    expect(shader.vertexShader).not.toContain("_livnormal");
  });

  it("sizes the edge blend from the screen-space rate of change, capped so a crease cannot smear it", () => {
    expect(glslFunction(fragment, "float livStep(")).toContain("clamp(fwidth(v), 1e-5, 0.1)");
  });
});
