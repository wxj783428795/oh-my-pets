use std::collections::BTreeMap;

use oh_my_pets_domain::PetAction;
use serde::Serialize;

const PREVIEW_SEQUENCE: [(&str, &str, u32); 8] = [
    ("intro", "首次进入预览", 900),
    ("idle", "安静观察桌面", 1800),
    ("walk_right", "在当前显示器内散步", 1400),
    ("curious", "注意到附近动静", 1200),
    ("idle", "回到默认待机", 1800),
    ("walk_left", "折返继续散步", 1400),
    ("edge_play", "靠近屏幕边缘玩耍", 1300),
    ("rare_1", "低频招牌动作占位", 1800),
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorStep {
    pub action: String,
    pub reason: String,
    pub hold_ms: u32,
}

#[derive(Debug, Default)]
pub struct PreviewBehavior {
    cursor: usize,
}

impl PreviewBehavior {
    pub fn reset(&mut self) {
        self.cursor = 0;
    }

    pub fn next(&mut self, actions: &BTreeMap<String, PetAction>) -> BehaviorStep {
        let (requested, reason, hold_ms) = PREVIEW_SEQUENCE[self.cursor % PREVIEW_SEQUENCE.len()];
        self.cursor = self.cursor.wrapping_add(1);
        step_with_fallback(requested, reason, hold_ms, actions)
    }

    pub fn trigger(&self, requested: &str, actions: &BTreeMap<String, PetAction>) -> BehaviorStep {
        step_with_fallback(requested, "用户触发的语义动作", 900, actions)
    }
}

fn step_with_fallback(
    requested: &str,
    reason: &str,
    hold_ms: u32,
    actions: &BTreeMap<String, PetAction>,
) -> BehaviorStep {
    let action = if actions.contains_key(requested) {
        requested
    } else {
        "idle"
    };
    BehaviorStep {
        action: action.to_string(),
        reason: if action == requested {
            reason.to_string()
        } else {
            format!("动作 {requested} 缺失，按规范回退到 idle")
        },
        hold_ms,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use oh_my_pets_domain::{ActionFrame, PetAction};

    use super::PreviewBehavior;

    fn action() -> PetAction {
        PetAction {
            r#loop: true,
            frames: vec![ActionFrame {
                frame_ref: "base".to_string(),
                duration_ms: 120,
            }],
            cue_points: Vec::new(),
            layout_override: None,
            extra: BTreeMap::new(),
        }
    }

    #[test]
    fn preview_sequence_falls_back_to_idle() {
        let actions = BTreeMap::from([("idle".to_string(), action())]);
        let mut behavior = PreviewBehavior::default();

        let first = behavior.next(&actions);
        let second = behavior.next(&actions);

        assert_eq!(first.action, "idle");
        assert!(first.reason.contains("回退"));
        assert_eq!(second.action, "idle");
    }
}
