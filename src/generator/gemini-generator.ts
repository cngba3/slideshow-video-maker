import axios from "axios";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { ScriptSchema, type Script } from "../render/script-schema.js";
import { loadConfig } from "../config.js";
import { toSlug } from "../utils/slug.js";
import { log } from "../utils/logger.js";

export interface ArticleContent {
  title: string;
  content: string;
  ogImage: string | null;
  domain: string;
  url: string;
}

/**
 * Extract article text & metadata from a URL, local .txt file, or direct prompt text
 */
export async function extractArticle(input: string): Promise<ArticleContent> {
  const isUrl = input.startsWith("http://") || input.startsWith("https://");

  if (isUrl) {
    log.info(`Fetching article content from URL: ${input}...`);
    try {
      const resp = await axios.get<string>(input, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        timeout: 15000,
      });
      const html = resp.data;
      const parsedUrl = new URL(input);
      const domain = parsedUrl.hostname.replace(/^www\./, "");

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i) ||
        html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
      const title = titleMatch ? titleMatch[1].trim() : "Tin tức công nghệ";

      // Extract og:image
      const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
      const ogImage = ogMatch ? ogMatch[1].trim() : null;

      // Extract body text (strip HTML tags)
      const cleanText = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const content = cleanText.slice(0, 5000); // take first ~5000 chars

      return { title, content, ogImage, domain, url: input };
    } catch (err) {
      throw new Error(`Failed to fetch article from ${input}: ${(err as Error).message}`);
    }
  } else {
    // Determine if input is meant to be a file path (.txt, .md or existing file)
    const isExplicitFile = input.endsWith(".txt") || input.endsWith(".md") || existsSync(input);

    if (isExplicitFile) {
      try {
        log.info(`Reading article from text file: ${input}...`);
        const raw = await readFile(input, "utf8");
        const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) {
          throw new Error(`Text file ${input} is empty.`);
        }
        const title = lines[0].slice(0, 80);
        const content = lines.slice(1).join("\n") || title;
        return {
          title,
          content,
          ogImage: null,
          domain: "local",
          url: input,
        };
      } catch (err) {
        if (!existsSync(input)) {
          // If file path given but file does not exist, fallback to direct text prompt
          log.info(`File ${input} not found. Processing as direct prompt text...`);
          const firstLine = input.split("\n")[0].trim();
          const title = firstLine.slice(0, 80) || "Tin tức công nghệ";
          return { title, content: input, ogImage: null, domain: "tin-tuc", url: "topic" };
        }
        throw err;
      }
    } else {
      // Direct raw text or short title/topic prompt
      log.info(`Processing input as direct topic/title prompt: "${input.slice(0, 50)}..."`);
      const firstLine = input.split("\n")[0].trim();
      const title = firstLine.slice(0, 80) || "Tin tức công nghệ";
      return {
        title,
        content: input,
        ogImage: null,
        domain: "tin-tuc",
        url: "topic",
      };
    }
  }
}

/**
 * Generate script.json using Google AI Studio (Gemini 2.5 Flash)
 */
export async function generateScriptWithGemini(input: string): Promise<string> {
  const cfg = loadConfig();
  const apiKey = cfg.geminiApiKey;

  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY (or GOOGLE_API_KEY) in .env.local.\n" +
      "Please set GEMINI_API_KEY in .env.local to generate video scripts using Google AI Studio."
    );
  }

  const article = await extractArticle(input);

  log.info(`Generating script via Gemini AI (${cfg.geminiModel})...`);
  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
Bạn là biên tập viên video ngắn chuyên nghiệp cho TikTok / YouTube Shorts (khung hình 9:16).
Nhiệm vụ của bạn là phân tích thông tin đầu vào (bài báo hoặc ý tưởng/tiêu đề ngắn) và biên soạn thành file kịch bản JSON (script.json) chuẩn.

QUY TẮC NỘI DUNG & THỜI LƯỢNG:
- Nếu đầu vào là một tiêu đề hoặc ý tưởng ngắn (chỉ 1-2 câu), bạn hãy tự phát triển và mở rộng thành một kịch bản tin tức cuốn hút gồm 5 đến 8 cảnh (scenes).
- Kịch bản gồm từ 5 đến 8 cảnh (scenes): Cảnh đầu tiên có type="hook", các cảnh giữa có type="body", cảnh cuối cùng có type="outro".
- Tổng số từ trong tất cả trường voiceText khoảng 150-200 từ (đủ đọc trong ~55-65 giây với tốc độ bình thường).
- Giọng văn nói tự nhiên, lôi cuốn, tạo sự chú ý ngay từ 3 giây đầu tiên. Không chứa emoji hay ký tự đặc biệt trong voiceText.


⚠️ QUY TẮC NGUYÊN TẮC BẮT BUỘC CHO VOICETEXT (ĐỂ TTS ĐỌC ĐÚNG):
Vì voiceText được đọc bởi động cơ Text-to-Speech tiếng Việt (Vbee / LucyLab / ElevenLabs), MỌI SỐ VÀ KÝ TỰ ĐẶC BIỆT PHẢI ĐƯỢC PHIÊN ÂM THÀNH CHỮ TIẾNG VIỆT:
1. Số thập phân / Phiên bản: "5.5" -> "năm chấm năm", "iOS 18.2" -> "iOS mười tám chấm hai", "GPT-4.5" -> "GPT bốn chấm năm".
2. Phần trăm: "82.7%" -> "tám mươi hai phẩy bảy phần trăm", "30%" -> "ba mươi phần trăm".
3. Giá cả: "$500" -> "năm trăm đô la", "21 triệu" -> "hai mươi mốt triệu đồng".
4. Thông số kỹ thuật: "200MP" -> "hai trăm megapixel", "5000mAh" -> "năm nghìn miliampe giờ", "1M tokens" -> "một triệu token".
5. Bội số: "2x" -> "gấp đôi", "3x" -> "gấp ba".
6. Năm: "2026" -> "năm hai nghìn không trăm hai mươi sáu".
7. Tên thương hiệu tiếng Anh (Apple, Google, OpenAI, TikTok, YouTube) giữ nguyên. Các từ viết tắt có thể viết dạng phát âm nếu cần (AI -> ây ai, API -> ây pi ai).
8. Tuyệt đối KHÔNG có emoji, dấu %, $, #, +, =, -> trong voiceText.

CÁC DẠNG TEMPLATE DÙNG TRONG SCENES (templateData):
1. hook: { "template": "hook", "headline": "Tiêu đề ngắn 3-6 từ", "subhead": "Phụ đề ngắn", "kenBurns": "zoom-in" }
2. comparison: { "template": "comparison", "left": { "label": "Nhãn A", "value": "Giá trị A", "color": "cyan" }, "right": { "label": "Nhãn B", "value": "Giá trị B", "color": "purple", "winner": true } }
3. stat-hero: { "template": "stat-hero", "value": "Số liệu nổi bật (vd: 82.7%)", "label": "Mô tả số liệu", "context": "Ngữ cảnh bổ sung" }
4. feature-list: { "template": "feature-list", "title": "Tiêu đề danh sách", "bullets": ["Ý 1", "Ý 2", "Ý 3"] }
5. callout: { "template": "callout", "statement": "Trích dẫn hoặc khẳng định quan trọng", "tag": "ĐIỂM CHÚ Ý" }
6. code-block: { "template": "code-block", "title": "Tiêu đề khối mã/lệnh", "filename": "terminal", "lines": ["# Lệnh cài đặt", "claude plugin install ..."] }
7. benchmark: { "template": "benchmark", "title": "ĐÁNH GIÁ BENCHMARK", "percentage": "64.37%", "valueNumber": 64, "label": "Dẫn đầu thị trường", "context": "Ngữ cảnh bổ sung" }
8. icon-grid: { "template": "icon-grid", "title": "Tiêu đề danh sách ô", "items": [{ "icon": "🏦", "label": "Mục 1" }, { "icon": "🛡️", "label": "Mục 2" }] }
9. outro: { "template": "outro", "ctaTop": "Đăng ký kênh ngay", "channelName": "Công nghệ 24h", "source": "${article.domain}" }

TRƯỜNG BỔ SUNG "sceneIcon" (BẮT BUỘC CHO MỌI SCENE TRỪ OUTRO):
- Với mỗi scene (trừ scene outro), hãy thêm trường "sceneIcon": 1-2 emoji / symbol / icon phù hợp nhất với nội dung scene đó.
- Emoji sẽ được hiển thị to, nổi bật phía trên nội dung, làm điểm nhấn visual cho slide video HTML.
- Chọn emoji cụ thể, sinh động, không dùng emoji chung chung. Tránh trùng lặp giữa các scene.

TRẢ VỀ DUY NHẤT 1 ĐỐI TƯỢNG JSON ĐÚNG ĐỊNH DẠNG SAU:
{
  "version": "1.0",
  "metadata": {
    "title": "${article.title.replace(/"/g, '\\"')}",
    "source": {
      "url": "${article.url}",
      "domain": "${article.domain}",
      "image": null
    },
    "channel": "Công nghệ 24h",
    "theme": "light"
  },
  "voice": {
    "provider": "${cfg.ttsProvider}",
    "voiceId": "${cfg.vbeeVoiceCode || cfg.lucylabVoiceId || cfg.elevenlabsVoiceId || "default"}",
    "speed": 1.0
  },
  "scenes": [
    {
      "id": "scene-1",
      "type": "hook",
      "voiceText": "...",
      "sceneIcon": "🔥",
      "templateData": { "template": "hook", "headline": "...", "subhead": "..." }
    },
    ... các scene body với đa dạng templateData (code-block, benchmark, icon-grid, stat-hero, feature-list, callout)...,
    {
      "id": "scene-final",
      "type": "outro",
      "voiceText": "...",
      "templateData": { "template": "outro", "ctaTop": "Đăng ký kênh ngay", "channelName": "Công nghệ 24h", "source": "${article.domain}" }
    }
  ]
}
`;

  const candidateModels = Array.from(
    new Set([cfg.geminiModel, "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-pro"])
  );

  let rawJson = "";
  let lastError: Error | null = null;

  for (const modelName of candidateModels) {
    try {
      log.info(`Generating script via Gemini AI (${modelName})...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Tạo kịch bản video ngắn cho bài báo sau:\n\nTIÊU ĐỀ: ${article.title}\n\nNỘI DUNG:\n${article.content}`,
              },
            ],
          },
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      });

      if (response.text) {
        rawJson = response.text;
        break;
      }
    } catch (err) {
      lastError = err as Error;
      log.warn(`Model ${modelName} failed (${(err as Error).message}) — trying fallback model...`);
    }
  }

  if (!rawJson && cfg.groqApiKey) {
    log.info("All Gemini models failed — trying Groq (llama-3.3-70b) fallback...");
    try {
      const groqRes = await axios.post<{ choices: Array<{ message: { content: string } }> }>(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemInstruction },
            {
              role: "user",
              content: `Tạo kịch bản video ngắn cho bài báo sau:\n\nTIÊU ĐỀ: ${article.title}\n\nNỘI DUNG:\n${article.content}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 4096,
          response_format: { type: "json_object" },
        },
        {
          headers: {
            Authorization: `Bearer ${cfg.groqApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        }
      );
      rawJson = groqRes.data.choices?.[0]?.message?.content ?? "";
      if (rawJson) log.info("Groq (llama-3.3-70b) generated script successfully.");
    } catch (groqErr) {
      log.warn(`Groq fallback also failed: ${(groqErr as Error).message}`);
    }
  }

  if (!rawJson) {
    throw new Error(`Script generation failed on all providers (Gemini + Groq): ${lastError?.message || "empty response"}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    throw new Error(`Failed to parse JSON returned by Gemini: ${(err as Error).message}\nRaw output: ${rawJson}`);
  }

  const script: Script = ScriptSchema.parse(parsed);

  // Prepare output folder
  const slug = toSlug(article.title);
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const outputDir = join(process.cwd(), "output", `${slug}-${dateStr}`);
  await mkdir(outputDir, { recursive: true });

  const scriptPath = join(outputDir, "script.json");
  await writeFile(scriptPath, JSON.stringify(script, null, 2), "utf8");

  log.info(`Generated script.json successfully at: ${scriptPath}`);
  return scriptPath;
}
