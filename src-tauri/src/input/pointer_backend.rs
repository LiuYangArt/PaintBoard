//! PointerEvent backend implementation
//!
//! Provides tablet input via the Web PointerEvent API.
//! This is the fallback backend when WinTab is not available.
//! Input is received from the frontend via Tauri commands.

use super::backend::{TabletBackend, TabletConfig, TabletEvent, TabletInfo, TabletStatus};
use super::RawInputPoint;
use std::sync::{Arc, Mutex};

/// PointerEvent backend for cross-platform tablet input
pub struct PointerEventBackend {
    status: TabletStatus,
    info: Option<TabletInfo>,
    config: TabletConfig,
    events: Arc<Mutex<Vec<TabletEvent>>>,
    pressure_curve: super::backend::PressureCurve,
}

impl PointerEventBackend {
    /// Create a new PointerEvent backend
    pub fn new() -> Self {
        Self {
            status: TabletStatus::Disconnected,
            info: None,
            config: TabletConfig::default(),
            events: Arc::new(Mutex::new(Vec::with_capacity(64))),
            pressure_curve: super::backend::PressureCurve::Linear,
        }
    }

    /// Push input from frontend PointerEvent
    /// Called by Tauri command when frontend receives pointer events
    pub fn push_input(&self, x: f32, y: f32, pressure: f32, tilt_x: f32, tilt_y: f32) {
        let adjusted_pressure = self.pressure_curve.apply(pressure);

        let point = RawInputPoint {
            x,
            y,
            pressure: adjusted_pressure,
            tilt_x: tilt_x.clamp(-90.0, 90.0),
            tilt_y: tilt_y.clamp(-90.0, 90.0),
            timestamp_ms: super::current_time_ms(),
        };

        if let Ok(mut events) = self.events.lock() {
            events.push(TabletEvent::Input(point));
        }
    }

    /// Push proximity enter event
    pub fn push_proximity_enter(&self) {
        if let Ok(mut events) = self.events.lock() {
            events.push(TabletEvent::ProximityEnter);
        }
    }

    /// Push proximity leave event
    pub fn push_proximity_leave(&self) {
        if let Ok(mut events) = self.events.lock() {
            events.push(TabletEvent::ProximityLeave);
        }
    }

    /// Get shared events reference for external access
    pub fn events_ref(&self) -> Arc<Mutex<Vec<TabletEvent>>> {
        self.events.clone()
    }
}

impl Default for PointerEventBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl TabletBackend for PointerEventBackend {
    fn init(&mut self, config: &TabletConfig) -> Result<(), String> {
        self.config = config.clone();
        self.pressure_curve = config.pressure_curve;

        self.info = Some(TabletInfo {
            name: "PointerEvent".to_string(),
            backend: "PointerEvent".to_string(),
            supports_pressure: true,
            supports_tilt: true,
            pressure_range: (0, 1), // Normalized 0.0-1.0
        });

        self.status = TabletStatus::Connected;
        tracing::info!("[PointerEvent] Initialized");
        Ok(())
    }

    fn start(&mut self) -> Result<(), String> {
        if self.status != TabletStatus::Connected {
            return Err("Backend not initialized".to_string());
        }
        tracing::info!("[PointerEvent] Started (waiting for frontend events)");
        Ok(())
    }

    fn stop(&mut self) {
        if let Ok(mut events) = self.events.lock() {
            events.clear();
        }
        tracing::info!("[PointerEvent] Stopped");
    }

    fn status(&self) -> TabletStatus {
        self.status
    }

    fn info(&self) -> Option<&TabletInfo> {
        self.info.as_ref()
    }

    fn poll(&mut self, events: &mut Vec<TabletEvent>) -> usize {
        if let Ok(mut events_lock) = self.events.lock() {
            let count = events_lock.len();
            events.append(&mut events_lock);
            count
        } else {
            0
        }
    }

    fn is_available() -> bool {
        // PointerEvent is always available as a fallback
        true
    }

    fn name(&self) -> &'static str {
        "PointerEvent"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pointer_backend_creation() {
        let backend = PointerEventBackend::new();
        assert_eq!(backend.status(), TabletStatus::Disconnected);
        assert!(backend.info().is_none());
    }

    #[test]
    fn test_pointer_backend_init() {
        let mut backend = PointerEventBackend::new();
        let config = TabletConfig::default();

        let result = backend.init(&config);
        assert!(result.is_ok());
        assert_eq!(backend.status(), TabletStatus::Connected);
        assert!(backend.info().is_some());
    }

    #[test]
    fn test_pointer_backend_push_input() -> Result<(), String> {
        let mut backend = PointerEventBackend::new();
        backend.init(&TabletConfig::default())?;
        backend.start()?;

        backend.push_input(100.0, 200.0, 0.5, 10.0, -5.0);

        let mut events = Vec::new();
        let count = backend.poll(&mut events);

        assert_eq!(count, 1);
        if let TabletEvent::Input(point) = &events[0] {
            assert_eq!(point.x, 100.0);
            assert_eq!(point.y, 200.0);
            assert_eq!(point.pressure, 0.5);
        } else {
            panic!("Expected Input event");
        }
        Ok(())
    }
}
