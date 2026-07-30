use std::{
    fs::{self, OpenOptions},
    io::{ErrorKind, Write},
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

use crate::product_state::{PreferencesRepository, PreferencesSaveStatus};

static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

pub struct FilePreferencesRepository {
    path: PathBuf,
}

impl FilePreferencesRepository {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn temporary_path(&self) -> Result<PathBuf, String> {
        let parent = self
            .path
            .parent()
            .ok_or_else(|| "偏好文件缺少父目录".to_string())?;
        let file_name = self
            .path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "偏好文件名无效".to_string())?;
        let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        Ok(parent.join(format!(
            ".{file_name}.{}.{}.tmp",
            std::process::id(),
            sequence
        )))
    }
}

impl PreferencesRepository for FilePreferencesRepository {
    fn load(&self) -> Result<Option<Vec<u8>>, String> {
        match fs::read(&self.path) {
            Ok(contents) => Ok(Some(contents)),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
            Err(error) => Err(format!("无法读取偏好文件：{error}")),
        }
    }

    fn save(&self, contents: &[u8]) -> Result<PreferencesSaveStatus, String> {
        let parent = self
            .path
            .parent()
            .ok_or_else(|| "偏好文件缺少父目录".to_string())?;
        fs::create_dir_all(parent).map_err(|error| format!("无法创建偏好目录：{error}"))?;
        let temporary_path = self.temporary_path()?;
        let result = (|| {
            let mut temporary = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary_path)
                .map_err(|error| format!("无法创建临时偏好文件：{error}"))?;
            temporary
                .write_all(contents)
                .map_err(|error| format!("无法写入临时偏好文件：{error}"))?;
            temporary
                .sync_all()
                .map_err(|error| format!("无法同步临时偏好文件：{error}"))?;
            fs::rename(&temporary_path, &self.path)
                .map_err(|error| format!("无法原子替换偏好文件：{error}"))?;
            #[cfg(unix)]
            let status = match fs::File::open(parent).and_then(|directory| directory.sync_all()) {
                Ok(()) => PreferencesSaveStatus::Durable,
                Err(error) => PreferencesSaveStatus::CommittedWithWarning(format!(
                    "无法同步偏好目录：{error}"
                )),
            };
            #[cfg(not(unix))]
            let status = PreferencesSaveStatus::Durable;
            Ok(status)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary_path);
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::FilePreferencesRepository;
    use crate::product_state::PreferencesRepository;

    #[test]
    fn atomic_save_replaces_the_complete_document_without_leaving_temporary_files() {
        let directory = tempfile::tempdir().expect("temporary directory should exist");
        let path = directory.path().join("preferences.json");
        fs::write(&path, br#"{"version":0}"#).expect("legacy file should be created");
        let repository = FilePreferencesRepository::new(path.clone());

        repository
            .save(br#"{"version":1,"petSize":"medium"}"#)
            .expect("atomic save should succeed");

        assert_eq!(
            repository.load().expect("saved file should load"),
            Some(br#"{"version":1,"petSize":"medium"}"#.to_vec())
        );
        let names = fs::read_dir(directory.path())
            .expect("directory should be readable")
            .map(|entry| {
                entry
                    .expect("directory entry should be readable")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect::<Vec<_>>();
        assert_eq!(names, ["preferences.json"]);
    }
}
