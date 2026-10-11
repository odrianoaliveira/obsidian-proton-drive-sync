import { spawn } from "child_process";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

import { FileConflictStrategy, FolderConflictStrategy } from "./settings";

export interface SyncResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

export type AuthErrorKind =
  | "not-logged-in"
  | "keyring-locked"
  | "binary-not-found"
  | "other";

export class ProtonDriveSyncClient {
  private binaryPath: string;

  constructor(binaryPath: string) {
    this.binaryPath = binaryPath;
  }

  static resolveBinary(configured: string): string {
    if (configured) {
      return configured;
    }
    const candidate = path.join(os.homedir(), ".local", "bin", "proton-drive");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    return "proton-drive";
  }

  static classifyError(stderr: string, error?: string): AuthErrorKind {
    const lowerStderr = stderr.toLowerCase();
    if (lowerStderr.includes("login") && lowerStderr.includes("first")) {
      return "not-logged-in";
    }
    if (
      lowerStderr.includes("keyring") ||
      lowerStderr.includes("secret service") ||
      lowerStderr.includes("dbus")
    ) {
      return "keyring-locked";
    }
    if (error?.includes("ENOENT")) {
      return "binary-not-found";
    }
    return "other";
  }

  static formatSyncError(result: SyncResult): string {
    switch (ProtonDriveSyncClient.classifyError(result.stderr, result.error)) {
      case "not-logged-in":
        return "Not logged in — run `proton-drive auth login`";
      case "keyring-locked":
        return "Keyring locked/unreachable — unlock your session keyring";
      case "binary-not-found":
        return "Binary not found";
      default: {
        const detail = result.stderr || result.error || "Unknown error";
        return detail.length > 200 ? detail.substring(0, 200) + "..." : detail;
      }
    }
  }

  private run(args: string[], timeoutMs = 600000): Promise<SyncResult> {
    return new Promise<SyncResult>((resolve) => {
      const child = spawn(this.binaryPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({ ok: false, code: null, stdout, stderr, error: "timeout" });
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timeout);
        resolve({ ok: code === 0, code, stdout, stderr });
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        resolve({
          ok: false,
          code: null,
          stdout: "",
          stderr: "",
          error: err.message,
        });
      });
    });
  }

  async list(remotePath: string): Promise<SyncResult> {
    return this.run(["filesystem", "list", "-j", remotePath]);
  }

  async info(remotePath: string): Promise<SyncResult> {
    return this.run(["filesystem", "info", "-j", remotePath]);
  }

  async trash(remotePaths: string[]): Promise<SyncResult> {
    return this.run(["filesystem", "trash", "-j", ...remotePaths]);
  }

  async createFolder(parentPath: string, name: string): Promise<SyncResult> {
    return this.run(["filesystem", "create-folder", parentPath, name]);
  }

  /**
   * Ensure a remote folder path exists, creating missing levels. The root
   * segment (e.g. "/my-files") is assumed to already exist. Returns the first
   * failure if any step errors.
   */
  async ensureRemoteFolder(remotePath: string): Promise<SyncResult> {
    const existing = await this.list(remotePath);
    if (existing.ok) {
      return existing;
    }

    // Only create when the folder is genuinely missing; propagate auth/keyring
    // and other errors verbatim.
    if (!existing.stderr.toLowerCase().includes("node not found")) {
      return existing;
    }

    const segments = remotePath.split("/").filter(Boolean);
    if (segments.length === 0) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr: `Invalid remote path: ${remotePath}`,
        error: "invalid-path",
      };
    }

    let parent = "/" + segments[0];
    for (let i = 1; i < segments.length; i++) {
      const current = parent + "/" + segments[i];
      const check = await this.list(current);
      if (!check.ok) {
        const created = await this.createFolder(parent, segments[i]);
        if (!created.ok) {
          return created;
        }
      }
      parent = current;
    }

    return { ok: true, code: 0, stdout: "", stderr: "" };
  }

  async upload(
    targets: string[],
    parentPath: string,
    opts: {
      fileStrategy: FileConflictStrategy;
      folderStrategy: FolderConflictStrategy;
      skipThumbnails: boolean;
    },
    timeoutMs = 600000
  ): Promise<SyncResult> {
    const args = ["filesystem", "upload"];
    args.push("-f", opts.fileStrategy);
    args.push("-d", opts.folderStrategy);
    if (opts.skipThumbnails) {
      args.push("-t");
    }
    args.push("-j");
    args.push(...targets);
    args.push(parentPath);

    return this.run(args, timeoutMs);
  }
}
