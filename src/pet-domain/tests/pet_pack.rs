use std::{
    fs,
    path::{Path, PathBuf},
};

use oh_my_pets_domain::load_pet_pack;

const TINY_PNG: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
    0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 8, 215, 99, 248, 15, 0, 1, 1, 1, 0, 24,
    221, 141, 176, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];
const TINY_GIF: &[u8] = &[
    71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33, 249, 4, 1, 0, 0, 0,
    0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
];

fn write_fixture(root: &Path, pet_json: &str) {
    fs::create_dir_all(root).expect("create fixture directory");
    fs::write(root.join("pet.json"), pet_json).expect("write pet manifest");
    fs::write(
        root.join("atlas.json"),
        r#"{
          "imagePath": "atlas.png",
          "pixelWidth": 1,
          "pixelHeight": 1,
          "frames": {
            "base": { "x": 0, "y": 0, "w": 1, "h": 1, "offsetX": 0, "offsetY": 0 }
          }
        }"#,
    )
    .expect("write atlas manifest");
    fs::write(root.join("atlas.png"), TINY_PNG).expect("write tiny png");
}

fn valid_manifest(extra_action_field: &str) -> String {
    let actions = [
        "idle",
        "walk_left",
        "walk_right",
        "sleep",
        "drag_hold",
        "fall",
        "land",
        "tap_react",
        "feed_react",
    ]
    .into_iter()
    .map(|name| {
        format!(
            r#""{name}": {{
              "loop": true,
              "frames": [{{ "ref": "base", "durationMs": 120 }}]
              {extra_action_field}
            }}"#
        )
    })
    .collect::<Vec<_>>()
    .join(",");

    format!(
        r#"{{
          "schemaVersion": 1,
          "id": "test-cat",
          "version": "1.0.0",
          "displayName": "Test Cat",
          "description": "Fixture",
          "author": {{ "name": "Oh My Pets" }},
          "minAppVersion": "0.1.0",
          "renderer": "sprite-atlas-v1",
          "canvas": {{ "width": 1, "height": 1 }},
          "atlasPath": "atlas.json",
          "layout": {{
            "baseline": {{ "x": 0, "y": 1 }},
            "hitbox": {{ "x": 0, "y": 0, "width": 1, "height": 1 }},
            "dropZone": {{ "x": 0, "y": 0, "width": 1, "height": 1 }},
            "bubbleAnchor": {{ "x": 0, "y": 0 }}
          }},
          "actions": {{ {actions} }}
        }}"#
    )
}

#[test]
fn loads_a_minimal_declarative_pack() {
    let temp = tempfile::tempdir().expect("create temp dir");
    write_fixture(temp.path(), &valid_manifest(""));

    let loaded = load_pet_pack(temp.path(), "0.1.0").expect("pack should load");

    assert_eq!(loaded.summary.id, "test-cat");
    assert_eq!(loaded.summary.action_count, 9);
    assert_eq!(loaded.atlas_image.media_type, "image/png");
    assert_eq!(loaded.atlas_image.bytes, TINY_PNG);
}

#[test]
fn rejects_an_atlas_whose_content_format_does_not_match_its_extension() {
    let temp = tempfile::tempdir().expect("create temp dir");
    write_fixture(temp.path(), &valid_manifest(""));
    fs::write(temp.path().join("atlas.png"), TINY_GIF).expect("write disguised gif");

    let error = load_pet_pack(temp.path(), "0.1.0").expect_err("pack should be rejected");

    assert!(
        error
            .0
            .iter()
            .any(|issue| { issue.code == "image.format-mismatch" && issue.path == "atlas.png" })
    );
}

#[test]
fn rejects_behavior_fields_inside_an_action() {
    let temp = tempfile::tempdir().expect("create temp dir");
    write_fixture(temp.path(), &valid_manifest(r#", "probability": 0.5"#));

    let error = load_pet_pack(temp.path(), "0.1.0").expect_err("pack should be rejected");

    assert!(
        error
            .0
            .iter()
            .any(|issue| issue.code == "action.field-forbidden")
    );
}

#[test]
fn rejects_behavior_fields_nested_inside_action_frames() {
    let temp = tempfile::tempdir().expect("create temp dir");
    let manifest = valid_manifest("").replace(
        r#"{ "ref": "base", "durationMs": 120 }"#,
        r#"{ "ref": "base", "durationMs": 120, "script": "run()" }"#,
    );
    write_fixture(temp.path(), &manifest);

    let error = load_pet_pack(temp.path(), "0.1.0").expect_err("pack should be rejected");

    assert!(
        error
            .0
            .iter()
            .any(|issue| issue.code == "action.field-forbidden")
    );
}

#[test]
fn rejects_scripts_nested_inside_unknown_frame_objects() {
    let temp = tempfile::tempdir().expect("create temp dir");
    let manifest = valid_manifest("").replace(
        r#"{ "ref": "base", "durationMs": 120 }"#,
        r#"{ "ref": "base", "durationMs": 120, "metadata": { "nested": { "script": "run()" } } }"#,
    );
    write_fixture(temp.path(), &manifest);

    let error = load_pet_pack(temp.path(), "0.1.0").expect_err("pack should be rejected");

    assert!(
        error
            .0
            .iter()
            .any(|issue| issue.code == "action.field-forbidden")
    );
}

#[test]
fn rejects_scripts_nested_inside_extension_objects() {
    let temp = tempfile::tempdir().expect("create temp dir");
    let manifest = valid_manifest("").replace(
        r#""actions": {"#,
        r#""metadata": { "nested": { "script": "run()" } }, "actions": {"#,
    );
    write_fixture(temp.path(), &manifest);

    let error = load_pet_pack(temp.path(), "0.1.0").expect_err("pack should be rejected");

    assert!(
        error
            .0
            .iter()
            .any(|issue| issue.code == "action.field-forbidden")
    );
}

#[test]
fn rejects_host_behavior_fields_nested_inside_unknown_objects() {
    for field in ["command", "plugin", "nativeHook"] {
        let temp = tempfile::tempdir().expect("create temp dir");
        let frame = r#"{ "ref": "base", "durationMs": 120, "metadata": { "nested": { "FIELD": "run()" } } }"#
            .replace("FIELD", field);
        let manifest =
            valid_manifest("").replace(r#"{ "ref": "base", "durationMs": 120 }"#, &frame);
        write_fixture(temp.path(), &manifest);

        let error = load_pet_pack(temp.path(), "0.1.0")
            .expect_err("host behavior field should be rejected");

        assert!(
            error.0.iter().any(|issue| {
                issue.code == "action.field-forbidden" && issue.path.ends_with(field)
            }),
            "{field} should be reported as a forbidden host behavior field"
        );
    }
}

#[test]
fn rejects_files_outside_the_allowlist() {
    let temp = tempfile::tempdir().expect("create temp dir");
    write_fixture(temp.path(), &valid_manifest(""));
    fs::write(temp.path().join("behavior.js"), "alert(1)").expect("write forbidden fixture");

    let error = load_pet_pack(temp.path(), "0.1.0").expect_err("pack should be rejected");

    assert!(error.0.iter().any(|issue| issue.code == "file.forbidden"));
}

#[test]
fn rejects_hard_linked_pack_files() {
    let temp = tempfile::tempdir().expect("create temp dir");
    let pack = temp.path().join("pack");
    write_fixture(&pack, &valid_manifest(""));
    let source = temp.path().join("external-pet.json");
    fs::rename(pack.join("pet.json"), &source).expect("move pet manifest outside pack");
    fs::hard_link(&source, pack.join("pet.json")).expect("hard link pet manifest into pack");

    let error = load_pet_pack(&pack, "0.1.0").expect_err("pack should be rejected");

    assert!(error.0.iter().any(|issue| issue.code == "path.hard-link"));
}

#[cfg(unix)]
#[test]
fn rejects_a_symlinked_pack_root_before_reading_it() {
    use std::os::unix::fs::symlink;

    let temp = tempfile::tempdir().expect("create temp dir");
    let source = temp.path().join("source-pack");
    let linked = temp.path().join("linked-pack");
    write_fixture(&source, &valid_manifest(""));
    symlink(&source, &linked).expect("link pack root");

    let error = load_pet_pack(&linked, "0.1.0").expect_err("pack should be rejected");

    assert!(error.0.iter().any(|issue| issue.code == "path.symlink"));
}

#[test]
fn rejects_external_atlas_before_reading_it() {
    let temp = tempfile::tempdir().expect("create temp dir");
    let pack = temp.path().join("pack");
    let manifest = valid_manifest("").replace(
        r#""atlasPath": "atlas.json""#,
        r#""atlasPath": "../external-atlas.json""#,
    );
    write_fixture(&pack, &manifest);
    fs::write(temp.path().join("external-atlas.json"), "{").expect("write invalid external atlas");

    let error = load_pet_pack(&pack, "0.1.0").expect_err("pack should be rejected");

    assert!(error.0.iter().any(|issue| issue.code == "path.atlas"));
    assert!(!error.0.iter().any(|issue| issue.code == "json.invalid"));
}

#[test]
fn rejects_external_image_before_reading_it() {
    let temp = tempfile::tempdir().expect("create temp dir");
    let pack = temp.path().join("pack");
    write_fixture(&pack, &valid_manifest(""));
    fs::write(
        pack.join("atlas.json"),
        r#"{
          "imagePath": "../external.png",
          "pixelWidth": 1,
          "pixelHeight": 1,
          "frames": {
            "base": { "x": 0, "y": 0, "w": 1, "h": 1, "offsetX": 0, "offsetY": 0 }
          }
        }"#,
    )
    .expect("write atlas manifest");
    fs::write(temp.path().join("external.png"), "not an image").expect("write external image");

    let error = load_pet_pack(&pack, "0.1.0").expect_err("pack should be rejected");

    assert!(error.0.iter().any(|issue| issue.code == "path.image"));
    assert!(!error.0.iter().any(|issue| issue.code == "image.invalid"));
}

#[test]
fn rejects_canvas_larger_than_the_rendering_limit() {
    let temp = tempfile::tempdir().expect("create temp dir");
    let manifest = valid_manifest("").replace(
        r#""canvas": { "width": 1, "height": 1 }"#,
        r#""canvas": { "width": 4097, "height": 1 }"#,
    );
    write_fixture(temp.path(), &manifest);

    let error = load_pet_pack(temp.path(), "0.1.0").expect_err("pack should be rejected");

    assert!(
        error
            .0
            .iter()
            .any(|issue| issue.code == "canvas.dimensions")
    );
}

#[test]
fn rejects_actions_with_more_than_256_frames() {
    let temp = tempfile::tempdir().expect("create temp dir");
    let frames = (0..257)
        .map(|_| r#"{ "ref": "base", "durationMs": 120 }"#)
        .collect::<Vec<_>>()
        .join(",");
    let manifest = valid_manifest("").replace(
        r#""frames": [{ "ref": "base", "durationMs": 120 }]"#,
        &format!(r#""frames": [{frames}]"#),
    );
    write_fixture(temp.path(), &manifest);

    let error = load_pet_pack(temp.path(), "0.1.0").expect_err("pack should be rejected");

    assert!(
        error
            .0
            .iter()
            .any(|issue| issue.code == "action.frames-limit")
    );
}

#[test]
fn rejects_undeclared_images() {
    let temp = tempfile::tempdir().expect("create temp dir");
    write_fixture(temp.path(), &valid_manifest(""));
    fs::copy(temp.path().join("atlas.png"), temp.path().join("extra.png"))
        .expect("write undeclared fixture");

    let error = load_pet_pack(temp.path(), "0.1.0").expect_err("pack should be rejected");

    assert!(error.0.iter().any(|issue| issue.code == "file.undeclared"));
}

#[test]
fn loads_the_mainline_example_pack() {
    let pack_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../assets/pets/juanjuan");

    let loaded = load_pet_pack(pack_dir, "0.1.0").expect("mainline example pack should load");

    assert_eq!(loaded.summary.display_name, "卷卷");
    assert_eq!(loaded.summary.action_count, 15);
    assert_eq!(loaded.summary.frame_count, 1);
}
