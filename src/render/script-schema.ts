import { z } from "zod";

// ── Template data shapes (discriminated by template field) ─────────────────

const HookData = z.object({
  template: z.literal("hook"),
  headline: z.string().min(1).max(40),
  subhead: z.string().max(40).optional(),
  /** background image path (literal "$source.image" → substituted at pipeline level) */
  bgSrc: z.string().optional(),
  /** Ken Burns effect class */
  kenBurns: z.enum(["zoom-in", "zoom-out", "pan-left", "pan-right"]).default("zoom-in"),
});

const ComparisonSide = z.object({
  label: z.string().min(1).max(40),
  value: z.string().min(1).max(30),
  color: z.enum(["cyan", "purple", "gold", "amber", "red", "cream"]).or(z.string()),
});

const ComparisonData = z.object({
  template: z.literal("comparison"),
  left: ComparisonSide,
  right: ComparisonSide.extend({ winner: z.boolean().optional() }),
});

const StatHeroData = z.object({
  template: z.literal("stat-hero"),
  value: z.string().min(1).max(30),
  label: z.string().min(1).max(60),
  context: z.string().max(100).optional(),
});

const FeatureListData = z.object({
  template: z.literal("feature-list"),
  title: z.string().min(1).max(60),
  bullets: z.array(z.string().min(1).max(80)).min(1).max(4),
  icon: z.string().optional(),
});

const CalloutData = z.object({
  template: z.literal("callout"),
  statement: z.string().min(1).max(120),
  tag: z.string().max(40).optional(),
});

const CodeBlockData = z.object({
  template: z.literal("code-block"),
  title: z.string().min(1).max(60),
  filename: z.string().max(40).optional().default("terminal"),
  lines: z.array(z.string()).min(1).max(10),
});

const BenchmarkData = z.object({
  template: z.literal("benchmark"),
  title: z.string().min(1).max(60),
  percentage: z.string().min(1).max(20),
  valueNumber: z.number().min(0).max(100).optional().default(64),
  label: z.string().min(1).max(80),
  context: z.string().max(120).optional(),
});

const GridItem = z.object({
  icon: z.string().min(1).max(10),
  label: z.string().min(1).max(40),
});

const IconGridData = z.object({
  template: z.literal("icon-grid"),
  title: z.string().min(1).max(60),
  items: z.array(GridItem).min(2).max(6),
});

const OutroData = z.object({
  template: z.literal("outro"),
  ctaTop: z.string().min(1).max(30),
  channelName: z.string().min(1).max(30),
  source: z.string().min(1).max(40),
});

export const TemplateData = z.discriminatedUnion("template", [
  HookData,
  ComparisonData,
  StatHeroData,
  FeatureListData,
  CalloutData,
  CodeBlockData,
  BenchmarkData,
  IconGridData,
  OutroData,
]);

export type TemplateDataType = z.infer<typeof TemplateData>;

// ── SFX schema ─────────────────────────────────────────────────────────────
/**
 * Per-scene sound effect override. If omitted, the pipeline picks a default
 * SFX based on the template type (see SKILL.md / pipeline DEFAULT_SFX).
 *
 * `name` examples: "transition/whoosh-soft", "emphasis/ding", "alert/notification"
 *   → resolves to assets/sfx/<name>.mp3
 * Set `name: "none"` to explicitly disable SFX for this scene.
 */
const SfxSpec = z.object({
  name: z.string().min(1),
  /** Volume 0–1, default 0.4 (so SFX doesn't drown the voice) */
  volume: z.number().min(0).max(1).default(0.4),
  /** Seconds offset from scene start (default 0). Negative = before scene. */
  startOffsetSec: z.number().default(0),
});

export type SfxSpecType = z.infer<typeof SfxSpec>;

// ── Scene schema ───────────────────────────────────────────────────────────

const Scene = z.object({
  id: z.string().min(1),
  type: z.enum(["hook", "body", "outro"]),
  voiceText: z.string().min(1),
  templateData: TemplateData,
  /** Optional sound effect override (else pipeline picks per template) */
  sfx: SfxSpec.optional(),
  /**
   * Emoji, symbol or unicode icon to display prominently in this scene.
   * Shown large above the content card. Use 1-2 emojis max.
   * Example: "💼", "📈", "🔥", "✅", "🎯", "💡", "🏆", "⚡"
   */
  sceneIcon: z.string().max(8).optional(),
});

// ── Root schema ────────────────────────────────────────────────────────────

export const ScriptSchema = z.object({
  version: z.literal("1.0"),
  metadata: z.object({
    title: z.string().min(1),
    source: z.object({
      url: z.string(),
      domain: z.string(),
      image: z.string().url().nullable(),
    }),
    channel: z.string().min(1),
    theme: z.enum(["dark", "light", "finance-gold"]).optional().default("dark"),
    font: z.enum(["montserrat", "lexend", "barlow", "jakarta", "be-vietnam"]).optional().default("montserrat"),
  }),
  voice: z.object({
    provider: z.enum(["lucylab", "elevenlabs", "vbee"]),
    voiceId: z.string().min(1),
    speed: z.number().min(0.5).max(2.0),
  }),
  scenes: z
    .array(Scene)
    .min(5)
    .max(8, "scenes must have at most 8 items")
    .refine(
      (s) => s[0]?.type === "hook",
      { message: "scenes[0] must be type=hook" }
    )
    .refine(
      (s) => s[s.length - 1]?.type === "outro",
      { message: "last scene must be type=outro" }
    ),
});

export type Script = z.infer<typeof ScriptSchema>;
