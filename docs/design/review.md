这个测试方案的整体架构非常扎实，涵盖了从**单元层（Simulator）**到**集成层（Playwright）**的覆盖。

特别是引入**InputSimulator（机器人手）**是绝对正确的方向。对于高频交互场景，人手是不可靠的。

但是，我必须指出这个方案中存在一个**极高风险的设计缺陷**，如果不修正，可能会导致测试结果完全不可信，甚至**掩盖（Mask）**掉你要测的那个 bug。

以下是对该方案的深度 Review 和修正建议：

### 🚨 核心风险警告：观察者效应 (The Observer Effect)

你在 **Phase 2 (FlickerDetector)** 中计划使用 `ctx.getImageData()` 在 `requestAnimationFrame` 循环中实时检测闪烁。

**这是一个致命的架构错误，原因如下：**

1.  **强制同步 (Forced Synchronization)**：`getImageData` 会强制 CPU 等待 GPU 完成当前命令队列的所有渲染（Pipeline Flush），以便把像素读回内存。
2.  **掩盖 Bug**：你要测的“闪烁”通常是由 **GPU 异步 Readback** 和 **浏览器合成器（Compositor）** 之间的竞态引起的。
    - 当你调用 `getImageData` 时，你人为地强制这两者同步了。
    - **结果**：测试代码一跑，Bug 就消失了；测试代码一停，Bug 又回来了。这就是经典的“海森堡 Bug”。
3.  **性能干扰**：在 4K 画布上每帧做全屏 `getImageData` 会导致 FPS 暴跌到个位数，完全破坏了“高频压力测试”的前提。

### ✅ 修正方案：置信度提升建议

我们需要将“实时全屏检测”改为 **“逻辑埋点检测”** 和 **“事后视觉验证”**。

#### 1. 针对“笔触丢失” (Missing Stroke) 的验证 —— 采用“网格法”

不要随机点，要有规律地点。

- **测试逻辑**：在画布上画一个 `10x10` 的点阵网格。
- **验证逻辑**：
  - 测试结束后（而不是过程中），一次性 `getImageData`。
  - 遍历这 100 个坐标中心。
  - **断言**：每个坐标点的 Alpha 值必须 > 0。
  - **结果**：如果有 1 个点是空的，说明丢帧了。这比实时检测更准且不干扰渲染。

```typescript
// 修正后的验证逻辑
async function verifyGrid(canvas: HTMLCanvasElement, points: Point[]) {
  // 等待渲染彻底空闲
  await new Promise((r) => requestAnimationFrame(r));

  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const missingPoints = points.filter((pt) => {
    const alpha = getPixelAlpha(imgData, pt.x, pt.y);
    return alpha === 0; // 应该是画了东西的，结果是空的
  });

  if (missingPoints.length > 0) {
    throw new Error(`丢笔检测失败: 丢失了 ${missingPoints.length} 个点`);
  }
}
```

#### 2. 针对“闪烁” (Flicker) 的验证 —— 采用“脏检测 Hook”

既然不能用 `getImageData` 抓闪烁，我们就在代码逻辑里抓“产生闪烁的条件”。

闪烁的本质通常是：**在合成到 Layer 之前，Preview 被清空了**。

我们在 `GPUStrokeAccumulator.ts` 里加一个“金丝雀”变量：

```typescript
// GPUStrokeAccumulator.ts (仅在测试模式下启用)

// 这种检测不会触发 GPU 同步，非常高效
checkFlickerCondition() {
  if (this.active === false && this.previewHasContent === true) {
    // 理论上：如果 active 关了，Preview 应该已经被合成走并清空了。
    // 如果 Preview 还有内容但 active 关了，说明可能处于中间态。
    // 但更精准的闪烁判定是：
    // 在 renderLayer 调用时，Preview 是空的，且 compositeFromPreview 还没执行完。
  }
}
```

**或者更简单的“视觉完整性检查”：**
利用 Playwright 的 `trace` 功能录制视频，虽然是事后分析，但对于偶发闪烁，人工回放 trace 视频往往比代码检测更直观。

#### 3. 针对“输入模拟”的改进 —— 模拟真实帧率

`InputSimulator` 中的 `sleep` 和 `for` 循环可能比浏览器事件循环快太多。

**建议**：模拟器应该与 `requestAnimationFrame` 对齐。

```typescript
// 改进 InputSimulator
async stroke(...) {
  // ... Down ...

  for (let pt of points) {
    // 确保每帧只触发有限的事件，模拟真实鼠标/笔采样率 (e.g. 120Hz)
    await new Promise(r => setTimeout(r, 8));
    this.canvas.dispatchEvent(new PointerEvent('pointermove', ...));
  }

  // ... Up ...
}
```

---

### 修正后的实施路线图

基于上述 Review，我为你修订了更具置信度的实施步骤：

#### Step 1: 建立确定性输入 (Deterministic Input)

实现 `InputSimulator`，但增加**网格模式 (Grid Mode)**。

- 脚本：`drawGrid(rows: 10, cols: 10, interval: 20ms)`
- 预期：屏幕上整齐排列 100 个点。

#### Step 2: 实现 "事后" 验证器 (Post-hoc Verifier)

实现 `GridVerifier`。

- 逻辑：测试跑完 -> 截图 -> 检查 100 个位置的像素 -> 报告丢失数量。
- **优势**：零性能干扰，100% 准确复现“丢笔”问题。

#### Step 3: 内部遥测 (Internal Telemetry)

使用你设计的 `DiagnosticHooks`，但重点监控 **Phase 2.7 状态机**。

- 监控指标：
  - `Starting` 状态持续了多久？（如果 > 100ms 说明死锁）
  - `Buffer` 里的点是否曾被清空但未调用绘制？（说明丢数据）
  - `PointerUp` 触发时是否处于 `Starting` 状态？（验证边界情况）

#### Step 4: 极端压力测试 (Chaos Monkey)

- **脚本**：`chaosClicker()`
- **行为**：随机位置、随机间隔（1ms - 50ms）、随机压感。
- **验证**：程序不崩溃，控制台无 Error，显存不泄漏。

---

### 结论

**批准通过**，但必须**移除实时 `getImageData` 检测**。

**行动建议**：

1.  优先实现 **InputSimulator** 和 **GridVerifier**（事后像素检查）。
2.  用这个组合来验证你刚才的 Phase 2.7 修复。
3.  如果 Grid 测试 100 次通过 100 次，那么“丢笔问题”就可以宣布彻底解决。

你要我先帮你写 **InputSimulator + GridVerifier** 的代码吗？这对验证 Phase 2.7 至关重要。
