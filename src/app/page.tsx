import type { Metadata } from "next";
import { credits } from "@/data/credits";
import { f1Copy, f1Sidecar } from "@/data/f1";
import { f222Copy, f222Sidecar } from "@/data/f222";
import { facts2026 } from "@/data/facts-2026";
import { ExplodeProvider } from "@/engine/explode";
import { pageMetadata } from "@/lib/site";
import { CarExperience } from "./car-experience";

export const metadata: Metadata = pageMetadata({
  title: "A 2026 F1 car, taken apart",
  description: "Pull a generic 2026 Formula 1 car apart in 3D: wings, floor, bodywork, then the power unit inside. Pick any part to read what it does.",
  path: "/",
});

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * The exploded car. Server-rendered: the headline, the part list and the 2026 facts are in the
 * HTML, so the page reads and indexes with JavaScript off. Only the canvas is client-only and lazy.
 */
export default function Page() {
  return (
    <ExplodeProvider>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 md:py-14">
        <CarExperience
          cars={{ 2022: { sidecar: f222Sidecar, copy: f222Copy }, 2026: { sidecar: f1Sidecar, copy: f1Copy } }}
          powerUnitNote={credits.powerUnit}
        />
        <section aria-labelledby="facts-2026" data-facts-2026 className="border-t border-border pt-10">
          <h2 id="facts-2026" className="font-display text-2xl text-ink md:text-3xl">
            2026 in numbers
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-secondary">{credits.regulations}</p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {facts2026.map((f) => (
              <li key={f.title} className="flex flex-col rounded-xl border border-border bg-surface p-5">
                <h3 className="font-display text-base text-ink">{f.title}</h3>
                <p className="mt-2 flex-1 text-sm text-ink-secondary">{f.body}</p>
                <a href={f.source} rel="noreferrer" target="_blank" className="mt-3 text-xs text-accent underline-offset-4 hover:underline max-md:mt-1 max-md:inline-flex max-md:min-h-9 max-md:items-center max-md:self-start">
                  Source: {hostOf(f.source)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </ExplodeProvider>
  );
}
