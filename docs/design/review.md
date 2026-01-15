这份更新后的 **Phase 2.7 修复计划** 非常出色。

你不仅准确地识别出了 Phase 2.6（加锁）引入的副作用——**“输入真空期”导致的点丢失**，而且提出了**最标准且稳健**的解决方案：**状态机 (State Machine) + 输入缓冲 (Input Buffering)**。

这比单纯继续加锁要高明得多，因为它解决了异步处理（GPU准备）与同步输入（用户手速）之间的根本矛盾。

以下是详细的 Review 和一些实施建议：

### 1. 核心方案评估 (Optimization 12)

**评分：S (强烈推荐)**

- **为什么这是正确的解法？**
  - **UI 事件是同步且密集的**：浏览器触发 `pointermove` 的频率很高（60-120Hz），且不会等待你的 `Promise`。
  - **GPU 准备是异步的**：`beginStroke` 可能需要几毫秒甚至更久（如果涉及 `device.queue` 等待）。
  - **缓冲区的必要性**：在“我想画”到“我可以画”之间的时间差里，必须把用户的意图（坐标点）存起来。这在游戏开发和高性能绘图中是标准模式。

- **对“极速点按”的覆盖**：
  - 逻辑中包含的 `pendingEndRef` 是点睛之笔。它完美处理了 **PointerDown (Starting) -> PointerUp** 发生在 **beginStroke 完成之前** 的情况。这正是导致“虽然落笔了但没画出来”的元凶。

### 2. 代码逻辑审查

计划中的代码结构很清晰，但我建议在实施时注意以下几个细节，以确保万无一失：

#### A. 状态重置的安全性 (Critical)

在 `handlePointerDown` 的 `catch` 块和 `finishCurrentStroke` 之后，必须保证状态回归 `idle`。

建议在 `finally` 块中处理状态重置，或者在 `finishCurrentStroke` 内部确保重置。

```typescript
// 建议的补全逻辑
(async () => {
  try {
    await beginBrushStroke(brushHardness);

    // Check if cancelled or error occurred during await
    if (strokeStateRef.current !== 'starting') return;

    strokeStateRef.current = 'active';

    // Replay buffer
    for (const pt of pendingPointsRef.current) {
      processBrushPointWithConfig(pt.x, pt.y, pt.pressure);
    }
    pendingPointsRef.current = []; // 及时释放内存

    // Handle early exit
    if (pendingEndRef.current) {
      strokeStateRef.current = 'finishing'; // 显式转态
      await finishCurrentStroke();
    }
  } catch (error) {
    console.error('Stroke failed:', error);
    // 出错必须重置，否则下一次点击会被吞掉
    strokeStateRef.current = 'idle';
    pendingPointsRef.current = [];
  }
})();
```

#### B. `handlePointerUp` 的状态排他性

你的计划中 `handlePointerUp` 的逻辑是正确的，但要确保 `finishCurrentStroke` 不会被重复调用。

```typescript
const handlePointerUp = useCallback((e) => {
  // ...

  // Case 1: 还没开始就结束了 -> 标记 pending，交给 Down 的异步回调去处理
  if (strokeStateRef.current === 'starting') {
    pendingEndRef.current = true;
    return;
  }

  // Case 2: 正在画 -> 立即结束
  if (strokeStateRef.current === 'active') {
    strokeStateRef.current = 'finishing'; // 立即锁住状态，防止再次触发
    finishCurrentStroke().finally(() => {
      strokeStateRef.current = 'idle'; // 确保回到 idle
    });
  }

  // Case 3: idle 或 finishing -> 忽略
}, []);
```

#### C. `pendingPoints` 的坐标引用

在 `handlePointerDown` 的闭包中，你直接使用了 `pendingPointsRef.current`。请确保 `handlePointerMove` 往里面 `push` 的对象包含了计算好的 `x, y`（基于 Canvas 坐标系），而不是原始的 Event 对象。

- **原因**：React 的 SyntheticEvent 或者 DOM Event 对象在某些浏览器版本中可能是被池化（Pooled）的，异步访问可能会读到空值。
- **确认**：看你的伪代码是 `push({ x: canvasX, y: canvasY ... })`，这是正确的。

### 3. 补充测试建议 (Phase 3)

除了你列出的测试项，建议增加一个**压力测试**：

- **“帕金森”测试**：在同一个位置极高频率地抖动鼠标并疯狂点击。这会产生大量的 `starting` -> `active` -> `finishing` 快速切换，以及大量的微小 `pointermove`。这是验证状态机是否死锁的最佳方式。

### 总结

这个 **Phase 2.7** 方案是成熟且专业的。

1.  **Phase 2.6 的锁** 解决了 GPU 资源竞争（崩坏/报错）。
2.  **Phase 2.7 的缓冲** 解决了用户输入丢失（漏画）。

两者结合，应该能彻底解决“闪烁”和“漏笔”问题。**可以直接开始实施。**
