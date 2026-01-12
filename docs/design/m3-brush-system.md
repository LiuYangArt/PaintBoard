# M3 笔刷系统设计文档

> 版本: 1.1 | 创建日期: 2026-01-12 | 更新日期: 2026-01-12

## 概述

本文档规划 PaintBoard 的专业笔刷系统实现，目标是兼容 Photoshop ABR 笔刷格式。

## 决策记录

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 实现优先级 | **笔刷纹理导入优先** | 先能用，再完善动态参数 |
| 渲染架构 | **WebGPU 前端渲染** | GPU 加速，性能最优，为未来大画布做准备 |
| 兼容程度 | **接受合理差异** | PS 笔刷引擎专有，100% 复现不现实 |

---

## 研究结论

### ABR 格式可行性分析

**结论：可行，但需分阶段实现**

| 方面 | 评估 |
|------|------|
| 笔刷纹理提取 | ✅ 完全可行，有成熟开源方案 |
| 基础动态参数 | ✅ 可行，格式已被逆向工程 |
| 完整动态系统 | ⚠️ 中等难度，需要自研笔刷引擎 |
| 100% PS 兼容 | ❌ 不现实，PS 笔刷引擎专有 |

### 开源参考资源

| 项目 | 语言 | 特点 | 许可证 |
|------|------|------|--------|
| [brush-viewer](https://github.com/jlai/brush-viewer) | TypeScript | 支持 v6-10，使用 Kaitai 解析 | MIT |
| [PSBrushExtract](https://github.com/MorrowShore/PSBrushExtract) | Python | 提取参数和纹理 | AGPL-3.0 |
| [Krita kis_abr_brush_collection](https://invent.kde.org/graphics/krita) | C++ | 最成熟的实现 | GPL |

### ABR 文件结构（v6+）

```
ABR File
├── Header (2 bytes version + 2 bytes sub-version)
├── 8BIMsamp (Sampled Brush Textures)
│   └── Item[]
│       ├── Length (4 bytes)
│       ├── UUID (Pascal string)
│       ├── Dimensions (rectangle)
│       ├── Depth (16-bit, usually 8)
│       ├── Compression mode (0=raw, 1=RLE)
│       └── Image data (grayscale alpha mask)
├── 8BIMpatt (Patterns, optional)
└── 8BIMdesc (Brush Presets Descriptor)
    └── BrshVlLs (Brush Value List)
        └── brushPreset[]
            ├── Nm   (Name, TEXT)
            ├── Brsh (Brush Shape)
            │   ├── Dmtr (Diameter, UntF#Pxl)
            │   ├── Angl (Angle, UntF#Ang)
            │   ├── Rndn (Roundness, UntF#Prc)
            │   ├── Spcn (Spacing, UntF#Prc)
            │   └── sampledData (UUID reference)
            ├── useTipDynamics (bool)
            ├── szVr (Size Variation)
            │   ├── bVTy (Control type: 0=Off, 2=Pressure, 6=Direction)
            │   ├── jitter (UntF#Prc)
            │   └── Mnm  (Minimum, UntF#Prc)
            ├── angleDynamics
            ├── roundnessDynamics
            ├── useScatter (bool)
            ├── dualBrush
            ├── useTexture (bool)
            ├── usePaintDynamics (bool)
            ├── prVr (Pressure Variation → Opacity)
            ├── opVr (Opacity Variation)
            └── useColorDynamics (bool)
```

### Photoshop 笔刷动态参数详解

| 动态类型 | 参数 | 控制方式 |
|----------|------|----------|
| **Shape Dynamics** | Size Jitter, Minimum Diameter | Pen Pressure / Tilt / Fade |
| | Angle Jitter | Pen Pressure / Tilt / Direction |
| | Roundness Jitter, Minimum Roundness | Pen Pressure / Tilt |
| **Scattering** | Scatter %, Both Axes | - |
| | Count, Count Jitter | Pen Pressure |
| **Texture** | Pattern, Scale, Mode, Depth | - |
| **Dual Brush** | Mode, Size, Spacing, Scatter, Count | - |
| **Color Dynamics** | Foreground/Background Jitter | Pen Pressure |
| | Hue/Saturation/Brightness Jitter | - |
| **Transfer** | Opacity Jitter, Flow Jitter | Pen Pressure / Tilt |

---

## 实现方案

### 阶段划分

```
Phase 1: 笔刷引擎核心
    ├── 图章式渲染架构
    ├── 圆形笔刷生成（硬度可调）
    ├── 采样笔刷支持（图像笔尖）
    └── 基础动态（压感 → 大小/透明度）
         ↓
Phase 2: ABR 解析器
    ├── 文件结构解析
    ├── 纹理提取（8BIMsamp）
    ├── 参数提取（8BIMdesc）
    └── 转换为内部格式
         ↓
Phase 3: 笔刷预设 UI
    ├── 预设网格面板
    ├── ABR 导入对话框
    ├── 参数编辑器
    └── 预设管理（保存/删除）
         ↓
Phase 4: 高级动态（可选）
    ├── 散布 (Scattering)
    ├── 双重笔刷 (Dual Brush)
    ├── 纹理叠加 (Texture)
    └── 颜色动态 (Color Dynamics)
```

---

## Phase 1: 笔刷引擎核心

### 1.1 数据结构设计

```rust
// src-tauri/src/brush/types.rs

/// 笔刷笔尖定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrushTip {
    /// 唯一标识符
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 笔尖类型
    pub tip_type: BrushTipType,
    /// 基础直径 (pixels)
    pub diameter: f32,
    /// 角度 (degrees, 0-360)
    pub angle: f32,
    /// 圆度 (0-1, 1=圆形, <1=椭圆)
    pub roundness: f32,
    /// 间距 (% of diameter, 如 25% = 0.25)
    pub spacing: f32,
    /// 是否启用抗锯齿
    pub anti_alias: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BrushTipType {
    /// 参数化圆形笔刷
    Round {
        /// 硬度 (0-1, 1=硬边, 0=软边)
        hardness: f32,
    },
    /// 采样图像笔刷
    Sampled {
        /// 灰度图像数据 (作为 alpha mask)
        /// 存储为 Vec<u8>，每个值 0-255
        image_data: Vec<u8>,
        /// 图像宽度
        width: u32,
        /// 图像高度
        height: u32,
    },
}

/// 笔刷动态设置
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BrushDynamics {
    /// 大小动态
    pub size: DynamicControl,
    /// 角度动态
    pub angle: DynamicControl,
    /// 圆度动态
    pub roundness: DynamicControl,
    /// 不透明度动态
    pub opacity: DynamicControl,
    /// 流量动态
    pub flow: DynamicControl,
}

/// 单个动态参数控制
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DynamicControl {
    /// 控制来源
    pub control: ControlSource,
    /// 抖动 (随机性, 0-1)
    pub jitter: f32,
    /// 最小值 (0-1)
    pub minimum: f32,
}

impl Default for DynamicControl {
    fn default() -> Self {
        Self {
            control: ControlSource::Off,
            jitter: 0.0,
            minimum: 0.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum ControlSource {
    #[default]
    Off,
    PenPressure,
    PenTilt,
    PenTiltX,
    PenTiltY,
    Direction,
    Fade { steps: u32 },
    Initial { direction: bool },
}

/// 散布设置
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ScatterSettings {
    pub enabled: bool,
    /// 散布距离 (% of diameter)
    pub scatter: f32,
    /// 是否双轴散布
    pub both_axes: bool,
    /// 每个间隔的图章数量
    pub count: u32,
    /// 数量抖动 (0-1)
    pub count_jitter: f32,
}

/// 完整笔刷预设
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrushPreset {
    /// 唯一标识符
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 笔尖定义
    pub tip: BrushTip,
    /// 动态设置
    pub dynamics: BrushDynamics,
    /// 散布设置
    pub scatter: ScatterSettings,
    /// 是否来自 ABR 导入
    pub from_abr: bool,
    /// 原始 ABR 文件路径（如有）
    pub source_file: Option<String>,
}
```

### 1.2 笔刷渲染管线

```
┌─────────────────────────────────────────────────────────┐
│                    Input Point                          │
│              (x, y, pressure, tiltX, tiltY)             │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  Apply Dynamics                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ size = baseDiameter * dynamicSize(pressure)     │   │
│  │ opacity = baseOpacity * dynamicOpacity(pressure)│   │
│  │ angle = baseAngle + dynamicAngle(direction)     │   │
│  │ roundness = baseRoundness * dynamicRound(tilt)  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Calculate Stamp Positions                  │
│  ┌─────────────────────────────────────────────────┐   │
│  │ distance = length(currentPos - lastPos)         │   │
│  │ stepSize = size * spacing                       │   │
│  │ stamps = interpolate(lastPos, currentPos, step) │   │
│  │ if scatter: apply scatter offset to each stamp  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              For Each Stamp Position                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 1. Get/Generate Brush Tip Image (cached)        │   │
│  │ 2. Apply Rotation (angle)                       │   │
│  │ 3. Apply Scale (size)                           │   │
│  │ 4. Apply Roundness (if not 1.0)                 │   │
│  │ 5. Apply Opacity                                │   │
│  │ 6. Composite to Layer Canvas                    │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Output to Canvas                      │
└─────────────────────────────────────────────────────────┘
```

### 1.3 圆形笔刷生成算法

```rust
// src-tauri/src/brush/tip.rs

/// 生成圆形笔刷的 alpha mask
pub fn generate_round_brush(diameter: u32, hardness: f32) -> Vec<u8> {
    let size = diameter as usize;
    let mut data = vec![0u8; size * size];

    let center = diameter as f32 / 2.0;
    let radius = center;

    // hardness 控制边缘渐变
    // hardness = 1.0: 硬边，无渐变
    // hardness = 0.0: 完全渐变到边缘
    let inner_radius = radius * hardness;
    let fade_width = radius - inner_radius;

    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 + 0.5 - center;
            let dy = y as f32 + 0.5 - center;
            let dist = (dx * dx + dy * dy).sqrt();

            let alpha = if dist <= inner_radius {
                1.0
            } else if dist <= radius {
                // 线性渐变（可改为其他曲线）
                1.0 - (dist - inner_radius) / fade_width
            } else {
                0.0
            };

            data[y * size + x] = (alpha * 255.0) as u8;
        }
    }

    data
}
```

### 1.4 核心文件结构

```
src-tauri/src/brush/
├── mod.rs              # 模块入口，导出公共 API
├── types.rs            # 数据结构定义
├── tip.rs              # 笔尖生成（圆形、采样）
├── dynamics.rs         # 动态参数计算
├── renderer.rs         # 图章渲染器
├── cache.rs            # 笔尖纹理缓存
├── engine.rs           # 现有引擎（保持兼容）
└── interpolation.rs    # 现有插值算法
```

---

## Phase 2: ABR 解析器

### 2.1 解析器架构

```rust
// src-tauri/src/abr/mod.rs

mod parser;
mod samp;
mod desc;
mod types;
mod error;

pub use parser::AbrParser;
pub use types::*;
pub use error::AbrError;
```

```rust
// src-tauri/src/abr/types.rs

#[derive(Debug, Clone)]
pub struct AbrFile {
    pub version: AbrVersion,
    pub brushes: Vec<AbrBrush>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AbrVersion {
    V1,   // Very old (PS 4)
    V2,   // Old format (PS 5-6)
    V6,   // New format (PS 7+)
    V7,   // New format variant
    V10,  // Latest (CC)
}

#[derive(Debug, Clone)]
pub struct AbrBrush {
    pub name: String,
    pub uuid: Option<String>,
    pub tip_image: Option<GrayscaleImage>,
    pub diameter: f32,
    pub spacing: f32,
    pub angle: f32,
    pub roundness: f32,
    pub hardness: Option<f32>,
    pub dynamics: Option<AbrDynamics>,
}

#[derive(Debug, Clone)]
pub struct GrayscaleImage {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Default)]
pub struct AbrDynamics {
    pub use_tip_dynamics: bool,
    pub size_control: u32,      // 0=Off, 2=Pressure, 6=Direction...
    pub size_jitter: f32,
    pub size_minimum: f32,
    pub angle_control: u32,
    pub angle_jitter: f32,
    pub use_scatter: bool,
    pub scatter: f32,
    pub scatter_count: u32,
    pub use_paint_dynamics: bool,
    pub opacity_control: u32,
    pub opacity_jitter: f32,
}
```

### 2.2 解析流程

```rust
// src-tauri/src/abr/parser.rs

impl AbrParser {
    pub fn parse(data: &[u8]) -> Result<AbrFile, AbrError> {
        let mut cursor = Cursor::new(data);

        // 1. 读取版本号
        let version = Self::read_version(&mut cursor)?;

        match version {
            AbrVersion::V1 | AbrVersion::V2 => {
                Self::parse_old_format(&mut cursor, version)
            }
            AbrVersion::V6 | AbrVersion::V7 | AbrVersion::V10 => {
                Self::parse_new_format(&mut cursor, version)
            }
        }
    }

    fn parse_new_format(cursor: &mut Cursor<&[u8]>, version: AbrVersion)
        -> Result<AbrFile, AbrError>
    {
        let mut brushes = Vec::new();
        let mut samples = HashMap::new();

        // 2. 扫描所有 8BIM 块
        while let Some(block) = Self::read_8bim_block(cursor)? {
            match block.key.as_str() {
                "samp" => {
                    // 3. 解析采样纹理
                    let samp_brushes = samp::parse_samp_block(&block.data)?;
                    for sb in samp_brushes {
                        samples.insert(sb.uuid.clone(), sb);
                    }
                }
                "desc" => {
                    // 4. 解析描述符
                    let presets = desc::parse_desc_block(&block.data)?;
                    for preset in presets {
                        // 5. 关联纹理和描述符
                        let tip_image = preset.sampled_data_uuid
                            .as_ref()
                            .and_then(|uuid| samples.get(uuid))
                            .map(|s| s.image.clone());

                        brushes.push(AbrBrush {
                            name: preset.name,
                            uuid: preset.sampled_data_uuid,
                            tip_image,
                            diameter: preset.diameter,
                            spacing: preset.spacing,
                            angle: preset.angle,
                            roundness: preset.roundness,
                            hardness: None,
                            dynamics: Some(preset.dynamics),
                        });
                    }
                }
                "patt" => {
                    // 图案，暂不支持
                }
                _ => {
                    // 忽略未知块
                }
            }
        }

        Ok(AbrFile { version, brushes })
    }
}
```

### 2.3 8BIMsamp 解析

```rust
// src-tauri/src/abr/samp.rs

pub struct SampledBrush {
    pub uuid: String,
    pub image: GrayscaleImage,
}

pub fn parse_samp_block(data: &[u8]) -> Result<Vec<SampledBrush>, AbrError> {
    let mut cursor = Cursor::new(data);
    let mut brushes = Vec::new();

    while cursor.position() < data.len() as u64 {
        // 读取项目长度
        let item_length = cursor.read_u32::<BigEndian>()?;
        let item_start = cursor.position();

        // 读取 UUID (Pascal string)
        let uuid = read_pascal_string(&mut cursor)?;

        // 跳过未知字节
        cursor.seek(SeekFrom::Current(8))?;

        // 读取深度
        let depth = cursor.read_u16::<BigEndian>()?;

        // 读取边界矩形
        let top = cursor.read_i32::<BigEndian>()?;
        let left = cursor.read_i32::<BigEndian>()?;
        let bottom = cursor.read_i32::<BigEndian>()?;
        let right = cursor.read_i32::<BigEndian>()?;

        let width = (right - left) as u32;
        let height = (bottom - top) as u32;

        // 再次读取深度
        let _depth2 = cursor.read_u16::<BigEndian>()?;

        // 读取压缩模式
        let compression = cursor.read_u8()?;

        // 读取图像数据
        let image_data = match compression {
            0 => read_raw_image(&mut cursor, width, height, depth)?,
            1 => read_rle_image(&mut cursor, width, height)?,
            _ => return Err(AbrError::UnsupportedCompression(compression)),
        };

        brushes.push(SampledBrush {
            uuid,
            image: GrayscaleImage { width, height, data: image_data },
        });

        // 跳到下一项（考虑 4 字节对齐）
        let consumed = cursor.position() - item_start;
        let padding = (4 - (consumed % 4)) % 4;
        cursor.seek(SeekFrom::Current(padding as i64))?;
    }

    Ok(brushes)
}
```

### 2.4 Tauri 命令

```rust
// src-tauri/src/commands.rs

#[tauri::command]
pub async fn import_abr_file(path: String) -> Result<Vec<BrushPreset>, String> {
    let data = std::fs::read(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let abr_file = AbrParser::parse(&data)
        .map_err(|e| format!("Failed to parse ABR: {}", e))?;

    let presets: Vec<BrushPreset> = abr_file.brushes
        .into_iter()
        .map(|b| b.into())
        .collect();

    Ok(presets)
}

#[tauri::command]
pub fn get_brush_presets() -> Vec<BrushPreset> {
    // 从应用状态获取已加载的预设
    BRUSH_PRESETS.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_active_brush(preset_id: String) -> Result<(), String> {
    // 设置当前活动笔刷
    // ...
}
```

---

## Phase 3: 笔刷预设 UI

### 3.1 组件结构

```
src/components/BrushPanel/
├── index.tsx              # 主面板容器
├── BrushPresetGrid.tsx    # 预设网格（缩略图）
├── BrushPresetItem.tsx    # 单个预设项
├── BrushSettings.tsx      # 详细参数编辑
├── BrushTipEditor.tsx     # 笔尖参数
├── DynamicsEditor.tsx     # 动态参数
├── ImportDialog.tsx       # ABR 导入对话框
└── BrushPanel.css         # 样式
```

### 3.2 状态管理

```typescript
// src/stores/brush.ts

interface BrushPreset {
  id: string;
  name: string;
  thumbnail: string;  // base64 data URL
  tip: {
    type: 'round' | 'sampled';
    diameter: number;
    hardness: number;
    angle: number;
    roundness: number;
    spacing: number;
  };
  dynamics: {
    size: DynamicControl;
    opacity: DynamicControl;
    angle: DynamicControl;
  };
  scatter: {
    enabled: boolean;
    amount: number;
    count: number;
  };
  fromAbr: boolean;
}

interface DynamicControl {
  control: 'off' | 'pressure' | 'tilt' | 'direction' | 'fade';
  jitter: number;
  minimum: number;
}

interface BrushState {
  presets: BrushPreset[];
  activePresetId: string | null;
  isLoading: boolean;

  // Actions
  loadPresets: () => Promise<void>;
  importAbr: (path: string) => Promise<void>;
  setActivePreset: (id: string) => void;
  updatePreset: (id: string, updates: Partial<BrushPreset>) => void;
  deletePreset: (id: string) => void;
  savePreset: (preset: BrushPreset) => Promise<void>;
}

export const useBrushStore = create<BrushState>((set, get) => ({
  presets: [],
  activePresetId: null,
  isLoading: false,

  loadPresets: async () => {
    set({ isLoading: true });
    try {
      const presets = await invoke<BrushPreset[]>('get_brush_presets');
      set({ presets, isLoading: false });
    } catch (e) {
      console.error('Failed to load presets:', e);
      set({ isLoading: false });
    }
  },

  importAbr: async (path: string) => {
    set({ isLoading: true });
    try {
      const newPresets = await invoke<BrushPreset[]>('import_abr_file', { path });
      set((state) => ({
        presets: [...state.presets, ...newPresets],
        isLoading: false,
      }));
    } catch (e) {
      console.error('Failed to import ABR:', e);
      set({ isLoading: false });
      throw e;
    }
  },

  // ... other actions
}));
```

### 3.3 UI 设计稿

```
┌─────────────────────────────────────────┐
│  Brushes                          [+] │  ← 标题 + 导入按钮
├─────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│ │     │ │     │ │     │ │     │       │  ← 预设网格
│ │ ○   │ │ ○   │ │ ✿   │ │ ★   │       │    (缩略图)
│ │     │ │     │ │     │ │     │       │
│ └─────┘ └─────┘ └─────┘ └─────┘       │
│  Hard    Soft    Leaf   Sparkle       │
│                                         │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│ │     │ │     │ │     │ │     │       │
│ ...                                    │
├─────────────────────────────────────────┤
│  Brush Tip                              │  ← 展开式设置
│  ├─ Size:     [====●====] 20px         │
│  ├─ Hardness: [●========] 100%         │
│  ├─ Spacing:  [==●======] 25%          │
│  └─ Angle:    [====●====] 0°           │
├─────────────────────────────────────────┤
│  Shape Dynamics                    [▼] │
│  ├─ Size:     [Pressure ▼] Jitter: 0%  │
│  └─ Angle:    [Direction▼] Jitter: 0%  │
├─────────────────────────────────────────┤
│  Transfer                          [▼] │
│  └─ Opacity:  [Pressure ▼] Jitter: 0%  │
└─────────────────────────────────────────┘
```

---

## 关键文件清单

### 需要修改的现有文件

| 文件 | 变更说明 |
|------|----------|
| `src-tauri/src/lib.rs` | 添加 `abr` 模块导入 |
| `src-tauri/src/brush/mod.rs` | 扩展导出，添加新子模块 |
| `src-tauri/src/brush/engine.rs` | 集成新笔刷渲染器 |
| `src-tauri/src/commands.rs` | 添加 ABR 导入命令 |
| `src-tauri/Cargo.toml` | 添加依赖（byteorder 等） |
| `src/stores/tool.ts` | 添加笔刷预设引用 |
| `src/components/Canvas/index.tsx` | 使用新笔刷引擎渲染 |
| `src/components/Toolbar/index.tsx` | 添加笔刷面板入口 |

### 需要新建的文件

| 文件 | 说明 |
|------|------|
| `src-tauri/src/brush/types.rs` | 笔刷数据结构 |
| `src-tauri/src/brush/tip.rs` | 笔尖生成算法 |
| `src-tauri/src/brush/dynamics.rs` | 动态参数计算 |
| `src-tauri/src/brush/renderer.rs` | 图章渲染器 |
| `src-tauri/src/brush/cache.rs` | 纹理缓存 |
| `src-tauri/src/abr/mod.rs` | ABR 模块入口 |
| `src-tauri/src/abr/parser.rs` | ABR 主解析器 |
| `src-tauri/src/abr/samp.rs` | samp 块解析 |
| `src-tauri/src/abr/desc.rs` | desc 块解析 |
| `src-tauri/src/abr/types.rs` | ABR 专用类型 |
| `src-tauri/src/abr/error.rs` | 错误类型 |
| `src/stores/brush.ts` | 笔刷预设 store |
| `src/components/BrushPanel/index.tsx` | 笔刷面板 |
| `src/components/BrushPanel/*.tsx` | 子组件 |
| `src/components/BrushPanel/BrushPanel.css` | 样式 |

---

## 验证方案

### 单元测试

```bash
# Rust 笔刷模块测试
cd src-tauri && cargo test brush

# Rust ABR 解析器测试
cd src-tauri && cargo test abr

# 前端 store 测试
pnpm test -- --grep brush
```

### 集成测试

1. **ABR 导入测试**
   - 使用 `abr/tahraart.abr` 作为测试文件
   - 验证笔刷数量正确
   - 验证笔刷纹理尺寸正确
   - 验证基础参数（直径、间距）正确

2. **笔刷渲染测试**
   - 圆形笔刷不同硬度效果
   - 采样笔刷图章效果
   - 压感动态响应

3. **端到端测试**
   - 启动应用
   - 点击"导入 ABR"
   - 选择测试文件
   - 验证预设列表更新
   - 选择一个预设
   - 在画布绘画
   - 验证笔刷效果

---

## 参考资源

### 格式规范
- [ABR 格式分析 (Archive Team)](https://fileformats.archiveteam.org/wiki/Photoshop_brush)
- [Adobe Photoshop File Formats Specification](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/)

### 开源实现
- [Krita ABR 实现 (C++)](https://invent.kde.org/graphics/krita/-/blob/master/libs/brush/kis_abr_brush_collection.cpp)
- [brush-viewer (TypeScript)](https://github.com/jlai/brush-viewer)
- [PSBrushExtract (Python)](https://github.com/MorrowShore/PSBrushExtract)

### 笔刷动态参考
- [Adobe Photoshop Brush Settings](https://helpx.adobe.com/photoshop/using/brush-settings.html)
- [Photoshop Brush Dynamics Tutorial](https://www.photoshopessentials.com/basics/brush-dynamics/)

---

## 风险与应对

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| ABR 格式版本差异大 | 部分文件无法解析 | 优先支持 v6-v10，记录不支持的版本 |
| PS 动态效果难以完美复现 | 效果与原版有差异 | 接受合理差异，专注核心效果 |
| 大尺寸笔刷性能问题 | 绘画卡顿 | 纹理缓存 + 降采样 + 后期 GPU 加速 |
| 复杂 descriptor 解析 | 参数丢失 | 渐进式支持，记录未解析字段 |

---

## 更新日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-01-12 | 1.0 | 初始版本 |
