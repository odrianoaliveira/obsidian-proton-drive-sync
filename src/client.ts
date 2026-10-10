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
  error?: string;       // spawn-level error (e.g. ENOENT)
}

export type AuthErrorKind = "not-logged-in" | "keyring-locked" | "binary-not-found" | "other";

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
        resolve({
          ok: false,
          code: null,
          stdout,
          stderr,
          error: "timeout",
        });
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timeout);
        resolve({
          ok: code === 0,
          code,
          stdout,
          stderr,
        });
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
}
