---
name: ai-podcast
description: End-to-end AI podcast video production. Covers text-to-podcast-audio (Volcengine TTS), speech-to-text with timestamps (Volcengine ASR), HyperFrames composition, and rendering. Use when asked to create a podcast video, generate dialogue audio, transcribe audio with timing, or produce any audio-driven video content with synchronized animations and subtitles.
---

# AI Podcast — 播客视频制作 Skill

从话题/URL 到播客视频的完整链路：AI 生成对话 → 语音合成 → 语音转文字 → 动效合成 → 渲染输出。

对标 HyperFrames 标准流程（init → write → lint → inspect → render），用火山引擎 TTS/ASR 替代 Whisper/Kokoro。

---

## Agent 执行流程（严格按步骤执行）

### Step 0: 准备版本目录

```bash
# 确定版本号（检查 exports/ 下已有目录，递增）
mkdir -p exports/VN
```

**完成条件：** `exports/VN/` 目录存在。

---

### Step 1: 生成播客音频（TTS）

**推荐模式：让模型自己写稿。** 优先用 `--prompt` 或 `--url`，不要手动写 dialogue.json。

```bash
# 方式 A：话题生成（最常用）
node scripts/volc_podcast_ws.mjs \
  --prompt "话题内容" \
  --speakers "zh_male_yuanboxiaoshu_uranus_bigtts,zh_female_zhixingnv_uranus_bigtts" \
  --output exports/VN/podcast_final.mp3

# 方式 B：URL 生成
node scripts/volc_podcast_ws.mjs \
  --url "https://..." \
  --speakers "zh_male_yuanboxiaoshu_uranus_bigtts,zh_female_zhixingnv_uranus_bigtts" \
  --output exports/VN/podcast_final.mp3

# 方式 C：自定义对话（仅用户明确要求时）
node scripts/volc_podcast_ws.mjs \
  --nlp-file project/dialogue.json \
  --speakers "zh_male_yuanboxiaoshu_uranus_bigtts,zh_female_zhixingnv_uranus_bigtts" \
  --output exports/VN/podcast_final.mp3
```

**TTS 完成后会打印 `audio_url=...`，保存此 URL 供 Step 2 使用。**

**可用音色：**
- `zh_male_yuanboxiaoshu_uranus_bigtts` — 男声
- `zh_female_zhixingnv_uranus_bigtts` — 女声
- `zh_male_dayixiansheng_v2_saturn_bigtts` — 男声，沉稳
- `zh_female_mizaitongxue_v2_saturn_bigtts` — 女声，活泼

**其他参数：**
- `--speech-rate N` — 语速（-10 ~ 10）
- `--head-music` / `--tail-music` — 片头/片尾音乐（预设，不可自定义）
- `--random-order` — 随机打乱说话人顺序（仅话题/文本模式有效）

**完成条件：** `exports/VN/podcast_final.mp3` 存在且 >0 字节，终端打印了 `audio_url`。

**失败处理：** 检查 `.env` 凭证 → 检查网络 → 重试。

---

### Step 2: 语音转文字（ASR）

TTS 完成后**立即开始**，不需要等其他步骤。

**优先方案：直接用 TTS 返回的 audio_url（TOS 签名 URL，有效期约 24h）。**

```bash
node scripts/volc_asr_auc.mjs \
  --url "Step1保存的audio_url" \
  --punctuation --utterances --speaker-info \
  --output exports/VN/transcript.json \
  --text-output exports/VN/transcript.txt
```

**备选方案：audio_url 失效时，下载后传 COS。**

```bash
# 下载
curl -o exports/VN/podcast_final.mp3 "audio_url"

# 上传到 COS（公有读写）
curl -T exports/VN/podcast_final.mp3 \
  "https://temp-1372876299.cos.ap-guangzhou.myqcloud.com/exports/VN/podcast_final.mp3"

# 用 COS URL 做 ASR
node scripts/volc_asr_auc.mjs \
  --url "https://temp-1372876299.cos.ap-guangzhou.myqcloud.com/exports/VN/podcast_final.mp3" \
  --punctuation --utterances --speaker-info \
  --output exports/VN/transcript.json \
  --text-output exports/VN/transcript.txt
```

**完成条件：** `exports/VN/transcript.json` 存在，包含 `result.utterances` 数组。

**质量检查（必须）：** 读取 transcript.json，确认：
- utterances 数量合理（不是空数组）
- 有 `start_time` / `end_time` 时间戳
- 有 `words` 逐字时间戳（用于字幕对齐）

---

### Step 3: 写 HyperFrames 合成（与 Step 2 可并行）

Step 2 启动后即可开始读取 `project/DESIGN.md` 和规划场景结构。Step 2 完成后才能写最终的字幕时间轴。

1. 读取 `project/DESIGN.md`（没有则用 hyperframes house-style 默认）
2. 读取 `exports/VN/transcript.json` 的 utterances
3. 用 `scripts/generate_video.mjs` 生成或手写 `project/index.html`
   ```bash
   node scripts/generate_video.mjs \
     --transcript exports/VN/transcript.json \
     --title "播客标题" \
     --accent "#D4A574"
   ```
   支持 `--scenes PATH` 传入自定义场景 JSON，不传则自动分组。
4. 音频 src 指向 `../exports/VN/podcast_final.mp3`

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

```bash
# 快速迭代（先出一版看效果）
cd project && npx hyperframes render --quality draft --output ../exports/VN/podcast_video.mp4

# 确认无误后高质量渲染
cd project && npx hyperframes render --quality high --output ../exports/VN/podcast_video.mp4
```

**完成条件：** `exports/VN/podcast_video.mp4` 存在，ffprobe 确认时长和分辨率正确。

---

### Step 6: 版本记录

更新根目录 `versions.md`，记录本次版本。

---

## 迭代流程

修改 `project/index.html` → Step 4 (lint + inspect) → Step 5 (render) → 新版本目录

**迭代时只改需要改的，不要重新生成音频和转写。**

---

## 快速跳过条件

| 条件 | 跳过步骤 |
|------|----------|
| 用户给了 dialogue.json | 跳过 Step 1 的 prompt/url 生成，直接用 --nlp-file |
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
├── exports/               # 成品导出
│   └── VN/
│       ├── podcast_final.mp3
│       ├── podcast_video.mp4
│       ├── transcript.json
│       └── transcript.txt
├── project/               # HyperFrames 工作目录
│   ├── DESIGN.md
│   ├── dialogue.json
│   ├── index.html
│   ├── fonts/
│   └── compositions/
├── scripts/
│   ├── volc_podcast_ws.mjs
│   ├── volc_asr_auc.mjs
│   └── generate_video.mjs
└── versions.md
```

---

## COS 存储

腾讯 COS：`https://temp-1372876299.cos.ap-guangzhou.myqcloud.com`（公有读写）

仅在 TTS audio_url 失效时使用。目录与本地 exports 一致：

```bash
curl -T exports/VN/podcast_final.mp3 \
  "https://temp-1372876299.cos.ap-guangzhou.myqcloud.com/exports/VN/podcast_final.mp3"
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
| 话题生成 | 4 | `--prompt` | 模型自动生成双人对话（推荐） |
| URL | 0 | `--url` | 抓取网页内容，自动转播客 |
| 文本 | 0 | `--text` | 长文本自动拆成对话 |
| 自定义对话 | 3 | `--nlp-file` | 传入预写对话 |

### ASR（HTTP 轮询）

- 音频必须公网 URL
- 轮询间隔 3s，超时 10min
- 状态码：`20000000`=完成

---

## HyperFrames 合成要点

- `.clip` 元素的 visibility 由框架管理，GSAP 不要动画 visibility
- 场景切换用 entrance 动画，不要 exit 动画（最后一场除外）
- 字幕用 `data-start` + `data-duration` 控制显示时间
- 同一轨道元素时间不能重叠
- GSAP 动画必须同步构建（不能在 async/setTimeout 中）
- 不要用 `repeat: -1`
- 渲染用 `--quality draft` 迭代，`--quality high` 交付
