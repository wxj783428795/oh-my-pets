use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PetManifest {
    pub schema_version: u32,
    pub id: String,
    pub version: String,
    pub display_name: String,
    pub description: String,
    pub author: Author,
    pub min_app_version: String,
    pub renderer: String,
    pub canvas: Size,
    pub atlas_path: String,
    pub layout: Layout,
    pub actions: BTreeMap<String, PetAction>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Author {
    pub name: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
pub struct Size {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    pub baseline: Point,
    pub hitbox: Rect,
    pub drop_zone: Rect,
    pub bubble_anchor: Point,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PetAction {
    pub r#loop: bool,
    pub frames: Vec<ActionFrame>,
    #[serde(default)]
    pub cue_points: Vec<CuePoint>,
    #[serde(default)]
    pub layout_override: Option<Layout>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionFrame {
    #[serde(rename = "ref")]
    pub frame_ref: String,
    pub duration_ms: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CuePoint {
    pub name: String,
    pub time_ms: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AtlasManifest {
    pub image_path: String,
    pub pixel_width: u32,
    pub pixel_height: u32,
    pub frames: BTreeMap<String, AtlasFrame>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AtlasFrame {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
    pub offset_x: i32,
    pub offset_y: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionSummary {
    pub name: String,
    pub frame_count: usize,
    pub duration_ms: u32,
    pub loops: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PetPackSummary {
    pub id: String,
    pub version: String,
    pub display_name: String,
    pub description: String,
    pub canvas: Size,
    pub atlas_image: String,
    pub action_count: usize,
    pub frame_count: usize,
    pub actions: Vec<ActionSummary>,
    pub warnings: Vec<ValidationIssue>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IssueSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub severity: IssueSeverity,
    pub code: String,
    pub path: String,
    pub message: String,
}

impl ValidationIssue {
    pub fn error(
        code: impl Into<String>,
        path: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            severity: IssueSeverity::Error,
            code: code.into(),
            path: path.into(),
            message: message.into(),
        }
    }

    pub fn warning(
        code: impl Into<String>,
        path: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            severity: IssueSeverity::Warning,
            code: code.into(),
            path: path.into(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct LoadedAtlasImage {
    pub media_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct LoadedPetPack {
    pub manifest: PetManifest,
    pub atlas: AtlasManifest,
    pub atlas_image: LoadedAtlasImage,
    pub summary: PetPackSummary,
}
