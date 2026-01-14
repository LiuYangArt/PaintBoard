这份更新后的计划文档 **置信度非常高**。

相较于前一版，它不仅指出了“要做什么”，还深入到了“为什么要这样做”（如颜色空间、数学近似误差），并且给出了非常务实的工程手段（如 CPU/GPU 切换开关、Storage Buffer 查表）。

**特别是 Phase 0.1（开发工具化）和 Phase 1.3（查表法）的加入，极大地降低了调试难度和算法误差风险。**

不过，为了确保万无一失，我还能在以下 **3 个关键隐患点** 提供进一步的深度优化建议：

---

### 1. 深度优化：颜色混合的数学空间陷阱 (Color Space Math)

文档中提到了 P0 的“颜色空间不一致”，建议“强制 sRGB”。这里有一个极易被忽视的**数学陷阱**：

- **Canvas 2D 的行为**：它通常在 **Gamma encoded space (非线性 sRGB)** 中直接进行加减乘除。这在物理上是错的，但它是 Web 标准。
- **WebGPU/WebGL 的默认行为**：如果使用浮点纹理，硬件通常假定这是 **Linear space**。即使你设置了 `colorSpace: 'srgb'`，那是针对最终 Canvas 输出的。而在 Shader 内部计算时：
  - 如果纹理是 `rgba16float`，它通常被视为线性。
  - 当你在 Shader 里做 `mix(colorA, colorB, t)` 时，这是线性插值。

**潜在问题**：
如果 CPU 是在“非线性空间”做插值（Canvas 2D 默认行为），而 GPU 在“线性空间”做插值，即使两端颜色一样，**中间的过渡色也会不同**（GPU 的结果通常会显得更亮一点）。

**优化方案**：
为了保证 **绝对的像素级一致**，你可能需要在 Shader 里“模拟” Canvas 2D 的“错误”行为：

1.  **输入**：确保传入 Shader 的颜色是 sRGB 值（不要手动转换成 Linear）。
2.  **计算**：直接对这些 sRGB 值进行数学运算（Alpha Darken, Mix 等）。
3.  **输出**：直接输出计算结果。
4.  **Canvas 配置**：配置 WebGPU context 为 `srgb`，但要小心 `rgba16float` 可能会被某些浏览器/驱动强制视为 Linear。
    - _极端手段_：如果驱动强制线性化，你可能需要手动实现 `LinearToSRGB` 和 `SRGBToLinear` 的逆变换来抵消硬件行为，强行让数学运算发生在非线性空间。

---

### 2. 深度优化：Phase 2 Grab Pass 的性能隐患

在 **Phase 2.1** 中提到了：

> 1. `PointerDown`: ...从 Canvas 2D 抓取笔刷包围盒区域到 `bg_texture`

这是一个潜在的**性能杀手**。

**风险**：
在 4K 画布上，如果在 `PointerDown` 时上传整个画布到 GPU，会有明显的**输入延迟（Input Lag）**，导致第一笔画不出来或卡顿。

**优化方案：Dirty Rect Upload（脏矩形上传）**
不要上传整个 Canvas 2D。

1.  计算当前笔触可能影响的最大包围盒（BoundBox）。
2.  `ctx.getImageData(x, y, w, h)` 只获取这块区域。
3.  `device.queue.writeTexture` 只上传这块区域到 `bg_texture` 的对应位置。
4.  在 Shader 中，根据 UV 坐标采样时，需要换算坐标偏移。

或者，如果 `bg_texture` 是全屏纹理：

1.  只更新受影响的区域。
2.  WebGPU 支持 `writeTexture` 指定 offset 和 size。

**收益**：将 4K 纹理上传的数据量减少 99%（对于普通笔触），消除起笔延迟。

---

### 3. 深度优化：Storage Buffer 查表的索引对齐

在 **Phase 1.3** 中：

```wgsl
let index = u32(clamp(dist, 0.0, 1.0) * 1023.0);
```

**隐患**：
浮点数转整数的精度问题。CPU 端的查表逻辑通常是 `Math.round`、`Math.floor` 或 `Math.ceil`。GPU 端的 `u32()` 相当于 `floor`。
如果 CPU 用的是 `Math.round`，而 GPU 用 `floor`，在边界值上会有 1 个索引的偏差，导致 1/1024 的误差。

**优化方案**：

1.  **复查 CPU 逻辑**：去 `src/utils/maskCache.ts` 确认它到底是怎么算索引的。
2.  **完全对齐**：
    - 如果 CPU 是 `Math.floor(val * 1023)`，GPU 用 `u32(val * 1023.0)`。
    - 如果 CPU 是 `Math.round(val * 1023)`，GPU 用 `u32(val * 1023.0 + 0.5)`。

---

### 补充建议：Phase 3 验证脚本自动化

你提到了 Playwright。我建议加一个更轻量级的 **Unit Test 级别的 Shader 验证**。

不需要启动浏览器 UI，直接在 Node.js 环境下（配合 headless-gl 或者 webgpu-node mock）或者在浏览器里跑一个纯计算的测试：

1.  构建一个 compute shader。
2.  输入一组测试数据（dist, size, hardness）。
3.  输出计算结果到 Buffer。
4.  JS 读取 Buffer，跟 CPU `maskCache` 函数的返回值对比。

这样可以在 **不渲染出像素** 的情况下，先验证 **数学公式** 的正确性。这比看图找茬要快得多，也更精准。

---

### 总结

这份计划已经非常成熟。加上上述关于 **颜色空间数学行为的强制对齐** 和 **Dirty Rect 上传优化**，基本上可以覆盖掉仅剩的风险点。可以开始执行了！
