# Stripe2Video — 设计文档（Spec）

- **日期：** 2026-06-18
- **状态：** 已通过头脑风暴评审，待用户复核 → 进入实现计划
- **作者：** Claude + 用户协作

---

## 1. 概述（Overview）

Stripe2Video 是一个 **桌面 GUI 工具**，把**精灵图（sprite sheet）**切成有序帧并渲染成 **MP4 视频**。

典型用途：游戏美术/独立开发者拿到一张横向排列的像素动画帧条带（如角色攻击动作），拖进工具，可视化调整切帧网格，按指定帧率和循环方式导出成 MP4。

**核心价值：** 所见即所得的切帧预览 + 一键导出，免去手动切图和命令行编码。

---

## 2. 范围

### 在范围内
- 单张精灵图 → 单个 MP4。
- **阶段 A：** 支持水平条带（单行多列）。
- **阶段 B：** 支持网格（多行多列）。
- 等宽帧等分切割。
- 自动猜默认网格 + 手动微调 + 实时网格预览。
- 动画预览（导出前按 FPS 实时播放切帧效果）。
- 导出参数：FPS、播放模式（单次/循环N次/目标时长）、缩放（1×/2×/4×）、背景色。
- 编码为 H.264 MP4（`yuv420p`）。

### 不在范围内（YAGNI）
- 变宽帧 / 逐帧手动框选。
- 多精灵图批量处理。
- 视频剪辑、转场、配乐。
- 除 MP4 外的导出格式（GIF/WebM/APNG/PNG 序列）。
- 帧级别逐帧编辑/重排。
- 云端 / 账号 / 在线功能。

---

## 3. 用户场景

1. 用户拖入一张水平精灵条带 PNG。
2. 工具自动猜出列数（如 8 列），预览图上叠加网格。
3. 用户在「动画预览」窗口确认动作播放正确；如需要，调整列数或 FPS。
4. 用户选择「循环 3 次」，点「导出 MP4」。
5. 进度条显示编码进度，完成后弹出保存对话框，用户选择保存位置。

---

## 4. 架构

Electron 双进程：

```
┌─────────────────────────────────────────────────────┐
│  渲染进程 (Renderer / UI)                            │
│  React + TypeScript (electron-vite)                  │
│                                                      │
│  Dropzone ──→ PreviewCanvas ──→ Controls/ExportBar   │
│      │            ▲                  │               │
│      ▼            │                  │ 导出参数+帧    │
│  frameDetector    │ 实时网格          ▼               │
│  frameExtractor ──┘            (PNG 帧)              │
└──────────────────────────────┬──────────────────────┘
                          IPC (contextBridge)
┌──────────────────────────────▼──────────────────────┐
│  主进程 (Main / Node)                                │
│  encoder.ts ──→ ffmpeg.ts (fluent-ffmpeg)            │
│  tempfs.ts ──→ 临时 PNG 目录管理                     │
│  ffmpeg-static (自带平台二进制)                       │
└──────────────────────────────────────────────────────┘
```

- **渲染进程** 负责图片加载、切帧逻辑（纯函数）、UI 和预览。
- **主进程** 负责 ffmpeg 编码、临时文件管理、文件对话框。
- 两层通过 **IPC（contextBridge）** 解耦。

---

## 5. 模块结构

每个模块单一职责，可独立测试。切帧逻辑为纯函数，便于 vitest 单测。

| 模块 | 进程 | 职责 |
|---|---|---|
| `shared/types.ts` | 共享 | `GridParams`、`ExportParams` 等类型 |
| `renderer/lib/frameDetector.ts` | 渲染 | 根据图片尺寸自动猜默认网格 |
| `renderer/lib/frameExtractor.ts` | 渲染 | 图片 + 网格参数 → 有序帧序列（含缩放、合成背景、循环展开） |
| `renderer/lib/ipc.ts` | 渲染 | 调用主进程 IPC 的客户端封装 |
| `renderer/components/Dropzone.tsx` | 渲染 | 拖拽/选择图片，加载成 `ImageBitmap` |
| `renderer/components/PreviewCanvas.tsx` | 渲染 | 画布预览：原图 + 可调网格叠加；动画预览小窗 |
| `renderer/components/Controls.tsx` | 渲染 | 网格与导出参数控件 |
| `renderer/components/ExportBar.tsx` | 渲染 | 导出按钮 + 进度条 |
| `main/encoder.ts` | 主 | 编排：帧 PNG → ffmpeg 命令 → MP4；回报进度 |
| `main/ffmpeg.ts` | 主 | `fluent-ffmpeg` 薄封装 + `ffmpeg-static` 路径 |
| `main/tempfs.ts` | 主 | 临时目录创建/清理 |
| `main/ipc.ts` | 主 | 注册 IPC 处理器（导出、进度） |

### 核心类型（`shared/types.ts`）

```typescript
interface GridParams {
  cols: number;      // 列数
  rows: number;      // 行数（阶段 A 恒为 1）
  frameW: number;    // 单帧宽（px）
  frameH: number;    // 单帧高（px）
}

type PlayMode = 'once' | 'loop' | 'duration';

interface ExportParams {
  fps: number;           // 1–30，默认 12
  playMode: PlayMode;    // 默认 'loop'
  loopCount: number;     // playMode='loop' 时有效，默认 3
  durationSec: number;   // playMode='duration' 时有效
  scale: 1 | 2 | 4;      // 整数放大，默认 1
  bgColor: string;       // 透明合成底色，默认 '#000000'
}
```

---

## 6. 关键算法

### 6.1 自动猜网格（frameDetector）

**水平条带（阶段 A）：**
- `cols ≈ round(imageW / imageH)`
- `frameW = imageW / cols`
- `frameH = imageH`

> 例：2048×256 的条带 → cols = 8，frameW = 256，frameH = 256。

**网格（阶段 B）：**
- 先按条带规则得 `frameW`、`cols`。
- `rows ≈ round(imageH / frameW)`（保持方块单元）
- `frameH = imageH / rows`

**整除校验：** 若 `imageW % cols ≠ 0` 或 `imageH % rows ≠ 0`，给警告并建议最近的整除值；用户可在控件手动覆盖。允许在非整除时仍导出（裁掉余数像素）。

### 6.2 切帧 + 循环展开（frameExtractor）

1. 按网格切出 N 帧原始 Canvas（N = cols × rows，按行优先顺序）。
2. 按 `PlayMode` 生成最终有序帧序列：
   - `once`：`[帧1..帧N]`
   - `loop`（K 次）：`[帧1..帧N] × K`
   - `duration`（T 秒）：`总数 = round(T × fps)`，第 i 帧 = `帧[(i) % N]`
3. 每帧按 `scale` 用 `imageSmoothingEnabled = false`（最近邻）重绘到目标尺寸；透明区域合成到 `bgColor`。
4. 输出有序帧序列，供主进程写成 PNG。

### 6.3 编码（encoder，方案 1：PNG 序列 → ffmpeg）

1. 渲染进程产出的帧序列 → 主进程写成临时 PNG：`frame_0001.png … frame_XXXX.png`。
2. ffmpeg 命令：
   ```
   ffmpeg -framerate {fps} -i frame_%04d.png -c:v libx264 -pix_fmt yuv420p out.mp4
   ```
   - `yuv420p` 保证播放兼容性。
   - 缩放已在 Canvas 完成，ffmpeg 只做编码。
3. 编码进度通过 IPC 流式回报给渲染进程。
4. 完成后清理临时目录（编码失败时可选保留供排查）。

---

## 7. 数据流（端到端）

```
拖入图片
  → 加载 ImageBitmap
  → frameDetector 猜默认网格参数
  → 渲染预览（网格叠加 + 动画预览）
  → 用户调整网格/导出参数（实时更新预览）
  → 点「导出」
  → frameExtractor 生成有序帧序列（循环展开、缩放、合成背景）
  → IPC 发给主进程
  → 主进程写临时 PNG → ffmpeg 编码 MP4（进度回流）
  → 完成 → 保存对话框 → 清理临时文件
```

---

## 8. 界面布局（UI/UX）

```
┌──────────────────────────────────────────────────────────┐
│  Stripe2Video                              [打开图片]      │
├─────────────────────────────────────────────┬────────────┤
│                                             │  网格       │
│   ┌─────────────────────────────────────┐  │  列数[ 8]▾  │
│   │  精灵图 + 可调网格叠加               │  │  行数[ 1]▾  │ ← B阶段
│   │  (拖滑块/输入→网格实时重绘)          │  │  ─────────  │
│   └─────────────────────────────────────┘  │  导出       │
│                                             │  FPS [12]▾  │
│   ─────────────────────────────────────   │  播放 ●循环  │
│   动画预览 ▶ (按FPS实时播放切帧效果)        │  ○单次○时长 │
│                                             │  循环[ 3]   │
│                                             │  缩放[1×]▾  │
│                                             │  底色[■000] │
│                                             │  ─────────  │
│                                             │ [ 导出MP4 ] │
│                                             │ ██████░ 80%│
└─────────────────────────────────────────────┴────────────┘
```

**交互要点：**
- 拖图进来 → 自动猜网格 → 预览立即可见。
- 改列数/行数 → 网格叠加实时重绘。
- 动画预览小窗：按当前 FPS 实际播放切出来的帧，导出前确认动画。
- 导出时进度条实时更新；完成后弹出保存对话框。

---

## 9. 错误处理

| 场景 | 处理 |
|---|---|
| 图片无法解码 / 不支持格式 | 提示「无法读取图片，请用 PNG/JPG/WebP」 |
| 图宽不能被列数整除 | 警告 + 建议最近整除值，仍允许导出（裁余数） |
| 列/行数为 0 或帧数 < 1 | 禁用导出按钮 + 提示 |
| ffmpeg 编码失败 | 显示错误信息；可选保留临时文件供排查 |
| 图片极大（>8K） | 提示可能较慢，仍允许继续 |
| 导出被取消 | 终止 ffmpeg 进程 + 清理临时文件 |

---

## 10. 测试策略（vitest）

- **frameDetector（单测）：** 喂入各种尺寸（2048×256→8列、1024×1024→猜行列），断言网格正确。
- **frameExtractor（单测）：** 已知小精灵图 + 固定网格，断言帧数与每帧尺寸；循环模式断言序列长度（once=N、loop×3=3N、duration=round(T×fps)）。
- **encoder（集成测试）：** 固定 PNG fixture → 编码 → 断言 MP4 存在、体积>0。若需进一步校验时长/帧率，可额外引入 `ffprobe-static`（可选依赖），或用 `ffmpeg -i` 回读元数据。
- **IPC/主进程：** 轻量冒烟测试。
- **UI 组件：** 以手动验证为主。

---

## 11. 技术栈与脚手架

- **框架：** Electron（最新稳定版）
- **脚手架：** `electron-vite`（React + TypeScript 模板，自带 main/preload/renderer 结构与 HMR）
- **前端：** React + TypeScript
- **编码：** `fluent-ffmpeg` + `ffmpeg-static`（打包时自动带平台二进制）
- **打包：** `electron-builder`
- **测试：** `vitest`
- **版本控制：** Git

---

## 12. 假设

| # | 假设 | 默认值 |
|---|---|---|
| 1 | 精灵图是等宽帧（等分切割即可） | 是 |
| 2 | FPS 默认 | 12（可调 1–30） |
| 3 | 循环默认 | 循环 3 次 |
| 4 | 缩放默认 | 1×（可选 2×/4×，最近邻） |
| 5 | 透明背景合成底色 | 黑色（可改白/自定义） |
| 6 | 编码参数 | H.264，`yuv420p`，兼容性优先 |
| 7 | 支持输入格式 | PNG / JPG / WebP |
| 8 | 脚手架 | `electron-vite`（React + TS） |

---

## 13. 分阶段交付

- **阶段 A（先做，确保可用）：** 水平条带（rows 恒为 1）的完整流程——加载、猜网格、预览、导出。
- **阶段 B（A 稳定后）：** 扩展 `frameDetector`/`frameExtractor` 支持多行网格；UI 显出「行数」控件。

> 架构上 `GridParams` 已含 `rows`，阶段 A 固定为 1，阶段 B 解锁——无需重构，只需扩展。

---

## 14. Git 约定

- 仓库根：`D:\Project\Stripe2Video`
- `.gitignore`：`node_modules/`、`dist/`、`out/`（electron-builder 产物）、临时帧目录、OS 文件（`.DS_Store`、`Thumbs.db`）、`.env`。
- 首次提交包含：本 spec、`.gitignore`、脚手架代码。
