---
name: ai-podcast
description: End-to-end AI podcast video production. Covers text-to-podcast-audio (Volcengine TTS), speech-to-text with timestamps (Volcengine ASR), HyperFrames composition, and rendering. Use when asked to create a podcast video, generate dialogue audio, transcribe audio with timing, or produce any audio-driven video content with synchronized animations and subtitles.
---

# AI Podcast — 播客视频制作 Skill

从话题/URL 到播客视频的完整链路：AI 生成对话 → 语音合成 → 语音转文字 → 动效合成 → 渲染输出。

对标 HyperFrames 标准流程（init → write → lint → inspect → render），用火山引擎 TTS/ASR 替代 Whisper/Kokoro。

---

## 固定配置（不要改）

| 配置项 | 值 |
|--------|-----|
| 女声 | `zh_female_vv_uranus_bigtts` |
| 男声 | `zh_male_wennuanahu_uranus_bigtts` |
| 片头音乐 | 始终加 `--head-music` |
| 片尾音乐 | **不要** `--tail-music` |
| 输出格式 | mp3 |
| 视频分辨率 | 横屏 1920×1080 / 竖屏 1080×1920 |

---

## Agent 执行流程（严格按步骤执行）

### Step 0: 准备版本目录

```bash
# 确定版本号（检查 exports/ 下已有目录，递增）
mkdir -p exports/VN/assets
```

**完成条件：** `exports/VN/` 和 `exports/VN/assets/` 目录存在。

---

### Step 1: 生成播客音频（TTS）

**默认音色：** `zh_female_vv_uranus_bigtts,zh_male_wennuanahu_uranus_bigtts`

**模式选择（只用这两种，不要用 --text 或 --nlp-file）：**
- **prompt 模式：** 直接用 `--prompt` 传话题内容（<1000 字全量传，>1000 字压缩到 1000 字以内）
- **URL 模式：** 用 `--url` 传网页链接，抓取内容转播客

```bash
# 方式 A：prompt 生成
node scripts/volc_podcast_ws.mjs \
  --prompt "话题内容" \
  --speakers "zh_female_vv_uranus_bigtts,zh_male_wennuanahu_uranus_bigtts" \
  --head-music \
  --output exports/VN/assets/podcast_final.mp3

# 方式 B：URL 生成
node scripts/volc_podcast_ws.mjs \
  --url "https://..." \
  --speakers "zh_female_vv_uranus_bigtts,zh_male_wennuanahu_uranus_bigtts" \
  --head-music \
  --output exports/VN/assets/podcast_final.mp3
```

**TTS 完成后会打印 `audio_url=...`，保存此 URL 供 Step 2 使用。**

**其他参数：**
- `--speech-rate N` — 语速（-10 ~ 10）
- `--head-music` — 片头音乐（**始终加**）
- `--tail-music` — 片尾音乐（**不要加**）
- `--random-order` — 随机打乱说话人顺序

**完成条件：** `exports/VN/assets/podcast_final.mp3` 存在且 >0 字节，终端打印了 `audio_url`。

**失败处理：** 检查 `.env` 凭证 → 检查网络 → 重试。

---

### Step 2: 语音转文字（ASR）

TTS 完成后**立即开始**，不需要等其他步骤。

**优先方案：直接用 TTS 返回的 audio_url（TOS 签名 URL，有效期约 24h）。**

```bash
node scripts/volc_asr_auc.mjs \
  --url "Step1保存的audio_url" \
  --punctuation --utterances --speaker-info \
  --output exports/VN/assets/transcript.json \
  --text-output exports/VN/assets/transcript.txt
```

**备选方案：audio_url 失效时，下载后传 COS。**

```bash
# 下载
curl -o exports/VN/assets/podcast_final.mp3 "audio_url"

# 上传到 COS（公有读写）
curl -T exports/VN/assets/podcast_final.mp3 \
  "https://temp-1372876299.cos.ap-guangzhou.myqcloud.com/exports/VN/assets/podcast_final.mp3"

# 用 COS URL 做 ASR
node scripts/volc_asr_auc.mjs \
  --url "https://temp-1372876299.cos.ap-guangzhou.myqcloud.com/exports/VN/assets/podcast_final.mp3" \
  --punctuation --utterances --speaker-info \
  --output exports/VN/assets/transcript.json \
  --text-output exports/VN/assets/transcript.txt
```

**完成条件：** `exports/VN/assets/transcript.json` 存在，包含 `result.utterances` 数组。

**质量检查（必须）：** 读取 transcript.json，确认：
- utterances 数量合理（不是空数组）
- 有 `start_time` / `end_time` 时间戳
- 有 `words` 逐字时间戳（用于字幕对齐）

---

### Step 3: 写 HyperFrames 合成（与 Step 2 可并行）

Step 2 启动后即可开始读取 `project/DESIGN.md` 和规划场景结构。Step 2 完成后才能写最终的字幕时间轴。

1. 读取 `project/DESIGN.md`（没有则按默认风格）
2. 读取 `exports/VN/assets/transcript.json` 的 utterances
3. 手写 `project/index.html`（推荐，控制力更强）
4. 音频 src 指向 `../exports/VN/assets/podcast_final.mp3`

**完成条件：** `project/index.html` 存在，包含 `data-composition-id` 和 `window.__timelines`。

---

### Step 4: 验证（lint + inspect 并行）

**两个命令同时执行，不要串行等待。**

```bash
# 终端 1
cd project && npx hyperframes lint

# 终端 2
cd project && npx hyperframes inspect --at 5,60,150,290
```

**lint 必须 0 errors。** warnings 可以接受但要记录。
**inspect 必须 0 layout issues。** 溢出元素加 `data-layout-allow-overflow` 或修复。

**完成条件：** lint 0 errors + inspect 0 issues。

**常见修复：**
- `timed_element_missing_clip_class` → 加 `class="clip"`
- `overlapping_gsap_tweens` → 调整时间或加 `overwrite: "auto"`
- `text_box_overflow` → 增大容器或减小字体
- `GSAP animation sets visibility on clip` → 不要动画 visibility

---

### Step 5: 渲染（draft 先行，high 最终）

**长视频（>60 秒）一律用 `run_in_background: true`，不要管道 tail。**

```bash
# 快速迭代（先出一版看效果）
cd project && npx hyperframes render --quality draft --output ../exports/VN/podcast_video.mp4

# 确认无误后高质量渲染
cd project && npx hyperframes render --quality high --output ../exports/VN/podcast_video.mp4
```

**完成条件：** `exports/VN/podcast_video.mp4` 存在，ffprobe 确认时长和分辨率正确。

---

### Step 6: 生成播客稿 Markdown

在 `exports/VN/` 根目录生成 `播客稿_VN.md`，包含：
- 标题、音色、时长等元信息
- 按章节分段的对话稿（标注说话人）
- 关键事件时间线表格

---

### Step 7: 清理目录

确保版本根目录只有交付物（视频 + 播客稿），其他文件移到 `assets/`。

---

## 迭代流程

修改 `project/index.html` → Step 4 (lint + inspect) → Step 5 (render) → 更新视频

**迭代时只改需要改的，不要重新生成音频和转写。**

---

## 快速跳过条件

| 条件 | 跳过步骤 |
|------|----------|
| 用户给了音频文件 | 跳过 Step 1，直接 Step 2 |
| 用户给了 transcript.json | 跳过 Step 2，直接 Step 3 |
| 用户只要改视觉 | 跳过 Step 1-2，直接 Step 3-5 |
| 用户只要重新渲染 | 跳过 Step 1-3，直接 Step 4-5 |

---

## 目录结构

```
工作目录/
├── .claude/skills/        # Claude Code 技能
├── .env                   # 火山引擎 API 凭证
├── exports/
│   ├── V1/                # 版本号递增，不复用
│   ├── V2/
│   └── VN/
│       ├── 播客稿_VN.md       # ← 交付物（根目录只放这两个）
│       ├── podcast_video.mp4  # ← 交付物
│       └── assets/            # ← 中间产物全放这里
│           ├── podcast_final.mp3
│           ├── transcript.json
│           ├── transcript.txt
│           ├── prompt.txt
│           └── scenes.json
├── project/               # HyperFrames 工作目录
│   ├── DESIGN.md
│   ├── index.html
│   ├── fonts/
│   └── compositions/
├── scripts/
│   ├── volc_podcast_ws.mjs
│   ├── volc_asr_auc.mjs
│   └── generate_video.mjs
└── versions.md
```

**exports 规范：** 每个版本根目录只放交付物（视频 + 播客稿），其他全部进 `assets/`。

---

## 字幕位置规范

### 横屏（1920×1080）

字幕距底部 **60px**，居中显示。底部有 speaker indicator 和 progress bar。

```css
.caption-bar {
  position: absolute;
  bottom: 60px;
  left: 0; right: 0;
  /* ... */
}
```

### 竖屏（1080×1920）

字幕位于画面 **3/4 高度处**（距底部约 480px），即把竖屏画面四等分，字幕落在第三格（从上往下数）。这个位置在中轴线以下，视觉重心稳且不遮挡主要内容。

**字体必须大！** 竖屏观看距离远、字号小了看不清。宁可多排几行（2-3 行都 OK），也要保证每行字号够大。只有在确实显示不全时才允许缩小，但底线是保证可读性。

如果 ASR 回传的 `transcript.json` 中逐字时间戳足够精准（有 `words` 数组），应尽量将字幕按语义细分——每句话、每个逗号断句单独一行，而非整段堆在一起。

```css
.caption-bar {
  position: absolute;
  bottom: 480px;  /* 竖屏 3/4 高度处：1920 × 1/4 = 480 */
  left: 0; right: 0;
  padding: 0 40px;
  /* ... */
}
.caption-group {
  font-size: 40px;  /* 竖屏字号必须大，保证远距离可读 */
  line-height: 1.6;
  letter-spacing: 0.02em;
}

/* 底部安全留白 — 不放任何内容 */
.safe-bottom {
  position: absolute;
  bottom: 0;
  left: 0; right: 0;
  height: 250px;
  /* 这个区域不放任何可见元素 */
}
```

**竖屏额外注意事项：**
- 场景内容 padding-bottom 加大到 **550px+**，避免正文和字幕重叠
- 字号基准 **40px**，只有显示不全时才缩小到 36px（不低于 34px）
- 字幕允许 2-3 行，优先保证字号大而非行数少
- 如果 ASR 有精确的 `words` 逐字时间戳，按语义断句细分字幕（逗号、句号、语气词处换行），而非整段一句话
- progress bar 放在字幕上方，不是最底部

---

## 视觉风格指南

### 字体

优先用衬线字体营造书籍排版高级感：
- 中文：`'Noto Serif SC', 'Songti SC', serif`
- 英文：`'Playfair Display', 'Georgia', serif`
- 辅助：`'Noto Sans SC', sans-serif`（标签、小字）

**注意：** Google Fonts 在离线渲染会失败。如有离线需求，下载 .woff2 到 `project/fonts/` 并用 `@font-face` 声明。

### 配色

书籍感暖色调：
- 背景：`#0D0B0E`（深紫黑）
- 正文：`#F0E6D3`（暖白/奶油色）
- 金色强调：`#C9A96E`
- 蓝色辅助：`#748CAB`
- 红色警示：`#A85C5C`
- 绿色成功：`#6B8E6B`

### 装饰元素

- 四角金色角标（`border-top/left` + `border-bottom/right`）
- 双层页面边框（外层 1px + 内层 0.5px，opacity 递减）
- 噪点纹理叠加（opacity 0.025）
- 径向渐变光晕

### 动画规范

**核心原则：动画跟随内容关键点，不要匀速平铺！**

动画应该在播客对话中的**关键信息点**触发——操作步骤、故事转折、建议、数据、对比、结论。不要每隔固定秒数硬塞动画，也不要整段画面一动不动。节奏是「静→动→静→动」的呼吸感，而不是匀速流水线。

**动效节奏框架（以 30 秒为一个内容节奏单元）：**

```
[场景入场动画] → 静态停留(3-8s) → [关键点动画1] → 静态停留(3-8s) → [关键点动画2] → ...
```

- **场景入场：** 每个场景开始时必须有入场动画（轮换使用下方 5 种模式）
- **关键点动画：** 只在内容真正有信息增量时触发——不是每个句子都需要动画
- **静态停留：** 动画之间留足呼吸时间，让观众消化信息。一般 3-8 秒，信息密集段可以短一些（2-4 秒），叙述/铺垫段可以长一些（6-10 秒）
- **场景收尾：** 最后 1-2 秒用淡出或静默过渡到下一场景

**什么该触发动画，什么不该：**

| 该动（有信息增量） | 不该动（铺垫/过渡） |
|---|---|
| 「第一步/第二步/…」→ 逐个展开 | 一般性寒暄、过渡语 |
| 故事/经历的关键转折 | 重复强调已说过的内容 |
| 强调某个核心概念 | 平铺直叙的背景介绍 |
| 列举要点（3 个以上） | 单句普通陈述 |
| 数据/数字出现 | 语气词、填充词 |
| 两种方案对比 | 已经在讲同一观点的展开 |
| 给出结论/建议 | |

**分析 transcript.json 时要做的事：**
1. 逐句扫描 utterances，标记所有关键信息点（步骤、建议、故事、数据、对比、结论）
2. 只对标记了的关键信息点配动画，不要给每句话都加
3. 动画类型要和内容语义匹配（步骤用逐个展开、对比用左右滑入、强调用缩放弹入、数据用数字跳动）
4. 检查节奏：相邻两个动画之间至少间隔 2 秒，避免视觉碎片化

| 动画类型 | 适用场景 | 示例 |
|----------|----------|------|
| 文字入场 | 场景标题 | `y: 50, opacity: 0 → 1, ease: "expo.out"` |
| 缩放入场 | 强调文字 | `scale: 0.95, opacity: 0 → 1, ease: "back.out(1.5)"` |
| 滑入 | 左右对比卡片 | `x: -80/80, opacity: 0 → 1` |
| 交错入场 | 列表项 | `stagger: 0.15, y: 15, opacity: 0` |
| 线条展开 | 装饰线 | `scaleX: 0 → 1, ease: "power2.inOut"` |
| 逐个展开 | 时间线步骤 | 每隔 N 秒入场，配合内容播放时间 |
| 弹性出场 | 结果/结论 | `ease: "back.out(2)"` |
| 淡出 | 场景结束 | `opacity: 1 → 0, duration: 2.0` |
| 高亮扫过 | 关键词强调 | marker sweep 效果，配合说话时机 |
| 数字跳动 | 数据/统计 | 数字从 0 快速跳到目标值 |
| 图标弹入 | 功能/操作提示 | `scale: 0 → 1.1 → 1, ease: "elastic.out(1, 0.5)"` |
| 背景脉动 | 节奏转折点 | 背景色/光晕微妙变化，配合语气转折 |
| 卡片翻转 | 观点切换 | `rotationY: 0 → 180`，正面→反面展示 |
| 描边路径 | 步骤/流程 | SVG path 逐步描边，展示操作路径 |
| 元素抖动 | 警告/注意 | `x: ±3, duration: 0.08, repeat: 3` |

**场景入场动画模式（轮换使用，不要重复）：**
1. 从下淡入（y + opacity）
2. 从左/右滑入（x + opacity）
3. 缩放淡入（scale + opacity）
4. 旋转淡入（rotation + opacity，轻度 ±2°）
5. 交错入场（stagger children）

**关键点动画类型（按内容语义匹配）：**
- 「第一步/第二步/…」→ 逐个展开动画，每步间隔 0.8-1.2 秒
- 讲故事/经历的关键转折 → 卡片从侧面滑入，配合叙事节奏
- 强调核心概念/关键词 → 高亮扫过 + 放大 + 颜色变化
- 给建议/操作步骤 → 图标弹入 + 文字高亮
- 列举要点（3+） → 列表项交错入场（stagger）
- 数据/数字 → 数字跳动动画
- 语气转折/重点句 → 背景脉动或装饰线展开
- 对比两种方案 → 左右卡片同时滑入

**GSAP 注意事项：**
- `.clip` 元素的 visibility 由框架管理，GSAP 不要动画 visibility
- 场景切换用 entrance 动画，不要 exit 动画（最后一场除外）
- 同一轨道元素时间不能重叠
- GSAP 动画必须同步构建（不能在 async/setTimeout 中）
- 不要用 `repeat: -1`
- **必须注册 timeline：** `window.__timelines["podcast"] = tl;`

---

## 竖屏场景结构模板

```html
<!-- 竖屏 1080×1920 -->
<div data-composition-id="podcast" data-width="1080" data-height="1920" data-duration="...">
  <!-- 顶部标题区 -->
  <div class="top-header">...</div>

  <!-- 场景内容区 — padding-bottom: 550px（避开 3/4 处字幕区） -->
  <section class="scene clip" data-start="..." data-duration="...">
    <div class="scene-content" style="padding: 100px 60px 550px;">
      <!-- 内容 -->
    </div>
  </section>

  <!-- 字幕区 — bottom: 480px（画面 3/4 高度处），字体必须大 -->
  <div class="caption-bar" style="bottom: 480px; padding: 0 40px;">
    <div class="caption-group clip" data-start="..." data-duration="...">字幕文字</div>
  </div>

  <!-- 底部安全留白（不放任何内容） -->
  <!-- 最后 250px 是平台 UI 占位 -->
  <!-- 字幕在 480px 处（画面 3/4），字体 40px，允许 2-3 行 -->
</div>
```

---

## COS 存储

腾讯 COS：`https://temp-1372876299.cos.ap-guangzhou.myqcloud.com`（公有读写）

仅在 TTS audio_url 失效时使用。目录与本地 exports 一致：

```bash
curl -T exports/VN/assets/podcast_final.mp3 \
  "https://temp-1372876299.cos.ap-guangzhou.myqcloud.com/exports/VN/assets/podcast_final.mp3"
```

---

## 火山引擎 API 参考

### 环境变量（.env）

```env
VOLC_ACCESS_KEY=
VOLC_API_KEY=
VOLC_PODCAST_API_KEY=
VOLC_RESOURCE_ID=volc.service_type.10050
VOLC_APP_KEY=aGjiRDfUWi
VOLC_PODCAST_WS_URL=wss://openspeech.bytedance.com/api/v3/sami/podcasttts
VOLC_ASR_RESOURCE_ID=volc.seedasr.auc
```

### 播客 TTS（WebSocket）

| 模式 | action | 参数 | 说明 |
|------|--------|------|------|
| prompt | 4 | `--prompt` | 模型自动生成双人对话（<1000 字全量传，>1000 字压缩） |
| URL | 0 | `--url` | 抓取网页内容，自动转播客 |

### ASR（HTTP 轮询）

- 音频必须公网 URL
- 轮询间隔 3s，超时 10min
- 状态码：`20000000`=完成

---

## 常见踩坑（必读）

### TTS prompt 模式长文本超时

`--prompt` 模式（action=4）长 prompt 处理时间远超 300 秒超时。**超过 1000 字的稿子要压缩到 1000 字以内再传 prompt，提取核心要点即可。**

### HyperFrames timeline 必须注册

`window.__timelines["podcast"] = tl;` 必须在 script 末尾，否则渲染器等 45 秒后报错。

### 后台渲染不要管道 tail

`npx hyperframes render ... 2>&1 | tail -5` 在 `run_in_background` 下会阻塞。直接 `2>&1` 输出。

### 渲染输出过大被截断

长视频帧捕获日志 >45KB 会截断。一律用 `run_in_background: true`。

### 工作目录

hyperframes 命令在 `project/` 执行，exports 在上级。用绝对路径或注意相对路径。
