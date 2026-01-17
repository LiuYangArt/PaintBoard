//! ABR default values for missing descriptor keys
//!
//! When ActionDescriptor lacks certain keys, these defaults are used
//! to ensure brushes remain usable.

/// Default values for ABR brush parameters
pub struct AbrDefaults;

impl AbrDefaults {
    /// Default brush diameter in pixels
    pub const DIAMETER: f32 = 30.0;

    /// Default hardness (1.0 = hard edge, 0.0 = soft)
    pub const HARDNESS: f32 = 1.0;

    /// Default spacing as fraction of diameter
    pub const SPACING: f32 = 0.25;

    /// Default brush angle in degrees
    pub const ANGLE: f32 = 0.0;

    /// Default roundness (1.0 = circular)
    pub const ROUNDNESS: f32 = 1.0;

    /// Default size jitter
    pub const SIZE_JITTER: f32 = 0.0;

    /// Default minimum size
    pub const SIZE_MINIMUM: f32 = 0.0;

    /// Default opacity jitter
    pub const OPACITY_JITTER: f32 = 0.0;

    /// Default scatter amount
    pub const SCATTER: f32 = 0.0;

    /// Default scatter count
    pub const SCATTER_COUNT: u32 = 1;
}
