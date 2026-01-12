//! Brush Stamper - Distance-based dab emission with interpolation
//!
//! This module handles the conversion of input points to brush dabs,
//! using distance accumulation to ensure consistent spacing regardless
//! of input device sampling rate.

use crate::input::RawInputPoint;

/// A single brush dab to be rendered
#[derive(Debug, Clone, Copy)]
pub struct Dab {
    /// Center X position
    pub x: f32,
    /// Center Y position
    pub y: f32,
    /// Dab size (diameter)
    pub size: f32,
    /// Dab alpha (0-1), affected by flow and pressure
    pub alpha: f32,
    /// Rotation angle in radians
    pub angle: f32,
    /// Pressure at this point (for reference)
    pub pressure: f32,
}

/// Interpolated point along the stroke path
#[derive(Debug, Clone, Copy)]
struct PathPoint {
    x: f32,
    y: f32,
    pressure: f32,
    tilt_x: f32,
    tilt_y: f32,
}

impl PathPoint {
    fn from_raw(p: &RawInputPoint) -> Self {
        Self {
            x: p.x,
            y: p.y,
            pressure: p.pressure,
            tilt_x: p.tilt_x,
            tilt_y: p.tilt_y,
        }
    }

    fn lerp(&self, other: &Self, t: f32) -> Self {
        Self {
            x: self.x + (other.x - self.x) * t,
            y: self.y + (other.y - self.y) * t,
            pressure: self.pressure + (other.pressure - self.pressure) * t,
            tilt_x: self.tilt_x + (other.tilt_x - self.tilt_x) * t,
            tilt_y: self.tilt_y + (other.tilt_y - self.tilt_y) * t,
        }
    }

    fn distance_to(&self, other: &Self) -> f32 {
        let dx = other.x - self.x;
        let dy = other.y - self.y;
        (dx * dx + dy * dy).sqrt()
    }
}

/// Brush stamper configuration
#[derive(Debug, Clone)]
pub struct StamperConfig {
    /// Base brush size (diameter in pixels)
    pub size: f32,
    /// Spacing as fraction of size (e.g., 0.25 = 25%)
    pub spacing: f32,
    /// Flow (opacity per dab, 0-1)
    pub flow: f32,
    /// Hardness (0 = soft edge, 1 = hard edge)
    pub hardness: f32,
    /// Whether pressure affects size
    pub pressure_size: bool,
    /// Whether pressure affects alpha (flow)
    pub pressure_alpha: bool,
    /// Minimum size ratio when pressure = 0 (0-1)
    pub min_size_ratio: f32,
    /// Minimum alpha ratio when pressure = 0 (0-1)
    pub min_alpha_ratio: f32,
}

impl Default for StamperConfig {
    fn default() -> Self {
        Self {
            size: 20.0,
            spacing: 0.25,
            flow: 1.0,
            hardness: 1.0,
            pressure_size: true,
            pressure_alpha: true,
            min_size_ratio: 0.0,
            min_alpha_ratio: 0.0,
        }
    }
}

/// Brush stamper that converts input points to dabs
pub struct BrushStamper {
    config: StamperConfig,
    /// Accumulated distance since last dab
    accumulated_distance: f32,
    /// Last point where a dab was emitted
    last_stamp_point: Option<PathPoint>,
    /// Previous input points for Catmull-Rom interpolation
    point_history: Vec<PathPoint>,
    /// Whether this is the first point of a stroke
    is_stroke_start: bool,
}

impl BrushStamper {
    /// Create a new stamper with given configuration
    pub fn new(config: StamperConfig) -> Self {
        Self {
            config,
            accumulated_distance: 0.0,
            last_stamp_point: None,
            point_history: Vec::with_capacity(4),
            is_stroke_start: true,
        }
    }

    /// Update configuration
    pub fn set_config(&mut self, config: StamperConfig) {
        self.config = config;
    }

    /// Get current configuration
    pub fn config(&self) -> &StamperConfig {
        &self.config
    }

    /// Reset for a new stroke
    pub fn begin_stroke(&mut self) {
        self.accumulated_distance = 0.0;
        self.last_stamp_point = None;
        self.point_history.clear();
        self.is_stroke_start = true;
    }

    /// Process a new input point and return dabs to render
    pub fn process_point(&mut self, point: &RawInputPoint) -> Vec<Dab> {
        let path_point = PathPoint::from_raw(point);
        let mut dabs = Vec::new();

        // Add to history for interpolation
        self.point_history.push(path_point);
        if self.point_history.len() > 4 {
            self.point_history.remove(0);
        }

        // First point of stroke: emit initial dab
        if self.is_stroke_start {
            self.is_stroke_start = false;
            self.last_stamp_point = Some(path_point);
            dabs.push(self.create_dab(&path_point));
            return dabs;
        }

        // Need at least 2 points to interpolate
        if self.point_history.len() < 2 {
            return dabs;
        }

        // Get interpolated path points
        let path_points = self.interpolate_path();

        // Process each path point
        for path_point in path_points {
            let last = match self.last_stamp_point {
                Some(p) => p,
                None => {
                    self.last_stamp_point = Some(path_point);
                    continue;
                }
            };

            let distance = last.distance_to(&path_point);
            self.accumulated_distance += distance;

            // Dynamic spacing based on current size
            let current_size = self.calculate_size(path_point.pressure);
            let threshold = (current_size * self.config.spacing).max(1.0);

            // Emit dabs at regular intervals
            while self.accumulated_distance >= threshold {
                // Calculate interpolation factor for exact dab position
                let overshoot = self.accumulated_distance - threshold;
                let t = if distance > 0.001 {
                    1.0 - (overshoot / distance).min(1.0)
                } else {
                    1.0
                };

                let dab_point = last.lerp(&path_point, t);
                dabs.push(self.create_dab(&dab_point));

                self.accumulated_distance -= threshold;
                self.last_stamp_point = Some(dab_point);
            }

            self.last_stamp_point = Some(path_point);
        }

        dabs
    }

    /// Finish stroke and return any remaining dabs
    pub fn finish_stroke(&mut self) -> Vec<Dab> {
        // Could emit a final dab at the exact end point if needed
        let dabs = Vec::new();
        self.begin_stroke();
        dabs
    }

    /// Create a dab from a path point
    fn create_dab(&self, point: &PathPoint) -> Dab {
        let size = self.calculate_size(point.pressure);
        let alpha = self.calculate_alpha(point.pressure);
        let angle = point.tilt_y.atan2(point.tilt_x);

        Dab {
            x: point.x,
            y: point.y,
            size,
            alpha,
            angle,
            pressure: point.pressure,
        }
    }

    /// Calculate dab size based on pressure
    fn calculate_size(&self, pressure: f32) -> f32 {
        if self.config.pressure_size {
            let min = self.config.size * self.config.min_size_ratio;
            let range = self.config.size - min;
            min + range * pressure
        } else {
            self.config.size
        }
    }

    /// Calculate dab alpha based on pressure and flow
    fn calculate_alpha(&self, pressure: f32) -> f32 {
        let base_alpha = self.config.flow;
        if self.config.pressure_alpha {
            let min = base_alpha * self.config.min_alpha_ratio;
            let range = base_alpha - min;
            min + range * pressure
        } else {
            base_alpha
        }
    }

    /// Interpolate path using Catmull-Rom spline
    fn interpolate_path(&self) -> Vec<PathPoint> {
        let n = self.point_history.len();
        if n < 2 {
            return self.point_history.clone();
        }

        // For 2-3 points, use linear interpolation
        if n < 4 {
            return self.linear_interpolate();
        }

        // Catmull-Rom interpolation for smooth curves
        self.catmull_rom_interpolate()
    }

    /// Linear interpolation between last two points
    fn linear_interpolate(&self) -> Vec<PathPoint> {
        let n = self.point_history.len();
        if n < 2 {
            return vec![];
        }

        let p0 = &self.point_history[n - 2];
        let p1 = &self.point_history[n - 1];

        let distance = p0.distance_to(p1);
        let step = self.config.size * self.config.spacing * 0.5;

        if distance < step {
            return vec![*p1];
        }

        let steps = (distance / step).ceil() as usize;
        let mut result = Vec::with_capacity(steps);

        for i in 1..=steps {
            let t = i as f32 / steps as f32;
            result.push(p0.lerp(p1, t));
        }

        result
    }

    /// Catmull-Rom spline interpolation
    fn catmull_rom_interpolate(&self) -> Vec<PathPoint> {
        let n = self.point_history.len();
        if n < 4 {
            return self.linear_interpolate();
        }

        // Use last 4 points for interpolation
        let p0 = &self.point_history[n - 4];
        let p1 = &self.point_history[n - 3];
        let p2 = &self.point_history[n - 2];
        let p3 = &self.point_history[n - 1];

        // Only interpolate the segment from p1 to p2
        let distance = p1.distance_to(p2);
        let step = self.config.size * self.config.spacing * 0.5;

        if distance < step {
            return vec![*p2];
        }

        let steps = (distance / step).ceil() as usize;
        let mut result = Vec::with_capacity(steps);

        for i in 1..=steps {
            let t = i as f32 / steps as f32;
            result.push(catmull_rom_point(p0, p1, p2, p3, t));
        }

        result
    }
}

/// Calculate a point on a Catmull-Rom spline
fn catmull_rom_point(
    p0: &PathPoint,
    p1: &PathPoint,
    p2: &PathPoint,
    p3: &PathPoint,
    t: f32,
) -> PathPoint {
    let t2 = t * t;
    let t3 = t2 * t;

    // Catmull-Rom basis functions
    let b0 = -0.5 * t3 + t2 - 0.5 * t;
    let b1 = 1.5 * t3 - 2.5 * t2 + 1.0;
    let b2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
    let b3 = 0.5 * t3 - 0.5 * t2;

    PathPoint {
        x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
        y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
        pressure: (b0 * p0.pressure + b1 * p1.pressure + b2 * p2.pressure + b3 * p3.pressure)
            .clamp(0.0, 1.0),
        tilt_x: b0 * p0.tilt_x + b1 * p1.tilt_x + b2 * p2.tilt_x + b3 * p3.tilt_x,
        tilt_y: b0 * p0.tilt_y + b1 * p1.tilt_y + b2 * p2.tilt_y + b3 * p3.tilt_y,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_point(x: f32, y: f32, pressure: f32) -> RawInputPoint {
        RawInputPoint::new(x, y, pressure)
    }

    #[test]
    fn test_stamper_creation() {
        let stamper = BrushStamper::new(StamperConfig::default());
        assert_eq!(stamper.config().size, 20.0);
        assert_eq!(stamper.config().spacing, 0.25);
    }

    #[test]
    fn test_first_point_emits_dab() {
        let mut stamper = BrushStamper::new(StamperConfig::default());
        stamper.begin_stroke();

        let point = make_point(100.0, 100.0, 1.0);
        let dabs = stamper.process_point(&point);

        assert_eq!(dabs.len(), 1);
        assert_eq!(dabs[0].x, 100.0);
        assert_eq!(dabs[0].y, 100.0);
    }

    #[test]
    fn test_close_points_no_extra_dabs() {
        let mut stamper = BrushStamper::new(StamperConfig {
            size: 20.0,
            spacing: 0.25, // 5 pixel spacing
            ..Default::default()
        });
        stamper.begin_stroke();

        // First point
        stamper.process_point(&make_point(100.0, 100.0, 1.0));

        // Second point very close (< spacing threshold)
        let dabs = stamper.process_point(&make_point(101.0, 100.0, 1.0));

        // Should not emit extra dabs for such a short distance
        assert!(dabs.len() <= 1);
    }

    #[test]
    fn test_far_points_emit_multiple_dabs() {
        let mut stamper = BrushStamper::new(StamperConfig {
            size: 20.0,
            spacing: 0.25, // 5 pixel spacing
            ..Default::default()
        });
        stamper.begin_stroke();

        // First point
        stamper.process_point(&make_point(0.0, 0.0, 1.0));

        // Second point far away (50 pixels = 10 spacing intervals)
        let dabs = stamper.process_point(&make_point(50.0, 0.0, 1.0));

        // Should emit multiple dabs
        assert!(dabs.len() >= 5);
    }

    #[test]
    fn test_pressure_affects_size() {
        let mut stamper = BrushStamper::new(StamperConfig {
            size: 20.0,
            pressure_size: true,
            min_size_ratio: 0.0,
            ..Default::default()
        });
        stamper.begin_stroke();

        // Low pressure
        let dabs_low = stamper.process_point(&make_point(0.0, 0.0, 0.2));
        stamper.begin_stroke();

        // High pressure
        let dabs_high = stamper.process_point(&make_point(0.0, 0.0, 0.8));

        assert!(dabs_high[0].size > dabs_low[0].size);
    }

    #[test]
    fn test_flow_affects_alpha() {
        let mut stamper = BrushStamper::new(StamperConfig {
            flow: 0.5,
            pressure_alpha: false,
            ..Default::default()
        });
        stamper.begin_stroke();

        let dabs = stamper.process_point(&make_point(0.0, 0.0, 1.0));

        assert!((dabs[0].alpha - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_begin_stroke_resets_state() {
        let mut stamper = BrushStamper::new(StamperConfig::default());

        stamper.begin_stroke();
        stamper.process_point(&make_point(0.0, 0.0, 1.0));
        stamper.process_point(&make_point(100.0, 0.0, 1.0));

        // Begin new stroke
        stamper.begin_stroke();
        let dabs = stamper.process_point(&make_point(0.0, 0.0, 1.0));

        // Should emit initial dab again
        assert_eq!(dabs.len(), 1);
    }
}
