import * as fs from "fs";
import * as path from "path";

/** Entry in the deletion journal. */
export interface DeletionJournalEntry {
  path: string;
  kind: "delete" | "rename";
  timestamp: string;   // ISO string
  newPath?: string;    // present only for rename entries
}

/** Return true if the stderr indicates a missing remote node. */
export function isNodeNotFound(stderr: string): boolean {
  return stderr.toLowerCase().includes("node not found");
}

/** Normalize a vault-relative path. Returns null if the path is invalid. */
export function normalizeVaultPath(p: string): string | null {
  // Reject empty/whitespace
  if (!p || !p.trim()) {
    return null;
  }
  // Reject leading '/'
  if (p.startsWith("/")) {
    return null;
  }
  // Reject any segment equal to '.' or '..'
  const segments = p.split("/");
  for (const seg of segments) {
    if (seg === "." || seg === "..") {
      return null;
    }
  }
  // Reject backslash
  if (p.includes("\\")) {
    return null;
  }
  // Collapse duplicate '/' and trim edges
  const cleaned = segments.filter(Boolean).join("/");
  return cleaned.length > 0 ? cleaned : null;
}

/** Join a remote base path with a normalized vault-relative path. */
export function joinRemote(remotePath: string, p: string): string {
  // Ensure remotePath has a leading '/'
  const base = remotePath.startsWith("/") ? remotePath : `/${remotePath}`;
  // Ensure no trailing '/' to avoid double slashes
  const cleanBase = base.replace(/\/+$/, "");
  // Prepend '/' to the normalized path
  return `${cleanBase}/${p}`;
}

/** Deduplicate entries by path, keeping the first occurrence. */
export function dedupByPath(entries: DeletionJournalEntry[]): DeletionJournalEntry[] {
  const seen = new Set<string>();
  const out: DeletionJournalEntry[] = [];
  for (const e of entries) {
    if (!seen.has(e.path)) {
      seen.add(e.path);
      out.push(e);
    }
  }
  return out;
}

/** Back up a corrupt journal file without throwing. */
function backupCorrupt(journalPath: string): void {
  try {
    fs.renameSync(journalPath, `${journalPath}.corrupt-${Date.now()}`);
  } catch {
    // Swallow — never break reconciliation over a backup failure.
  }
}

/** Type guard for well-formed journal entries. */
function isValidEntry(e: unknown): e is DeletionJournalEntry {
  if (typeof e !== "object" || e === null) {
    return false;
  }
  const o = e as Record<string, unknown>;
  return (
    typeof o.path === "string" &&
    typeof o.timestamp === "string" &&
    (o.kind === "delete" || o.kind === "rename")
  );
}

/** Read and parse the journal file. Backs up corrupt files; drops malformed entries. */
export function readJournal(journalPath: string): DeletionJournalEntry[] {
  try {
    if (!fs.existsSync(journalPath)) {
      return [];
    }
    const content = fs.readFileSync(journalPath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      backupCorrupt(journalPath);
      return [];
    }
    if (!Array.isArray(parsed)) {
      backupCorrupt(journalPath);
      return [];
    }
    return parsed.filter(isValidEntry);
  } catch {
    // File exists but unreadable or other error
    return [];
  }
}

/** Write the journal atomically (temp file + rename). Swallow errors. */
export function writeJournalAtomic(journalPath: string, entries: DeletionJournalEntry[]): void {
  try {
    const tmpPath = `${journalPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(entries, null, 2));
    fs.renameSync(tmpPath, journalPath);
  } catch {
    // Never throw
  }
}

/** Merge the journal: drop entries whose path was resolved AND timestamp <= cutoff. */
export function mergeJournal(
  fresh: DeletionJournalEntry[],
  resolvedPaths: Set<string>,
  cutoff: string
): DeletionJournalEntry[] {
  return fresh.filter((e) => {
    if (resolvedPaths.has(e.path) && e.timestamp <= cutoff) {
      return false;
    }
    return true;
  });
}
