use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Read,
    path::{Component, Path},
};

use cap_std::fs::{Dir as CapDir, OpenOptions as CapOpenOptions};
use semver::Version;

use crate::model::{
    AtlasManifest, IssueSeverity, Layout, LoadedAtlasImage, LoadedPetPack, PetManifest,
    PetPackSummary, Rect, ValidationIssue,
};

const MAX_UNPACKED_BYTES: u64 = 32 * 1024 * 1024;
const MAX_ATLAS_EDGE: u32 = 4096;
const MAX_FRAMES: usize = 256;
const MAX_ACTIONS: usize = 32;
const FORBIDDEN_BEHAVIOR_FIELDS: [&str; 11] = [
    "probability",
    "need_move",
    "direction",
    "physics",
    "soundPath",
    "script",
    "command",
    "plugin",
    "nativeHook",
    "if",
    "phase",
];
const REQUIRED_ACTIONS: [&str; 9] = [
    "idle",
    "walk_left",
    "walk_right",
    "sleep",
    "drag_hold",
    "fall",
    "land",
    "tap_react",
    "feed_react",
];
const ALLOWED_ACTIONS: [&str; 15] = [
    "idle",
    "walk_left",
    "walk_right",
    "sleep",
    "drag_hold",
    "fall",
    "land",
    "tap_react",
    "feed_react",
    "intro",
    "curious",
    "edge_play",
    "rare_1",
    "rare_2",
    "quiet_idle",
];

#[derive(Debug, thiserror::Error)]
#[error("宠物包校验失败")]
pub struct PetPackLoadError(pub Vec<ValidationIssue>);

#[derive(Debug, Default)]
struct PetPackSnapshot {
    files: BTreeMap<String, Vec<u8>>,
}

impl PetPackSnapshot {
    fn get(&self, name: &str) -> Option<&[u8]> {
        self.files.get(name).map(Vec::as_slice)
    }

    fn contains(&self, name: &str) -> bool {
        self.files.contains_key(name)
    }

    fn names(&self) -> impl Iterator<Item = &str> {
        self.files.keys().map(String::as_str)
    }
}

pub fn load_pet_pack(
    root: impl AsRef<Path>,
    app_version: &str,
) -> Result<LoadedPetPack, PetPackLoadError> {
    let root = root.as_ref();
    let (snapshot, mut issues) = read_pack_snapshot(root);
    if has_errors(&issues) {
        return Err(PetPackLoadError(issues));
    }
    let manifest: PetManifest = read_json(snapshot.get("pet.json"), "pet.json", &mut issues)?;
    validate_atlas_path(&manifest.atlas_path, &mut issues);
    if has_errors(&issues) {
        return Err(PetPackLoadError(issues));
    }
    let atlas: AtlasManifest = read_json(
        snapshot.get(&manifest.atlas_path),
        &manifest.atlas_path,
        &mut issues,
    )?;

    validate_manifest(&manifest, app_version, &mut issues);
    validate_declared_files(&snapshot, &atlas.image_path, &mut issues);
    validate_atlas(&snapshot, &manifest, &atlas, &mut issues);

    if issues
        .iter()
        .any(|issue| issue.severity == IssueSeverity::Error)
    {
        return Err(PetPackLoadError(issues));
    }

    let atlas_image = LoadedAtlasImage {
        media_type: image_media_type(&atlas.image_path).to_string(),
        bytes: snapshot
            .get(&atlas.image_path)
            .expect("validated atlas image must exist in the snapshot")
            .to_vec(),
    };
    let warnings = issues
        .into_iter()
        .filter(|issue| issue.severity == IssueSeverity::Warning)
        .collect::<Vec<_>>();
    let actions = manifest
        .actions
        .iter()
        .map(|(name, action)| crate::model::ActionSummary {
            name: name.clone(),
            frame_count: action.frames.len(),
            duration_ms: action.frames.iter().map(|frame| frame.duration_ms).sum(),
            loops: action.r#loop,
        })
        .collect::<Vec<_>>();
    let summary = PetPackSummary {
        id: manifest.id.clone(),
        version: manifest.version.clone(),
        display_name: manifest.display_name.clone(),
        description: manifest.description.clone(),
        canvas: manifest.canvas,
        atlas_image: atlas.image_path.clone(),
        action_count: manifest.actions.len(),
        frame_count: atlas.frames.len(),
        actions,
        warnings,
    };

    Ok(LoadedPetPack {
        manifest,
        atlas,
        atlas_image,
        summary,
    })
}

fn read_json<T: serde::de::DeserializeOwned>(
    content: Option<&[u8]>,
    label: &str,
    issues: &mut Vec<ValidationIssue>,
) -> Result<T, PetPackLoadError> {
    let content = match content {
        Some(content) => content,
        None => {
            issues.push(ValidationIssue::error(
                "file.missing",
                label,
                "缺少必需文件",
            ));
            return Err(PetPackLoadError(issues.clone()));
        }
    };

    let raw_value = serde_json::from_slice(content).map_err(|error| {
        issues.push(ValidationIssue::error(
            "json.invalid",
            label,
            format!(
                "JSON 无效（第 {} 行，第 {} 列）：{}",
                error.line(),
                error.column(),
                error
            ),
        ));
        PetPackLoadError(issues.clone())
    })?;
    validate_forbidden_json_fields(label, &raw_value, issues);

    let mut ignored_paths = Vec::new();
    let mut deserializer = serde_json::Deserializer::from_slice(content);
    let parsed = serde_ignored::deserialize(&mut deserializer, |path| {
        ignored_paths.push(path.to_string());
    });
    for path in ignored_paths {
        let field = path.rsplit('.').next().unwrap_or(path.as_str());
        if !FORBIDDEN_BEHAVIOR_FIELDS.contains(&field) {
            issues.push(ValidationIssue::warning(
                "field.unknown",
                format!("{label}.{path}"),
                "未识别的非关键字段已忽略",
            ));
        }
    }

    parsed.map_err(|error| {
        issues.push(ValidationIssue::error(
            "json.invalid",
            label,
            format!(
                "JSON 无效（第 {} 行，第 {} 列）：{}",
                error.line(),
                error.column(),
                error
            ),
        ));
        PetPackLoadError(issues.clone())
    })
}

fn validate_forbidden_json_fields(
    path: &str,
    value: &serde_json::Value,
    issues: &mut Vec<ValidationIssue>,
) {
    match value {
        serde_json::Value::Array(values) => {
            for (index, value) in values.iter().enumerate() {
                validate_forbidden_json_fields(&format!("{path}[{index}]"), value, issues);
            }
        }
        serde_json::Value::Object(fields) => {
            for (field, value) in fields {
                let field_path = format!("{path}.{field}");
                if FORBIDDEN_BEHAVIOR_FIELDS.contains(&field.as_str()) {
                    issues.push(ValidationIssue::error(
                        "action.field-forbidden",
                        &field_path,
                        format!("字段 {field} 会改变宿主行为，宠物包不允许声明"),
                    ));
                }
                validate_forbidden_json_fields(&field_path, value, issues);
            }
        }
        _ => {}
    }
}

fn read_pack_snapshot(root: &Path) -> (PetPackSnapshot, Vec<ValidationIssue>) {
    let mut snapshot = PetPackSnapshot::default();
    let mut issues = Vec::new();
    let root_metadata = match fs::symlink_metadata(root) {
        Ok(metadata) => metadata,
        Err(error) => {
            issues.push(ValidationIssue::error(
                "directory.metadata",
                root.display().to_string(),
                format!("无法读取宠物包目录信息：{error}"),
            ));
            return (snapshot, issues);
        }
    };
    if root_metadata.file_type().is_symlink() {
        issues.push(ValidationIssue::error(
            "path.symlink",
            root.display().to_string(),
            "宠物包根目录不允许符号链接",
        ));
        return (snapshot, issues);
    }
    if !root_metadata.is_dir() {
        issues.push(ValidationIssue::error(
            "directory.invalid",
            root.display().to_string(),
            "宠物包根路径必须是目录",
        ));
        return (snapshot, issues);
    }

    let root_file = match open_pack_directory(root) {
        Ok(file) => file,
        Err(error) => {
            issues.push(ValidationIssue::error(
                "directory.open",
                root.display().to_string(),
                format!("无法安全打开宠物包目录：{error}"),
            ));
            return (snapshot, issues);
        }
    };
    let opened_root_metadata = match root_file.metadata() {
        Ok(metadata) => metadata,
        Err(error) => {
            issues.push(ValidationIssue::error(
                "directory.metadata",
                root.display().to_string(),
                format!("无法读取已打开宠物包目录信息：{error}"),
            ));
            return (snapshot, issues);
        }
    };
    if metadata_is_link_like(&opened_root_metadata) {
        issues.push(ValidationIssue::error(
            "path.symlink",
            root.display().to_string(),
            "宠物包根目录不允许符号链接或重解析点",
        ));
        return (snapshot, issues);
    }
    if !opened_root_metadata.is_dir() {
        issues.push(ValidationIssue::error(
            "directory.invalid",
            root.display().to_string(),
            "宠物包根路径必须是目录",
        ));
        return (snapshot, issues);
    }

    let directory = CapDir::from_std_file(root_file);
    let entries = match directory.entries() {
        Ok(entries) => entries,
        Err(error) => {
            issues.push(ValidationIssue::error(
                "directory.read",
                root.display().to_string(),
                format!("无法读取宠物包目录：{error}"),
            ));
            return (snapshot, issues);
        }
    };

    let mut declared_total_bytes = 0_u64;
    let mut loaded_total_bytes = 0_u64;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                issues.push(ValidationIssue::error(
                    "directory.entry",
                    root.display().to_string(),
                    format!("无法枚举宠物包目录项：{error}"),
                ));
                continue;
            }
        };
        let label = match entry.file_name().into_string() {
            Ok(label) => label,
            Err(_) => {
                issues.push(ValidationIssue::error(
                    "file.name",
                    ".",
                    "宠物包文件名必须是有效 UTF-8",
                ));
                continue;
            }
        };
        let entry_metadata = match directory.symlink_metadata(&label) {
            Ok(metadata) => metadata,
            Err(error) => {
                issues.push(ValidationIssue::error(
                    "file.metadata",
                    &label,
                    format!("无法读取文件信息：{error}"),
                ));
                continue;
            }
        };

        if entry_metadata.file_type().is_symlink() {
            issues.push(ValidationIssue::error(
                "path.symlink",
                &label,
                "宠物包不允许符号链接",
            ));
            continue;
        }
        if !entry_metadata.is_file() {
            issues.push(ValidationIssue::error(
                "path.nested",
                &label,
                "P0 宠物包根目录不允许嵌套目录",
            ));
            continue;
        }

        let mut file = match open_pack_file(&directory, &label) {
            Ok(file) => file,
            Err(error) => {
                issues.push(ValidationIssue::error(
                    "file.open",
                    &label,
                    format!("无法安全打开文件：{error}"),
                ));
                continue;
            }
        };
        let metadata = match file.metadata() {
            Ok(metadata) => metadata,
            Err(error) => {
                issues.push(ValidationIssue::error(
                    "file.metadata",
                    &label,
                    format!("无法读取已打开文件信息：{error}"),
                ));
                continue;
            }
        };
        if metadata_is_link_like(&metadata) {
            issues.push(ValidationIssue::error(
                "path.symlink",
                &label,
                "宠物包不允许符号链接或重解析点",
            ));
            continue;
        }
        if !metadata.is_file() {
            issues.push(ValidationIssue::error(
                "path.nested",
                &label,
                "P0 宠物包根目录只允许普通文件",
            ));
            continue;
        }
        match has_multiple_hard_links(&file, &metadata) {
            Ok(true) => {
                issues.push(ValidationIssue::error(
                    "path.hard-link",
                    &label,
                    "宠物包不允许硬链接",
                ));
                continue;
            }
            Ok(false) => {}
            Err(error) => {
                issues.push(ValidationIssue::error(
                    "file.metadata",
                    &label,
                    format!("无法检查文件硬链接：{error}"),
                ));
                continue;
            }
        }

        declared_total_bytes = declared_total_bytes.saturating_add(metadata.len());
        if !is_allowed_filename(&label) {
            issues.push(ValidationIssue::error(
                "file.forbidden",
                &label,
                "文件名或文件类型不在 P0 白名单内",
            ));
            continue;
        }

        let remaining_bytes = MAX_UNPACKED_BYTES.saturating_sub(loaded_total_bytes);
        if metadata.len() > remaining_bytes {
            issues.push(ValidationIssue::error(
                "size.total",
                ".",
                format!("宠物包总大小超过 {} MiB", MAX_UNPACKED_BYTES / 1024 / 1024),
            ));
            continue;
        }
        let mut content = Vec::with_capacity(metadata.len() as usize);
        match file
            .by_ref()
            .take(remaining_bytes.saturating_add(1))
            .read_to_end(&mut content)
        {
            Ok(_) if content.len() as u64 <= remaining_bytes => {
                loaded_total_bytes += content.len() as u64;
                snapshot.files.insert(label, content);
            }
            Ok(_) => issues.push(ValidationIssue::error(
                "size.total",
                ".",
                format!("宠物包总大小超过 {} MiB", MAX_UNPACKED_BYTES / 1024 / 1024),
            )),
            Err(error) => issues.push(ValidationIssue::error(
                "file.read",
                &label,
                format!("无法读取文件：{error}"),
            )),
        }
    }

    if declared_total_bytes > MAX_UNPACKED_BYTES {
        issues.push(ValidationIssue::error(
            "size.total",
            ".",
            format!("宠物包总大小超过 {} MiB", MAX_UNPACKED_BYTES / 1024 / 1024),
        ));
    }

    for required in ["pet.json", "atlas.json"] {
        if !snapshot.contains(required) {
            issues.push(ValidationIssue::error(
                "file.missing",
                required,
                "缺少必需文件",
            ));
        }
    }

    (snapshot, issues)
}

fn validate_manifest(manifest: &PetManifest, app_version: &str, issues: &mut Vec<ValidationIssue>) {
    if manifest.schema_version != 1 {
        issues.push(ValidationIssue::error(
            "schema.unsupported",
            "pet.json.schemaVersion",
            "P0 只支持 schemaVersion 1",
        ));
    }
    if manifest.renderer != "sprite-atlas-v1" {
        issues.push(ValidationIssue::error(
            "renderer.unsupported",
            "pet.json.renderer",
            "P0 只支持 sprite-atlas-v1",
        ));
    }
    if !is_slug(&manifest.id) {
        issues.push(ValidationIssue::error(
            "id.invalid",
            "pet.json.id",
            "id 必须是小写短横线 slug",
        ));
    }
    validate_version(&manifest.version, "pet.json.version", issues);
    validate_version(&manifest.min_app_version, "pet.json.minAppVersion", issues);
    if let (Ok(required), Ok(current)) = (
        Version::parse(&manifest.min_app_version),
        Version::parse(app_version),
    ) && required > current
    {
        issues.push(ValidationIssue::error(
            "app-version.too-old",
            "pet.json.minAppVersion",
            format!("宠物包要求应用版本 {required}，当前为 {current}"),
        ));
    }
    if manifest.canvas.width == 0 || manifest.canvas.height == 0 {
        issues.push(ValidationIssue::error(
            "canvas.empty",
            "pet.json.canvas",
            "画布尺寸必须大于零",
        ));
    }
    if manifest.canvas.width > MAX_ATLAS_EDGE || manifest.canvas.height > MAX_ATLAS_EDGE {
        issues.push(ValidationIssue::error(
            "canvas.dimensions",
            "pet.json.canvas",
            format!("画布尺寸不能超过 {MAX_ATLAS_EDGE}×{MAX_ATLAS_EDGE}"),
        ));
    }
    validate_layout(
        &manifest.layout,
        manifest.canvas.width,
        manifest.canvas.height,
        "pet.json.layout",
        issues,
    );

    if manifest.actions.len() > MAX_ACTIONS {
        issues.push(ValidationIssue::error(
            "actions.limit",
            "pet.json.actions",
            format!("动作数不能超过 {MAX_ACTIONS}"),
        ));
    }
    for required in REQUIRED_ACTIONS {
        if !manifest.actions.contains_key(required) {
            issues.push(ValidationIssue::error(
                "action.required",
                format!("pet.json.actions.{required}"),
                "缺少必填语义动作",
            ));
        }
    }
    for (name, action) in &manifest.actions {
        let path = format!("pet.json.actions.{name}");
        if !ALLOWED_ACTIONS.contains(&name.as_str()) {
            issues.push(ValidationIssue::error(
                "action.unknown",
                &path,
                "动作键不在 P0 固定语义动作集合内",
            ));
        }
        if action.frames.is_empty() {
            issues.push(ValidationIssue::error(
                "action.empty",
                format!("{path}.frames"),
                "动作至少需要一帧",
            ));
        }
        if action.frames.len() > MAX_FRAMES {
            issues.push(ValidationIssue::error(
                "action.frames-limit",
                format!("{path}.frames"),
                format!("单个动作帧数不能超过 {MAX_FRAMES}"),
            ));
        }
        if !action.extra.is_empty() {
            issues.push(ValidationIssue::error(
                "action.field-forbidden",
                &path,
                format!(
                    "动作包含不允许的字段：{}",
                    action.extra.keys().cloned().collect::<Vec<_>>().join("、")
                ),
            ));
        }
        let duration = action
            .frames
            .iter()
            .map(|frame| u64::from(frame.duration_ms))
            .sum::<u64>();
        for (index, frame) in action.frames.iter().enumerate() {
            if !(16..=10_000).contains(&frame.duration_ms) {
                issues.push(ValidationIssue::error(
                    "frame.duration",
                    format!("{path}.frames[{index}].durationMs"),
                    "单帧时长必须在 16–10000 ms 之间",
                ));
            }
        }
        for (index, cue) in action.cue_points.iter().enumerate() {
            if u64::from(cue.time_ms) > duration {
                issues.push(ValidationIssue::error(
                    "cue.out-of-range",
                    format!("{path}.cuePoints[{index}].timeMs"),
                    "动作提示点不能晚于动作总时长",
                ));
            }
        }
        if let Some(layout) = &action.layout_override {
            validate_layout(
                layout,
                manifest.canvas.width,
                manifest.canvas.height,
                &format!("{path}.layoutOverride"),
                issues,
            );
        }
    }

    for key in manifest.extra.keys() {
        issues.push(ValidationIssue::warning(
            "field.unknown",
            format!("pet.json.{key}"),
            "未识别的非关键字段已忽略",
        ));
    }
}

fn validate_atlas_path(atlas_path: &str, issues: &mut Vec<ValidationIssue>) {
    if !is_safe_relative_file(atlas_path) || atlas_path != "atlas.json" {
        issues.push(ValidationIssue::error(
            "path.atlas",
            "pet.json.atlasPath",
            "P0 的 atlasPath 必须是 atlas.json",
        ));
    }
}

fn validate_declared_files(
    snapshot: &PetPackSnapshot,
    image_path: &str,
    issues: &mut Vec<ValidationIssue>,
) {
    let allowed = [
        "pet.json",
        "atlas.json",
        image_path,
        "preview.png",
        "README.md",
        "LICENSE.txt",
    ];
    for name in snapshot.names() {
        if !allowed.contains(&name) {
            issues.push(ValidationIssue::error(
                "file.undeclared",
                name,
                "文件未被宠物包清单声明，也不在可选说明文件集合内",
            ));
        }
    }
}

fn validate_atlas(
    snapshot: &PetPackSnapshot,
    manifest: &PetManifest,
    atlas: &AtlasManifest,
    issues: &mut Vec<ValidationIssue>,
) {
    let image_path_is_safe = is_safe_relative_file(&atlas.image_path)
        && matches!(
            Path::new(&atlas.image_path)
                .extension()
                .and_then(|value| value.to_str()),
            Some("png" | "webp")
        );
    if !image_path_is_safe {
        issues.push(ValidationIssue::error(
            "path.image",
            "atlas.json.imagePath",
            "图集路径必须是包根目录内的小写 PNG 或 WebP 文件",
        ));
    }
    if atlas.pixel_width == 0
        || atlas.pixel_height == 0
        || atlas.pixel_width > MAX_ATLAS_EDGE
        || atlas.pixel_height > MAX_ATLAS_EDGE
    {
        issues.push(ValidationIssue::error(
            "atlas.dimensions",
            "atlas.json",
            format!("图集尺寸必须在 1×1 到 {MAX_ATLAS_EDGE}×{MAX_ATLAS_EDGE} 之间"),
        ));
    }
    if atlas.frames.is_empty() || atlas.frames.len() > MAX_FRAMES {
        issues.push(ValidationIssue::error(
            "atlas.frames-limit",
            "atlas.json.frames",
            format!("图集帧数必须在 1–{MAX_FRAMES} 之间"),
        ));
    }

    if image_path_is_safe {
        if let Some(image) = snapshot.get(&atlas.image_path) {
            let expected_image_type = if atlas.image_path.ends_with(".png") {
                imagesize::ImageType::Png
            } else {
                imagesize::ImageType::Webp
            };
            if let Ok(actual_image_type) = imagesize::image_type(image)
                && actual_image_type != expected_image_type
            {
                issues.push(ValidationIssue::error(
                    "image.format-mismatch",
                    &atlas.image_path,
                    format!("图片实际格式 {actual_image_type:?} 与文件扩展名不一致"),
                ));
            }
            match imagesize::blob_size(image) {
                Ok(size)
                    if size.width != atlas.pixel_width as usize
                        || size.height != atlas.pixel_height as usize =>
                {
                    issues.push(ValidationIssue::error(
                        "image.size-mismatch",
                        &atlas.image_path,
                        format!(
                            "图片实际尺寸 {}×{} 与清单 {}×{} 不一致",
                            size.width, size.height, atlas.pixel_width, atlas.pixel_height
                        ),
                    ));
                }
                Err(error) => issues.push(ValidationIssue::error(
                    "image.invalid",
                    &atlas.image_path,
                    format!("无法识别图集图片：{error}"),
                )),
                _ => {}
            }
        } else {
            issues.push(ValidationIssue::error(
                "image.missing",
                &atlas.image_path,
                "图集图片不存在",
            ));
        }
    }

    let mut used_frames = BTreeSet::new();
    for (name, frame) in &atlas.frames {
        if frame.w == 0
            || frame.h == 0
            || frame.x.saturating_add(frame.w) > atlas.pixel_width
            || frame.y.saturating_add(frame.h) > atlas.pixel_height
        {
            issues.push(ValidationIssue::error(
                "frame.bounds",
                format!("atlas.json.frames.{name}"),
                "帧裁剪区域超出图集边界或为空",
            ));
        }
        let right = i64::from(frame.offset_x) + i64::from(frame.w);
        let bottom = i64::from(frame.offset_y) + i64::from(frame.h);
        if frame.offset_x < 0
            || frame.offset_y < 0
            || right > i64::from(manifest.canvas.width)
            || bottom > i64::from(manifest.canvas.height)
        {
            issues.push(ValidationIssue::error(
                "frame.canvas-bounds",
                format!("atlas.json.frames.{name}"),
                "帧放回位置超出标准画布",
            ));
        }
    }

    for (action_name, action) in &manifest.actions {
        for (index, frame) in action.frames.iter().enumerate() {
            if !atlas.frames.contains_key(&frame.frame_ref) {
                issues.push(ValidationIssue::error(
                    "frame.reference",
                    format!("pet.json.actions.{action_name}.frames[{index}].ref"),
                    format!("引用的图集帧 {} 不存在", frame.frame_ref),
                ));
            } else {
                used_frames.insert(frame.frame_ref.as_str());
            }
        }
    }
    for frame in atlas.frames.keys() {
        if !used_frames.contains(frame.as_str()) {
            issues.push(ValidationIssue::warning(
                "frame.unused",
                format!("atlas.json.frames.{frame}"),
                "图集帧未被任何动作使用",
            ));
        }
    }
    for key in atlas.extra.keys() {
        issues.push(ValidationIssue::warning(
            "field.unknown",
            format!("atlas.json.{key}"),
            "未识别的非关键字段已忽略",
        ));
    }
    if !snapshot.contains("preview.png") {
        issues.push(ValidationIssue::warning(
            "preview.missing",
            "preview.png",
            "缺少可选预览图",
        ));
    }
}

fn validate_version(value: &str, path: &str, issues: &mut Vec<ValidationIssue>) {
    if Version::parse(value).is_err() {
        issues.push(ValidationIssue::error(
            "version.invalid",
            path,
            "版本号必须是有效 semver",
        ));
    }
}

fn validate_layout(
    layout: &Layout,
    width: u32,
    height: u32,
    path: &str,
    issues: &mut Vec<ValidationIssue>,
) {
    for (name, point) in [
        ("baseline", layout.baseline),
        ("bubbleAnchor", layout.bubble_anchor),
    ] {
        if point.x < 0 || point.y < 0 || point.x > width as i32 || point.y > height as i32 {
            issues.push(ValidationIssue::error(
                "layout.point",
                format!("{path}.{name}"),
                "锚点必须位于标准画布内",
            ));
        }
    }
    for (name, rect) in [("hitbox", layout.hitbox), ("dropZone", layout.drop_zone)] {
        validate_rect(rect, width, height, &format!("{path}.{name}"), issues);
    }
}

fn validate_rect(
    rect: Rect,
    width: u32,
    height: u32,
    path: &str,
    issues: &mut Vec<ValidationIssue>,
) {
    let right = i64::from(rect.x) + i64::from(rect.width);
    let bottom = i64::from(rect.y) + i64::from(rect.height);
    if rect.x < 0
        || rect.y < 0
        || rect.width == 0
        || rect.height == 0
        || right > i64::from(width)
        || bottom > i64::from(height)
    {
        issues.push(ValidationIssue::error(
            "layout.rect",
            path,
            "区域必须非空且完全位于标准画布内",
        ));
    }
}

fn is_slug(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('-')
        && !value.ends_with('-')
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn is_safe_relative_file(value: &str) -> bool {
    let path = Path::new(value);
    !value.is_empty()
        && !path.is_absolute()
        && path.components().count() == 1
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_' | b'.')
        })
}

fn is_allowed_filename(value: &str) -> bool {
    if matches!(value, "README.md" | "LICENSE.txt") {
        return true;
    }
    if !is_safe_relative_file(value) {
        return false;
    }
    matches!(
        Path::new(value)
            .extension()
            .and_then(|value| value.to_str()),
        Some("json" | "png" | "webp")
    )
}

fn image_media_type(path: &str) -> &'static str {
    match Path::new(path).extension().and_then(|value| value.to_str()) {
        Some("webp") => "image/webp",
        _ => "image/png",
    }
}

fn has_errors(issues: &[ValidationIssue]) -> bool {
    issues
        .iter()
        .any(|issue| issue.severity == IssueSeverity::Error)
}

#[cfg(unix)]
fn open_pack_directory(root: &Path) -> std::io::Result<fs::File> {
    use std::os::unix::fs::OpenOptionsExt;

    fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW)
        .open(root)
}

#[cfg(windows)]
fn open_pack_directory(root: &Path) -> std::io::Result<fs::File> {
    use std::os::windows::fs::OpenOptionsExt;

    use windows_sys::Win32::Storage::FileSystem::{
        FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT,
    };

    fs::OpenOptions::new()
        .read(true)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(root)
}

#[cfg(not(any(unix, windows)))]
fn open_pack_directory(root: &Path) -> std::io::Result<fs::File> {
    fs::File::open(root)
}

fn open_pack_file(directory: &CapDir, name: &str) -> std::io::Result<fs::File> {
    let mut options = CapOpenOptions::new();
    options.read(true);
    configure_no_follow(&mut options);
    directory
        .open_with(name, &options)
        .map(|file| file.into_std())
}

#[cfg(unix)]
fn configure_no_follow(options: &mut CapOpenOptions) {
    use cap_std::fs::OpenOptionsExt;

    options.custom_flags(libc::O_NOFOLLOW);
}

#[cfg(windows)]
fn configure_no_follow(options: &mut CapOpenOptions) {
    use cap_std::fs::OpenOptionsExt;

    use windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT;

    options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
}

#[cfg(not(any(unix, windows)))]
fn configure_no_follow(_options: &mut CapOpenOptions) {}

#[cfg(windows)]
fn metadata_is_link_like(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;

    use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;

    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn metadata_is_link_like(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

#[cfg(unix)]
fn has_multiple_hard_links(_file: &fs::File, metadata: &fs::Metadata) -> std::io::Result<bool> {
    use std::os::unix::fs::MetadataExt;

    Ok(metadata.nlink() > 1)
}

#[cfg(windows)]
fn has_multiple_hard_links(file: &fs::File, _metadata: &fs::Metadata) -> std::io::Result<bool> {
    use std::os::windows::io::AsRawHandle;

    use windows_sys::Win32::Storage::FileSystem::{
        BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle,
    };

    // SAFETY: the handle remains valid for this call and the output pointer references
    // initialized writable storage of the exact Win32 structure type.
    let mut information = unsafe { std::mem::zeroed::<BY_HANDLE_FILE_INFORMATION>() };
    let succeeded = unsafe {
        GetFileInformationByHandle(file.as_raw_handle(), std::ptr::addr_of_mut!(information))
    };
    if succeeded == 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(information.nNumberOfLinks > 1)
}

#[cfg(not(any(unix, windows)))]
fn has_multiple_hard_links(_file: &fs::File, _metadata: &fs::Metadata) -> std::io::Result<bool> {
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::{is_safe_relative_file, is_slug};

    #[test]
    fn accepts_stable_pet_slug() {
        assert!(is_slug("juanjuan-cat"));
        assert!(!is_slug("JuanJuan"));
        assert!(!is_slug("../cat"));
    }

    #[test]
    fn only_accepts_single_safe_relative_file() {
        assert!(is_safe_relative_file("atlas.json"));
        assert!(!is_safe_relative_file("../atlas.json"));
        assert!(!is_safe_relative_file("nested/atlas.json"));
        assert!(!is_safe_relative_file("/tmp/atlas.json"));
    }
}
