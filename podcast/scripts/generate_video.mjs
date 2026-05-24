#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const PROJECT = path.resolve(decodeURIComponent(__dirname), "..");

// Parse CLI args
function parseArgs(argv) {
  const args = {
    transcript: path.join(PROJECT, "exports", "V1", "transcript.json"),
    dialogue: path.join(PROJECT, "project", "dialogue.json"),
    output: path.join(PROJECT, "project", "index.html"),
    title: "Podcast",
    subtitle: "",
    duration: 0,
    width: 1920,
    height: 1080,
    audioSrc: "../exports/V1/podcast_final.mp3",
    accent: "#D4A574",
    scenes: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => { i++; if (i >= argv.length) throw new Error(`Missing value for ${arg}`); return argv[i]; };
    if (arg === "--transcript") args.transcript = path.resolve(next());
    else if (arg === "--dialogue") args.dialogue = path.resolve(next());
    else if (arg === "--output") args.output = path.resolve(next());
    else if (arg === "--title") args.title = next();
    else if (arg === "--subtitle") args.subtitle = next();
    else if (arg === "--duration") args.duration = Number(next());
    else if (arg === "--audio-src") args.audioSrc = next();
    else if (arg === "--accent") args.accent = next();
    else if (arg === "--scenes") args.scenes = path.resolve(next());
    else if (arg === "--help" || arg === "-h") { printHelp(); process.exit(0); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/generate_video.mjs --transcript exports/V1/transcript.json --title "My Podcast"

Options:
  --transcript PATH   transcript.json path (default: exports/V1/transcript.json)
  --dialogue PATH     dialogue.json path (default: project/dialogue.json)
  --output PATH       output HTML path (default: project/index.html)
  --title TEXT        podcast title
  --subtitle TEXT     subtitle text
  --duration SECONDS  total duration (default: auto from transcript)
  --audio-src PATH    audio file src relative to project/ (default: ../exports/V1/podcast_final.mp3)
  --accent COLOR      primary accent color (default: #D4A574)
  --scenes PATH       JSON file with scene definitions (default: auto-generate)
`);
}

// Auto-generate scenes from utterances (group ~6 utterances per scene)
function autoGenerateScenes(utterances, totalDuration) {
  const scenes = [];
  const groupSize = Math.max(3, Math.ceil(utterances.length / 8));
  const accents = ["#D4A574", "#748CAB", "#C9A96E", "#A85C5C", "#6B8E6B", "#8B7EC8", "#C87E8B", "#7EC8A0"];

  for (let i = 0; i < utterances.length; i += groupSize) {
    const chunk = utterances.slice(i, i + groupSize);
    const startTime = chunk[0].start_time / 1000;
    const endTime = chunk[chunk.length - 1].end_time / 1000;
    const sceneIndex = scenes.length;

    scenes.push({
      id: `scene-${sceneIndex}`,
      label: `Part ${sceneIndex + 1}`,
      startUtterance: i,
      endUtterance: Math.min(i + groupSize - 1, utterances.length - 1),
      timeStart: startTime,
      timeEnd: Math.min(endTime + 1, totalDuration),
      hero: `Part ${sceneIndex + 1}`,
      subtitle: chunk[0].text.slice(0, 20) + "...",
      accent: accents[sceneIndex % accents.length],
    });
  }
  return scenes;
}

function buildCaptionGroups(utterances) {
  const groups = [];
  for (const utt of utterances) {
    const text = utt.text.trim();
    if (!text) continue;
    groups.push({
      text,
      start: utt.start_time / 1000,
      end: utt.end_time / 1000,
      speaker: utt.additions?.speaker || "1",
    });
  }
  return groups;
}

function generateCaptionElements(groups) {
  return groups.map((g, i) => {
    const speakerClass = g.speaker === "1" ? "speaker-a" : "speaker-b";
    const dur = Math.max(0.1, g.end - g.start).toFixed(3);
    return `      <div class="caption-group clip ${speakerClass}" id="cap-${i}" data-start="${g.start.toFixed(3)}" data-duration="${dur}">${g.text}</div>`;
  }).join("\n");
}

function generateCaptionTimeline(groups) {
  const lines = ["    // Captions"];
  for (let i = 0; i < groups.length; i++) {
    lines.push(`    tl.fromTo("#cap-${i}", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" }, ${groups[i].start.toFixed(3)});`);
  }
  return lines.join("\n");
}

function generateSceneCards(scenes) {
  return scenes.map((s, i) => `      <section class="scene clip" id="scene-${i}" data-start="${s.timeStart.toFixed(1)}" data-duration="${(s.timeEnd - s.timeStart).toFixed(1)}" data-track-index="1">
        <div class="scene-content">
          <div class="scene-label">${s.label}</div>
          <div class="scene-hero" style="color: ${s.accent}">${s.hero}</div>
          <div class="scene-subtitle">${s.subtitle}</div>
          <div class="scene-line" style="background: ${s.accent}"></div>
        </div>
      </section>`).join("\n\n");
}

function generateSceneAnimations(scenes) {
  const lines = ["    // Scene entrance animations"];
  const patterns = [
    { label: { y: 30, opacity: 0 }, hero: { y: 50, opacity: 0, scale: 0.95 }, sub: { y: 20, opacity: 0 }, line: { scaleX: 0 } },
    { label: { x: -40, opacity: 0 }, hero: { y: 40, opacity: 0 }, sub: { x: 40, opacity: 0 }, line: { scaleX: 0 } },
    { label: { y: -30, opacity: 0 }, hero: { scale: 0.9, opacity: 0 }, sub: { y: 30, opacity: 0 }, line: { scaleX: 0 } },
    { label: { opacity: 0 }, hero: { y: 60, opacity: 0, rotation: -2 }, sub: { opacity: 0 }, line: { scaleX: 0 } },
  ];
  const eases = ["power3.out", "expo.out", "power2.out", "back.out(1.2)"];

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const dur = s.timeEnd - s.timeStart;
    const p = patterns[i % patterns.length];
    const ease = eases[i % eases.length];
    const t = s.timeStart;

    lines.push(`    // Scene ${i}: ${s.id}`);
    lines.push(`    tl.from("#scene-${i} .scene-label", { ...${JSON.stringify(p.label)}, duration: 0.6, ease: "${ease}" }, ${t.toFixed(1)});`);
    lines.push(`    tl.from("#scene-${i} .scene-hero", { ...${JSON.stringify(p.hero)}, duration: 0.8, ease: "${ease}" }, ${(t + 0.15).toFixed(1)});`);
    lines.push(`    tl.from("#scene-${i} .scene-subtitle", { ...${JSON.stringify(p.sub)}, duration: 0.6, ease: "${ease}" }, ${(t + 0.3).toFixed(1)});`);
    lines.push(`    tl.from("#scene-${i} .scene-line", { ...${JSON.stringify(p.line)}, duration: 0.8, ease: "power2.inOut" }, ${(t + 0.45).toFixed(1)});`);

    if (dur > 5) {
      lines.push(`    tl.to("#scene-${i} .scene-hero", { scale: 1.02, duration: 2, ease: "sine.inOut", yoyo: true, repeat: Math.floor(${(dur - 2) / 4}) }, ${(t + 1.5).toFixed(1)});`);
    }
  }

  // Final scene exit
  const last = scenes[scenes.length - 1];
  lines.push(`    // Final scene exit`);
  lines.push(`    tl.to("#scene-${scenes.length - 1} .scene-content", { opacity: 0, duration: 1.5, ease: "power2.in" }, ${(last.timeEnd - 2).toFixed(1)});`);

  return lines.join("\n");
}

// Main
const args = parseArgs(process.argv.slice(2));

// Load transcript
const transcriptPath = path.resolve(args.transcript);
if (!fs.existsSync(transcriptPath)) {
  console.error(`Transcript not found: ${transcriptPath}`);
  console.error(`Run ASR first: node scripts/volc_asr_auc.mjs --url "AUDIO_URL" --output ${transcriptPath}`);
  process.exit(1);
}
const transcript = JSON.parse(fs.readFileSync(transcriptPath, "utf8"));
const utterances = transcript.result?.utterances;
if (!utterances?.length) {
  console.error("No utterances found in transcript.json");
  process.exit(1);
}

// Determine duration
const lastUtterance = utterances[utterances.length - 1];
const autoDuration = Math.ceil(lastUtterance.end_time / 1000) + 5;
const DURATION_S = args.duration > 0 ? args.duration : autoDuration;
const W = args.width, H = args.height;

// Load or auto-generate scenes
let scenes;
if (args.scenes && fs.existsSync(args.scenes)) {
  scenes = JSON.parse(fs.readFileSync(args.scenes, "utf8"));
} else {
  scenes = autoGenerateScenes(utterances, DURATION_S);
}

const allGroups = buildCaptionGroups(utterances);

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${args.title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;700;900&family=Noto+Sans+SC:wght@300;400;700&display=swap" rel="stylesheet" />
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;700;900&family=Noto+Sans+SC:wght@300;400;700&display=swap');

      :root {
        --bg-deep: #0A0F1A;
        --bg-mid: #111827;
        --bg-surface: #1A2234;
        --text-primary: #F0EBD8;
        --text-secondary: #9CA3AF;
        --text-muted: #6B7280;
        --accent: ${args.accent};
        --border: rgba(240, 235, 216, 0.08);
      }

      * { margin: 0; padding: 0; box-sizing: border-box; }

      [data-composition-id="podcast"] {
        width: ${W}px;
        height: ${H}px;
        background: var(--bg-deep);
        font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif;
        color: var(--text-primary);
        overflow: hidden;
        position: relative;
      }

      .bg-texture {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 80% 60% at 20% 30%, rgba(116, 140, 171, 0.06) 0%, transparent 60%),
          radial-gradient(ellipse 60% 80% at 80% 70%, rgba(212, 165, 116, 0.04) 0%, transparent 60%);
        pointer-events: none;
        z-index: 0;
      }

      .grain {
        position: absolute;
        inset: 0;
        opacity: 0.03;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        pointer-events: none;
        z-index: 1;
      }

      .accent-line-top {
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 2px;
        background: linear-gradient(90deg, transparent, var(--accent), transparent);
        opacity: 0.3;
        z-index: 2;
      }

      .accent-line-bottom {
        position: absolute;
        bottom: 140px; left: 10%; right: 10%;
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--border), transparent);
        z-index: 2;
      }

      audio { position: absolute; width: 0; height: 0; }

      .scene {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
      }

      .scene-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        padding: 100px 160px 200px;
        gap: 20px;
      }

      .scene-label {
        font-family: 'Noto Sans SC', sans-serif;
        font-size: 18px;
        font-weight: 300;
        letter-spacing: 0.3em;
        text-transform: uppercase;
        color: var(--text-muted);
      }

      .scene-hero {
        font-size: 120px;
        font-weight: 900;
        line-height: 1.1;
        letter-spacing: -0.04em;
        text-align: center;
        max-width: 80%;
      }

      .scene-subtitle {
        font-size: 32px;
        font-weight: 300;
        color: var(--text-secondary);
        letter-spacing: 0.1em;
        text-align: center;
      }

      .scene-line {
        width: 80px;
        height: 2px;
        margin-top: 10px;
        opacity: 0.6;
      }

      .caption-bar {
        position: absolute;
        bottom: 40px;
        left: 0; right: 0;
        height: 80px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 50;
        padding: 0 120px;
      }

      .caption-group {
        position: absolute;
        font-family: 'Noto Serif SC', serif;
        font-size: 26px;
        font-weight: 300;
        line-height: 1.6;
        letter-spacing: 0.02em;
        text-align: center;
        max-width: 1600px;
        width: 100%;
      }

      .caption-group.speaker-a { color: var(--text-primary); }
      .caption-group.speaker-b { color: var(--accent); }

      .speaker-indicator {
        position: absolute;
        bottom: 130px;
        left: 120px;
        display: flex;
        gap: 24px;
        z-index: 50;
        font-family: 'Noto Sans SC', sans-serif;
        font-size: 14px;
        font-weight: 300;
        letter-spacing: 0.1em;
        color: var(--text-muted);
      }
      .speaker-dot {
        width: 8px; height: 8px;
        border-radius: 50%;
        display: inline-block;
        margin-right: 8px;
        vertical-align: middle;
      }
      .speaker-dot.a { background: var(--text-primary); }
      .speaker-dot.b { background: var(--accent); }

      .top-label {
        position: absolute;
        top: 40px; left: 60px;
        font-family: 'Noto Sans SC', sans-serif;
        font-size: 14px;
        font-weight: 300;
        letter-spacing: 0.2em;
        color: var(--text-muted);
        z-index: 50;
      }

      .progress-track {
        position: absolute;
        bottom: 12px; left: 60px; right: 60px;
        height: 2px;
        background: var(--border);
        z-index: 50;
      }
      .progress-fill {
        position: absolute;
        left: 0; top: 0;
        height: 100%; width: 0%;
        background: linear-gradient(90deg, var(--accent), var(--text-secondary));
      }
    </style>
  </head>
  <body>
    <div data-composition-id="podcast" id="root" data-start="0" data-width="${W}" data-height="${H}" data-duration="${DURATION_S}">

      <div class="bg-texture"></div>
      <div class="grain"></div>
      <div class="accent-line-top"></div>
      <div class="accent-line-bottom"></div>

      <audio id="podcast-audio" data-start="0" data-track-index="2" data-volume="1" src="${args.audioSrc}"></audio>

      <div class="top-label">PODCAST</div>

      <div class="speaker-indicator">
        <span><span class="speaker-dot a"></span>Speaker A</span>
        <span><span class="speaker-dot b"></span>Speaker B</span>
      </div>

${generateSceneCards(scenes)}

      <div class="caption-bar">
${generateCaptionElements(allGroups)}
      </div>

      <div class="progress-track">
        <div class="progress-fill" id="progress-fill"></div>
      </div>

      <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
      <script>
        window.__timelines = window.__timelines || {};
        const tl = gsap.timeline({ paused: true });

${generateSceneAnimations(scenes)}

${generateCaptionTimeline(allGroups)}

        // Progress bar
        tl.to("#progress-fill", { width: "100%", duration: ${DURATION_S}, ease: "none" }, 0);
      </script>
    </div>
  </body>
</html>`;

fs.writeFileSync(args.output, html, "utf8");
console.log(`Generated ${args.output}`);
console.log(`  ${scenes.length} scenes, ${allGroups.length} captions, ${DURATION_S}s`);
