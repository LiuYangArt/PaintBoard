//! WinTab backend implementation
//!
//! Provides low-latency tablet input on Windows via the WinTab API.
//! This is the preferred backend for Wacom tablets.

use super::backend::{TabletBackend, TabletConfig, TabletEvent, TabletInfo, TabletStatus};
use super::RawInputPoint;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
#[cfg(target_os = "windows")]
use wintab_lite::{cast_void, Packet, AXIS, CXO, DVC, HCTX, INT, LOGCONTEXT, LPVOID, WTI, WTPKT};

// Function pointer types for WinTab API
#[cfg(target_os = "windows")]
type WTInfoFn = unsafe extern "C" fn(WTI, u32, LPVOID) -> u32;
#[cfg(target_os = "windows")]
type WTOpenFn = unsafe extern "C" fn(HWND, *mut LOGCONTEXT, i32) -> *mut HCTX;
#[cfg(target_os = "windows")]
type WTCloseFn = unsafe extern "C" fn(*mut HCTX) -> i32;
#[cfg(target_os = "windows")]
type WTPacketsGetFn = unsafe extern "C" fn(*mut HCTX, INT, LPVOID) -> INT;

/// WinTab backend for Windows tablet input
pub struct WinTabBackend {
    status: TabletStatus,
    info: Option<TabletInfo>,
    config: TabletConfig,
    running: Arc<AtomicBool>,
    events: Arc<Mutex<Vec<TabletEvent>>>,
    poll_thread: Option<JoinHandle<()>>,
    pressure_max: f32,
}

impl WinTabBackend {
    /// Create a new WinTab backend
    pub fn new() -> Self {
        Self {
            status: TabletStatus::Disconnected,
            info: None,
            config: TabletConfig::default(),
            running: Arc::new(AtomicBool::new(false)),
            events: Arc::new(Mutex::new(Vec::with_capacity(64))),
            poll_thread: None,
            pressure_max: 32767.0,
        }
    }

    #[cfg(target_os = "windows")]
    fn load_wintab_functions() -> Result<
        (
            libloading::Library,
            WTInfoFn,
            WTOpenFn,
            WTCloseFn,
            WTPacketsGetFn,
        ),
        String,
    > {
        let lib = unsafe { libloading::Library::new("Wintab32.dll") }
            .map_err(|e| format!("Failed to load Wintab32.dll: {}", e))?;

        let wt_info: WTInfoFn = unsafe {
            match lib.get::<WTInfoFn>(b"WTInfoA") {
                Ok(f) => *f,
                Err(e) => return Err(format!("Failed to get WTInfoA: {}", e)),
            }
        };

        let wt_open: WTOpenFn = unsafe {
            match lib.get::<WTOpenFn>(b"WTOpenA") {
                Ok(f) => *f,
                Err(e) => return Err(format!("Failed to get WTOpenA: {}", e)),
            }
        };

        let wt_close: WTCloseFn = unsafe {
            match lib.get::<WTCloseFn>(b"WTClose") {
                Ok(f) => *f,
                Err(e) => return Err(format!("Failed to get WTClose: {}", e)),
            }
        };

        let wt_packets_get: WTPacketsGetFn = unsafe {
            match lib.get::<WTPacketsGetFn>(b"WTPacketsGet") {
                Ok(f) => *f,
                Err(e) => return Err(format!("Failed to get WTPacketsGet: {}", e)),
            }
        };

        Ok((lib, wt_info, wt_open, wt_close, wt_packets_get))
    }

    #[cfg(target_os = "windows")]
    fn query_device_info(wt_info: WTInfoFn) -> Option<(String, (i32, i32), bool)> {
        let mut device_name = wintab_lite::CString40::default();
        let name_result =
            unsafe { wt_info(WTI::DEVICES, DVC::NAME as u32, cast_void!(device_name)) };

        if name_result == 0 {
            return None;
        }

        let mut pressure_axis = AXIS::default();
        let pressure_result = unsafe {
            wt_info(
                WTI::DEVICES,
                DVC::NPRESSURE as u32,
                cast_void!(pressure_axis),
            )
        };

        let pressure_range = if pressure_result > 0 {
            (pressure_axis.axMin, pressure_axis.axMax)
        } else {
            (0, 1024)
        };

        // Tilt support detection: assume true for Wacom devices
        // (DVC::TILTX constant not available in wintab_lite, but most Wacom tablets support it)
        let supports_tilt = true;

        Some((device_name.to_string(), pressure_range, supports_tilt))
    }
}

impl Default for WinTabBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl TabletBackend for WinTabBackend {
    #[cfg(target_os = "windows")]
    fn init(&mut self, config: &TabletConfig) -> Result<(), String> {
        self.config = config.clone();

        let (lib, wt_info, _wt_open, _wt_close, _wt_packets_get) = Self::load_wintab_functions()?;

        // Query device info
        let (name, pressure_range, supports_tilt) =
            Self::query_device_info(wt_info).ok_or_else(|| "No tablet device found".to_string())?;

        self.pressure_max = pressure_range.1 as f32;

        self.info = Some(TabletInfo {
            name,
            backend: "WinTab".to_string(),
            supports_pressure: true,
            supports_tilt,
            pressure_range,
        });

        self.status = TabletStatus::Connected;

        // Keep library loaded
        std::mem::forget(lib);

        tracing::info!("[WinTab] Initialized: {:?}", self.info);
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    fn init(&mut self, _config: &TabletConfig) -> Result<(), String> {
        Err("WinTab is only available on Windows".to_string())
    }

    #[cfg(target_os = "windows")]
    fn start(&mut self) -> Result<(), String> {
        if self.status != TabletStatus::Connected {
            return Err("Backend not initialized".to_string());
        }

        if self.running.load(Ordering::SeqCst) {
            return Ok(()); // Already running
        }

        self.running.store(true, Ordering::SeqCst);

        let running = self.running.clone();
        let events = self.events.clone();
        let polling_interval_ms = 1000 / self.config.polling_rate_hz as u64;
        let pressure_max = self.pressure_max;
        let pressure_curve = self.config.pressure_curve;

        let handle = thread::spawn(move || {
            // Load WinTab functions in this thread
            let Ok((_lib, wt_info, wt_open, wt_close, wt_packets_get)) =
                WinTabBackend::load_wintab_functions()
            else {
                tracing::error!("[WinTab] Failed to load functions in poll thread");
                return;
            };

            // Get window handle
            let hwnd = unsafe { GetForegroundWindow() };
            let hwnd_val = HWND(hwnd.0);

            // Create context
            let mut log_context = LOGCONTEXT::default();
            let ctx_result = unsafe { wt_info(WTI::DEFCONTEXT, 0, cast_void!(log_context)) };
            if ctx_result == 0 {
                tracing::error!("[WinTab] Failed to get default context");
                return;
            }

            log_context.lcOptions.insert(CXO::SYSTEM);
            log_context.lcPktData = WTPKT::X
                | WTPKT::Y
                | WTPKT::NORMAL_PRESSURE
                | WTPKT::STATUS
                | WTPKT::ORIENTATION
                | WTPKT::TIME;
            log_context.lcPktMode = WTPKT::empty();
            log_context.lcMoveMask = WTPKT::X | WTPKT::Y | WTPKT::NORMAL_PRESSURE;

            let context_ptr = unsafe { wt_open(hwnd_val, &mut log_context as *mut LOGCONTEXT, 1) };
            if context_ptr.is_null() {
                tracing::error!("[WinTab] Failed to open context");
                return;
            }

            tracing::info!(
                "[WinTab] Polling thread started at {}Hz",
                1000 / polling_interval_ms
            );

            let mut was_in_proximity = false;

            while running.load(Ordering::SeqCst) {
                let mut packets: Vec<Packet> = vec![Packet::default(); 64];
                let count =
                    unsafe { wt_packets_get(context_ptr, 64, packets.as_mut_ptr() as *mut c_void) };

                if count > 0 {
                    let mut new_events = Vec::with_capacity(count as usize);

                    for packet in packets.iter().take(count as usize) {
                        // Infer proximity from pressure (TPS module is private in wintab_lite)
                        // Pressure > 0 means pen is touching the tablet
                        let has_pressure = packet.pkNormalPressure > 0;
                        let in_proximity = has_pressure;

                        if in_proximity && !was_in_proximity {
                            new_events.push(TabletEvent::ProximityEnter);
                        } else if !in_proximity && was_in_proximity {
                            new_events.push(TabletEvent::ProximityLeave);
                        }
                        was_in_proximity = in_proximity;

                        // Convert to normalized values
                        let raw_pressure = packet.pkNormalPressure as f32 / pressure_max;
                        let pressure = pressure_curve.apply(raw_pressure);

                        // Convert tilt from orientation
                        let tilt_x =
                            (packet.pkOrientation.orAzimuth as f32 / 10.0).clamp(-90.0, 90.0);
                        let tilt_y =
                            (packet.pkOrientation.orAltitude as f32 / 10.0).clamp(-90.0, 90.0);

                        let point = RawInputPoint {
                            x: packet.pkXYZ.x as f32,
                            y: packet.pkXYZ.y as f32,
                            pressure,
                            tilt_x,
                            tilt_y,
                            timestamp_ms: packet.pkTime as u64,
                        };

                        new_events.push(TabletEvent::Input(point));
                    }

                    if let Ok(mut events_lock) = events.lock() {
                        events_lock.extend(new_events);
                    }
                }

                thread::sleep(Duration::from_millis(polling_interval_ms));
            }

            // Cleanup
            unsafe {
                wt_close(context_ptr);
            }
            tracing::info!("[WinTab] Polling thread stopped");
        });

        self.poll_thread = Some(handle);
        tracing::info!("[WinTab] Started");
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    fn start(&mut self) -> Result<(), String> {
        Err("WinTab is only available on Windows".to_string())
    }

    fn stop(&mut self) {
        self.running.store(false, Ordering::SeqCst);

        if let Some(handle) = self.poll_thread.take() {
            let _ = handle.join();
        }

        tracing::info!("[WinTab] Stopped");
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

    #[cfg(target_os = "windows")]
    fn is_available() -> bool {
        unsafe { libloading::Library::new("Wintab32.dll") }.is_ok()
    }

    #[cfg(not(target_os = "windows"))]
    fn is_available() -> bool {
        false
    }

    fn name(&self) -> &'static str {
        "WinTab"
    }
}

impl Drop for WinTabBackend {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wintab_backend_creation() {
        let backend = WinTabBackend::new();
        assert_eq!(backend.status(), TabletStatus::Disconnected);
        assert!(backend.info().is_none());
    }
}
