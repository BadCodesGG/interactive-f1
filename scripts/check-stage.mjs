/**
 * Checks every feature route's exploded view on the production build.
 *
 * What this catches that lint, types and unit tests cannot: three landing in a route's initial JS,
 * the part list missing from the server HTML (a no-JS visitor or a crawler sees nothing), the stage
 * throwing or warning in a real browser, the explode slider or the part list not reaching the scene,
 * and the payload creeping past its budget.
 *
 * Runs against `next start` after `npm run build` (RESUME_SERVER=start, the default), on a free port,
 * or against STAGE_URL if set. Screenshots go to STAGE_SHOTS_DIR (default .stage-shots/).
 */

import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { ROOT, findRunningServer, startDevServer, stopDevServer, waitForServer } from "./lib/dev-server.mjs";

/** One entry per feature route. `slug` names the screenshots; `kind` picks the checks. */
const ROUTES = [
  { path: "/", slug: "home", kind: "explode", sidecar: "src/data/f1.sidecar.json" },
  { path: "/tunnel", slug: "tunnel", kind: "tunnel", sidecar: "src/data/f1.sidecar.json" },
];

// Present only in three's renderer, so a script containing it carries three.
const THREE_MARKER = "WebGLRenderer";
// View in AR loads <model-viewer> (its public API name survives minification) and three's GLTF and USDZ
// exporters only when a visitor presses the button, so none of them may sit in an initial chunk.
const AR_MARKERS = ["canActivateAR", "THREE.GLTFExporter", "THREE.USDZExporter"];
// Gzip -9 of the served bytes, KB. `stage` is every script the route loads lazily after the initial
// HTML (R3F, camera-controls, GLTFLoader, the Meshopt decoder, the engine) except three's own chunks,
// which are reported separately because they are shared and cached across every feature route.
// stage-client.tsx's sibling import("three") is what gives three chunks of its own.
// `ao` is the ambient-occlusion chunk (N8AO and its composer passes), loaded lazily after the stage when
// `render.ao` is on. It has its own line so the stage budget stays what it was.
const BUDGET = { initial: 260, stage: 120, ao: 100 };
// A lazy chunk counts as three's only if it carries three and none of these. A chunk mixing three
// with stage code counts against the stage budget, so bundling cannot hide stage bytes.
const STAGE_MARKERS = [
  "R3F: ", // @react-three/fiber's error messages
  "dollyToCursor", // camera-controls
  "__explode_outline", // src/engine/explode/stage.tsx
  "KHR_materials_emissive_strength", // GLTFLoader
  "MeshoptDecoder", // three's Meshopt decoder
  // The app's own stage code (livery-apply.ts's material name). R3F makes the bundler emit a table of every
  // three export, which carries "WebGLRenderer"; when the app's code shares that chunk none of the markers
  // above is in it and the chunk was counted as three's, so the stage's own bytes dropped out of the budget.
  "livery-paint",
];
// Present only in N8AO's own code (its option names and shader uniforms), never in the stage, so a
// script containing it is the AO chunk however the bundler names or splits it.
const AO_MARKER = "screenSpaceRadius";
// R3F 9.8 constructs a THREE.Clock, which three 0.186 deprecates. The only allowed THREE. warning.
const ALLOWED_WARNING = /THREE\.Clock: This module has been deprecated/;

const SHOTS = path.resolve(ROOT, process.env.STAGE_SHOTS_DIR ?? ".stage-shots");
const gz = (text) => gzipSync(Buffer.from(text), { level: 9 }).length / 1024;
const failures = [];
const check = (ok, msg) => {
  if (!ok) failures.push(msg);
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
};
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** The outer `<ul data-part-list ...>...</ul>`, nested lists included. */
function partListHtml(html) {
  const start = html.search(/<ul[^>]*\bdata-part-list\b/);
  if (start < 0) return null;
  const re = /<(\/?)ul\b/g;
  re.lastIndex = start;
  let depth = 0;
  for (let m; (m = re.exec(html)); ) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + 5);
  }
  return null;
}

async function checkRoute(browser, baseUrl, route) {
  const url = new URL(route.path, baseUrl).href;
  const sidecar = JSON.parse(readFileSync(path.join(ROOT, route.sidecar), "utf8"));
  const labels = Object.values(sidecar.parts).map((p) => p.label);
  console.log(`\n${route.path} (${route.slug})`);

  // 1. Server HTML, no JavaScript: the part list with every label.
  const html = await (await fetch(url)).text();
  const list = partListHtml(html);
  check(!!list, "server HTML has <ul data-part-list>");
  const missing = labels.filter((l) => !list?.includes(escapeHtml(l)));
  check(list && missing.length === 0, `part list carries all ${labels.length} labels${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);

  // 2. No initial script carries three.
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, "&"), baseUrl).href);
  let initialKb = 0;
  const withThree = [];
  const withAr = [];
  for (const src of srcs) {
    const body = await (await fetch(src)).text();
    initialKb += gz(body);
    if (body.includes(THREE_MARKER)) withThree.push(src);
    if (AR_MARKERS.some((m) => body.includes(m))) withAr.push(src);
  }
  check(srcs.length > 0 && withThree.length === 0, `no ${THREE_MARKER} in the ${srcs.length} initial script chunks`);
  check(withAr.length === 0, `no <model-viewer> or exporter in the ${srcs.length} initial script chunks`);

  // 3. In the browser: the stage becomes ready with no errors and no stray THREE. warnings.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const warnings = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
    if (m.type() === "warning" && m.text().includes("THREE.") && !ALLOWED_WARNING.test(m.text())) warnings.push(m.text());
  });
  const scripts = [];
  const pending = [];
  page.on("response", (res) => {
    if (res.request().resourceType() !== "script") return;
    pending.push(res.text().then((text) => scripts.push({ url: res.url(), text }), () => {}));
  });
  await page.goto(url, { waitUntil: "load" });
  const ready = await page.waitForSelector('[data-stage-ready="true"]', { timeout: 60_000 }).then(() => true, () => false);
  check(ready, "stage reports [data-stage-ready=true]");
  check((await page.locator("[data-stage-gate] canvas").count()) === 1, "one canvas mounted inside the gate");

  // 4. Assembled, then exploded through the range input.
  mkdirSync(SHOTS, { recursive: true });
  const gate = page.locator("[data-stage-gate]");
  const assembledShot = path.join(SHOTS, `${route.slug}-assembled.png`);
  await gate.screenshot({ path: assembledShot });
  await page.locator("[data-explode-range]").fill("1");
  const settled = await page.waitForSelector('[data-stage-k="1"]', { timeout: 15_000 }).then(() => true, () => false);
  check(settled, "range at 1 explodes the model (settled k = 1)");
  await page.waitForTimeout(300);
  const explodedShot = path.join(SHOTS, `${route.slug}-exploded.png`);
  await gate.screenshot({ path: explodedShot });
  console.log(`     shots: ${assembledShot}\n            ${explodedShot}`);

  // 5. The part list reaches the scene and the info panel.
  const first = page.locator("[data-part-list] button[data-part]").first();
  const firstLabel = labels[0];
  await first.click();
  const panel = page.locator("[data-info-panel]");
  const shown = await panel.getByRole("heading", { name: firstLabel }).waitFor({ timeout: 5_000 }).then(() => true, () => false);
  check(shown && (await first.getAttribute("aria-pressed")) === "true", `first part button selects "${firstLabel}" and [data-info-panel] shows it`);
  await page.locator("[data-explode-isolate]").click();
  check((await page.locator("[data-explode-isolate]").getAttribute("aria-pressed")) === "true", "Isolate toggles on with a selection");
  await page.waitForTimeout(600);
  const isolatedShot = path.join(SHOTS, `${route.slug}-isolated.png`);
  await gate.screenshot({ path: isolatedShot });
  await page.screenshot({ path: path.join(SHOTS, `${route.slug}-page.png`), fullPage: true });
  await page.locator("[data-explode-reset]").click();
  await page.locator("[data-explode-toggle]").click();
  const assembledAgain = await page.waitForSelector('[data-stage-k="0"]', { timeout: 15_000 }).then(() => true, () => false);
  check(assembledAgain, "Assemble returns the model to k = 0");

  await Promise.all(pending);
  check(errors.length === 0, `zero page and console errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  check(warnings.length === 0, `no THREE. warning besides the Clock deprecation${warnings.length ? `: ${warnings.slice(0, 3).join(" | ")}` : ""}`);

  // 6. Budgets.
  const lazy = scripts.filter((s) => !srcs.includes(s.url));
  const isAo = (s) => s.text.includes(AO_MARKER);
  const isThree = (s) => s.text.includes(THREE_MARKER) && !STAGE_MARKERS.some((m) => s.text.includes(m));
  const ao = lazy.filter(isAo);
  const core = lazy.filter((s) => !isAo(s) && isThree(s));
  const rest = lazy.filter((s) => !isAo(s) && !isThree(s));
  const coreKb = core.reduce((n, s) => n + gz(s.text), 0);
  const aoKb = ao.reduce((n, s) => n + gz(s.text), 0);
  const stageKb = rest.reduce((n, s) => n + gz(s.text), 0);
  check(initialKb <= BUDGET.initial, `initial JS ${initialKb.toFixed(1)} KB gz in ${srcs.length} chunks (budget ${BUDGET.initial} KB)`);
  check(rest.length > 0 && stageKb <= BUDGET.stage, `stage chunks ${stageKb.toFixed(1)} KB gz in ${rest.length} chunks (budget ${BUDGET.stage} KB)`);
  check(ao.length > 0 && aoKb <= BUDGET.ao, `ambient-occlusion chunk ${aoKb.toFixed(1)} KB gz in ${ao.length} chunk(s) (budget ${BUDGET.ao} KB)`);
  console.log(`     three (shared, cached across routes): ${coreKb.toFixed(1)} KB gz in ${core.length} chunk(s); all lazy JS ${(coreKb + aoKb + stageKb).toFixed(1)} KB gz`);
  await context.close();

  // 7. A phone: the canvas is bounded so the page still scrolls past it, only the canvas captures
  // touch, and a selected part's copy opens as a bottom sheet.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mp = await phone.newPage();
  const phoneErrors = [];
  mp.on("pageerror", (e) => phoneErrors.push(String(e)));
  mp.on("console", (m) => m.type() === "error" && phoneErrors.push(m.text()));
  await mp.goto(url, { waitUntil: "load" });
  const phoneReady = await mp.waitForSelector('[data-stage-ready="true"]', { timeout: 60_000 }).then(() => true, () => false);
  const layout = await mp.evaluate(() => {
    const gate = document.querySelector("[data-stage-gate]").getBoundingClientRect();
    const canvas = document.querySelector("[data-stage-gate] canvas");
    const touchNone = [...document.querySelectorAll("*")].filter((el) => getComputedStyle(el).touchAction === "none");
    return {
      gateH: gate.height,
      vh: window.innerHeight,
      scrollH: document.scrollingElement.scrollHeight,
      touchOnlyCanvas: touchNone.length > 0 && touchNone.every((el) => el === canvas),
    };
  });
  check(phoneReady && layout.gateH <= layout.vh * 0.7, `phone: stage ready, canvas height ${layout.gateH.toFixed(0)} px of a ${layout.vh} px viewport`);
  check(layout.scrollH > layout.vh, `phone: the page scrolls past the stage (${layout.scrollH} px tall)`);
  check(layout.touchOnlyCanvas, "phone: touch-action none is set on the canvas and nothing else");
  // Below the md breakpoint the part list is collapsed behind an "All N parts" toggle (the engine's part-list.tsx
  // hides its panel with max-md:hidden until it is opened), so the second part's button is not visible until then.
  const panelId = await mp.locator("[data-part-panel]").getAttribute("id");
  await mp.locator(`button[aria-controls="${panelId}"]`).click();
  await mp.locator("[data-part-list] button[data-part]").nth(1).click();
  const sheet = await mp.locator("[data-info-panel]").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { fixed: getComputedStyle(el).position === "fixed", bottom: Math.round(r.bottom), vh: window.innerHeight };
  });
  check(sheet.fixed && Math.abs(sheet.bottom - sheet.vh) <= 1, "phone: the info panel opens as a bottom sheet");
  await mp.waitForTimeout(400); // let the list's colour transition finish before the shot
  const phoneShot = path.join(SHOTS, `${route.slug}-phone.png`);
  await mp.screenshot({ path: phoneShot });
  check(phoneErrors.length === 0, `phone: zero page and console errors${phoneErrors.length ? `: ${phoneErrors.slice(0, 3).join(" | ")}` : ""}`);
  console.log(`     shots: ${path.join(SHOTS, `${route.slug}-isolated.png`)}
            ${path.join(SHOTS, `${route.slug}-page.png`)}
            ${phoneShot}`);
  await phone.close();

  // 8. The gate: reduced motion loads nothing until Load 3D; no WebGL 2 keeps the poster.
  const reducedCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const rp = await reducedCtx.newPage();
  const rThree = [];
  rp.on("response", async (res) => {
    if (res.request().resourceType() === "script" && (await res.text().catch(() => "")).includes(THREE_MARKER)) rThree.push(res.url());
  });
  await rp.goto(url, { waitUntil: "load" });
  await rp.waitForTimeout(2000);
  const optIn = (await rp.locator('[data-stage-gate="opt-in"] [data-stage-load]').count()) === 1;
  check(optIn && rThree.length === 0, `reduced motion: Load 3D offered and three not fetched (${rThree.length} chunks)`);
  await rp.locator("[data-stage-load]").click();
  const rReady = await rp.waitForSelector('[data-stage-ready="true"]', { timeout: 60_000 }).then(() => true, () => false);
  check(rReady, "reduced motion: Load 3D mounts the stage");
  await reducedCtx.close();

  const noGl = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await noGl.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return type === "webgl2" ? null : orig.call(this, type, ...rest);
    };
  });
  const np = await noGl.newPage();
  const nThree = [];
  np.on("response", async (res) => {
    if (res.request().resourceType() === "script" && (await res.text().catch(() => "")).includes(THREE_MARKER)) nThree.push(res.url());
  });
  await np.goto(url, { waitUntil: "load" });
  const unsupported = await np.waitForSelector('[data-stage-gate="unsupported"] [data-stage-note]', { timeout: 10_000 }).then(() => true, () => false);
  await np.waitForTimeout(1000);
  check(unsupported && nThree.length === 0, `no WebGL 2: poster and note shown, three not fetched (${nThree.length} chunks)`);
  await noGl.close();
}

// The tunnel carries GPUComputationRenderer, the flow shaders, the livery and the aero model on top of
// the explode stage's R3F, camera-controls and GLTFLoader, so it has its own budget line. It measured
// 100.7 KB gz when it shipped, inside the explode stage's 120 KB, so the number was not raised.
const TUNNEL_BUDGET = { initial: 260, stage: 120 };
const TUNNEL_CONTROLS = ["front-wing", "rear-wing", "mode", "floor", "ride-height", "halo", "speed", "circuit"];

/** /tunnel: the controls and score card render on the server, and changing the rear wing moves the score. */
async function checkTunnel(browser, baseUrl, route) {
  const url = new URL(route.path, baseUrl).href;
  console.log(`\n${route.path} (${route.slug})`);

  const html = await (await fetch(url)).text();
  const controls = TUNNEL_CONTROLS.filter((c) => html.includes(`data-tunnel-control="${c}"`));
  check(controls.length === TUNNEL_CONTROLS.length, `server HTML has all ${TUNNEL_CONTROLS.length} labelled controls (${controls.length} found)`);
  check(html.includes("data-lap-delta") && html.includes("Qualitative flow, table-driven score"), "server HTML has the score card and its disclaimer");
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, "&"), baseUrl).href);
  let initialKb = 0;
  const withThree = [];
  for (const src of srcs) {
    const body = await (await fetch(src)).text();
    initialKb += gz(body);
    if (body.includes(THREE_MARKER)) withThree.push(src);
  }
  check(srcs.length > 0 && withThree.length === 0, `no ${THREE_MARKER} in the ${srcs.length} initial script chunks`);

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const warnings = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
    if (m.type() === "warning" && m.text().includes("THREE.") && !ALLOWED_WARNING.test(m.text())) warnings.push(m.text());
  });
  const scripts = [];
  const pending = [];
  page.on("response", (res) => {
    if (res.request().resourceType() !== "script") return;
    pending.push(res.text().then((text) => scripts.push({ url: res.url(), text }), () => {}));
  });
  await page.goto(url, { waitUntil: "load" });
  const ready = await page.waitForSelector('[data-stage-ready="true"]', { timeout: 60_000 }).then(() => true, () => false);
  check(ready, "tunnel stage reports [data-stage-ready=true]");
  check((await page.locator("[data-stage-gate] canvas").count()) === 1, "one canvas mounted inside the gate");
  const running = (await page.locator("[data-tunnel-pause]").getAttribute("aria-pressed")) === "true";
  check(running, "airflow runs by default without reduced motion");

  mkdirSync(SHOTS, { recursive: true });
  const gate = page.locator("[data-stage-gate]");
  await page.waitForTimeout(3000); // let the particles fill the tunnel
  const baseShot = path.join(SHOTS, `${route.slug}.png`);
  await gate.screenshot({ path: baseShot });

  const lapDelta = page.locator("[data-lap-delta]");
  const before = (await lapDelta.textContent())?.trim();
  await page.locator('[data-tunnel-range="rear-wing"]').fill("10");
  const changed = await page
    .waitForFunction((b) => document.querySelector("[data-lap-delta]")?.textContent?.trim() !== b, before, { timeout: 5_000 })
    .then(() => true, () => false);
  const after = (await lapDelta.textContent())?.trim();
  check(changed && after !== before, `rear wing to +10 deg changes the lap delta (${before} -> ${after})`);
  await page.waitForTimeout(1500);
  const rearShot = path.join(SHOTS, `${route.slug}-rear-wing-10.png`);
  await gate.screenshot({ path: rearShot });

  await page.locator('[data-tunnel-control="mode"] input[value="straight"]').check({ force: true });
  await page.locator('[data-tunnel-control="floor"] input[value="aggressive"]').check({ force: true });
  await page.waitForTimeout(1500);
  const straightShot = path.join(SHOTS, `${route.slug}-straight.png`);
  await gate.screenshot({ path: straightShot });
  await page.locator("[data-tunnel-pause]").click();
  check((await page.locator("[data-tunnel-pause]").getAttribute("aria-pressed")) === "false", "Pause stops the airflow");
  await page.screenshot({ path: path.join(SHOTS, `${route.slug}-page.png`), fullPage: true });
  console.log(`     shots: ${baseShot}\n            ${rearShot}\n            ${straightShot}`);

  await Promise.all(pending);
  check(errors.length === 0, `zero page and console errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
  check(warnings.length === 0, `no THREE. warning besides the Clock deprecation${warnings.length ? `: ${warnings.slice(0, 3).join(" | ")}` : ""}`);
  const lazy = scripts.filter((s) => !srcs.includes(s.url));
  const isThree = (s) => s.text.includes(THREE_MARKER) && !STAGE_MARKERS.some((m) => s.text.includes(m));
  const stageKb = lazy.filter((s) => !isThree(s)).reduce((n, s) => n + gz(s.text), 0);
  const coreKb = lazy.filter(isThree).reduce((n, s) => n + gz(s.text), 0);
  check(initialKb <= TUNNEL_BUDGET.initial, `initial JS ${initialKb.toFixed(1)} KB gz in ${srcs.length} chunks (tunnel budget ${TUNNEL_BUDGET.initial} KB)`);
  check(stageKb > 0 && stageKb <= TUNNEL_BUDGET.stage, `tunnel stage chunks ${stageKb.toFixed(1)} KB gz (tunnel budget ${TUNNEL_BUDGET.stage} KB)`);
  console.log(`     three (shared, cached across routes): ${coreKb.toFixed(1)} KB gz`);
  await context.close();

  // A phone: fewer particles, same page, no errors.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const mp = await phone.newPage();
  const phoneErrors = [];
  mp.on("pageerror", (e) => phoneErrors.push(String(e)));
  mp.on("console", (m) => m.type() === "error" && phoneErrors.push(m.text()));
  await mp.goto(url, { waitUntil: "load" });
  const phoneReady = await mp.waitForSelector('[data-stage-ready="true"]', { timeout: 60_000 }).then(() => true, () => false);
  await mp.waitForTimeout(1500);
  await mp.screenshot({ path: path.join(SHOTS, `${route.slug}-phone.png`) });
  check(phoneReady && phoneErrors.length === 0, `phone: stage ready with zero errors${phoneErrors.length ? `: ${phoneErrors.slice(0, 3).join(" | ")}` : ""}`);
  await phone.close();

  // Reduced motion: nothing loads until Load 3D, and then the airflow starts paused.
  const reducedCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const rp = await reducedCtx.newPage();
  await rp.goto(url, { waitUntil: "load" });
  await rp.waitForTimeout(1500);
  const optIn = (await rp.locator('[data-stage-gate="opt-in"] [data-stage-load]').count()) === 1;
  await rp.locator("[data-stage-load]").click();
  const rReady = await rp.waitForSelector('[data-stage-ready="true"]', { timeout: 60_000 }).then(() => true, () => false);
  const rPaused = (await rp.locator("[data-tunnel-pause]").getAttribute("aria-pressed")) === "false";
  check(optIn && rReady && rPaused, "reduced motion: Load 3D offered, then the airflow starts paused");
  await reducedCtx.close();
}

async function main() {
  const explicit = process.env.STAGE_URL;
  const mode = process.env.RESUME_SERVER ?? "start";
  if (!explicit) {
    const running = await findRunningServer();
    if (running) throw new Error(`A dev server is running at ${running}. test:stage needs a production server: stop it, or set STAGE_URL.`);
    if (mode !== "start") throw new Error(`test:stage needs a production build, but RESUME_SERVER=${mode}. Use RESUME_SERVER=start.`);
    if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("No production build found (.next/BUILD_ID). Run `npm run build` first.");
  }
  const port = explicit ? null : await freePort();
  const baseUrl = explicit ?? `http://localhost:${port}`;
  const server = explicit ? null : startDevServer(port, "start");
  if (server) console.log(`next start on ${baseUrl} (pid ${server.pid})`);
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    await waitForServer(baseUrl, 90_000);
    const cache = await fetch(new URL(JSON.parse(readFileSync(path.join(ROOT, ROUTES[0].sidecar), "utf8")).model, baseUrl));
    check(cache.ok && /immutable/.test(cache.headers.get("cache-control") ?? ""), `model served with Cache-Control: ${cache.headers.get("cache-control")}`);
    for (const route of ROUTES) await (route.kind === "tunnel" ? checkTunnel : checkRoute)(browser, baseUrl, route);
  } finally {
    await browser.close();
    stopDevServer(server);
  }
  console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nall stage checks passed");
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
