import { config } from "dotenv";
config({ path: ".env.local" });
config();

export type TtsProvider = "lucylab" | "elevenlabs" | "vbee";

export interface TiktokConfig {
  displayName: string;
  handle: string;
  followers: string;
  /** URL to download avatar JPG. If undefined, the bundled `assets/avatar.jpg` is used. */
  avatarUrl?: string;
}

export interface Config {
  ttsProvider: TtsProvider;

  // LucyLab
  lucylabApiKey?: string;
  lucylabVoiceId?: string;
  lucylabEndpoint: string;
  lucylabPollIntervalMs: number;
  lucylabPollTimeoutMs: number;

  // ElevenLabs
  elevenlabsApiKey?: string;
  elevenlabsVoiceId?: string;
  elevenlabsModelId: string;
  elevenlabsEndpoint: string;

  // Vbee TTS
  vbeeAppId?: string;
  vbeeToken?: string;
  vbeeVoiceCode: string;
  vbeeEndpoint: string;
  vbeeSpeed: number;

  // Google AI Studio (Gemini)
  geminiApiKey?: string;
  geminiModel: string;

  // Groq (LLM fallback)
  groqApiKey?: string;


  // TikTok follow card (outro)
  tiktok: TiktokConfig;

  ttsConcurrency: number;
  /** Playback speed factor applied to TTS audio via ffmpeg atempo. Default 1.0 (no change). */
  ttsSpeed: number;
  renderWorkers?: number;
  renderFps?: number;
}

function intDefault(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseInt(v, 10);
  if (isNaN(n)) throw new Error(`Env var ${name} must be integer, got "${v}"`);
  return n;
}

function floatDefault(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseFloat(v);
  if (isNaN(n)) throw new Error(`Env var ${name} must be number, got "${v}"`);
  return n;
}

export function loadConfig(): Config {
  const provider = (process.env.TTS_PROVIDER ?? "lucylab") as TtsProvider;
  if (provider !== "lucylab" && provider !== "elevenlabs" && provider !== "vbee") {
    throw new Error(`TTS_PROVIDER must be "lucylab", "elevenlabs", or "vbee", got "${provider}"`);
  }

  // Validate provider-specific required vars
  if (provider === "lucylab") {
    if (!process.env.VIETNAMESE_API_KEY || process.env.VIETNAMESE_API_KEY.trim() === "") {
      throw new Error(
        `Missing VIETNAMESE_API_KEY (required when TTS_PROVIDER=lucylab). ` +
        `Copy .env.example to .env.local and fill in your LucyLab API key.`
      );
    }
    if (!process.env.VIETNAMESE_VOICEID || process.env.VIETNAMESE_VOICEID.trim() === "") {
      throw new Error(
        `Missing VIETNAMESE_VOICEID (required when TTS_PROVIDER=lucylab). ` +
        `Copy .env.example to .env.local and fill in your LucyLab voice ID.`
      );
    }
  } else if (provider === "elevenlabs") {
    if (!process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY.trim() === "") {
      throw new Error(
        `Missing ELEVENLABS_API_KEY (required when TTS_PROVIDER=elevenlabs). ` +
        `Copy .env.example to .env.local and fill in your ElevenLabs API key.`
      );
    }
    if (!process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE_ID.trim() === "") {
      throw new Error(
        `Missing ELEVENLABS_VOICE_ID (required when TTS_PROVIDER=elevenlabs). ` +
        `Copy .env.example to .env.local and fill in your ElevenLabs voice ID.`
      );
    }
  } else if (provider === "vbee") {
    const token = process.env.VBEE_TOKEN ?? process.env.VBEE_API_KEY;
    if (!token || token.trim() === "") {
      throw new Error(
        `Missing VBEE_TOKEN or VBEE_API_KEY (required when TTS_PROVIDER=vbee). ` +
        `Copy .env.example to .env.local and fill in your Vbee Token/API key.`
      );
    }
  }

  return {
    ttsProvider: provider,
    lucylabApiKey: process.env.VIETNAMESE_API_KEY,
    lucylabVoiceId: process.env.VIETNAMESE_VOICEID,
    lucylabEndpoint: process.env.LUCYLAB_ENDPOINT ?? "https://api.lucylab.io/json-rpc",
    lucylabPollIntervalMs: intDefault("LUCYLAB_POLL_INTERVAL_MS", 2000),
    lucylabPollTimeoutMs: intDefault("LUCYLAB_POLL_TIMEOUT_MS", 120000),
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID,
    elevenlabsModelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
    elevenlabsEndpoint: process.env.ELEVENLABS_ENDPOINT ?? "https://api.elevenlabs.io/v1",
    vbeeAppId: process.env.VBEE_APP_ID,
    vbeeToken: process.env.VBEE_TOKEN ?? process.env.VBEE_API_KEY,
    vbeeVoiceCode: process.env.VBEE_VOICE_CODE ?? "hn_female_ngochuyen_full_48k-fhg",
    vbeeEndpoint: process.env.VBEE_ENDPOINT ?? "https://api.vbee.vn/v1/tts",
    vbeeSpeed: floatDefault("VBEE_SPEED", 1.0),
    geminiApiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
    groqApiKey: process.env.GROQ_API_KEY,
    tiktok: {
      displayName: process.env.TIKTOK_DISPLAY_NAME ?? "Công nghệ 24h",
      handle: process.env.TIKTOK_HANDLE ?? "@congnghe24h",
      followers: process.env.TIKTOK_FOLLOWERS ?? "1.2M followers",
      avatarUrl: process.env.TIKTOK_AVATAR_URL || undefined,
    },
    ttsConcurrency: intDefault("TTS_CONCURRENCY", 1),
    ttsSpeed: floatDefault("TTS_SPEED", 1.25),
    renderWorkers: process.env.RENDER_WORKERS ? parseInt(process.env.RENDER_WORKERS, 10) : undefined,
    renderFps: process.env.RENDER_FPS ? parseInt(process.env.RENDER_FPS, 10) : undefined,
  };
}
