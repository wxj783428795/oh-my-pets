use std::{collections::BTreeMap, error::Error, fmt, sync::RwLock};

use oh_my_pets_domain::{LoadedPetPack, PetAction, ValidationIssue};

#[derive(Debug, Clone)]
pub struct PetPackStoreSnapshot {
    pub revision: u64,
    pub pack: Option<LoadedPetPack>,
    pub issues: Vec<ValidationIssue>,
}

#[derive(Debug, Default)]
struct StoredPetPack {
    latest_started_revision: u64,
    applied_revision: u64,
    pack: Option<LoadedPetPack>,
    issues: Vec<ValidationIssue>,
}

#[derive(Debug, Default)]
pub struct PetPackStore {
    state: RwLock<StoredPetPack>,
}

impl PetPackStore {
    pub fn begin_reload(&self) -> Result<u64, PetPackStoreError> {
        let mut state = self.state.write().map_err(|_| PetPackStoreError)?;
        state.latest_started_revision = state
            .latest_started_revision
            .checked_add(1)
            .ok_or(PetPackStoreError)?;
        Ok(state.latest_started_revision)
    }

    pub fn is_latest_revision(&self, revision: u64) -> Result<bool, PetPackStoreError> {
        let state = self.state.read().map_err(|_| PetPackStoreError)?;
        Ok(revision == state.latest_started_revision)
    }

    pub fn accept(&self, revision: u64, pack: LoadedPetPack) -> Result<bool, PetPackStoreError> {
        let mut state = self.state.write().map_err(|_| PetPackStoreError)?;
        if revision != state.latest_started_revision {
            return Ok(false);
        }
        state.applied_revision = revision;
        state.pack = Some(pack);
        state.issues.clear();
        Ok(true)
    }

    pub fn reject(
        &self,
        revision: u64,
        issues: Vec<ValidationIssue>,
    ) -> Result<bool, PetPackStoreError> {
        let mut state = self.state.write().map_err(|_| PetPackStoreError)?;
        if revision != state.latest_started_revision {
            return Ok(false);
        }
        state.applied_revision = revision;
        state.pack = None;
        state.issues = issues;
        Ok(true)
    }

    pub fn snapshot(&self) -> Result<PetPackStoreSnapshot, PetPackStoreError> {
        let state = self.state.read().map_err(|_| PetPackStoreError)?;
        Ok(PetPackStoreSnapshot {
            revision: state.applied_revision,
            pack: state.pack.clone(),
            issues: state.issues.clone(),
        })
    }

    pub fn behavior_actions(
        &self,
    ) -> Result<Option<BTreeMap<String, PetAction>>, PetPackStoreError> {
        let state = self.state.read().map_err(|_| PetPackStoreError)?;
        Ok(state
            .pack
            .as_ref()
            .map(|pack| pack.manifest.actions.clone()))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PetPackStoreError;

impl fmt::Display for PetPackStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("宠物包状态锁已损坏")
    }
}

impl Error for PetPackStoreError {}
