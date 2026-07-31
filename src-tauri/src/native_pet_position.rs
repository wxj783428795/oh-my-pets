use std::{sync::Mutex, time::Duration};

use tauri::{PhysicalPosition, WebviewWindow};

use crate::{
    display_motion::{
        LogicalVelocity, MotionStep, PetPlacement, PhysicalPoint, adopt_external_position,
        advance_placement, recall_placement, reconcile_placement, resolve_startup_placement,
    },
    display_runtime::{capture_display_snapshot, outer_window_size},
    product_state::{ProductStateController, ProductStateSnapshot, SavedPosition},
};

pub const PET_SAFE_MARGIN: i32 = 24;

#[derive(Default)]
pub struct NativePetPositionController {
    placement: Mutex<Option<PetPlacement>>,
}

impl NativePetPositionController {
    pub fn recall(
        &self,
        window: &WebviewWindow,
        product: &ProductStateController,
    ) -> Result<ProductStateSnapshot, String> {
        let displays = capture_display_snapshot(window)?;
        let window_size = outer_window_size(window)?;
        let placement = recall_placement(&displays, window_size, PET_SAFE_MARGIN)
            .ok_or_else(|| "鼠标所在显示器无法容纳宠物窗口".to_string())?;
        self.apply(window, product, placement, true)
    }

    pub fn restore(
        &self,
        window: &WebviewWindow,
        product: &ProductStateController,
    ) -> Result<Option<ProductStateSnapshot>, String> {
        let product_snapshot = product.snapshot()?;
        let saved = product_snapshot
            .preferences
            .last_valid_position
            .map(|position| PhysicalPoint::new(position.x, position.y));
        let displays = capture_display_snapshot(window)?;
        let window_size = outer_window_size(window)?;
        let placement = resolve_startup_placement(&displays, saved, window_size, PET_SAFE_MARGIN)
            .ok_or_else(|| "当前显示器无法容纳宠物窗口".to_string())?;
        let recovered = saved != Some(placement.position);
        let value = self.apply(window, product, placement, recovered)?;

        Ok(recovered.then_some(value))
    }

    pub fn advance(
        &self,
        window: &WebviewWindow,
        product: &ProductStateController,
        velocity: LogicalVelocity,
        elapsed: Duration,
        persist: bool,
    ) -> Result<(PhysicalPoint, MotionStep), String> {
        let displays = capture_display_snapshot(window)?;
        let window_size = outer_window_size(window)?;
        let placement = self
            .placement
            .lock()
            .map_err(|_| "宠物位置状态锁已损坏".to_string())?
            .clone()
            .ok_or_else(|| "宠物位置尚未初始化".to_string())?;
        let before = placement.position;
        let step = advance_placement(
            &displays,
            placement,
            velocity,
            elapsed,
            window_size,
            PET_SAFE_MARGIN,
        )
        .ok_or_else(|| "无法在当前显示器内更新宠物位置".to_string())?;
        self.apply(window, product, step.placement.clone(), persist)?;

        Ok((before, step))
    }

    pub fn reconcile(
        &self,
        window: &WebviewWindow,
        product: &ProductStateController,
    ) -> Result<Option<ProductStateSnapshot>, String> {
        let displays = capture_display_snapshot(window)?;
        let window_size = outer_window_size(window)?;
        let current = self
            .placement
            .lock()
            .map_err(|_| "宠物位置状态锁已损坏".to_string())?
            .clone()
            .ok_or_else(|| "宠物位置尚未初始化".to_string())?;
        let recovered =
            reconcile_placement(&displays, current.clone(), window_size, PET_SAFE_MARGIN)
                .ok_or_else(|| "显示器变化后没有可用的宠物安全区域".to_string())?;
        if recovered == current {
            return Ok(None);
        }

        self.apply(window, product, recovered, true).map(Some)
    }

    pub fn observe_move(
        &self,
        window: &WebviewWindow,
        product: &ProductStateController,
        position: PhysicalPoint,
    ) -> Result<Option<ProductStateSnapshot>, String> {
        let current = self
            .placement
            .lock()
            .map_err(|_| "宠物位置状态锁已损坏".to_string())?
            .clone();
        if current
            .as_ref()
            .is_some_and(|placement| placement.position == position)
        {
            return Ok(None);
        }

        let displays = capture_display_snapshot(window)?;
        let window_size = outer_window_size(window)?;
        let previous = current.clone().or_else(|| {
            resolve_startup_placement(&displays, Some(position), window_size, PET_SAFE_MARGIN)
        });
        let previous = previous.ok_or_else(|| "无法识别宠物窗口当前所在显示器".to_string())?;

        if let Some(adopted) = adopt_external_position(
            &displays,
            previous.clone(),
            position,
            window_size,
            PET_SAFE_MARGIN,
        ) {
            if adopted.position != position {
                return self.apply(window, product, adopted, true).map(Some);
            }
            *self
                .placement
                .lock()
                .map_err(|_| "宠物位置状态锁已损坏".to_string())? = Some(adopted.clone());
            return product
                .set_last_valid_position(SavedPosition {
                    x: adopted.position.x,
                    y: adopted.position.y,
                })
                .map(Some);
        }

        let observed = PetPlacement {
            display_id: previous.display_id,
            position,
        };
        let recovered = reconcile_placement(&displays, observed, window_size, PET_SAFE_MARGIN)
            .ok_or_else(|| "窗口移动后没有可用的宠物安全区域".to_string())?;
        self.apply(window, product, recovered, true).map(Some)
    }

    fn apply(
        &self,
        window: &WebviewWindow,
        product: &ProductStateController,
        placement: PetPlacement,
        persist: bool,
    ) -> Result<ProductStateSnapshot, String> {
        window
            .set_position(PhysicalPosition::new(
                placement.position.x,
                placement.position.y,
            ))
            .map_err(|error| error.to_string())?;
        *self
            .placement
            .lock()
            .map_err(|_| "宠物位置状态锁已损坏".to_string())? = Some(placement.clone());

        if persist {
            product.set_last_valid_position(SavedPosition {
                x: placement.position.x,
                y: placement.position.y,
            })
        } else {
            product.snapshot()
        }
    }
}
