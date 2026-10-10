export type FileConflictStrategy = "create-new-revision" | "rename" | "replace" | "skip";
export type FolderConflictStrategy = "merge" | "rename" | "replace" | "skip";

export interface ProtonDriveSyncSettings {
  /** Remote parent path on Proton Drive (Posix syntax, "/my-files" is the root). */
  remotePath: string;
  /** File conflict strategy: create-new-revision | rename | replace | skip */
  fileConflictStrategy: FileConflictStrategy;
  /** Folder conflict strategy: merge | rename | replace | skip */
  folderConflictStrategy: FolderConflictStrategy;
  /** Skip thumbnail generation server-side. */
  skipThumbnails: boolean;
  /** Debounce window (ms) after a change before triggering a sync. */
  debounceMs: number;
  /** Periodic fallback sync interval in minutes (0 disables). */
  intervalMinutes: number;
  /** Whether change-triggered auto-sync is enabled. */
  autoSync: boolean;
  /** Absolute path override for the proton-drive binary (empty = auto-resolve). */
  binaryPath: string;
  /** Path prefixes (relative to vault root) to exclude from upload. */
  ignore: string[];
}

export const DEFAULT_SETTINGS: ProtonDriveSyncSettings = {
  remotePath: "/my-files/Obsidian",
  fileConflictStrategy: "create-new-revision",
  folderConflictStrategy: "merge",
  skipThumbnails: true,
  debounceMs: 3000,
  intervalMinutes: 5,
  autoSync: true,
  binaryPath: "",
  ignore: [".obsidian", ".trash"],
};
