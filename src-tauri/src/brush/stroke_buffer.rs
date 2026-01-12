//! Stroke Buffer - Isolates current stroke for Flow/Opacity separation
//!
//! The stroke buffer is the key to achieving Photoshop-like brush behavior:
//! - Flow controls individual dab opacity (accumulates within stroke)
//! - Opacity acts as a ceiling (maximum alpha for the entire stroke)

use super::blend::blend_normal_premul;

/// A simple rectangle for dirty region tracking
#[derive(Debug, Clone, Copy, Default)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Rect {
    pub fn new(left: i32, top: i32, right: i32, bottom: i32) -> Self {
        Self {
            left,
            top,
            right,
            bottom,
        }
    }

    pub fn empty() -> Self {
        Self {
            left: i32::MAX,
            top: i32::MAX,
            right: i32::MIN,
            bottom: i32::MIN,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.left >= self.right || self.top >= self.bottom
    }

    pub fn expand(&mut self, x: i32, y: i32, radius: i32) {
        self.left = self.left.min(x - radius);
        self.top = self.top.min(y - radius);
        self.right = self.right.max(x + radius + 1);
        self.bottom = self.bottom.max(y + radius + 1);
    }

    pub fn union(&mut self, other: &Rect) {
        if other.is_empty() {
            return;
        }
        self.left = self.left.min(other.left);
        self.top = self.top.min(other.top);
        self.right = self.right.max(other.right);
        self.bottom = self.bottom.max(other.bottom);
    }

    pub fn clamp_to(&mut self, width: i32, height: i32) {
        self.left = self.left.max(0);
        self.top = self.top.max(0);
        self.right = self.right.min(width);
        self.bottom = self.bottom.min(height);
    }
}

/// RGBA pixel in premultiplied alpha format
#[derive(Debug, Clone, Copy, Default)]
pub struct Pixel {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

impl Pixel {
    pub fn new(r: f32, g: f32, b: f32, a: f32) -> Self {
        Self { r, g, b, a }
    }

    pub fn transparent() -> Self {
        Self::default()
    }

    pub fn from_rgba_u8(r: u8, g: u8, b: u8, a: u8) -> Self {
        let a_f = a as f32 / 255.0;
        // Convert to premultiplied alpha
        Self {
            r: (r as f32 / 255.0) * a_f,
            g: (g as f32 / 255.0) * a_f,
            b: (b as f32 / 255.0) * a_f,
            a: a_f,
        }
    }

    pub fn to_rgba_u8(&self) -> [u8; 4] {
        if self.a < 0.001 {
            return [0, 0, 0, 0];
        }
        // Convert from premultiplied to straight alpha
        let inv_a = 1.0 / self.a;
        [
            ((self.r * inv_a).clamp(0.0, 1.0) * 255.0) as u8,
            ((self.g * inv_a).clamp(0.0, 1.0) * 255.0) as u8,
            ((self.b * inv_a).clamp(0.0, 1.0) * 255.0) as u8,
            (self.a.clamp(0.0, 1.0) * 255.0) as u8,
        ]
    }

    pub fn with_alpha(&self, new_alpha: f32) -> Self {
        if self.a < 0.001 {
            return Self::transparent();
        }
        // Rescale premultiplied components
        let scale = new_alpha / self.a;
        Self {
            r: self.r * scale,
            g: self.g * scale,
            b: self.b * scale,
            a: new_alpha,
        }
    }
}

/// Stroke accumulation buffer
///
/// This buffer collects all dabs from a single stroke, allowing Flow to
/// accumulate while Opacity acts as a ceiling when compositing to the layer.
pub struct StrokeBuffer {
    width: u32,
    height: u32,
    /// RGBA pixel data in premultiplied alpha format
    data: Vec<Pixel>,
    /// Region that has been modified
    dirty_rect: Rect,
    /// Whether a stroke is currently active
    active: bool,
}

impl StrokeBuffer {
    /// Create a new stroke buffer with given dimensions
    pub fn new(width: u32, height: u32) -> Self {
        let size = (width * height) as usize;
        Self {
            width,
            height,
            data: vec![Pixel::transparent(); size],
            dirty_rect: Rect::empty(),
            active: false,
        }
    }

    /// Resize the buffer (clears content)
    pub fn resize(&mut self, width: u32, height: u32) {
        self.width = width;
        self.height = height;
        let size = (width * height) as usize;
        self.data = vec![Pixel::transparent(); size];
        self.dirty_rect = Rect::empty();
        self.active = false;
    }

    /// Begin a new stroke
    pub fn begin_stroke(&mut self) {
        self.clear();
        self.active = true;
    }

    /// Clear the buffer
    pub fn clear(&mut self) {
        for pixel in &mut self.data {
            *pixel = Pixel::transparent();
        }
        self.dirty_rect = Rect::empty();
    }

    /// Check if stroke is active
    pub fn is_active(&self) -> bool {
        self.active
    }

    /// Get pixel at coordinates
    pub fn get_pixel(&self, x: u32, y: u32) -> Pixel {
        if x >= self.width || y >= self.height {
            return Pixel::transparent();
        }
        let idx = (y * self.width + x) as usize;
        self.data.get(idx).copied().unwrap_or_default()
    }

    /// Set pixel at coordinates
    pub fn set_pixel(&mut self, x: u32, y: u32, pixel: Pixel) {
        if x >= self.width || y >= self.height {
            return;
        }
        let idx = (y * self.width + x) as usize;
        if let Some(p) = self.data.get_mut(idx) {
            *p = pixel;
        }
    }

    /// Blend a pixel into the buffer using standard alpha blending
    pub fn blend_pixel(&mut self, x: u32, y: u32, src: Pixel) {
        if x >= self.width || y >= self.height {
            return;
        }
        let idx = (y * self.width + x) as usize;
        if let Some(dst) = self.data.get_mut(idx) {
            *dst = blend_normal_premul(src, *dst);
        }
    }

    /// Stamp a circular dab onto the buffer
    ///
    /// # Arguments
    /// * `cx`, `cy` - Center position
    /// * `radius` - Dab radius in pixels
    /// * `color` - RGB color (0-1)
    /// * `alpha` - Dab alpha (flow * brush_alpha)
    /// * `hardness` - Edge hardness (0 = soft, 1 = hard)
    pub fn stamp_dab(
        &mut self,
        cx: f32,
        cy: f32,
        radius: f32,
        color: [f32; 3],
        alpha: f32,
        hardness: f32,
    ) {
        let r = radius.max(0.5);
        let left = (cx - r).floor() as i32;
        let top = (cy - r).floor() as i32;
        let right = (cx + r).ceil() as i32;
        let bottom = (cy + r).ceil() as i32;

        // Expand dirty rect
        self.dirty_rect
            .expand(cx as i32, cy as i32, r.ceil() as i32);

        // Calculate inner radius for hardness falloff
        let inner_radius = r * hardness;
        let fade_width = r - inner_radius;

        for py in top..=bottom {
            if py < 0 || py >= self.height as i32 {
                continue;
            }
            for px in left..=right {
                if px < 0 || px >= self.width as i32 {
                    continue;
                }

                let dx = px as f32 + 0.5 - cx;
                let dy = py as f32 + 0.5 - cy;
                let dist = (dx * dx + dy * dy).sqrt();

                if dist > r {
                    continue;
                }

                // Calculate falloff
                let dab_alpha = if dist <= inner_radius {
                    alpha
                } else if fade_width > 0.001 {
                    alpha * (1.0 - (dist - inner_radius) / fade_width)
                } else {
                    alpha
                };

                if dab_alpha < 0.001 {
                    continue;
                }

                // Create premultiplied pixel
                let src = Pixel {
                    r: color[0] * dab_alpha,
                    g: color[1] * dab_alpha,
                    b: color[2] * dab_alpha,
                    a: dab_alpha,
                };

                self.blend_pixel(px as u32, py as u32, src);
            }
        }
    }

    /// End the stroke and composite to layer data with opacity ceiling
    ///
    /// # Arguments
    /// * `layer_data` - Target layer RGBA data (will be modified)
    /// * `opacity` - Maximum opacity (ceiling) for this stroke
    ///
    /// # Returns
    /// The dirty rectangle that was modified
    pub fn end_stroke(&mut self, layer_data: &mut [u8], opacity: f32) -> Rect {
        if !self.active {
            return Rect::empty();
        }

        self.active = false;

        // Clamp dirty rect to buffer bounds
        let mut rect = self.dirty_rect;
        rect.clamp_to(self.width as i32, self.height as i32);

        if rect.is_empty() {
            return Rect::empty();
        }

        // Composite stroke buffer to layer with opacity ceiling
        for y in rect.top..rect.bottom {
            for x in rect.left..rect.right {
                let idx = (y as u32 * self.width + x as u32) as usize;
                let stroke_pixel = self.data.get(idx).copied().unwrap_or_default();

                if stroke_pixel.a < 0.001 {
                    continue;
                }

                // Apply opacity ceiling
                let clamped_alpha = stroke_pixel.a.min(opacity);
                let clamped_pixel = stroke_pixel.with_alpha(clamped_alpha);

                // Get layer pixel
                let layer_idx = idx * 4;
                if layer_idx + 3 >= layer_data.len() {
                    continue;
                }

                let layer_pixel = Pixel::from_rgba_u8(
                    layer_data[layer_idx],
                    layer_data[layer_idx + 1],
                    layer_data[layer_idx + 2],
                    layer_data[layer_idx + 3],
                );

                // Blend stroke onto layer
                let result = blend_normal_premul(clamped_pixel, layer_pixel);
                let rgba = result.to_rgba_u8();

                layer_data[layer_idx] = rgba[0];
                layer_data[layer_idx + 1] = rgba[1];
                layer_data[layer_idx + 2] = rgba[2];
                layer_data[layer_idx + 3] = rgba[3];
            }
        }

        rect
    }

    /// Get the dirty rectangle
    pub fn dirty_rect(&self) -> Rect {
        self.dirty_rect
    }

    /// Get buffer dimensions
    pub fn dimensions(&self) -> (u32, u32) {
        (self.width, self.height)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stroke_buffer_creation() {
        let buffer = StrokeBuffer::new(100, 100);
        assert_eq!(buffer.dimensions(), (100, 100));
        assert!(!buffer.is_active());
    }

    #[test]
    fn test_begin_end_stroke() {
        let mut buffer = StrokeBuffer::new(100, 100);
        buffer.begin_stroke();
        assert!(buffer.is_active());

        let mut layer_data = vec![0u8; 100 * 100 * 4];
        buffer.end_stroke(&mut layer_data, 1.0);
        assert!(!buffer.is_active());
    }

    #[test]
    fn test_stamp_dab() {
        let mut buffer = StrokeBuffer::new(100, 100);
        buffer.begin_stroke();

        // Stamp a white dab at center
        buffer.stamp_dab(50.0, 50.0, 10.0, [1.0, 1.0, 1.0], 1.0, 1.0);

        // Check that center pixel has content
        let center = buffer.get_pixel(50, 50);
        assert!(center.a > 0.9);

        // Check dirty rect
        let rect = buffer.dirty_rect();
        assert!(!rect.is_empty());
        assert!(rect.left <= 40);
        assert!(rect.right >= 60);
    }

    #[test]
    fn test_opacity_ceiling() {
        let mut buffer = StrokeBuffer::new(10, 10);
        buffer.begin_stroke();

        // Stamp with flow = 1.0 (full opacity in stroke buffer)
        buffer.stamp_dab(5.0, 5.0, 3.0, [1.0, 0.0, 0.0], 1.0, 1.0);

        // Composite with opacity ceiling of 0.5
        let mut layer_data = vec![0u8; 10 * 10 * 4];
        buffer.end_stroke(&mut layer_data, 0.5);

        // Check that layer pixel alpha is capped at ~0.5
        let idx = (5 * 10 + 5) * 4;
        let alpha = layer_data[idx + 3] as f32 / 255.0;
        assert!(alpha <= 0.55); // Allow small tolerance
    }

    #[test]
    fn test_flow_accumulation() {
        let mut buffer = StrokeBuffer::new(20, 20);
        buffer.begin_stroke();

        // Stamp multiple overlapping dabs with low flow
        for _ in 0..5 {
            buffer.stamp_dab(10.0, 10.0, 5.0, [1.0, 1.0, 1.0], 0.2, 1.0);
        }

        // Check that alpha accumulated beyond 0.2
        let center = buffer.get_pixel(10, 10);
        assert!(center.a > 0.5);
    }

    #[test]
    fn test_rect_operations() {
        let mut rect = Rect::empty();
        assert!(rect.is_empty());

        rect.expand(50, 50, 10);
        assert!(!rect.is_empty());
        assert_eq!(rect.left, 40);
        assert_eq!(rect.right, 61);

        rect.clamp_to(100, 100);
        assert_eq!(rect.left, 40);
        assert_eq!(rect.right, 61);
    }
}
