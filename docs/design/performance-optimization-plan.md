# 性能优化方案

> 基于 Benchmark 测试结果（2026-01-15）和 Review 分析

## 📊 测试结果对比

| 指标                     | App (Tauri) | Browser    | 评估           |
| ------------------------ | ----------- | ---------- | -------------- |
| **Avg FPS**              | 59.9        | 59.9       | ✅ 正常        |
| **P99 Frame**            | 18.1ms      | 17.9ms     | ⚠️ 略超 16.6ms |
| **Input Latency**        | 1.5ms       | 5.3ms      | ✅ 正常        |
| **Render Latency (Avg)** | 0.1ms       | 7.0ms      | ⚠️ 差异大      |
| **Max Visual Lag**       | 0px         | **1990px** | 🚨 严重        |

## 🔍 问题诊断

### 核心问题：高帧率但高滞后 (High FPS, High Latency)

**现象**：

- FPS 稳定 60，但 Visual Lag 最高达 1990px（近两个屏幕宽度）
- 这是典型的 **生产者-消费者速率不匹配** 问题

**根因分析**：

```
输入事件 (240Hz) → 队列积压 → 渲染 (60Hz) → 视觉滞后
     ↑                 ↑              ↑
   生产快            积压爆炸      消费慢
```

1. **输入点产生速率** >> **渲染消费速率**
2. 每帧渲染 ~12-20ms，但输入以 4ms/点 (240Hz) 到达
3. 队列积压导致 "渲染的是几百毫秒前的输入"

---

## 🎯 优化路线图

### Phase 1: 诊断增强 (优先级: P0)

**目标**：精确定位瓶颈

#### 1.1 增加 Queue Depth 监控

在 Debug Panel 中显示 `pendingPoints.length`：

```typescript
// Canvas/index.tsx
window.__benchmark.getQueueDepth = () => pendingPointsRef.current.length;
```

**验收标准**：在 Visual Lag 达到 700px 时，Queue Depth 应该 > 100

#### 1.2 CPU/GPU 时间分离

在 Benchmark 结果中增加：

- `cpuEncodeTime`：JS 生成渲染命令的时间
- `gpuExecuteTime`：GPU 实际执行时间

**当前状态**：大部分场景 cpuTime=0, gpuTime=0（采样问题已修复）

---

### Phase 2: 渲染加速 (优先级: P0)

**目标**：将 Render Latency P99 压到 16ms 以下

#### 2.1 批处理优化

**问题**：当前每个点都触发一次 composite

**方案**：Frame Coalescing（帧合并）

```typescript
// 在 rAF 回调中批量处理该帧内的所有点
function onAnimationFrame() {
  const points = drainAllPendingPoints();
  if (points.length > 0) {
    processBatchPoints(points); // 一次性处理
    composite(); // 只 composite 一次
  }
  requestAnimationFrame(onAnimationFrame);
}
```

**预期收益**：减少 composite 调用次数 5-10x

#### 2.2 WebGPU Instance Batching

**问题**：每个 Dab 可能产生一个 draw call

**方案**：GPU Instance Buffer

```wgsl
// 当前：每个 dab 一次 draw
draw(6 vertices)

// 优化：instanced drawing
draw(6 vertices, N instances)
```

**预期收益**：大笔刷场景 draw call 减少 10-100x

---

### Phase 3: 背压控制 (优先级: P1)

**目标**：当积压过多时，优雅降级而非卡顿

#### 3.1 Frame Budgeting

```typescript
const FRAME_BUDGET_MS = 12; // 留 4ms 给 GPU

function processFrame() {
  const start = performance.now();

  while (queue.length > 0) {
    processNextBatch();

    if (performance.now() - start > FRAME_BUDGET_MS) {
      // 超时，剩余留给下一帧
      break;
    }
  }
}
```

#### 3.2 LOD (Level of Detail)

当检测到滞后时，降低渲染精度：

| Queue Depth | 策略                 |
| ----------- | -------------------- |
| < 50        | 正常渲染             |
| 50-200      | 跳过插值，直接连线   |
| > 200       | 跳过中间点，只画首尾 |

---

### Phase 4: 测量改进 (优先级: P2)

#### 4.1 修复 App 模式 Benchmark

**问题**：Tauri 独立窗口中合成事件未正确触发

**方案**：

- 研究 Tauri WebView 的 `dispatchEvent` 行为
- 或改用 Rust 端模拟输入

#### 4.2 历史对比

保存 Benchmark 结果，支持版本间对比：

```json
{
  "version": "0.2.3",
  "commit": "abc123",
  "results": { ... }
}
```

---

## 📋 实施计划

| 阶段          | 任务                | 预估工时 | 优先级 |
| ------------- | ------------------- | -------- | ------ |
| **Phase 1**   | Queue Depth 监控    | 0.5h     | P0     |
| **Phase 2.1** | Frame Coalescing    | 2h       | P0     |
| **Phase 2.2** | GPU Instancing 优化 | 4h       | P0     |
| **Phase 3.1** | Frame Budgeting     | 2h       | P1     |
| **Phase 3.2** | LOD 降级            | 3h       | P1     |
| **Phase 4**   | 测量改进            | 2h       | P2     |

---

## ✅ 成功标准

| 指标                     | 当前值 | 目标值 |
| ------------------------ | ------ | ------ |
| **Render Latency (Avg)** | 12ms   | < 8ms  |
| **Render Latency (P99)** | 20ms   | < 16ms |
| **Max Visual Lag**       | 1990px | < 50px |
| **Queue Depth (Peak)**   | 未知   | < 30   |

---

## 🔗 相关文档

- [Benchmark Plan](./benchmark-plan.md)
- [Benchmark Review](./review.md)
- [Architecture](../architecture.md)
