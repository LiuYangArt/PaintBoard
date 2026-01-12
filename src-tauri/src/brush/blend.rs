//! Blend mode algorithms for brush rendering
//!
//! All functions work with premultiplied alpha format for correct compositing.

use super::stroke_buffer::Pixel;

/// Standard alpha blending (Porter-Duff "over" operator) for premultiplied alpha
///
/// Formula: result = src + dst * (1 - src.a)
#[inline]
pub fn blend_normal_premul(src: Pixel, dst: Pixel) -> Pixel {
    let inv_src_a = 1.0 - src.a;
    Pixel {
        r: src.r + dst.r * inv_src_a,
        g: src.g + dst.g * inv_src_a,
        b: src.b + dst.b * inv_src_a,
        a: src.a + dst.a * inv_src_a,
    }
}

/// Multiply blend mode
///
/// Formula: S × D (darkens image)
#[inline]
pub fn blend_multiply_premul(src: Pixel, dst: Pixel) -> Pixel {
    if src.a < 0.001 {
        return dst;
    }
    if dst.a < 0.001 {
        return src;
    }

    // Unpremultiply for blend calculation
    let src_r = src.r / src.a;
    let src_g = src.g / src.a;
    let src_b = src.b / src.a;

    let dst_r = dst.r / dst.a;
    let dst_g = dst.g / dst.a;
    let dst_b = dst.b / dst.a;

    // Multiply blend
    let blend_r = src_r * dst_r;
    let blend_g = src_g * dst_g;
    let blend_b = src_b * dst_b;

    // Composite with alpha
    let out_a = src.a + dst.a * (1.0 - src.a);
    if out_a < 0.001 {
        return Pixel::transparent();
    }

    // Lerp between dst color and blended color based on src alpha
    let result_r = dst_r + (blend_r - dst_r) * src.a;
    let result_g = dst_g + (blend_g - dst_g) * src.a;
    let result_b = dst_b + (blend_b - dst_b) * src.a;

    // Premultiply result
    Pixel {
        r: result_r * out_a,
        g: result_g * out_a,
        b: result_b * out_a,
        a: out_a,
    }
}

/// Screen blend mode
///
/// Formula: 1 - (1-S) × (1-D) (lightens image)
#[inline]
pub fn blend_screen_premul(src: Pixel, dst: Pixel) -> Pixel {
    if src.a < 0.001 {
        return dst;
    }
    if dst.a < 0.001 {
        return src;
    }

    let src_r = src.r / src.a;
    let src_g = src.g / src.a;
    let src_b = src.b / src.a;

    let dst_r = dst.r / dst.a;
    let dst_g = dst.g / dst.a;
    let dst_b = dst.b / dst.a;

    let blend_r = 1.0 - (1.0 - src_r) * (1.0 - dst_r);
    let blend_g = 1.0 - (1.0 - src_g) * (1.0 - dst_g);
    let blend_b = 1.0 - (1.0 - src_b) * (1.0 - dst_b);

    let out_a = src.a + dst.a * (1.0 - src.a);
    if out_a < 0.001 {
        return Pixel::transparent();
    }

    let result_r = dst_r + (blend_r - dst_r) * src.a;
    let result_g = dst_g + (blend_g - dst_g) * src.a;
    let result_b = dst_b + (blend_b - dst_b) * src.a;

    Pixel {
        r: result_r * out_a,
        g: result_g * out_a,
        b: result_b * out_a,
        a: out_a,
    }
}

/// Overlay blend mode
///
/// Formula: if D < 0.5: 2×S×D else: 1 - 2×(1-S)×(1-D)
#[inline]
pub fn blend_overlay_premul(src: Pixel, dst: Pixel) -> Pixel {
    if src.a < 0.001 {
        return dst;
    }
    if dst.a < 0.001 {
        return src;
    }

    let src_r = src.r / src.a;
    let src_g = src.g / src.a;
    let src_b = src.b / src.a;

    let dst_r = dst.r / dst.a;
    let dst_g = dst.g / dst.a;
    let dst_b = dst.b / dst.a;

    let overlay = |s: f32, d: f32| -> f32 {
        if d < 0.5 {
            2.0 * s * d
        } else {
            1.0 - 2.0 * (1.0 - s) * (1.0 - d)
        }
    };

    let blend_r = overlay(src_r, dst_r);
    let blend_g = overlay(src_g, dst_g);
    let blend_b = overlay(src_b, dst_b);

    let out_a = src.a + dst.a * (1.0 - src.a);
    if out_a < 0.001 {
        return Pixel::transparent();
    }

    let result_r = dst_r + (blend_r - dst_r) * src.a;
    let result_g = dst_g + (blend_g - dst_g) * src.a;
    let result_b = dst_b + (blend_b - dst_b) * src.a;

    Pixel {
        r: result_r * out_a,
        g: result_g * out_a,
        b: result_b * out_a,
        a: out_a,
    }
}

/// Darken blend mode
///
/// Formula: min(S, D)
#[inline]
pub fn blend_darken_premul(src: Pixel, dst: Pixel) -> Pixel {
    if src.a < 0.001 {
        return dst;
    }
    if dst.a < 0.001 {
        return src;
    }

    let src_r = src.r / src.a;
    let src_g = src.g / src.a;
    let src_b = src.b / src.a;

    let dst_r = dst.r / dst.a;
    let dst_g = dst.g / dst.a;
    let dst_b = dst.b / dst.a;

    let blend_r = src_r.min(dst_r);
    let blend_g = src_g.min(dst_g);
    let blend_b = src_b.min(dst_b);

    let out_a = src.a + dst.a * (1.0 - src.a);
    if out_a < 0.001 {
        return Pixel::transparent();
    }

    let result_r = dst_r + (blend_r - dst_r) * src.a;
    let result_g = dst_g + (blend_g - dst_g) * src.a;
    let result_b = dst_b + (blend_b - dst_b) * src.a;

    Pixel {
        r: result_r * out_a,
        g: result_g * out_a,
        b: result_b * out_a,
        a: out_a,
    }
}

/// Lighten blend mode
///
/// Formula: max(S, D)
#[inline]
pub fn blend_lighten_premul(src: Pixel, dst: Pixel) -> Pixel {
    if src.a < 0.001 {
        return dst;
    }
    if dst.a < 0.001 {
        return src;
    }

    let src_r = src.r / src.a;
    let src_g = src.g / src.a;
    let src_b = src.b / src.a;

    let dst_r = dst.r / dst.a;
    let dst_g = dst.g / dst.a;
    let dst_b = dst.b / dst.a;

    let blend_r = src_r.max(dst_r);
    let blend_g = src_g.max(dst_g);
    let blend_b = src_b.max(dst_b);

    let out_a = src.a + dst.a * (1.0 - src.a);
    if out_a < 0.001 {
        return Pixel::transparent();
    }

    let result_r = dst_r + (blend_r - dst_r) * src.a;
    let result_g = dst_g + (blend_g - dst_g) * src.a;
    let result_b = dst_b + (blend_b - dst_b) * src.a;

    Pixel {
        r: result_r * out_a,
        g: result_g * out_a,
        b: result_b * out_a,
        a: out_a,
    }
}

/// Blend mode enum matching the existing BlendMode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BlendFunc {
    #[default]
    Normal,
    Multiply,
    Screen,
    Overlay,
    Darken,
    Lighten,
}

impl BlendFunc {
    /// Apply blend function to source and destination pixels
    pub fn apply(&self, src: Pixel, dst: Pixel) -> Pixel {
        match self {
            BlendFunc::Normal => blend_normal_premul(src, dst),
            BlendFunc::Multiply => blend_multiply_premul(src, dst),
            BlendFunc::Screen => blend_screen_premul(src, dst),
            BlendFunc::Overlay => blend_overlay_premul(src, dst),
            BlendFunc::Darken => blend_darken_premul(src, dst),
            BlendFunc::Lighten => blend_lighten_premul(src, dst),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx_eq(a: f32, b: f32) -> bool {
        (a - b).abs() < 0.01
    }

    #[test]
    fn test_blend_normal_opaque() {
        let src = Pixel::new(1.0, 0.0, 0.0, 1.0); // Red, fully opaque
        let dst = Pixel::new(0.0, 1.0, 0.0, 1.0); // Green, fully opaque

        let result = blend_normal_premul(src, dst);

        // Opaque source should completely cover destination
        assert!(approx_eq(result.r, 1.0));
        assert!(approx_eq(result.g, 0.0));
        assert!(approx_eq(result.a, 1.0));
    }

    #[test]
    fn test_blend_normal_transparent() {
        let src = Pixel::transparent();
        let dst = Pixel::new(0.0, 1.0, 0.0, 1.0);

        let result = blend_normal_premul(src, dst);

        // Transparent source should leave destination unchanged
        assert!(approx_eq(result.g, 1.0));
        assert!(approx_eq(result.a, 1.0));
    }

    #[test]
    fn test_blend_normal_semi_transparent() {
        // 50% red over green
        let src = Pixel::new(0.5, 0.0, 0.0, 0.5); // Premultiplied
        let dst = Pixel::new(0.0, 1.0, 0.0, 1.0);

        let result = blend_normal_premul(src, dst);

        // Should blend to some mix
        assert!(result.r > 0.0);
        assert!(result.g > 0.0);
        assert!(approx_eq(result.a, 1.0));
    }

    #[test]
    fn test_blend_multiply() {
        // White multiplied by any color = that color
        let white = Pixel::new(1.0, 1.0, 1.0, 1.0);
        let red = Pixel::new(1.0, 0.0, 0.0, 1.0);

        let result = blend_multiply_premul(white, red);
        assert!(approx_eq(result.r, 1.0));
        assert!(approx_eq(result.g, 0.0));
    }

    #[test]
    fn test_blend_screen() {
        // Black screened over any color = that color
        let black = Pixel::new(0.0, 0.0, 0.0, 1.0);
        let red = Pixel::new(1.0, 0.0, 0.0, 1.0);

        let result = blend_screen_premul(black, red);
        assert!(approx_eq(result.r, 1.0));
        assert!(approx_eq(result.g, 0.0));
    }

    #[test]
    fn test_blend_func_enum() {
        let src = Pixel::new(1.0, 0.0, 0.0, 1.0);
        let dst = Pixel::new(0.0, 1.0, 0.0, 1.0);

        let result = BlendFunc::Normal.apply(src, dst);
        assert!(approx_eq(result.r, 1.0));
    }
}
