import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { VbeeClient } from "./vbee-client.js";

const opts = {
  token: "vbee_test_token",
  appId: "test_app_id",
  voiceCode: "hn_female_ngochuyen_full_48k-fhg",
  endpoint: "https://api.vbee.ai/v1/tts",
  speed: 1.0,
};

let tmpDir: string;

beforeEach(() => {
  nock.cleanAll();
  tmpDir = mkdtempSync(join(tmpdir(), "vbee-test-"));
});

afterEach(() => {
  nock.cleanAll();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("VbeeClient", () => {
  it("handles direct binary MP3 response", async () => {
    nock("https://api.vbee.ai")
      .post("/v1/tts", (b: any) => b.input_text === "Xin chào" && b.voice_code === opts.voiceCode)
      .matchHeader("authorization", "Bearer vbee_test_token")
      .reply(200, Buffer.from("VBEEMP3DATA"), { "content-type": "audio/mpeg" });

    const client = new VbeeClient(opts);
    const out = join(tmpDir, "out.mp3");
    await client.generate("Xin chào", out);
    expect(readFileSync(out).toString()).toBe("VBEEMP3DATA");
  });

  it("handles JSON response containing audio link URL", async () => {
    nock("https://api.vbee.ai")
      .post("/v1/tts")
      .reply(200, JSON.stringify({ audio_link: "https://cdn.vbee.ai/audio/123.mp3" }), {
        "content-type": "application/json",
      });

    nock("https://cdn.vbee.ai")
      .get("/audio/123.mp3")
      .reply(200, Buffer.from("DOWNLOADEDMP3"), { "content-type": "audio/mpeg" });

    const client = new VbeeClient(opts);
    const out = join(tmpDir, "out.mp3");
    await client.generate("Xin chào", out);
    expect(readFileSync(out).toString()).toBe("DOWNLOADEDMP3");
  });

  it("retries on 429 rate limit", async () => {
    nock("https://api.vbee.ai")
      .post("/v1/tts").reply(429, { message: "rate limited" })
      .post("/v1/tts").reply(200, Buffer.from("RETRYOK"), { "content-type": "audio/mpeg" });

    const client = new VbeeClient(opts);
    const out = join(tmpDir, "out.mp3");
    await client.generate("test retry", out);
    expect(readFileSync(out).toString()).toBe("RETRYOK");
  }, 10000);

  it("throws error on API failure response", async () => {
    nock("https://api.vbee.ai")
      .post("/v1/tts")
      .reply(401, { message: "Invalid token" });
    nock("https://translate.google.com")
      .get(/.*/)
      .reply(500);

    const client = new VbeeClient(opts);
    await expect(client.generate("test", join(tmpDir, "out.mp3")))
      .rejects.toThrow(/Vbee TTS failed/);
  });
});
