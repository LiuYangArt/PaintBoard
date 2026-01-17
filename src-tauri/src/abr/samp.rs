//! 8BIMsamp section utilities
//!
//! Provides utility functions for brush texture processing.
//! The main ABR parsing is done in parser.rs.

use super::types::GrayscaleImage;

/// Normalize brush texture to standard format
///
/// ABR textures may use different conventions for opacity:
/// - Some use 0=transparent, 255=opaque
/// - Some use 0=opaque, 255=transparent
///
/// This function normalizes to: 255=opaque, 0=transparent
pub fn normalize_brush_texture(image: &GrayscaleImage) -> GrayscaleImage {
    let should_invert = detect_inverted_alpha(image);

    let normalized_data: Vec<u8> = if should_invert {
        image.data.iter().map(|&p| 255 - p).collect()
    } else {
        image.data.clone()
    };

    GrayscaleImage::new(image.width, image.height, normalized_data)
}

/// Detect if alpha channel is inverted by comparing center to corners
///
/// For a typical brush, the center should be more opaque than the edges.
/// If the center is darker (lower value), the convention is probably
/// 0=opaque, so we need to invert.
fn detect_inverted_alpha(image: &GrayscaleImage) -> bool {
    if image.width == 0 || image.height == 0 {
        return false;
    }

    let cx = image.width / 2;
    let cy = image.height / 2;

    let center = image.get_pixel(cx, cy).unwrap_or(128);
    let corner = image.get_pixel(0, 0).unwrap_or(128);

    // If center is darker than corner, probably inverted
    center < corner
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_inverted_normal() {
        // Normal brush: center bright (opaque), edges dark (transparent)
        let mut data = vec![0u8; 9]; // 3x3
        data[4] = 255; // Center bright
        let img = GrayscaleImage::new(3, 3, data);

        assert!(!detect_inverted_alpha(&img));
    }

    #[test]
    fn test_detect_inverted_inverted() {
        // Inverted brush: center dark (opaque in ABR), edges bright
        let mut data = vec![255u8; 9]; // 3x3
        data[4] = 0; // Center dark
        let img = GrayscaleImage::new(3, 3, data);

        assert!(detect_inverted_alpha(&img));
    }
}
