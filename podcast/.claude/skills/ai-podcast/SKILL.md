---
name: ai-podcast
description: End-to-end AI podcast video production. Covers text-to-podcast-audio (Volcengine TTS), speech-to-text with timestamps (Volcengine ASR), HyperFrames composition with V3 template, and rendering. Use when asked to create a podcast video, generate dialogue audio, transcribe audio with timing, or produce any audio-driven video content with synchronized animations and subtitles.
---

# AI Podcast — 播客视频制作 Skill (V3 定版)

从话题/URL 到播客视频的完整链路：AI 生成对话 → 语音合成 → 语音转文字 → 字幕脚本生成 → 视觉模板填充 → 动效合成 → 渲染输出。

---

## 版本管理（重要）

### 主版本

每次全新生成（新话题、新音频）递增主版本号：`V1` → `V2` → `V3` → ...

```bash
mkdir -p exports/VN/assets
```

### 子版本（迭代修改时必做）

**同一话题的每次迭代修改，不要覆盖已有视频，创建子版本目录：**

```bash
# 第一次修改 V2 → 创建 V2.1
mkdir -p exports/V2.1/assets
cp exports/V2/assets/podcast_final.mp3 exports/V2.1/assets/
cp exports/V2/assets/transcript.json exports/V2.1/assets/

# 第二次修改 V2 → 创建 V2.2
mkdir -p exports/V2.2/assets
cp exports/V2.1/assets/podcast_final.mp3 exports/V2.2/assets/
cp exports/V2.1/assets/transcript.json exports/V2.2/assets/
```

**子版本导出路径规则：**
- 主版本：`exports/V2/podcast_video.mp4`
- 子版本：`exports/V2.1/podcast_video.mp4`、`exports/V2.2/podcast_video.mp4`
- `project/index.html` 中的音频 src 指向当前子版本：`../exports/V2.1/assets/podcast_final.mp3`

**严禁直接覆盖已有版本的视频文件。**

---

## 固定配置（不要改）

| 配置项 | 值 |
|--------|-----|
| 女声 | `zh_female_vv_uranus_bigtts` |
| 男声 | `zh_male_wennuanahu_uranus_bigtts` |
| 片头音乐 | 始终加 `--head-music` |
| 片尾音乐 | **不要** `--tail-music` |
| 输出格式 | mp3 |
| 视频分辨率 | 竖屏 1080×1920 |
| 字幕字体 | Songti SC / Noto Serif SC, 700 weight |
| 字幕字号 | 42px |
| 苏米颜色 | `#C9A96E` |
| 嘉宾颜色 | `#748CAB` |
| 背景色 | `#0D0B0E` |

---

## Agent 执行流程（严格按步骤执行）

### Step 0: 确定版本号

```bash
# 检查 exports/ 下最大版本号，新话题用下一个整数主版本
# 例如已有 V1、V2 → 新话题用 V3
mkdir -p exports/VN/assets
```

---

### Step 1: 生成播客音频（TTS）

**默认音色：** `zh_female_vv_uranus_bigtts,zh_male_wennuanahu_uranus_bigtts`

**prompt 前面必须加上开场白 `这里是苏米老师，`**

```bash
node scripts/volc_podcast_ws.mjs \
  --prompt "这里是苏米老师，[话题内容]" \
  --speakers "zh_female_vv_uranus_bigtts,zh_male_wennuanahu_uranus_bigtts" \
  --head-music \
  --output exports/VN/assets/podcast_final.mp3
```

**TTS 完成后保存 `audio_url=...` 供 Step 2。**

---

### Step 2: 语音转文字（ASR）

```bash
node scripts/volc_asr_auc.mjs \
  --url "Step1保存的audio_url" \
  --punctuation --utterances --speaker-info \
  --output exports/VN/assets/transcript.json \
  --text-output exports/VN/assets/transcript.txt
```

**质量检查（必须）：**
- utterances 数量合理（>50）
- 有 `start_time` / `end_time`
- 有 `words` 逐字时间戳数组（每个字都有 start/end）

---

### Step 3a: 生成字幕（用脚本，严禁手写）

**这是最关键的一步。** 字幕时间戳来自 transcript.json 的逐字数据，不是手动估算。

```bash
# 修改 build_captions.mjs 中的 transcript 路径指向当前版本
# const data = JSON.parse(fs.readFileSync('exports/VN/assets/transcript.json', 'utf8'));
node build_captions.mjs
```

脚本逻辑：
1. 遍历每个 utterance 的 `words[]` 数组（逐字时间戳）
2. 在标点（，。！？、；）处断句
3. 取每段第一个字和最后一个字的时间戳 → 精确 `data-start` / `data-duration`
4. 去除水词：呢/啊/呃/嘛/嗯/吧/哦/呀/哇 + 对对对/没错没错/OK对/就是/就是说
5. 合并 <900ms 的短段，拆分 >5000ms 的长段
6. 输出 HTML caption-item 片段

**输出示例（约 150 段）：**
```html
<div class="caption-item clip" data-start="7.3" data-duration="3.3" data-speaker="sumi"><span class="caption-text">今天我们要聊的是 2026年人工</span></div>
```

将输出替换到 `project/index.html` 的 `<!-- CAPTIONS_PLACEHOLDER -->` 处。

---

### Step 3b: 基于模板填充视觉元素

**模板文件：** `project/index.html`（基于 V3 定版）

**模板中 FIXED 标记的部分不可改：**
- 全部 CSS（设计系统）
- 装饰层（脉冲环、浮动几何、环境光球、边框、噪点、光晕）
- 说话人指示点
- GSAP 辅助函数和框架动画（光球、边框呼吸、字幕入场、指示点变色）

**Agent 需要填充（FILL 标记）：**
1. 替换 `PODCAST_TITLE`、`PODCAST_DURATION`、`AUDIO_PATH`
2. 分析 transcript.json，标记所有关键信息点
3. 在视觉元素区域填充卡片（约 70-90 个元素）
4. 在 GSAP 区域为每个视觉元素写入场动画

**视觉元素类型和用法见 `DESIGN.md`。**

**填充规则：**
- 密度：平均每 2-3 秒一个视觉元素
- 最长不超过 8 秒空白
- 轮换使用不同类型（不要连续 3 次同类型）
- 动画跟随内容关键信息点（数据、对比、步骤、结论、提问）

---

### Step 3c: 编写 GSAP 动画

GSAP 代码中已有 5 个辅助函数：

| 函数 | 用途 | 缓动 |
|------|------|------|
| `cardIn(sel, ts)` | 关键词卡、概念标签、提问卡 | `back.out(1.5)` |
| `slideUp(sel, ts)` | 普通卡片入场 | `expo.out` |
| `burstIn(sel, ts)` | 数据大字报 | `back.out(2.5)` |
| `emIn(sel, ts)` | 强调文字（分主副两段） | `expo.out` |
| `dotsPop(sel, ts)` | 装饰点组（stagger 0.12s） | `back.out(2)` |

**特殊动画（直接写 GSAP）：**
- 对比双栏左右滑入：`tl.from('.left', {x:-70,...}, ts); tl.from('.right', {x:70,...}, ts+0.2)`
- 流程步骤逐颗弹出：`tl.from('.process-step:nth-child(N)', {scale:0.6,...}, ts+N*0.5)`
- 要点列表交错：`tl.from('.bullet-item:nth-child(N)', {x:-30,...}, ts+N*0.7)`
- 概念标签交错：`tl.from('.concept-tag:nth-child(N)', {scale:0.7,...}, ts+N*0.3)`

**脉冲环触发：** 在 5-8 个关键情绪转折点调用 `pulseRing(".pulse-ring.rN", TIME)`

**环境光球 repeat 计算：** `repeat = Math.floor(totalDuration / (duration * 2))`

---

### Step 4: 验证（lint + inspect 并行）

```bash
cd project && npx hyperframes lint &
cd project && npx hyperframes inspect --at 15,60,150,250,380,480,550 &
wait
```

**lint 必须 0 errors。inspect 必须 0 layout issues。**

---

### Step 5: 渲染

```bash
# 长视频（>60 秒）一律用 run_in_background: true
cd project && npx hyperframes render --quality high --output ../exports/VN/podcast_video.mp4 2>&1
```

---

### Step 6: 生成播客稿

在 `exports/VN/` 生成 `播客稿_VN.md`，包含标题、音色、时长、章节对话稿、动效时间线。

---

### Step 7: 清理

版本根目录只放视频 + 播客稿，其他文件移到 `assets/`。

---

## 迭代流程（子版本管理）

每次修改视觉 → 创建子版本，不要覆盖：

```bash
# 1. 创建子版本
mkdir -p exports/V2.1/assets
cp exports/V2/assets/podcast_final.mp3 exports/V2.1/assets/
cp exports/V2/assets/transcript.json exports/V2.1/assets/

# 2. 更新 project/index.html 中的音频路径
# src="../exports/V2.1/assets/podcast_final.mp3"

# 3. 修改 project/index.html → lint + inspect → render
cd project && npx hyperframes render --quality high --output ../exports/V2.1/podcast_video.mp4
```

---

## 快速跳过条件

| 条件 | 跳过步骤 |
|------|----------|
| 用户给了音频 | 跳过 Step 1 |
| 用户给了 transcript.json | 跳过 Step 1-2 |
| 只改视觉 | 跳过 Step 1-2，从 Step 3a 开始 |
| 只重新渲染 | 跳过 Step 1-3，直接 Step 4-5 |

---

## 目录结构

```
工作目录/
├── .env
├── build_captions.mjs        # 字幕生成脚本
├── exports/
│   ├── V1/
│   ├── V2/
│   │   ├── podcast_video.mp4
│   │   ├── 播客稿_V2.md
│   │   └── assets/
│   ├── V2.1/                  # 子版本（迭代修改）
│   │   ├── podcast_video.mp4
│   │   └── assets/
│   └── V3/
├── project/
│   ├── DESIGN.md              # 设计规范（完整）
│   ├── index.html             # V3 模板
│   ├── fonts/
│   └── compositions/
└── scripts/
    ├── volc_podcast_ws.mjs
    ├── volc_asr_auc.mjs
    └── generate_video.mjs
```

---

## 踩坑清单（Agent 必须遵守，逐条检查）

### 字幕相关

1. **字幕必须 `position: absolute`** — 用 flex 流式布局会导致所有字幕挤在一个超高容器里，overflow hidden 后只有最后几条可见。每条 `.caption-item` 必须绝对定位在固定位置。

2. **字幕时间戳必须来自 ASR 逐字数据** — `transcript.json` 的 `words[].start_time/end_time` 是毫秒级精度。严禁手动估算 data-start/data-duration。使用 `build_captions.mjs` 脚本生成。

3. **字幕去水词** — 必须去除：呢/啊/呃/嘛/嗯/吧/哦/呀/哇 + 对对对/没错没错/OK对。`build_captions.mjs` 已内置此逻辑。

4. **字幕不显示时的排查顺序**：① `.caption-item` 是不是 `position: absolute`？② `.caption-stage` 有没有 `overflow: hidden` 裁剪了内容？③ GSAP 的 opacity 动画时间是不是在元素的 data-start/data-duration 窗口内？

### 视觉相关

5. **进度条不要加** — V3 设计系统不需要进度条。

6. **动效密度 2-3 秒/次** — 不能有超过 8 秒的视觉空白。每 2-3 秒至少一个视觉变化（卡片、装饰点、脉冲环或场景切换）。

7. **动画类型必须轮换** — 不要连续 3 次以上用同一种动画。轮换序列：cardIn → emIn → 对比滑入 → burstIn → slideUp → dotsPop → stagger 列表 → stagger 标签 → cardIn → ...

8. **数据大字报用 `burstIn`** — 不要用普通 cardIn，弹性出场效果（back.out 2.5）才有冲击力。

9. **visual-stage 内所有元素用绝对定位** — 不要用 flow 布局。每个卡片是独立的 `.clip` 元素，有自己的 `data-start` 和 `data-duration`。

### HyperFrames 相关

10. **timeline 必须注册** — `window.__timelines["podcast"] = tl;` 在 script 末尾，否则渲染器等 45 秒后报错。

11. **渲染用 `run_in_background: true`** — 长视频帧捕获日志 >45KB 会截断，不要管道 tail。

12. **GSAP 不要动画 visibility** — `.clip` 元素的 visibility 由 HyperFrames 管理。只动画 opacity 和 transform。

13. **不要用 `repeat: -1`** — 必须计算有限重复次数。`repeat = Math.floor(totalDuration / (duration * 2))`。

14. **GSAP 动画必须同步构建** — 不能在 async/setTimeout 中。script 标签内直接同步构建 timeline。

15. **inspect 的 text_box_overflow** — 如果报错，加 `data-layout-allow-overflow` 或 `overflow: hidden`。

### TTS/ASR 相关

16. **prompt 超过 1000 字要压缩** — TTS prompt 模式（action=4）长文本会超时。压缩到 1000 字以内，提取核心要点。

17. **audio_url 有效期约 24h** — 如果过期，下载音频上传 COS 再用 COS URL 做 ASR。

18. **ASR 必须加 `--speaker-info`** — 否则没有 speaker 字段，无法区分苏米/嘉宾。

---

## 设计系统速查

完整规范见 `project/DESIGN.md`。以下为速查表：

### 视觉元素选择决策树

```
关键信息点是什么类型？
├── 核心概念/术语       → keyword-card (cardIn)
├── 3个以上并列要点     → bullet-list (stagger x:-30)
├── 数字/百分比/统计    → data-burst (burstIn)
├── 两种方案/时代对比   → comparison-row (左右滑入)
├── 操作步骤/流程       → process-row (stagger scale)
├── 3个相关关键词       → concept-tags (stagger scale)
├── 提出关键问题         → question-card (cardIn)
├── 金句/结论/观点      → emphasis-text (emIn)
└── 点缀空白/装饰       → geo-dot 组 (dotsPop)
```

### 配色速查

| 用途 | 色值 |
|------|------|
| 背景 | `#0D0B0E` |
| 苏米 | `#C9A96E` |
| 嘉宾 | `#748CAB` |
| 正文 | `#F0E6D3` |

### GSAP 缓动速查

| 场景 | 函数 | 缓动 |
|------|------|------|
| 卡片弹出 | `cardIn()` | `back.out(1.5)` |
| 数据冲击 | `burstIn()` | `back.out(2.5)` |
| 平滑入场 | `slideUp()` | `expo.out` |
| 强调金句 | `emIn()` | `expo.out` (分主副) |
| 装饰点缀 | `dotsPop()` | `back.out(2)` (staggered) |
| 左右对比 | 直接写 | `expo.out` x ±60-70 |
| 光球浮动 | 直接写 | `sine.inOut` yoyo |

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

### COS 存储

腾讯 COS：`https://temp-1372876299.cos.ap-guangzhou.myqcloud.com`（公有读写）

仅在 TTS audio_url 失效时使用。
