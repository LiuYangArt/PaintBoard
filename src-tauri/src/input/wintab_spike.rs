//! WinTab Spike - 验证 wintab_lite 在 Tauri 环境的可行性
//!
//! 验证目标：
//! 1. Wintab32.dll 能否加载
//! 2. WinTab 上下文能否创建
//! 3. 能否读取压感数据

use serde::{Deserialize, Serialize};

/// Spike 验证结果
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SpikeResult {
    pub dll_loaded: bool,
    pub dll_error: Option<String>,
    pub context_created: bool,
    pub context_error: Option<String>,
    pub device_name: Option<String>,
    pub pressure_range: Option<(i32, i32)>,
    pub packets_received: u32,
    pub sample_pressure: Option<f32>,
}

#[cfg(target_os = "windows")]
pub mod spike {
    use super::SpikeResult;
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    use wintab_lite::{
        cast_void, Packet, AXIS, CXO, DVC, HCTX, INT, LOGCONTEXT, LPVOID, WTI, WTPKT,
    };

    // 定义自己的函数指针类型，避免生命周期问题
    type WTInfoFn = unsafe extern "C" fn(WTI, u32, LPVOID) -> u32;
    type WTOpenFn = unsafe extern "C" fn(HWND, *mut LOGCONTEXT, i32) -> *mut HCTX;
    type WTCloseFn = unsafe extern "C" fn(*mut HCTX) -> i32;
    type WTPacketsGetFn = unsafe extern "C" fn(*mut HCTX, INT, LPVOID) -> INT;

    /// 运行 WinTab 可行性验证
    ///
    /// 参数 hwnd: 窗口句柄（isize），如果为 0 则尝试获取前台窗口
    pub fn run_wintab_spike(hwnd: isize) -> SpikeResult {
        let mut result = SpikeResult::default();

        // Step 1: 尝试加载 Wintab32.dll
        tracing::info!("[Spike] Step 1: Loading Wintab32.dll...");

        let lib = match unsafe { libloading::Library::new("Wintab32.dll") } {
            Ok(lib) => {
                result.dll_loaded = true;
                tracing::info!("[Spike] ✓ Wintab32.dll loaded successfully");
                lib
            }
            Err(e) => {
                result.dll_error = Some(format!("{}", e));
                tracing::error!("[Spike] ✗ Failed to load Wintab32.dll: {}", e);
                return result;
            }
        };

        // 获取函数指针
        let wt_info: WTInfoFn = match unsafe { lib.get::<WTInfoFn>(b"WTInfoA") } {
            Ok(f) => *f,
            Err(e) => {
                result.dll_error = Some(format!("Failed to get WTInfoA: {}", e));
                tracing::error!("[Spike] ✗ Failed to get WTInfoA: {}", e);
                return result;
            }
        };

        let wt_open: WTOpenFn = match unsafe { lib.get::<WTOpenFn>(b"WTOpenA") } {
            Ok(f) => *f,
            Err(e) => {
                result.dll_error = Some(format!("Failed to get WTOpenA: {}", e));
                tracing::error!("[Spike] ✗ Failed to get WTOpenA: {}", e);
                return result;
            }
        };

        let wt_close: WTCloseFn = match unsafe { lib.get::<WTCloseFn>(b"WTClose") } {
            Ok(f) => *f,
            Err(e) => {
                result.dll_error = Some(format!("Failed to get WTClose: {}", e));
                tracing::error!("[Spike] ✗ Failed to get WTClose: {}", e);
                return result;
            }
        };

        let wt_packets_get: WTPacketsGetFn =
            match unsafe { lib.get::<WTPacketsGetFn>(b"WTPacketsGet") } {
                Ok(f) => *f,
                Err(e) => {
                    result.dll_error = Some(format!("Failed to get WTPacketsGet: {}", e));
                    tracing::error!("[Spike] ✗ Failed to get WTPacketsGet: {}", e);
                    return result;
                }
            };

        // Step 2: 获取设备信息
        tracing::info!("[Spike] Step 2: Querying device info...");

        let mut device_name = wintab_lite::CString40::default();
        let info_result =
            unsafe { wt_info(WTI::DEVICES, DVC::NAME as u32, cast_void!(device_name)) };

        if info_result > 0 {
            let name = device_name.to_string();
            result.device_name = Some(name.clone());
            tracing::info!("[Spike] ✓ Device found: {}", name);
        } else {
            tracing::warn!("[Spike] No device name available (WTInfo returned 0)");
        }

        // Step 3: 获取窗口句柄
        let window_handle = if hwnd != 0 {
            hwnd
        } else {
            tracing::info!("[Spike] Step 3: Getting foreground window...");
            unsafe {
                let fg_hwnd = GetForegroundWindow();
                fg_hwnd.0 as isize
            }
        };

        tracing::info!("[Spike] Using HWND: {}", window_handle);

        // Step 4: 获取默认上下文并配置
        tracing::info!("[Spike] Step 4: Creating WinTab context...");

        let mut log_context = LOGCONTEXT::default();
        let ctx_result = unsafe { wt_info(WTI::DEFCONTEXT, 0, cast_void!(log_context)) };

        if ctx_result == 0 {
            result.context_error = Some("Failed to get default context".to_string());
            tracing::error!("[Spike] ✗ Failed to get default context (WTInfo returned 0)");
            return result;
        }

        // 配置上下文
        log_context.lcOptions.insert(CXO::SYSTEM);
        log_context.lcPktData = WTPKT::X | WTPKT::Y | WTPKT::NORMAL_PRESSURE | WTPKT::STATUS;
        log_context.lcPktMode = WTPKT::empty();
        log_context.lcMoveMask = WTPKT::X | WTPKT::Y | WTPKT::NORMAL_PRESSURE;

        // 打开上下文
        let hwnd_win = HWND(window_handle);
        let context_ptr = unsafe { wt_open(hwnd_win, &mut log_context as *mut LOGCONTEXT, 1) };

        if context_ptr.is_null() {
            result.context_error = Some("WTOpen returned null".to_string());
            tracing::error!("[Spike] ✗ Failed to open WinTab context (WTOpen returned null)");
            return result;
        }

        result.context_created = true;
        tracing::info!("[Spike] ✓ WinTab context created successfully");

        // Step 5: 获取压感范围
        tracing::info!("[Spike] Step 5: Querying pressure range...");

        let mut pressure_axis = AXIS::default();
        let axis_result = unsafe {
            wt_info(
                WTI::DEVICES,
                DVC::NPRESSURE as u32,
                cast_void!(pressure_axis),
            )
        };

        if axis_result > 0 {
            result.pressure_range = Some((pressure_axis.axMin, pressure_axis.axMax));
            tracing::info!(
                "[Spike] ✓ Pressure range: {} - {}",
                pressure_axis.axMin,
                pressure_axis.axMax
            );
        } else {
            tracing::warn!("[Spike] Could not get pressure range");
        }

        // Step 6: 尝试读取数据包（轮询模式）
        tracing::info!("[Spike] Step 6: Polling for packets (3 seconds)...");
        tracing::info!("[Spike] >>> Please touch the tablet with the pen <<<");

        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();

        // 3秒后停止
        thread::spawn(move || {
            thread::sleep(Duration::from_secs(3));
            running_clone.store(false, Ordering::SeqCst);
        });

        let pressure_max = result.pressure_range.map(|(_, max)| max).unwrap_or(1024) as f32;

        while running.load(Ordering::SeqCst) {
            let mut packets: Vec<Packet> = vec![Packet::default(); 32];
            let count =
                unsafe { wt_packets_get(context_ptr, 32, packets.as_mut_ptr() as *mut c_void) };

            if count > 0 {
                result.packets_received += count as u32;

                for packet in packets.iter().take(count as usize) {
                    let pressure = packet.pkNormalPressure as f32 / pressure_max;
                    if result.sample_pressure.is_none() || pressure > 0.0 {
                        result.sample_pressure = Some(pressure);
                    }
                    tracing::debug!(
                        "[Spike] Packet: x={}, y={}, pressure={:.3}",
                        packet.pkXYZ.x,
                        packet.pkXYZ.y,
                        pressure
                    );
                }
            }

            thread::sleep(Duration::from_millis(5)); // 200Hz polling
        }

        if result.packets_received > 0 {
            tracing::info!(
                "[Spike] ✓ Received {} packets, sample pressure: {:.3}",
                result.packets_received,
                result.sample_pressure.unwrap_or(0.0)
            );
        } else {
            tracing::warn!("[Spike] No packets received (tablet may not have been touched)");
        }

        // 关闭上下文
        unsafe {
            wt_close(context_ptr);
        }
        tracing::info!("[Spike] Context closed");

        result
    }

    /// 快速检查 WinTab 是否可用（不创建上下文）
    pub fn check_wintab_available() -> bool {
        let lib = match unsafe { libloading::Library::new("Wintab32.dll") } {
            Ok(lib) => lib,
            Err(e) => {
                tracing::warn!("[Spike] WinTab not available: {}", e);
                return false;
            }
        };

        let wt_info: WTInfoFn = match unsafe { lib.get::<WTInfoFn>(b"WTInfoA") } {
            Ok(f) => *f,
            Err(_) => return false,
        };

        let mut device_name = wintab_lite::CString40::default();
        let info_result =
            unsafe { wt_info(WTI::DEVICES, DVC::NAME as u32, cast_void!(device_name)) };

        let available = info_result > 0;
        tracing::info!("[Spike] WinTab available: {}", available);
        available
    }
}

#[cfg(not(target_os = "windows"))]
pub mod spike {
    use super::SpikeResult;

    pub fn run_wintab_spike(_hwnd: isize) -> SpikeResult {
        tracing::warn!("[Spike] WinTab is only available on Windows");
        SpikeResult {
            dll_error: Some("WinTab is only available on Windows".to_string()),
            ..Default::default()
        }
    }

    pub fn check_wintab_available() -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::spike::*;

    #[test]
    fn test_wintab_availability() {
        let available = check_wintab_available();
        println!("WinTab available: {}", available);
    }
}
