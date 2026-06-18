# Stripe2Video

> 把精灵图（sprite sheet）切成帧，渲染成视频 / 动画 —— 带实时网格预览的 Electron 桌面工具。

## 简介

Stripe2Video 是一个 Windows 桌面 GUI 工具，用于把横向或网格排列的**精灵图**切成有序帧，并导出成：

- **MP4**（H.264，不透明）
- **透明 WebM**（VP9 + alpha）
- **透明 PNG 序列**

拖入精灵图 → 自动猜测网格 → 实时预览切帧与动画效果 → 调参 → 一键导出。免去手动切图和命令行编码。

## 功能特性

- 🎯 **自动猜网格**：拖图后自动估算列/行数，可在界面上手动微调
- 👁️ **实时网格预览**：在原图上叠加可调网格，所见即所得
- ▶️ **动画预览**：导出前按当前 FPS 实时播放切帧效果
- 🎬 **三种导出格式**：MP4 / 透明 WebM / 透明 PNG 序列
- 🔁 **多种播放模式**：单次 / 循环 N 次 / 指定目标时长
- 🔍 **整数放大**：1× / 2× / 4×（最近邻插值，保持像素清晰）
- 🎨 **背景合成**：MP4 可选底色；WebM / PNG 保留原始透明

## 技术栈

- **Electron** + **electron-vite** + **React 18** + **TypeScript**
- **ffmpeg-static** + **fluent-ffmpeg**（视频编码）
- **vitest**（测试）
- **electron-builder**（打包）

## 快速开始

### 前置要求

- Node.js 18+（推荐 20 LTS）
- npm

### 安装

```bash
npm install
```

> 安装会自动下载 Electron 和 ffmpeg 二进制（ffmpeg-static），首次较慢。

### 开发模式

```bash
npm run dev
```

打开一个 Electron 窗口，支持热更新。

### 运行测试

```bash
npm test            # 跑一次
npm run test:watch  # 监听模式
```

### 构建

```bash
npm run build      # 编译 main / preload / renderer
npm run build:win  # 打包 Windows 安装包（需开启开发者模式，见下）
```

## 使用说明

1. `npm run dev` 打开应用
2. 把精灵图拖进顶部拖拽区（支持 PNG / JPG / WebP）
3. 工具自动猜测列数并叠加网格；如需调整，在右侧「网格」里改列/行数
4. 下方「动画预览」按 FPS 播放，确认动画正确
5. 右侧设置导出参数（FPS、播放模式、缩放、格式、背景色）
6. 点「导出」按钮 → 选择保存位置

### 导出格式说明

| 格式 | 透明 | 说明 |
|---|---|---|
| **MP4** | ❌ 不透明 | 透明像素合成到选定底色；兼容性最好 |
| **WebM** | ✅ | VP9 + alpha；**请用浏览器（Chrome/Edge）打开验证透明**，部分旧播放器读不出 VP9 alpha |
| **PNG 序列** | ✅ | 逐帧 PNG 写入选定文件夹；PNG 原生 alpha，透明最可靠 |

> ⚠️ 透明 WebM 的 alpha 在某些播放器（如 Windows 媒体播放器、ffmpeg 原生 VP9 解码器）下不显示透明，这是解码器限制。**用浏览器验证最准。**

## 已知注意事项

- **生成 Windows 安装包需开启「开发者模式」**：electron-builder 的 `winCodeSign` 缓存含 macOS 符号链接，普通用户权限无法创建，导致 NSIS 安装包步骤失败。设置 → 系统 → 开发者选项 → 开启「开发者模式」后重跑 `npm run build:win`。解包版 `dist/win-unpacked/Stripe2Video.exe` 无需此设置即可直接运行。
- **若 `npm run dev` 出现 `ERR_CONNECTION_REFUSED`**：通常是 `localhost` 的 IPv6/IPv4 解析问题，已在 `electron.vite.config.ts` 把开发服务器固定到 `127.0.0.1` 解决。

## 项目结构

```
src/
├── shared/types.ts           # 共享类型（GridParams / ExportParams / API 契约）
├── main/                     # Electron 主进程
│   ├── encoder.ts            #   PNG 序列 → MP4/WebM 编码
│   ├── ffmpeg.ts             #   ffmpeg-static 路径封装
│   ├── tempfs.ts             #   临时帧目录与帧写入
│   └── ipc.ts                #   IPC 处理器
├── preload/index.ts          # contextBridge：暴露 window.api
└── renderer/                 # React 渲染进程
    └── src/
        ├── lib/
        │   ├── frameDetector.ts   # 自动猜网格（纯函数）
        │   ├── frameOrder.ts       # 播放序列计算（纯函数）
        │   └── frameRenderer.ts    # Canvas 切帧 → PNG
        └── components/             # UI 组件
tests/                        # vitest 单元 / 集成测试
docs/superpowers/             # 设计 spec 与实现计划
```

## 开发说明

- 核心算法（`frameDetector`、`frameOrder`）为**纯函数**，便于单元测试
- 编码器有**真实 ffmpeg 集成测试**（生成 MP4/WebM 并用 libvpx 解码回验透明通道）
- GUI 交互以手动验证为主

## 许可证

MIT
