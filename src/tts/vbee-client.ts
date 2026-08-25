import axios, { AxiosError } from "axios";
import { writeFile } from "node:fs/promises";
import type { TtsClient } from "./tts-client.js";
import { log } from "../utils/logger.js";

export interface VbeeOpts {
  token?: string;
  appId?: string;
  voiceCode: string;
  endpoint: string; // e.g. "https://api.vbee.ai/v1/tts" or "https://vbee.vn/api/v1/tts"
  speed?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Vbee AI Text-to-Speech client.
 *
 * API reference: https://vbee.vn/api-docs
 *
 * Sends text to Vbee TTS API endpoint and saves output MP3 audio file.
 */
export class VbeeClient implements TtsClient {
  constructor(private cfg: VbeeOpts) {}

  async generate(text: string, audioOutPath: string, _srtOutPath?: string): Promise<void> {
    await this.synthesizeWithRetry(text, audioOutPath);
  }

  private async synthesizeWithRetry(text: string, outPath: string): Promise<void> {
    const delays = [1000, 2000, 4000];
    let lastErr: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Accept": "application/json, audio/mpeg, audio/mp3",
        };
        if (this.cfg.token) {
          headers["Authorization"] = `Bearer ${this.cfg.token}`;
          headers["token"] = this.cfg.token;
        }

        const payload: Record<string, unknown> = {
          input_text: text,
          voice_code: this.cfg.voiceCode,
          callback_url: "https://example.com/callback",
        };

        if (this.cfg.appId) {
          payload.app_id = this.cfg.appId;
          headers["app_id"] = this.cfg.appId;
        }

        const resp = await axios.post(this.cfg.endpoint, payload, {
          headers,
          responseType: "arraybuffer",
          timeout: 60000,
        });

        const contentType = String(resp.headers["content-type"] ?? "");
        const dataBuffer = Buffer.from(resp.data);

        const first4 = dataBuffer.toString("utf8", 0, 4).trimStart();
        const isJson = contentType.includes("json") || first4.startsWith("{") || first4.startsWith("[");

        // Case A: Binary audio returned directly
        if (!isJson) {
          await writeFile(outPath, dataBuffer);
          return;
        }

        // Case B: JSON returned containing audio URL
        const jsonText = dataBuffer.toString("utf8");
        const parsed = JSON.parse(jsonText);

        let audioUrl =
          parsed?.audio_link ||
          parsed?.download_url ||
          parsed?.url ||
          parsed?.data?.audio_link ||
          parsed?.result?.audio_link ||
          parsed?.result?.url;

        const requestId = parsed?.result?.request_id || parsed?.request_id;

        if (!audioUrl && requestId) {
          const pollUrl = `https://vbee.vn/api/v1/tts/${requestId}`;
          for (let pollAttempt = 0; pollAttempt < 15; pollAttempt++) {
            await sleep(1500);
            try {
              const pollResp = await axios.get(pollUrl, { headers, timeout: 10000 });
              const pollData = typeof pollResp.data === "string" ? JSON.parse(pollResp.data) : pollResp.data;
              audioUrl =
                pollData?.audio_link ||
                pollData?.download_url ||
                pollData?.url ||
                pollData?.data?.audio_link ||
                pollData?.result?.audio_link ||
                pollData?.result?.url;

              if (audioUrl) break;
            } catch {
              // retry poll
            }
          }
        }

        if (!audioUrl) {
          const errMsg = parsed?.message || parsed?.error || parsed?.detail || jsonText;
          throw new Error(`Vbee API returned success status but no audio URL found: ${errMsg}`);
        }

        // Download audio file from returned URL
        const audioDownload = await axios.get(audioUrl, {
          responseType: "arraybuffer",
          timeout: 60000,
        });

        await writeFile(outPath, Buffer.from(audioDownload.data));
        return;
      } catch (e) {
        lastErr = e;
        const err = e as AxiosError;
        const status = err.response?.status;
        const retryable = status === undefined || status === 429 || status >= 500;

        if (!retryable || attempt === delays.length) {
          log.warn(`Vbee TTS failed (status ${status ?? "?"}): ${err.message} -> Falling back to standard Vietnamese TTS...`);
          try {
            await this.generateFallbackTts(text, outPath);
            return;
          } catch (fallbackErr) {
            let detail = err.message;
            if (err.response?.data) {
              try {
                const body =
                  err.response.data instanceof ArrayBuffer
                    ? Buffer.from(err.response.data).toString("utf8")
                    : String(err.response.data);
                const parsed = JSON.parse(body);
                detail = parsed?.message || parsed?.detail || parsed?.error || detail;
              } catch {
                /* ignore parse error */
              }
            }
            throw new Error(`Vbee TTS failed (status ${status ?? "?"}): ${detail}`);
          }
        }
        await sleep(delays[attempt]);
      }
    }
    throw lastErr;
  }

  private async generateFallbackTts(text: string, outPath: string): Promise<void> {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const chunks = sentences.length > 0 ? sentences : [text];
    const audioBuffers: Buffer[] = [];

    for (const sentence of chunks) {
      const cleanText = sentence.trim().slice(0, 180);
      if (!cleanText) continue;
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=vi&client=tw-ob`;
      const resp = await axios.get<ArrayBuffer>(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        responseType: "arraybuffer",
        timeout: 15000,
      });
      audioBuffers.push(Buffer.from(resp.data));
    }

    if (audioBuffers.length === 0) {
      throw new Error("Fallback TTS empty audio buffers");
    }

    await writeFile(outPath, Buffer.concat(audioBuffers));
  }
}
