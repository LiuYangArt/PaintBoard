//! TabletBackend trait - unified interface for tablet input backends
//!
//! This module defines the common interface that all tablet backends must implement,
//! allowing seamless switching between WinTab, PointerEvent, and other backends.

use crate::input::RawInputPoint;
use serde::{Deserialize, Serialize};

/// Tablet device information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabletInfo {
    /// Device name
    pub name: String,
    /// Backend type (e.g., "WinTab", "PointerEvent")
    pub backend: String,
    /// Whether pressure is supported
    pub supports_pressure: bool,
    /// Whether tilt is supported
    pub supports_tilt: bool,
    /// Pressure range (min, max)
    pub pressure_range: (i32, i32),
}

/// Tablet connection status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TabletStatus {
    /// Not connected or not initialized
    Disconnected,
    /// Connected and ready
    Connected,
    /// Connection failed
    Error,
}

/// Events emitted by the tablet backend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TabletEvent {
    /// Input point received
    Input(RawInputPoint),
    /// Pen entered proximity
    ProximityEnter,
    /// Pen left proximity
    ProximityLeave,
    /// Status changed
    StatusChanged(TabletStatus),
}

/// Configuration for tablet backend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabletConfig {
    /// Polling rate in Hz (for polling-based backends)
    pub polling_rate_hz: u32,
    /// Enable input prediction
    pub prediction_enabled: bool,
    /// Pressure curve type
    pub pressure_curve: PressureCurve,
}

impl Default for TabletConfig {
    fn default() -> Self {
        Self {
            polling_rate_hz: 200,
            prediction_enabled: true,
            pressure_curve: PressureCurve::Linear,
        }
    }
}

/// Pressure curve types for mapping raw pressure to output
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PressureCurve {
    /// Linear mapping (1:1)
    Linear,
    /// Soft curve (easier light pressure)
    Soft,
    /// Hard curve (requires more pressure)
    Hard,
    /// S-curve (soft at extremes, linear in middle)
    SCurve,
}

impl PressureCurve {
    /// Apply the pressure curve to a normalized pressure value (0.0 - 1.0)
    pub fn apply(&self, pressure: f32) -> f32 {
        let p = pressure.clamp(0.0, 1.0);
        match self {
            PressureCurve::Linear => p,
            PressureCurve::Soft => p.sqrt(),
            PressureCurve::Hard => p * p,
            PressureCurve::SCurve => {
                // S-curve using smoothstep
                p * p * (3.0 - 2.0 * p)
            }
        }
    }
}

/// Trait that all tablet backends must implement
pub trait TabletBackend: Send {
    /// Initialize the backend
    fn init(&mut self, config: &TabletConfig) -> Result<(), String>;

    /// Start receiving input events
    fn start(&mut self) -> Result<(), String>;

    /// Stop receiving input events
    fn stop(&mut self);

    /// Get current status
    fn status(&self) -> TabletStatus;

    /// Get tablet info (if connected)
    fn info(&self) -> Option<&TabletInfo>;

    /// Poll for new events (for polling-based backends)
    /// Returns the number of events retrieved
    fn poll(&mut self, events: &mut Vec<TabletEvent>) -> usize;

    /// Check if this backend is available on the current system
    fn is_available() -> bool
    where
        Self: Sized;

    /// Get the backend name
    fn name(&self) -> &'static str;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pressure_curve_linear() {
        let curve = PressureCurve::Linear;
        assert_eq!(curve.apply(0.0), 0.0);
        assert_eq!(curve.apply(0.5), 0.5);
        assert_eq!(curve.apply(1.0), 1.0);
    }

    #[test]
    fn test_pressure_curve_soft() {
        let curve = PressureCurve::Soft;
        assert_eq!(curve.apply(0.0), 0.0);
        assert!(curve.apply(0.25) > 0.25); // Soft makes low pressure easier
        assert_eq!(curve.apply(1.0), 1.0);
    }

    #[test]
    fn test_pressure_curve_hard() {
        let curve = PressureCurve::Hard;
        assert_eq!(curve.apply(0.0), 0.0);
        assert!(curve.apply(0.5) < 0.5); // Hard makes low pressure harder
        assert_eq!(curve.apply(1.0), 1.0);
    }

    #[test]
    fn test_pressure_curve_clamping() {
        let curve = PressureCurve::Linear;
        assert_eq!(curve.apply(-0.5), 0.0);
        assert_eq!(curve.apply(1.5), 1.0);
    }
}
