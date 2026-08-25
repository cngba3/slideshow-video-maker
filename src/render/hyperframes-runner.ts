import { spawn } from "node:child_process";
import os from "node:os";
import { log } from "../utils/logger.js";

export interface RenderArgs {
  compositionDir: string;  // path to composition directory
  outputPath: string;      // path for .mp4
  fps?: number;            // default 30
  quality?: "draft" | "standard" | "high"; // default "standard"
  workers?: number;        // default auto-detected
}

export async function renderWithHyperframes(args: RenderArgs): Promise<void> {
  const cpus = os.cpus().length;
  // Default to min(8, cpus - 2) with a floor of 4 to maximize CPU parallelism without overwhelming system memory
  const defaultWorkers = Math.max(4, Math.min(8, cpus > 4 ? cpus - 2 : cpus));
  const { compositionDir, outputPath, fps = 30, quality = "standard", workers = defaultWorkers } = args;

  const spawnArgs = [
    "hyperframes",
    "render",
    compositionDir,
    "--output",
    outputPath,
    "--fps",
    String(fps),
    "--quality",
    quality,
    "--workers",
    String(workers),
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("npx", spawnArgs, {
      stdio: ["ignore", "inherit", "inherit"],
      shell: true,
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `hyperframes render failed with exit code ${code}`
          )
        );
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });

  log.info(`Rendered: ${outputPath}`);
}
