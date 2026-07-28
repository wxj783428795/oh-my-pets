use std::path::PathBuf;

use oh_my_pets_domain::{ValidationIssue, load_pet_pack};
use oh_my_pets_lib::pet_pack_store::PetPackStore;

#[test]
fn failed_reload_replaces_the_previous_pack_with_an_invalid_state() {
    let pack_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/pets/juanjuan");
    let pack = load_pet_pack(pack_dir, "0.1.0").expect("load fixture pack");
    let store = PetPackStore::default();
    let revision = store.begin_reload().expect("begin successful reload");
    store.accept(revision, pack).expect("store loaded pack");
    let revision = store.begin_reload().expect("begin failed reload");
    store
        .reject(
            revision,
            vec![ValidationIssue::error(
                "json.invalid",
                "pet.json",
                "JSON 无效",
            )],
        )
        .expect("store failed reload");

    let snapshot = store.snapshot().expect("read pack state");

    assert!(snapshot.pack.is_none());
    assert_eq!(snapshot.revision, revision);
    assert_eq!(snapshot.issues.len(), 1);
    assert_eq!(snapshot.issues[0].code, "json.invalid");
}

#[test]
fn newer_reload_revision_wins_over_older_success_and_failure() {
    let pack_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/pets/juanjuan");
    let pack = load_pet_pack(pack_dir, "0.1.0").expect("load fixture pack");
    let store = PetPackStore::default();
    let older = store.begin_reload().expect("begin older reload");
    let newer = store.begin_reload().expect("begin newer reload");
    assert!(!store.is_latest_revision(older).expect("check older reload"));
    assert!(store.is_latest_revision(newer).expect("check newer reload"));
    store
        .accept(newer, pack.clone())
        .expect("store newer success");
    store
        .reject(
            older,
            vec![ValidationIssue::error("json.invalid", "pet.json", "旧失败")],
        )
        .expect("ignore older failure");

    let successful = store.snapshot().expect("read successful state");
    assert_eq!(successful.revision, newer);
    assert!(successful.pack.is_some());
    assert!(successful.issues.is_empty());

    let older = store.begin_reload().expect("begin older reload");
    let newer = store.begin_reload().expect("begin newer reload");
    assert!(!store.is_latest_revision(older).expect("check older reload"));
    assert!(store.is_latest_revision(newer).expect("check newer reload"));
    store
        .reject(
            newer,
            vec![ValidationIssue::error("json.invalid", "pet.json", "新失败")],
        )
        .expect("store newer failure");
    store.accept(older, pack).expect("ignore older success");

    let failed = store.snapshot().expect("read failed state");
    assert_eq!(failed.revision, newer);
    assert!(failed.pack.is_none());
    assert_eq!(failed.issues[0].message, "新失败");
}

#[test]
fn behavior_actions_snapshot_excludes_the_loaded_atlas_asset() {
    let pack_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../assets/pets/juanjuan");
    let pack = load_pet_pack(pack_dir, "0.1.0").expect("load fixture pack");
    let store = PetPackStore::default();
    let revision = store.begin_reload().expect("begin reload");
    store.accept(revision, pack).expect("store loaded pack");

    let actions = store
        .behavior_actions()
        .expect("read behavior actions")
        .expect("loaded pack should expose actions");

    assert!(actions.contains_key("idle"));
    assert!(actions.contains_key("feed_react"));
}
