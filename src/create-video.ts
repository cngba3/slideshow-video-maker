#!/usr/bin/env node
import { config } from "dotenv";
config({ path: ".env.local" });

import { generateScriptWithGemini } from "./generator/gemini-generator.js";
import { runPipeline } from "./pipeline.js";
import { log } from "./utils/logger.js";

async function main() {
  const inputArg = process.argv[2];

  if (!inputArg) {
    console.log(`
🎬 Auto News Video Generator (Gemini + Vbee / LucyLab / ElevenLabs)

Usage:
  npm run create-video -- <URL-or-txt-file-path>

Examples:
  npm run create-video -- https://vnexpress.net/san-pham-cong-nghe-moi
  npm run create-video -- my-article.txt
`);
    process.exit(1);
  }

  try {
    log.info("Starting Auto News Video creation workflow...");
    // Step 1: Generate script.json from URL or .txt using Google AI Studio (Gemini)
    const scriptPath = await generateScriptWithGemini(inputArg);

    // Step 2: Run the full video production pipeline
    await runPipeline(scriptPath);

    log.info("\n🎉 Video creation completed successfully!");
  } catch (err) {
    log.error("Video creation workflow failed", err);
    process.exit(1);
  }
}

main();
