// v3 Animation Engine — Premium kinetic typography
// Warm editorial palette — NO cyan/blue
//
// IMPORTANT: Only use supported GSAP props: opacity, x, y, scale, scaleX, scaleY, rotation, width, height, visibility.
// Do NOT use `delay:` in vars — use position parameter (3rd arg) instead.

window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
window.__timelines["news-video"] = tl;

(function () {
  // ── Inject shimmer masks ──────────────────────────────────────────────────
  document.querySelectorAll(".shimmer-sweep-target").forEach((el) => {
    if (!el.querySelector(".shimmer-mask")) {
      const mask = document.createElement("div");
      mask.className = "shimmer-mask";
      el.appendChild(mask);
    }
  });

  const stage = document.getElementById("stage");
  const scenes = Array.from(stage.querySelectorAll(".scene"));

  // ── Scene dispatch ──────────────────────────────────────────────────────
  scenes.forEach((scene) => {
    const start  = parseFloat(scene.dataset.start);
    const dur    = parseFloat(scene.dataset.duration);
    const layout = scene.dataset.layout;

    // Scene hard-cut (no fade — faster feel)
    tl.set(scene, { opacity: 1 }, start);
    tl.set(scene, { opacity: 0 }, start + dur);

    // Scene background number entrance
    const bgNum = scene.querySelector(".bg-scene-num");
    if (bgNum) {
      tl.fromTo(bgNum,
        { scale: 1.3, opacity: 0 },
        { scale: 1,   opacity: 0.08, duration: 0.5 },
        start + 0.02
      );
    }

    // Scene icon entrance (if present — applies to all layouts)
    const icon = scene.querySelector(".scene-icon");
    if (icon) {
      tl.fromTo(icon,
        { scale: 0.3, opacity: 0, y: -20 },
        { scale: 1,   opacity: 1, y: 0, duration: 0.4 },
        start + 0.05
      );
      // Gentle float bobbing (finite repeat count to satisfy HyperFrames)
      const repeatCount = Math.max(1, Math.floor(dur / 1.2) - 1);
      tl.fromTo(icon,
        { y: 0 },
        { y: -18, duration: 1.2, yoyo: true, repeat: repeatCount },
        start + 0.5
      );
    }

    if (layout === "hook")         animateHook(scene, tl, start);
    else if (layout === "comparison")  animateComparison(scene, tl, start);
    else if (layout === "stat-hero")   animateStatHero(scene, tl, start);
    else if (layout === "feature-list") animateFeatureList(scene, tl, start);
    else if (layout === "callout")     animateCallout(scene, tl, start);
    else if (layout === "code-block")   animateCodeBlock(scene, tl, start);
    else if (layout === "benchmark")    animateBenchmark(scene, tl, start);
    else if (layout === "icon-grid")    animateIconGrid(scene, tl, start);
    else if (layout === "outro")       animateOutro(scene, tl, start, dur);
  });

  // ══════════════════════════════════════════════════════
  // HOOK — massive headline slam + subhead slice-up
  // ══════════════════════════════════════════════════════
  function animateHook(scene, tl, start) {
    const headline = scene.querySelector(".hook-headline");
    if (headline) {
      // Slam down from above — heavyweight impact
      tl.fromTo(headline,
        { y: -80, scale: 1.15, opacity: 0 },
        { y: 0,   scale: 1,    opacity: 1, duration: 0.5 },
        start + 0.1
      );
      // Shimmer sweep 0.6s after entrance
      const mask = headline.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-130%" }, { x: "130%", duration: 0.9 }, start + 0.6);
      }
    }

    const divider = scene.querySelector(".hook-divider");
    if (divider) {
      tl.fromTo(divider, { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.45 }, start + 0.45);
    }

    const subhead = scene.querySelector(".hook-subhead");
    if (subhead) {
      // Slice up from below
      tl.fromTo(subhead,
        { y: 55, opacity: 0, scale: 0.96 },
        { y: 0,  opacity: 1, scale: 1,    duration: 0.45 },
        start + 0.55
      );
    }
  }

  // ══════════════════════════════════════════════════════
  // COMPARISON — left card flies in, VS pops, right flies in
  // ══════════════════════════════════════════════════════
  function animateComparison(scene, tl, start) {
    const leftCard = scene.querySelector(".cmp-left");
    if (leftCard) {
      tl.fromTo(leftCard, { x: -100, opacity: 0, scale: 0.95 }, { x: 0, opacity: 1, scale: 1, duration: 0.42 }, start + 0.12);
    }

    const vs = scene.querySelector(".cmp-vs");
    if (vs) {
      tl.fromTo(vs, { scale: 0.2, opacity: 0, rotation: -15 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.3 }, start + 0.42);
    }

    const rightCard = scene.querySelector(".cmp-right");
    if (rightCard) {
      tl.fromTo(rightCard, { x: 100, opacity: 0, scale: 0.95 }, { x: 0, opacity: 1, scale: 1, duration: 0.42 }, start + 0.58);
    }
  }

  // ══════════════════════════════════════════════════════
  // STAT HERO — number zooms in + pulse glow
  // ══════════════════════════════════════════════════════
  function animateStatHero(scene, tl, start) {
    const value = scene.querySelector(".stat-value");
    if (value) {
      // Explosive scale-in
      tl.fromTo(value,
        { scale: 0.1, opacity: 0 },
        { scale: 1.08, opacity: 1, duration: 0.45 },
        start + 0.1
      );
      // Settle back to 1.0
      tl.to(value, { scale: 1.0, duration: 0.2 }, start + 0.55);
      // Shimmer
      const mask = value.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-130%" }, { x: "130%", duration: 0.85 }, start + 0.65);
      }
    }

    const label = scene.querySelector(".stat-label");
    if (label) {
      tl.fromTo(label, { y: 45, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, start + 0.5);
    }

    const context = scene.querySelector(".stat-context");
    if (context) {
      tl.fromTo(context, { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 }, start + 0.78);
    }
  }

  // ══════════════════════════════════════════════════════
  // FEATURE LIST — card rises, rule draws, bullets cascade in
  // ══════════════════════════════════════════════════════
  function animateFeatureList(scene, tl, start) {
    const card = scene.querySelector(".feat-card");
    if (card) {
      tl.fromTo(card,
        { y: 70, scale: 0.94, opacity: 0 },
        { y: 0,  scale: 1,    opacity: 1, duration: 0.45 },
        start + 0.08
      );
    }

    const rule = scene.querySelector(".feat-rule");
    if (rule) {
      tl.fromTo(rule, { scaleX: 0, opacity: 1 }, { scaleX: 1, opacity: 1, duration: 0.38 }, start + 0.4);
    }

    const bullets = scene.querySelectorAll(".feat-bullet");
    bullets.forEach((b, i) => {
      tl.fromTo(b,
        { x: -50, opacity: 0 },
        { x: 0,   opacity: 1, duration: 0.35 },
        start + 0.55 + i * 0.13
      );
    });
  }

  // ══════════════════════════════════════════════════════
  // CALLOUT — icon bounces in, card slides + expands, tag badge pops
  // ══════════════════════════════════════════════════════
  function animateCallout(scene, tl, start) {
    const calloutIcon = scene.querySelector(".callout-icon");
    if (calloutIcon) {
      tl.fromTo(calloutIcon,
        { scale: 0.1, opacity: 0, y: 30 },
        { scale: 1.15, opacity: 1, y: 0, duration: 0.38 },
        start + 0.08
      );
      tl.to(calloutIcon, { scale: 1.0, duration: 0.2 }, start + 0.46);
    }

    const card = scene.querySelector(".callout-card");
    if (card) {
      tl.fromTo(card,
        { y: 60, scale: 0.91, opacity: 0 },
        { y: 0,  scale: 1,    opacity: 1, duration: 0.45 },
        calloutIcon ? start + 0.28 : start + 0.15
      );
    }

    const tag = scene.querySelector(".callout-tag");
    if (tag) {
      tl.fromTo(tag, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.28 }, start + 0.55);
    }
  }

  // ══════════════════════════════════════════════════════
  // CODE BLOCK — card enters, lines cascade in
  // ══════════════════════════════════════════════════════
  function animateCodeBlock(scene, tl, start) {
    const card = scene.querySelector(".code-card");
    if (card) {
      tl.fromTo(card,
        { y: 60, scale: 0.94, opacity: 0 },
        { y: 0,  scale: 1,    opacity: 1, duration: 0.45 },
        start + 0.1
      );
    }

    const lines = scene.querySelectorAll(".code-line, .code-cmd, .code-comment");
    lines.forEach((line, i) => {
      tl.fromTo(line,
        { x: -30, opacity: 0 },
        { x: 0,   opacity: 1, duration: 0.3 },
        start + 0.4 + i * 0.1
      );
    });
  }

  // ══════════════════════════════════════════════════════
  // BENCHMARK — card pops, needle slides, value slams
  // ══════════════════════════════════════════════════════
  function animateBenchmark(scene, tl, start) {
    const card = scene.querySelector(".bench-card");
    if (card) {
      tl.fromTo(card,
        { y: 60, opacity: 0 },
        { y: 0,  opacity: 1, duration: 0.45 },
        start + 0.08
      );
    }

    const fill = scene.querySelector(".bench-fill");
    const needle = scene.querySelector(".bench-needle");
    if (fill && needle) {
      const targetPct = fill.style.width || "50%";
      tl.fromTo(fill, { width: "0%" }, { width: targetPct, duration: 0.8 }, start + 0.3);
      tl.fromTo(needle, { left: "0%" }, { left: targetPct, duration: 0.8 }, start + 0.3);
    }

    const value = scene.querySelector(".bench-value");
    if (value) {
      tl.fromTo(value,
        { scale: 0.2, opacity: 0 },
        { scale: 1,   opacity: 1, duration: 0.4 },
        start + 0.6
      );
    }

    const label = scene.querySelector(".bench-label");
    if (label) {
      tl.fromTo(label, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 }, start + 0.75);
    }

    const context = scene.querySelector(".bench-context");
    if (context) {
      tl.fromTo(context, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 }, start + 0.9);
    }
  }

  // ══════════════════════════════════════════════════════
  // ICON GRID — title slides down, cards pop in grid order
  // ══════════════════════════════════════════════════════
  function animateIconGrid(scene, tl, start) {
    const title = scene.querySelector(".grid-title");
    if (title) {
      tl.fromTo(title, { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, start + 0.1);
    }

    const cards = scene.querySelectorAll(".grid-card");
    cards.forEach((c, i) => {
      tl.fromTo(c,
        { scale: 0.75, opacity: 0, y: 30 },
        { scale: 1,    opacity: 1, y: 0, duration: 0.38 },
        start + 0.35 + i * 0.1
      );
    });
  }

  // ══════════════════════════════════════════════════════
  // OUTRO — CTA slides down, channel slams in, TikTok card rises
  // ══════════════════════════════════════════════════════
  function animateOutro(scene, tl, start, dur) {
    const cta = scene.querySelector(".out-cta-top");
    if (cta) {
      tl.fromTo(cta, { y: -40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, start + 0.15);
    }

    const channel = scene.querySelector(".out-channel");
    if (channel) {
      tl.fromTo(channel,
        { scale: 0.55, opacity: 0, y: 30 },
        { scale: 1,    opacity: 1, y: 0,  duration: 0.5 },
        start + 0.48
      );
      // Shimmer
      const mask = channel.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-130%" }, { x: "130%", duration: 1.0 }, start + 0.9);
      }
    }

    const underline = scene.querySelector(".out-underline");
    if (underline) {
      tl.fromTo(underline, { width: 0, opacity: 1 }, { width: "560px", opacity: 1, duration: 0.48 }, start + 0.85);
    }

    const source = scene.querySelector(".out-source");
    if (source) {
      tl.fromTo(source, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.35 }, start + 1.25);
    }

    // ── TikTok follow card ──────────────────────────────────────────────
    const ttCard = scene.querySelector("#tt-card");
    if (ttCard) {
      const ttBtn      = scene.querySelector("#tt-follow-btn");
      const ttFollow   = scene.querySelector("#tt-btn-follow");
      const ttFollwing = scene.querySelector("#tt-btn-following");
      const ttBase = start + 1.5;

      tl.fromTo(ttCard,
        { opacity: 0, y: 280 },
        { opacity: 1, y: 0, duration: 0.48 },
        ttBase
      );

      if (ttBtn) {
        tl.to(ttBtn, { scale: 0.90, duration: 0.14 }, ttBase + 0.85);
        tl.to(ttBtn, { scale: 1.0,  duration: 0.35 }, ttBase + 0.99);
      }
      if (ttFollow)   tl.to(ttFollow,   { opacity: 0, duration: 0.08 }, ttBase + 0.99);
      if (ttFollwing) tl.to(ttFollwing, { opacity: 1, duration: 0.08 }, ttBase + 1.02);

      const holdStart = ttBase + 1.2;
      const holdEnd   = start + dur - 0.1;
      const holdLen   = Math.max(0.5, holdEnd - holdStart);
      tl.to(ttCard, { scale: 1.06, duration: holdLen }, holdStart);
    }
  }
})();
