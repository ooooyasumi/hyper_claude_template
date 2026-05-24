# Hyper Claude Template

Claude Code 项目的 HyperFrames 模板集合。每个文件夹都是一个独立的、可直接使用的模板。

## 模板列表

### [podcast](./podcast)

AI 播客视频制作模板。从话题/URL 生成双人播客对话，配合 HyperFrames 动效合成，输出带字幕的播客视频。

**功能特性：**
- 火山引擎 TTS 语音合成（支持多种音色）
- 火山引擎 ASR 语音转文字（带时间戳）
- HyperFrames 视频合成与渲染
- 自动生成字幕与动画同步

**快速开始：**
```bash
cd podcast
npm install

# 生成播客音频
node scripts/volc_podcast_ws.mjs --prompt "你的播客话题" --output exports/V1/podcast_final.mp3

# 语音转文字
node scripts/volc_asr_auc.mjs --url "audio_url" --output exports/V1/transcript.json

# 渲染视频
npm run render:draft
```

**环境变量：** 复制 `.env.example` 为 `.env` 并填入火山引擎 API 凭证。

## 使用方式

1. 选择需要的模板文件夹
2. 复制到你的项目目录
3. 配置环境变量（如有需要）
4. 开始使用

## 许可证

MIT
