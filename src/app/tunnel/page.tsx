import type { Metadata } from "next";
import Link from "next/link";
import { credits } from "@/data/credits";
import tunnel from "@/data/f1-tunnel.json";
import { pageMetadata } from "@/lib/site";
import { LiveryName } from "../livery-picker";
import { TunnelClient } from "./tunnel-client";

export const metadata: Metadata = pageMetadata({
  title: "Wind tunnel",
  description: "Swap the front wing, the floor and the rear wing angle on a 2026 F1 car, switch Corner and Straight Mode, and watch the airflow and the lap time change.",
  path: "/tunnel",
});

/**
 * Stage 1 of the wind tunnel. Server-rendered: the controls, the score card and its disclaimer are
 * in the HTML; only the canvas and its airflow are client-only and lazy.
 */
export default function TunnelPage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 md:py-14">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="font-display text-xs uppercase tracking-[0.24em] text-ink-secondary">Interactive: wind tunnel, stage 1</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.01em] text-ink md:text-5xl">Put the car in the tunnel</h1>
          <p className="mt-4 text-base text-ink-secondary">
            Swap the front wing and the floor, steepen the rear wing, flip between Corner and Straight Mode. The car in the{" "}
            <LiveryName /> livery changes shape, the airflow around it shifts, and the score card works out what that does to downforce,
            drag and a lap of the circuit you pick.
          </p>
        </div>
        <Link
          href="/"
          // Not prefetched: the exploded view is a route with its own 3D stage, and fetching it in the background would add its scripts to this page's load.
          prefetch={false}
          className="inline-flex min-h-10 shrink-0 items-center rounded-md border border-field-border px-4 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          Back to the exploded car
        </Link>
      </header>
      <TunnelClient model={tunnel.model} sdf={tunnel.sdf} disclaimer={credits.disclaimer} />
    </main>
  );
}
