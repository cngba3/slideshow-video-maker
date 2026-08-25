import express from "express";
import cors from "cors";
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import { config as dotenvConfig } from "dotenv";
import { generateScriptWithGemini } from "./generator/gemini-generator.js";
import { runPipeline } from "./pipeline.js";
import { addLogListener, log, type LogEvent } from "./utils/logger.js";
import { ScriptSchema } from "./render/script-schema.js";

dotenvConfig({ path: ".env.local" });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Job management for async background video creation & SSE log streaming
interface Job {
  id: string;
  type: "create" | "rerender";
  status: "running" | "completed" | "failed";
  input?: string;
  scriptPath?: string;
  outputDir?: string;
  videoUrl?: string;
  error?: string;
  logs: LogEvent[];
  listeners: Array<(event: string) => void>;
}

const jobs = new Map<string, Job>();

function broadcastJobEvent(job: Job, eventName: string, data: Record<string, unknown>) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const listener of job.listeners) {
    listener(payload);
  }
}

// Subscribe logger to feed active jobs
addLogListener((logEvent) => {
  for (const job of jobs.values()) {
    if (job.status === "running") {
      job.logs.push(logEvent);
      broadcastJobEvent(job, "log", logEvent as unknown as Record<string, unknown>);
    }
  }
});

// API: Create video from URL or text
app.post("/api/create-video", async (req, res) => {
  const { input } = req.body;
  if (!input || typeof input !== "string" || !input.trim()) {
    return res.status(400).json({ error: "Input URL or text file path is required" });
  }

  const jobId = `job-${Date.now()}`;
  const job: Job = {
    id: jobId,
    type: "create",
    status: "running",
    input: input.trim(),
    logs: [],
    listeners: [],
  };
  jobs.set(jobId, job);

  // Start background task
  (async () => {
    try {
      log.info(`[Job ${jobId}] Starting video generation for input: ${input.slice(0, 60)}...`);
      const scriptPath = await generateScriptWithGemini(input.trim());
      job.scriptPath = scriptPath;
      const outputDir = basename(join(scriptPath, ".."));
      job.outputDir = outputDir;

      log.info(`[Job ${jobId}] Script generated. Running video render pipeline...`);
      await runPipeline(scriptPath);

      job.status = "completed";
      job.videoUrl = `/output/${outputDir}/video.mp4`;
      broadcastJobEvent(job, "complete", {
        jobId,
        scriptPath,
        outputDir,
        videoUrl: job.videoUrl,
        audioUrl: `/output/${outputDir}/voice.mp3`,
        scriptTxtUrl: `/output/${outputDir}/script.txt`,
      });
      log.info(`[Job ${jobId}] Finished successfully!`);
    } catch (err) {
      job.status = "failed";
      job.error = (err as Error).message || String(err);
      broadcastJobEvent(job, "error", { jobId, error: job.error });
      log.error(`[Job ${jobId}] Failed: ${job.error}`);
    }
  })();

  return res.json({ jobId, message: "Video generation job started" });
});

// API: Re-render video for existing project script
app.post("/api/projects/:id/rerender", async (req, res) => {
  const { id } = req.params;
  const scriptPath = join(process.cwd(), "output", id, "script.json");

  if (!existsSync(scriptPath)) {
    return res.status(404).json({ error: `Script file not found at ${scriptPath}` });
  }

  const jobId = `rerender-${Date.now()}`;
  const job: Job = {
    id: jobId,
    type: "rerender",
    status: "running",
    scriptPath,
    outputDir: id,
    logs: [],
    listeners: [],
  };
  jobs.set(jobId, job);

  (async () => {
    try {
      log.info(`[Job ${jobId}] Re-rendering pipeline for project: ${id}...`);
      await runPipeline(scriptPath);

      job.status = "completed";
      job.videoUrl = `/output/${id}/video.mp4`;
      broadcastJobEvent(job, "complete", {
        jobId,
        scriptPath,
        outputDir: id,
        videoUrl: job.videoUrl,
        audioUrl: `/output/${id}/voice.mp3`,
        scriptTxtUrl: `/output/${id}/script.txt`,
      });
      log.info(`[Job ${jobId}] Re-render finished successfully!`);
    } catch (err) {
      job.status = "failed";
      job.error = (err as Error).message || String(err);
      broadcastJobEvent(job, "error", { jobId, error: job.error });
      log.error(`[Job ${jobId}] Re-render failed: ${job.error}`);
    }
  })();

  return res.json({ jobId, message: "Re-render job started" });
});

// API: SSE event stream for a job
app.get("/api/jobs/:id/events", (req, res) => {
  const { id } = req.params;
  const job = jobs.get(id);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send initial logs
  for (const logItem of job.logs) {
    res.write(`event: log\ndata: ${JSON.stringify(logItem)}\n\n`);
  }

  if (job.status === "completed") {
    res.write(
      `event: complete\ndata: ${JSON.stringify({
        jobId: job.id,
        outputDir: job.outputDir,
        videoUrl: job.videoUrl,
      })}\n\n`
    );
    return res.end();
  }

  if (job.status === "failed") {
    res.write(`event: error\ndata: ${JSON.stringify({ jobId: job.id, error: job.error })}\n\n`);
    return res.end();
  }

  const listener = (data: string) => {
    res.write(data);
  };
  job.listeners.push(listener);

  req.on("close", () => {
    job.listeners = job.listeners.filter((l) => l !== listener);
  });
});

// API: List all generated projects
app.get("/api/projects", async (_req, res) => {
  try {
    const outputBase = join(process.cwd(), "output");
    if (!existsSync(outputBase)) {
      return res.json({ projects: [] });
    }

    const entries = await readdir(outputBase, { withFileTypes: true });
    const projects = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projDir = join(outputBase, entry.name);
      const scriptPath = join(projDir, "script.json");
      const metaPath = join(projDir, "meta.json");

      if (!existsSync(scriptPath)) continue;

      let script = null;
      let meta = null;
      try {
        script = JSON.parse(await readFile(scriptPath, "utf8"));
      } catch {}
      try {
        if (existsSync(metaPath)) {
          meta = JSON.parse(await readFile(metaPath, "utf8"));
        }
      } catch {}

      const dirStat = await stat(projDir);
      const hasVideo = existsSync(join(projDir, "video.mp4"));
      const hasVoice = existsSync(join(projDir, "voice.mp3"));
      const hasScriptTxt = existsSync(join(projDir, "script.txt"));
      const hasBgImage = existsSync(join(projDir, "images", "bg.jpg"));

      projects.push({
        id: entry.name,
        title: script?.metadata?.title || meta?.name || entry.name,
        createdAt: meta?.createdAt || dirStat.birthtime.toISOString(),
        videoUrl: hasVideo ? `/output/${entry.name}/video.mp4` : null,
        voiceUrl: hasVoice ? `/output/${entry.name}/voice.mp3` : null,
        scriptTxtUrl: hasScriptTxt ? `/output/${entry.name}/script.txt` : null,
        bgImageUrl: hasBgImage ? `/output/${entry.name}/images/bg.jpg` : null,
        sceneCount: script?.scenes?.length || 0,
        domain: script?.metadata?.source?.domain || "local",
      });
    }

    projects.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return res.json({ projects });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// API: Get project detail & script.json
app.get("/api/projects/:id", async (req, res) => {
  const { id } = req.params;
  const projDir = join(process.cwd(), "output", id);
  const scriptPath = join(projDir, "script.json");

  if (!existsSync(scriptPath)) {
    return res.status(404).json({ error: "Project not found" });
  }

  try {
    const scriptRaw = await readFile(scriptPath, "utf8");
    const script = JSON.parse(scriptRaw);
    let scriptTxt = "";
    if (existsSync(join(projDir, "script.txt"))) {
      scriptTxt = await readFile(join(projDir, "script.txt"), "utf8");
    }

    return res.json({
      id,
      script,
      scriptTxt,
      videoUrl: existsSync(join(projDir, "video.mp4")) ? `/output/${id}/video.mp4` : null,
      voiceUrl: existsSync(join(projDir, "voice.mp3")) ? `/output/${id}/voice.mp3` : null,
      bgImageUrl: existsSync(join(projDir, "images", "bg.jpg")) ? `/output/${id}/images/bg.jpg` : null,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// API: Save script.json edits
app.put("/api/projects/:id/script", async (req, res) => {
  const { id } = req.params;
  const scriptPath = join(process.cwd(), "output", id, "script.json");

  if (!existsSync(scriptPath)) {
    return res.status(404).json({ error: "Project script not found" });
  }

  try {
    const updatedScript = req.body;
    // Validate schema
    const parsed = ScriptSchema.parse(updatedScript);
    await writeFile(scriptPath, JSON.stringify(parsed, null, 2), "utf8");
    return res.json({ message: "Script updated successfully", script: parsed });
  } catch (err) {
    return res.status(400).json({ error: `Validation failed: ${(err as Error).message}` });
  }
});

// API: Get current config settings
app.get("/api/config", async (_req, res) => {
  try {
    const envPath = join(process.cwd(), ".env.local");
    let rawEnv = "";
    if (existsSync(envPath)) {
      rawEnv = await readFile(envPath, "utf8");
    }

    const parseEnvKey = (key: string) => {
      const match = rawEnv.match(new RegExp(`^${key}=(.*)$`, "m"));
      return match ? match[1].trim() : "";
    };

    const maskKey = (val: string) => {
      if (!val) return "";
      if (val.length <= 8) return "********";
      return `${val.slice(0, 4)}...${val.slice(-4)}`;
    };

    const config = {
      geminiApiKey: maskKey(parseEnvKey("GEMINI_API_KEY") || parseEnvKey("GOOGLE_API_KEY")),
      geminiModel: parseEnvKey("GEMINI_MODEL") || "gemini-2.5-flash",
      ttsProvider: parseEnvKey("TTS_PROVIDER") || "lucylab",
      lucylabVoiceId: parseEnvKey("LUCYLAB_VOICE_ID") || "",
      vbeeVoiceCode: parseEnvKey("VBEE_VOICE_CODE") || "",
      elevenlabsVoiceId: parseEnvKey("ELEVENLABS_VOICE_ID") || "",
      tiktokChannelName: parseEnvKey("TIKTOK_CHANNEL_NAME") || "Công nghệ 24h",
      tiktokHandle: parseEnvKey("TIKTOK_HANDLE") || "@congnghe24h",
      hasGeminiApiKey: Boolean(parseEnvKey("GEMINI_API_KEY") || parseEnvKey("GOOGLE_API_KEY")),
    };

    return res.json({ config });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// API: Update .env.local config
app.post("/api/config", async (req, res) => {
  try {
    const envPath = join(process.cwd(), ".env.local");
    let envContent = existsSync(envPath) ? await readFile(envPath, "utf8") : "";

    const updates: Record<string, string> = req.body;

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value.includes("...")) continue; // Skip masked inputs if unchanged
      const regex = new RegExp(`^${key}=.*$`, "m");
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    }

    await writeFile(envPath, envContent.trim() + "\n", "utf8");

    // Reload dotenv
    dotenvConfig({ path: ".env.local", override: true });

    return res.json({ message: "Configuration updated successfully" });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// Serve output directory for media preview
app.use("/output", express.static(join(process.cwd(), "output")));

// Serve static frontend assets
app.use(express.static(join(process.cwd(), "public")));

app.listen(PORT, () => {
  log.info(`\n🚀 Auto News Video Web UI is running!`);
  log.info(`👉 Open your browser at: http://localhost:${PORT}\n`);
});
