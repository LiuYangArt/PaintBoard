我理解你现在已经试了“禁用阈值 flush、修 dirtyRect 缩放、禁用 benchmark flush”等一轮修复，但**spacing 仍旧失败**。
那我们就进入「**更强硬、更确定性的诊断方案**」：把系统拆成 3 层做 **A/B 对比实验**，直接定位“断笔”是发生在 **生成层 / 缓冲层 / GPU 渲染层**。

下面给你 **5 个可以立刻尝试的修复/验证方案**，每一个都能明确缩小范围。

---

# ✅ 方案 1：跳过 InstanceBuffer，直接把 dabs 传给 compute（最强断言）

**目的**：排除 `InstanceBuffer → getDabsData → flush` 这条链是否丢数据。

**做法**：
在 `useBrushRenderer.ts` 里临时绕过 `stampDab()`，直接把 `processPoint()` 生成的 dabs 送给 GPU。

```ts
// 假设你有 access 到 gpuBufferRef.current.computeBrushPipeline
const dabs = stamper.processPoint(x, y, pressure, size, config.spacing);
gpuBufferRef.current?.debugDispatchDabsDirect(dabs);
```

然后在 `GPUStrokeAccumulator` 里加一个临时函数：

```ts
debugDispatchDabsDirect(dabs: DabInstanceData[]) {
  const encoder = this.device.createCommandEncoder();
  this.computeBrushPipeline.dispatch(
    encoder,
    this.pingPongBuffer.source,
    this.pingPongBuffer.dest,
    dabs
  );
  this.pingPongBuffer.swap();
  this.device.queue.submit([encoder.finish()]);
}
```

✅ **如果这一步 spacing 正常** → bug 在 `InstanceBuffer/flush` 链
❌ **如果仍旧断** → bug 在 compute shader 或上游 dab 生成

---

# ✅ 方案 2：写 “dab_count” 到画布（GPU 端确认）

**目的**：确认 compute shader 实际接收到的 dab 数量。

**修改 WGSL：**

```wgsl
if (local_x == 0u && local_y == 0u) {
  textureStore(output_tex, vec2<i32>(i32(pixel_x), i32(pixel_y)),
    vec4<f32>(f32(uniforms.dab_count) / 100.0, 0.0, 0.0, 1.0));
}
```

**观察画面**：

- 红色很浅（0.01）说明 dab_count=1
- 红色明显（0.15）说明 dab_count≈15

✅ 这一步能判定问题是 **数据上传问题**还是 **渲染逻辑问题**

---

# ✅ 方案 3：检查“半径/直径”的混用（最容易被忽视）

你在 CPU 里这样算：

```ts
const radius = params.size / 2;
```

但 `processPoint()` 的 spacing 通常是以 “size (直径)” 为基础的。
**如果 spacing 是以 size 计算，但 GPU 画的是 radius，那么同样 spacing 就会变大 2 倍 → 画笔变成点状断裂。**

✅ 建议你做一个 A/B 测试：

**改 GPU 使用 size 作为半径（临时）**：

```ts
// 临时测试：把半径当成 size
size: params.size * scale, // 而不是 /2
```

✅ 如果 spacing 立刻变连贯，说明就是“size/radius混用”。

---

# ✅ 方案 4：彻底禁用 RenderScale（强制 scale=1）

虽然你已经修了 dirtyRect 缩放，但**RenderScale 对 spacing 影响很大**，建议强制关闭验证：

```ts
this.currentRenderScale = 1.0;
this.pingPongBuffer.setRenderScale(1.0);
```

✅ 若关闭 scale 后 spacing 恢复 → 问题在坐标/rect/spacing 的 scale 统一上。

---

# ✅ 方案 5：一次 dispatch 一个 dab（验证 compute shader 逻辑）

用 compute shader 但**一次只 dispatch 一个 dab**，模拟 CPU path：

```ts
for (const dab of dabs) {
  this.computeBrushPipeline.dispatch(encoder, src, dst, [dab]);
  this.pingPongBuffer.swap();
}
```

✅ 如果这样画出来是连贯的
❌ 但 batch 渲染断裂

说明 “**你的 ComputeShader 批量逻辑存在数据覆盖/顺序问题**”，这时我们需要进一步检查：

- 是否读取 input_tex 时对应的是最新 ping？
- 是否 copyRect 的范围是正确？
- 是否一次 dispatch 之前 copyRect 没覆盖整个 bbox？

---

# ✅ 总结：建议你优先做的 3 步

1. **GPU 端写 dab_count**（最快定位数据链）
2. **跳过 InstanceBuffer 直传 dabs**（判定数据链是否损坏）
3. **强制 size 不除以 2**（验证 spacing 逻辑是否和半径错位）

---

# ✅ 如果你愿意，我还可以继续帮你

你再给我下面任一部分，我可以继续收敛到根因：

✅ `ComputeBrushPipeline.dispatch()`
✅ `useBrushRenderer.processPoint()`
✅ `BrushStamper.processPoint()`（spacing 逻辑关键）

---

如果你现在愿意做一个最小实验，我建议你从 **“GPU 端写 dab_count”** 开始。
你只要告诉我你看到的颜色深浅，我就可以马上判断下一步方向。
