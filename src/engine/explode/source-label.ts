/**
 * The words a source link shows: the publisher's name for the sites the copy books cite most, else the
 * bare host name. A raw URL as link text is long, breaks mid-word and reads as machine output.
 */

/** Host (without `www.`) to publisher name. A host not listed here shows as itself. */
const PUBLISHERS: Record<string, string> = {
  "ncbi.nlm.nih.gov": "NCBI Bookshelf",
  "pubmed.ncbi.nlm.nih.gov": "PubMed",
  "nhs.uk": "NHS",
  "medlineplus.gov": "MedlinePlus",
  "niddk.nih.gov": "NIDDK (NIH)",
  "nimh.nih.gov": "NIMH (NIH)",
  "niams.nih.gov": "NIAMS (NIH)",
  "nhlbi.nih.gov": "NHLBI (NIH)",
  "britannica.com": "Britannica",
  "fia.com": "FIA",
  "api.fia.com": "FIA",
  "formula1.com": "Formula 1",
  "press.pirelli.com": "Pirelli",
};

/** The label for a source link, or null when `src` is not an http(s) URL (it then shows as plain text). */
export function sourceLabel(src: string): string | null {
  if (!/^https?:\/\//i.test(src)) return null;
  let host: string;
  try {
    host = new URL(src).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  return PUBLISHERS[host] ?? host;
}
