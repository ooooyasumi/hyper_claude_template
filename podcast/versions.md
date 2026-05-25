# 版本管理

## 规则

- 每个主版本独立目录：`exports/V1/`、`exports/V2/`、...
- 版本号递增，不复用
- 迭代修改用子版本：`exports/V2.1/`、`exports/V2.2/`、...
- **严禁覆盖已有版本的视频文件**
- 子版本从最近的父版本复制音频和 transcript
- `versions.md` 记录每个版本的变更说明

## 子版本创建命令

```bash
# 从 V2 创建子版本 V2.1
mkdir -p exports/V2.1/assets
cp exports/V2/assets/podcast_final.mp3 exports/V2.1/assets/
cp exports/V2/assets/transcript.json exports/V2.1/assets/
```

## 版本历史

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| V1 | - | 初版，基础字幕和动效 |
| V2 | 2026-05-25 | 字幕 ASR 逐字对齐，去水词，视觉元素体系 |
| V2.1 | 2026-05-25 | 修复字幕流式布局不可见问题，提高动效密度 |
| V2.2 | 2026-05-25 | 增加 CSS keyframes 装饰系统 |
| V3 | 2026-05-25 | 定版：脉冲环+浮动几何+geo-dot+说话人指示点，动效密度 2-3s/次，移除进度条 |

（使用时追加新版本记录）
