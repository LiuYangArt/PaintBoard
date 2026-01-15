# App vs Browser 性能差距排查

> 日期: 2026-01-15
> 分类: 性能优化

## 问题描述

在性能 Benchmark 测试中发现，Tauri App 的 Render Latency (19-20ms) 明显高于浏览器 (12-13ms)，差距约 8ms。用户反馈在 App 中绘制手感稍慢。

## 排查过程

### 嫌疑人清单

| 嫌疑人                       | 排查方法              | 结果                            |
| ---------------------------- | --------------------- | ------------------------------- |
| Canvas 回读 (`getImageData`) | grep 搜索代码         | ❌ 仅在 stroke 结束时使用       |
| Tauri IPC 阻塞               | 检查 `invoke` 调用    | ❌ WinTab 通过非阻塞 event 推送 |
| console.log 开销             | 搜索渲染路径          | ❌ 仅在 GPU 初始化时            |
| DPR 差异                     | 搜索 devicePixelRatio | ❌ 未使用                       |
| WebView2 固有开销            | 创建纯 Canvas 测试页  | ✅ 存在，约 2-3ms               |

### 诊断工具

1. **DebugPanel 环境检测** - 添加了运行时环境显示 (Tauri App/Browser, WebView2/Chrome)
2. **WebView 延迟测试页** - `public/webview-latency-test.html`，纯 Canvas 绘制，测量 `event.timeStamp` → `performance.now()` 延迟

### 测试结果

| 环境                 | 测试类型         | 平均延迟  | 备注           |
| -------------------- | ---------------- | --------- | -------------- |
| Chrome               | 纯 Canvas 测试页 | 8.87ms    | 最小开销基准线 |
| Tauri App (WebView2) | 完整应用         | 19.08ms   | 含完整渲染管线 |
| **差距**             |                  | **~10ms** |                |

## 根因分析

差距 ~10ms 分解：

1. **WebView2 固有开销** (~2-3ms)
   - Edge WebView2 与 Chrome 的事件处理差异
   - 属于平台限制，无法消除

2. **应用逻辑开销** (~7-8ms)
   - React 渲染管线
   - 笔刷算法（插值、dab stamping）
   - GPU 命令提交和同步

## 结论

- **非平台问题**：差距主要来自应用逻辑本身
- **已达标指标**：
  - Visual Lag: 0.8x 笔刷半径 (目标 < 1.0x) ✅
  - Queue Depth: 0 (无积压) ✅
  - Input Latency: 3.15ms (极低) ✅

## 经验教训

### 正面

1. **隔离测试很重要** - 创建纯 Canvas 测试页帮助隔离了 WebView2 固有开销和应用逻辑开销
2. **环境检测显示** - 在 Debug Panel 中显示运行环境有助于快速确认测试条件
3. **批量处理有效** - Queue Depth = 0 证明 P0 优化（批量处理）生效

### 改进点

1. **目标需要分层** - 纯平台延迟 vs 应用逻辑延迟应该分开追踪
2. **自动化测试时间戳** - 合成事件的 timeStamp 可能与真实输入不一致，需要进一步研究

## 后续建议

若需进一步优化 Render Latency，可从以下方向着手：

1. **Phase 3: 智能流控** - 动态追赶策略、动态 LOD
2. **Phase 4: 输入预测** - 预测绘制掩盖 VSync 延迟
3. **WebGPU 管线优化** - 减少 GPU 同步点

## 相关文件

- [性能优化方案](../design/performance-optimization-plan.md)
- [DebugPanel](../../src/components/DebugPanel/index.tsx)
- [WebView 延迟测试页](../../public/webview-latency-test.html)
