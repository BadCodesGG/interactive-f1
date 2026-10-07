/**
 * Part copy: typed constants, one CopyBook per feature (src/data/<feature>.copy.ts). A sidecar
 * part's `copy` field is a key into its feature's book; `npm run check:sidecar` fails on a key
 * with no entry.
 */
export interface PartCopy {
  id: string;
  label: string;
  group: string;
  summary: string;
  function: string;
  whyItMatters: string;
  funFact?: string;
  stats?: { label: string; value: string }[];
  sources?: string[];
}

export type CopyBook = Record<string, PartCopy>;
