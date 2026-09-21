use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use globset::{GlobBuilder, GlobSet, GlobSetBuilder};
use grep_matcher::Matcher;
use grep_regex::{RegexMatcher, RegexMatcherBuilder};
use grep_searcher::{Searcher, SearcherBuilder, Sink, SinkMatch};
use ignore::WalkBuilder;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::{Deserialize, Serialize};

const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_PATTERN_BYTES: usize = 4096;
const MAX_GLOBS: usize = 100;
const MAX_COMPILED_PATTERNS: usize = 128;
const MAX_CACHED_MATCHES_PER_FILE: usize = 1001;
const MAX_WALK_FILES: usize = 100_000;
type ComputeResult<T> = std::result::Result<T, String>;

#[derive(Clone, Debug, Eq, PartialEq)]
struct FileVersion {
    size: u64,
    volume: u64,
    file_id: [u8; 16],
    creation_time: i64,
    write_time: i64,
    change_time: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct FallbackVersion {
    size: u64,
    modified: Option<SystemTime>,
}

fn fallback_version(file: &File) -> std::io::Result<FallbackVersion> {
    let metadata = file.metadata()?;
    Ok(FallbackVersion {
        size: metadata.len(),
        modified: metadata.modified().ok(),
    })
}

#[cfg(windows)]
fn file_version(file: &File) -> std::io::Result<FileVersion> {
    use std::mem::{size_of, MaybeUninit};
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::Storage::FileSystem::{
        FileBasicInfo, FileIdInfo, GetFileInformationByHandleEx, FILE_BASIC_INFO, FILE_ID_INFO,
    };

    let handle = file.as_raw_handle() as HANDLE;
    let mut basic = MaybeUninit::<FILE_BASIC_INFO>::zeroed();
    let mut id = MaybeUninit::<FILE_ID_INFO>::zeroed();
    let basic_ok = unsafe {
        GetFileInformationByHandleEx(
            handle,
            FileBasicInfo,
            basic.as_mut_ptr().cast(),
            size_of::<FILE_BASIC_INFO>() as u32,
        )
    };
    let id_ok = unsafe {
        GetFileInformationByHandleEx(
            handle,
            FileIdInfo,
            id.as_mut_ptr().cast(),
            size_of::<FILE_ID_INFO>() as u32,
        )
    };
    if basic_ok == 0 || id_ok == 0 {
        return Err(std::io::Error::last_os_error());
    }
    let basic = unsafe { basic.assume_init() };
    let id = unsafe { id.assume_init() };
    Ok(FileVersion {
        size: file.metadata()?.len(),
        volume: id.VolumeSerialNumber,
        file_id: id.FileId.Identifier,
        creation_time: basic.CreationTime,
        write_time: basic.LastWriteTime,
        change_time: basic.ChangeTime,
    })
}

#[cfg(not(windows))]
fn file_version(file: &File) -> std::io::Result<FileVersion> {
    use std::os::unix::fs::MetadataExt;

    let metadata = file.metadata()?;
    let mut file_id = [0_u8; 16];
    file_id[..8].copy_from_slice(&metadata.ino().to_ne_bytes());
    Ok(FileVersion {
        size: metadata.len(),
        volume: metadata.dev(),
        file_id,
        creation_time: metadata.ctime(),
        write_time: metadata.mtime(),
        change_time: metadata.ctime_nsec(),
    })
}

#[derive(Clone)]
struct ContentEntry {
    version: FileVersion,
    bytes: Arc<Vec<u8>>,
    line_starts: Arc<Vec<usize>>,
    estimated_bytes: usize,
    last_used: u64,
}

#[derive(Clone)]
struct MatchEntry {
    version: FileVersion,
    lines: Arc<Vec<u64>>,
    complete: bool,
    estimated_bytes: usize,
    last_used: u64,
}

struct MatcherEntry {
    matcher: Arc<RegexMatcher>,
    last_used: u64,
}

struct GlobEntry {
    glob: Arc<GlobSet>,
    last_used: u64,
}

struct Cache {
    content: HashMap<PathBuf, ContentEntry>,
    matches: HashMap<String, MatchEntry>,
    matchers: HashMap<String, MatcherEntry>,
    globs: HashMap<String, GlobEntry>,
    bytes: usize,
    max_bytes: usize,
    clock: u64,
    content_hits: u64,
    content_misses: u64,
    match_hits: u64,
    match_misses: u64,
    bytes_read: u64,
}

impl Cache {
    fn new(max_bytes: usize) -> Self {
        Self {
            content: HashMap::new(),
            matches: HashMap::new(),
            matchers: HashMap::new(),
            globs: HashMap::new(),
            bytes: 0,
            max_bytes,
            clock: 0,
            content_hits: 0,
            content_misses: 0,
            match_hits: 0,
            match_misses: 0,
            bytes_read: 0,
        }
    }

    fn tick(&mut self) -> u64 {
        self.clock = self.clock.saturating_add(1);
        self.clock
    }

    fn evict(&mut self) {
        while self.bytes > self.max_bytes {
            let oldest_content = self
                .content
                .iter()
                .min_by_key(|(_, value)| value.last_used)
                .map(|(key, value)| (key.clone(), value.last_used));
            let oldest_match = self
                .matches
                .iter()
                .min_by_key(|(_, value)| value.last_used)
                .map(|(key, value)| (key.clone(), value.last_used));
            match (oldest_content, oldest_match) {
                (Some((key, used)), Some((_match_key, match_used))) if used <= match_used => {
                    if let Some(value) = self.content.remove(&key) {
                        self.bytes = self.bytes.saturating_sub(value.estimated_bytes);
                    }
                }
                (_, Some((key, _))) => {
                    if let Some(value) = self.matches.remove(&key) {
                        self.bytes = self.bytes.saturating_sub(value.estimated_bytes);
                    }
                }
                (Some((key, _)), None) => {
                    if let Some(value) = self.content.remove(&key) {
                        self.bytes = self.bytes.saturating_sub(value.estimated_bytes);
                    }
                }
                (None, None) => break,
            }
        }
    }

    fn invalidate(&mut self, path: &Path) {
        if let Some(value) = self.content.remove(path) {
            self.bytes = self.bytes.saturating_sub(value.estimated_bytes);
        }
        let prefix = format!("{}\0", path.to_string_lossy());
        let keys: Vec<String> = self
            .matches
            .keys()
            .filter(|key| key.starts_with(&prefix))
            .cloned()
            .collect();
        for key in keys {
            if let Some(value) = self.matches.remove(&key) {
                self.bytes = self.bytes.saturating_sub(value.estimated_bytes);
            }
        }
    }
}

struct EngineState {
    cache: Mutex<Cache>,
    cancellations: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl EngineState {
    fn cancellation(&self, id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.cancellations
            .lock()
            .expect("cancellation lock poisoned")
            .insert(id.to_owned(), flag.clone());
        flag
    }

    fn finish(&self, id: &str, flag: &Arc<AtomicBool>) {
        let mut cancellations = self
            .cancellations
            .lock()
            .expect("cancellation lock poisoned");
        if cancellations
            .get(id)
            .is_some_and(|current| Arc::ptr_eq(current, flag))
        {
            cancellations.remove(id);
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommonRequest {
    workspace: String,
    path: String,
    #[serde(default)]
    include: Vec<String>,
    #[serde(default)]
    exclude: Vec<String>,
    #[serde(default)]
    include_hidden: bool,
    #[serde(default)]
    blocked: Vec<String>,
    limit: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchRequest {
    #[serde(flatten)]
    common: CommonRequest,
    pattern: String,
    #[serde(default)]
    literal: bool,
    case_mode: CaseMode,
    before_context: usize,
    after_context: usize,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
enum CaseMode {
    Sensitive,
    Insensitive,
    #[default]
    Smart,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadRequest {
    workspace: String,
    path: String,
    #[serde(default)]
    blocked: Vec<String>,
    start_line: usize,
    line_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchMatch {
    path: String,
    line: u64,
    column: usize,
    text: String,
    before: Vec<String>,
    after: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchResponse {
    matches: Vec<SearchMatch>,
    truncated: bool,
    files_checked: usize,
    cache: OperationCacheStats,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FindResponse {
    paths: Vec<String>,
    truncated: bool,
    files_checked: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadResponse {
    text: String,
    start_line: usize,
    end_line: usize,
    total_lines: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    next_line: Option<usize>,
    cache_hit: bool,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct OperationCacheStats {
    content_hits: u64,
    content_misses: u64,
    match_hits: u64,
    match_misses: u64,
    bytes_read: u64,
}

struct CachedContent {
    bytes: Arc<Vec<u8>>,
    line_starts: Arc<Vec<usize>>,
    version: Option<FileVersion>,
    hit: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CacheStats {
    content_entries: usize,
    match_entries: usize,
    matcher_entries: usize,
    glob_entries: usize,
    line_index_entries: usize,
    line_index_bytes: usize,
    bytes: usize,
    max_bytes: usize,
    content_hits: u64,
    content_misses: u64,
    match_hits: u64,
    match_misses: u64,
    bytes_read: u64,
}

enum Query {
    Search(SearchRequest),
    Find(CommonRequest),
    Read(ReadRequest),
}

pub struct QueryTask {
    state: Arc<EngineState>,
    id: String,
    cancel: Arc<AtomicBool>,
    query: Option<Query>,
}

impl Task for QueryTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> Result<Self::Output> {
        let query = self
            .query
            .take()
            .ok_or_else(|| Error::from_reason("query already executed"))?;
        let result = match query {
            Query::Search(request) => search(&self.state, request, &self.cancel),
            Query::Find(request) => find(&self.state, request, &self.cancel),
            Query::Read(request) => read(&self.state, request, &self.cancel),
        };
        result.map_err(Error::from_reason)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }

    fn finally(&mut self, _env: Env) -> Result<()> {
        self.state.finish(&self.id, &self.cancel);
        Ok(())
    }
}

#[napi]
pub struct WorkspaceQueryEngine {
    state: Arc<EngineState>,
}

#[napi]
impl WorkspaceQueryEngine {
    #[napi(constructor)]
    pub fn new(max_cache_bytes: u32) -> Self {
        Self {
            state: Arc::new(EngineState {
                cache: Mutex::new(Cache::new(max_cache_bytes as usize)),
                cancellations: Mutex::new(HashMap::new()),
            }),
        }
    }

    #[napi]
    pub fn search(&self, request_json: String, cancel_id: String) -> Result<AsyncTask<QueryTask>> {
        let request = serde_json::from_str(&request_json)
            .map_err(|error| Error::from_reason(format!("invalid search request: {error}")))?;
        Ok(self.task(Query::Search(request), cancel_id))
    }

    #[napi]
    pub fn find(&self, request_json: String, cancel_id: String) -> Result<AsyncTask<QueryTask>> {
        let request = serde_json::from_str(&request_json)
            .map_err(|error| Error::from_reason(format!("invalid find request: {error}")))?;
        Ok(self.task(Query::Find(request), cancel_id))
    }

    #[napi]
    pub fn read(&self, request_json: String, cancel_id: String) -> Result<AsyncTask<QueryTask>> {
        let request = serde_json::from_str(&request_json)
            .map_err(|error| Error::from_reason(format!("invalid read request: {error}")))?;
        Ok(self.task(Query::Read(request), cancel_id))
    }

    #[napi]
    pub fn cancel(&self, cancel_id: String) -> bool {
        let cancellations = self
            .state
            .cancellations
            .lock()
            .expect("cancellation lock poisoned");
        if let Some(flag) = cancellations.get(&cancel_id) {
            flag.store(true, Ordering::Release);
            true
        } else {
            false
        }
    }

    #[napi]
    pub fn invalidate(&self, absolute_path: String) {
        self.state
            .cache
            .lock()
            .expect("cache lock poisoned")
            .invalidate(Path::new(&absolute_path));
    }

    #[napi]
    pub fn clear(&self) {
        let max_bytes = self
            .state
            .cache
            .lock()
            .expect("cache lock poisoned")
            .max_bytes;
        *self.state.cache.lock().expect("cache lock poisoned") = Cache::new(max_bytes);
    }

    #[napi]
    pub fn cache_stats(&self) -> Result<String> {
        let cache = self.state.cache.lock().expect("cache lock poisoned");
        json(&CacheStats {
            content_entries: cache.content.len(),
            match_entries: cache.matches.len(),
            matcher_entries: cache.matchers.len(),
            glob_entries: cache.globs.len(),
            line_index_entries: cache.content.len(),
            line_index_bytes: cache
                .content
                .values()
                .map(|entry| entry.line_starts.len() * std::mem::size_of::<usize>())
                .sum(),
            bytes: cache.bytes,
            max_bytes: cache.max_bytes,
            content_hits: cache.content_hits,
            content_misses: cache.content_misses,
            match_hits: cache.match_hits,
            match_misses: cache.match_misses,
            bytes_read: cache.bytes_read,
        })
        .map_err(Error::from_reason)
    }

    fn task(&self, query: Query, cancel_id: String) -> AsyncTask<QueryTask> {
        let cancel = self.state.cancellation(&cancel_id);
        AsyncTask::new(QueryTask {
            state: self.state.clone(),
            id: cancel_id,
            cancel,
            query: Some(query),
        })
    }
}

#[napi]
pub fn native_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn cancelled(cancel: &AtomicBool) -> ComputeResult<()> {
    if cancel.load(Ordering::Acquire) {
        Err("query cancelled".to_owned())
    } else {
        Ok(())
    }
}

fn json<T: Serialize>(value: &T) -> ComputeResult<String> {
    serde_json::to_string(value).map_err(|error| format!("could not encode native result: {error}"))
}

fn canonical_root(workspace: &str, requested: &str) -> ComputeResult<(PathBuf, PathBuf)> {
    let workspace = Path::new(workspace)
        .canonicalize()
        .map_err(|error| format!("could not resolve workspace: {error}"))?;
    let requested = workspace.join(requested);
    let scope = requested
        .canonicalize()
        .map_err(|error| format!("could not resolve query path: {error}"))?;
    if !scope.starts_with(&workspace) {
        return Err("query path is outside the workspace".to_owned());
    }
    Ok((workspace, scope))
}

fn blocked_paths(values: &[String]) -> Vec<PathBuf> {
    values
        .iter()
        .filter_map(|value| Path::new(value).canonicalize().ok())
        .collect()
}

fn is_blocked(path: &Path, blocked: &[PathBuf]) -> bool {
    blocked.iter().any(|root| path.starts_with(root))
}

fn glob_set(patterns: &[String]) -> ComputeResult<Option<GlobSet>> {
    if patterns.len() > MAX_GLOBS {
        return Err(format!("at most {MAX_GLOBS} glob patterns are allowed"));
    }
    if patterns.is_empty() {
        return Ok(None);
    }
    let mut builder = GlobSetBuilder::new();
    for pattern in patterns {
        let glob = GlobBuilder::new(pattern)
            .literal_separator(true)
            .backslash_escape(true)
            .build()
            .map_err(|error| format!("invalid glob {pattern:?}: {error}"))?;
        builder.add(glob);
    }
    builder
        .build()
        .map(Some)
        .map_err(|error| format!("could not compile glob set: {error}"))
}

fn compiled_glob_set(
    state: &EngineState,
    kind: &str,
    patterns: &[String],
) -> ComputeResult<Option<Arc<GlobSet>>> {
    if patterns.is_empty() {
        return Ok(None);
    }
    let key = format!("{kind}\0{}", patterns.join("\0"));
    {
        let mut cache = state
            .cache
            .lock()
            .map_err(|_| "cache lock poisoned".to_owned())?;
        let used = cache.tick();
        if let Some(entry) = cache.globs.get_mut(&key) {
            entry.last_used = used;
            return Ok(Some(entry.glob.clone()));
        }
    }
    let compiled = Arc::new(glob_set(patterns)?.expect("non-empty patterns produce a glob set"));
    let mut cache = state
        .cache
        .lock()
        .map_err(|_| "cache lock poisoned".to_owned())?;
    let used = cache.tick();
    cache.globs.insert(
        key,
        GlobEntry {
            glob: compiled.clone(),
            last_used: used,
        },
    );
    while cache.globs.len() > MAX_COMPILED_PATTERNS {
        let Some(oldest) = cache
            .globs
            .iter()
            .min_by_key(|(_, value)| value.last_used)
            .map(|(key, _)| key.clone())
        else {
            break;
        };
        cache.globs.remove(&oldest);
    }
    Ok(Some(compiled))
}

fn walk_files(
    state: &EngineState,
    request: &CommonRequest,
    cancel: &AtomicBool,
) -> ComputeResult<Vec<(PathBuf, String)>> {
    let (workspace, scope) = canonical_root(&request.workspace, &request.path)?;
    let blocked = blocked_paths(&request.blocked);
    if is_blocked(&scope, &blocked) {
        return Err("Host runtime data is protected".to_owned());
    }
    let include = compiled_glob_set(state, "include", &request.include)?;
    let exclude = compiled_glob_set(state, "exclude", &request.exclude)?;
    let mut builder = WalkBuilder::new(&scope);
    builder
        .hidden(!request.include_hidden)
        .follow_links(false)
        .max_filesize(Some(MAX_FILE_BYTES))
        .git_ignore(true)
        .git_exclude(true)
        .ignore(true)
        .require_git(false)
        .add_custom_ignore_filename(".rgignore")
        .parents(true);
    let mut files = Vec::new();
    for entry in builder.build() {
        cancelled(cancel)?;
        let entry = entry.map_err(|error| format!("workspace traversal failed: {error}"))?;
        let Some(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_file() {
            continue;
        }
        let path = entry.path();
        if is_blocked(path, &blocked) {
            continue;
        }
        let relative = path
            .strip_prefix(&workspace)
            .map_err(|_| "walked path escaped the workspace".to_owned())?
            .to_string_lossy()
            .replace('\\', "/");
        if include.as_ref().is_some_and(|set| !set.is_match(&relative))
            || exclude.as_ref().is_some_and(|set| set.is_match(&relative))
        {
            continue;
        }
        if files.len() == MAX_WALK_FILES {
            return Err(format!(
                "workspace query exceeds {MAX_WALK_FILES} eligible files"
            ));
        }
        files.push((path.to_owned(), relative));
    }
    files.sort_by(|left, right| left.1.cmp(&right.1));
    Ok(files)
}

fn find(state: &EngineState, request: CommonRequest, cancel: &AtomicBool) -> ComputeResult<String> {
    if request.limit == 0 || request.limit > 1000 {
        return Err("find limit must be between 1 and 1000".to_owned());
    }
    let files = walk_files(state, &request, cancel)?;
    let files_checked = files.len();
    let truncated = files_checked > request.limit;
    let paths = files
        .into_iter()
        .take(request.limit)
        .map(|(_, relative)| relative)
        .collect();
    json(&FindResponse {
        paths,
        truncated,
        files_checked,
    })
}

fn matcher_key(request: &SearchRequest) -> String {
    format!(
        "{}\0{}\0{}",
        if request.literal { "literal" } else { "regex" },
        match request.case_mode {
            CaseMode::Sensitive => "sensitive",
            CaseMode::Insensitive => "insensitive",
            CaseMode::Smart => "smart",
        },
        request.pattern
    )
}

fn compiled_matcher(
    state: &EngineState,
    request: &SearchRequest,
) -> ComputeResult<(String, Arc<RegexMatcher>)> {
    if request.pattern.is_empty() || request.pattern.len() > MAX_PATTERN_BYTES {
        return Err(format!(
            "search pattern must contain 1 to {MAX_PATTERN_BYTES} bytes"
        ));
    }
    let key = matcher_key(request);
    {
        let mut cache = state
            .cache
            .lock()
            .map_err(|_| "cache lock poisoned".to_owned())?;
        let used = cache.tick();
        if let Some(entry) = cache.matchers.get_mut(&key) {
            entry.last_used = used;
            return Ok((key, entry.matcher.clone()));
        }
    }
    let mut builder = RegexMatcherBuilder::new();
    builder
        .line_terminator(Some(b'\n'))
        .size_limit(10 * 1024 * 1024);
    match request.case_mode {
        CaseMode::Sensitive => {
            builder.case_insensitive(false);
        }
        CaseMode::Insensitive => {
            builder.case_insensitive(true);
        }
        CaseMode::Smart => {
            builder.case_smart(true);
        }
    }
    let matcher = if request.literal {
        builder.build_literals(&[request.pattern.as_str()])
    } else {
        builder.build(&request.pattern)
    }
    .map_err(|error| format!("invalid search pattern: {error}"))?;
    let matcher = Arc::new(matcher);
    let mut cache = state
        .cache
        .lock()
        .map_err(|_| "cache lock poisoned".to_owned())?;
    let used = cache.tick();
    cache.matchers.insert(
        key.clone(),
        MatcherEntry {
            matcher: matcher.clone(),
            last_used: used,
        },
    );
    while cache.matchers.len() > MAX_COMPILED_PATTERNS {
        let Some(oldest) = cache
            .matchers
            .iter()
            .min_by_key(|(_, value)| value.last_used)
            .map(|(key, _)| key.clone())
        else {
            break;
        };
        cache.matchers.remove(&oldest);
    }
    Ok((key, matcher))
}

fn read_cached(
    state: &EngineState,
    path: &Path,
    operation: &mut OperationCacheStats,
    cancel: &AtomicBool,
) -> ComputeResult<CachedContent> {
    let mut file =
        File::open(path).map_err(|error| format!("could not open {}: {error}", path.display()))?;
    let fallback_before = fallback_version(&file)
        .map_err(|error| format!("could not inspect {}: {error}", path.display()))?;
    let before = file_version(&file).ok();
    if fallback_before.size > MAX_FILE_BYTES {
        return Err(format!("file exceeds {MAX_FILE_BYTES} bytes"));
    }
    {
        let mut cache = state
            .cache
            .lock()
            .map_err(|_| "cache lock poisoned".to_owned())?;
        let used = cache.tick();
        if let (Some(entry), Some(before)) = (cache.content.get_mut(path), before.as_ref()) {
            if &entry.version == before {
                entry.last_used = used;
                let bytes = entry.bytes.clone();
                let line_starts = entry.line_starts.clone();
                cache.content_hits += 1;
                operation.content_hits += 1;
                return Ok(CachedContent {
                    bytes,
                    line_starts,
                    version: Some(before.clone()),
                    hit: true,
                });
            }
        }
        cache.content_misses += 1;
        operation.content_misses += 1;
        cache.invalidate(path);
    }
    let mut bytes = Vec::with_capacity(fallback_before.size as usize);
    let mut chunk = [0_u8; 64 * 1024];
    loop {
        cancelled(cancel)?;
        let count = file
            .read(&mut chunk)
            .map_err(|error| format!("could not read {}: {error}", path.display()))?;
        if count == 0 {
            break;
        }
        bytes.extend_from_slice(&chunk[..count]);
        if bytes.len() as u64 > MAX_FILE_BYTES {
            return Err(format!("file exceeds {MAX_FILE_BYTES} bytes"));
        }
    }
    cancelled(cancel)?;
    let after_file = File::open(path)
        .map_err(|error| format!("could not re-open {}: {error}", path.display()))?;
    let fallback_after = fallback_version(&after_file)
        .map_err(|error| format!("could not re-inspect {}: {error}", path.display()))?;
    let after = file_version(&after_file).ok();
    if fallback_before != fallback_after
        || before
            .as_ref()
            .zip(after.as_ref())
            .is_some_and(|(left, right)| left != right)
        || bytes.len() as u64 != fallback_after.size
    {
        return Err(format!("file changed while reading: {}", path.display()));
    }
    let reliable_version = before
        .zip(after)
        .filter(|(left, right)| left == right)
        .map(|(_, right)| right);
    let line_starts = Arc::new(index_lines(&bytes)?);
    let bytes = Arc::new(bytes);
    let estimated_bytes = bytes.len() + line_starts.len() * std::mem::size_of::<usize>();
    let mut cache = state
        .cache
        .lock()
        .map_err(|_| "cache lock poisoned".to_owned())?;
    cache.bytes_read = cache.bytes_read.saturating_add(bytes.len() as u64);
    operation.bytes_read = operation.bytes_read.saturating_add(bytes.len() as u64);
    if let Some(version) = reliable_version.as_ref() {
        let used = cache.tick();
        cache.bytes = cache.bytes.saturating_add(estimated_bytes);
        if let Some(previous) = cache.content.insert(
            path.to_owned(),
            ContentEntry {
                version: version.clone(),
                bytes: bytes.clone(),
                line_starts: line_starts.clone(),
                estimated_bytes,
                last_used: used,
            },
        ) {
            cache.bytes = cache.bytes.saturating_sub(previous.estimated_bytes);
        }
        cache.evict();
    }
    Ok(CachedContent {
        bytes,
        line_starts,
        version: reliable_version,
        hit: false,
    })
}

struct LineSink {
    lines: Vec<u64>,
    complete: bool,
}

impl Sink for LineSink {
    type Error = std::io::Error;

    fn matched(
        &mut self,
        _searcher: &Searcher,
        matched: &SinkMatch<'_>,
    ) -> std::result::Result<bool, Self::Error> {
        if let Some(line) = matched.line_number() {
            self.lines.push(line);
        }
        if self.lines.len() >= MAX_CACHED_MATCHES_PER_FILE {
            self.complete = false;
            Ok(false)
        } else {
            Ok(true)
        }
    }
}

fn matched_lines(
    state: &EngineState,
    path: &Path,
    version: Option<&FileVersion>,
    bytes: &[u8],
    matcher: (&str, &RegexMatcher),
    operation: &mut OperationCacheStats,
    cancel: &AtomicBool,
) -> ComputeResult<(Arc<Vec<u64>>, bool)> {
    let (matcher_key, matcher) = matcher;
    let key = format!("{}\0{matcher_key}", path.to_string_lossy());
    {
        let mut cache = state
            .cache
            .lock()
            .map_err(|_| "cache lock poisoned".to_owned())?;
        let used = cache.tick();
        if let (Some(entry), Some(version)) = (cache.matches.get_mut(&key), version) {
            if &entry.version == version {
                entry.last_used = used;
                let lines = entry.lines.clone();
                let complete = entry.complete;
                cache.match_hits += 1;
                operation.match_hits += 1;
                return Ok((lines, complete));
            }
        }
        cache.match_misses += 1;
        operation.match_misses += 1;
        if let Some(entry) = cache.matches.remove(&key) {
            cache.bytes = cache.bytes.saturating_sub(entry.estimated_bytes);
        }
    }
    let mut searcher = SearcherBuilder::new().line_number(true).build();
    let mut sink = LineSink {
        lines: Vec::new(),
        complete: true,
    };
    cancelled(cancel)?;
    searcher
        .search_slice(matcher, bytes, &mut sink)
        .map_err(|error| format!("search failed for {}: {error}", path.display()))?;
    cancelled(cancel)?;
    let lines = Arc::new(sink.lines);
    let estimated_bytes = lines.len() * std::mem::size_of::<u64>();
    if let Some(version) = version.filter(|_| sink.complete) {
        let mut cache = state
            .cache
            .lock()
            .map_err(|_| "cache lock poisoned".to_owned())?;
        let used = cache.tick();
        cache.bytes = cache.bytes.saturating_add(estimated_bytes);
        if let Some(previous) = cache.matches.insert(
            key,
            MatchEntry {
                version: version.clone(),
                lines: lines.clone(),
                complete: true,
                estimated_bytes,
                last_used: used,
            },
        ) {
            cache.bytes = cache.bytes.saturating_sub(previous.estimated_bytes);
        }
        cache.evict();
    }
    Ok((lines, sink.complete))
}

fn index_lines(bytes: &[u8]) -> ComputeResult<Vec<usize>> {
    std::str::from_utf8(bytes).map_err(|_| "file is not valid UTF-8 text".to_owned())?;
    if bytes.is_empty() {
        return Ok(Vec::new());
    }
    let mut starts = vec![0];
    for (index, byte) in bytes.iter().enumerate() {
        if *byte == b'\n' && index + 1 < bytes.len() {
            starts.push(index + 1);
        }
    }
    Ok(starts)
}

fn line_text<'a>(bytes: &'a [u8], starts: &[usize], index: usize) -> ComputeResult<&'a str> {
    let start = *starts
        .get(index)
        .ok_or_else(|| "line index is outside the file".to_owned())?;
    let mut end = starts.get(index + 1).copied().unwrap_or(bytes.len());
    if end > start && bytes.get(end - 1) == Some(&b'\n') {
        end -= 1;
    }
    if end > start && bytes.get(end - 1) == Some(&b'\r') {
        end -= 1;
    }
    std::str::from_utf8(&bytes[start..end]).map_err(|_| "file is not valid UTF-8 text".to_owned())
}

fn search(
    state: &EngineState,
    request: SearchRequest,
    cancel: &AtomicBool,
) -> ComputeResult<String> {
    if request.common.limit == 0 || request.common.limit > 1000 {
        return Err("search limit must be between 1 and 1000".to_owned());
    }
    if request.before_context > 20 || request.after_context > 20 {
        return Err("search context is limited to 20 lines on each side".to_owned());
    }
    let (matcher_key, matcher) = compiled_matcher(state, &request)?;
    let mut matches = Vec::new();
    let mut truncated = false;
    let mut operation = OperationCacheStats::default();
    let files = walk_files(state, &request.common, cancel)?;
    let files_checked = files.len();
    for (path, relative) in files {
        cancelled(cancel)?;
        let content = match read_cached(state, &path, &mut operation, cancel) {
            Ok(value) => value,
            Err(error) if error.contains("not valid UTF-8") => continue,
            Err(error) => return Err(error),
        };
        let bytes = content.bytes;
        let line_starts = content.line_starts;
        if bytes.contains(&0) {
            continue;
        }
        let (line_numbers, complete) = matched_lines(
            state,
            &path,
            content.version.as_ref(),
            &bytes,
            (&matcher_key, &matcher),
            &mut operation,
            cancel,
        )?;
        for line_number in line_numbers.iter().copied() {
            cancelled(cancel)?;
            if matches.len() == request.common.limit {
                truncated = true;
                break;
            }
            let index = line_number.saturating_sub(1) as usize;
            if index >= line_starts.len() {
                continue;
            }
            let text = line_text(&bytes, &line_starts, index)?;
            let column = matcher
                .find(text.as_bytes())
                .map_err(|error| format!("search matcher failed: {error}"))?
                .map_or(1, |matched| matched.start() + 1);
            let before_start = index.saturating_sub(request.before_context);
            let after_end = line_starts.len().min(index + request.after_context + 1);
            matches.push(SearchMatch {
                path: relative.clone(),
                line: line_number,
                column,
                text: text.to_owned(),
                before: (before_start..index)
                    .map(|line| line_text(&bytes, &line_starts, line).map(str::to_owned))
                    .collect::<ComputeResult<Vec<_>>>()?,
                after: (index + 1..after_end)
                    .map(|line| line_text(&bytes, &line_starts, line).map(str::to_owned))
                    .collect::<ComputeResult<Vec<_>>>()?,
            });
        }
        if !complete && matches.len() >= request.common.limit {
            truncated = true;
            break;
        }
        if truncated {
            break;
        }
    }
    json(&SearchResponse {
        matches,
        truncated,
        files_checked,
        cache: operation,
    })
}

fn read(state: &EngineState, request: ReadRequest, cancel: &AtomicBool) -> ComputeResult<String> {
    cancelled(cancel)?;
    if request.start_line == 0 || request.line_count == 0 || request.line_count > 2000 {
        return Err(
            "read range requires startLine >= 1 and lineCount between 1 and 2000".to_owned(),
        );
    }
    let (workspace, path) = canonical_root(&request.workspace, &request.path)?;
    if path == workspace || is_blocked(&path, &blocked_paths(&request.blocked)) {
        return Err("read path is not an accessible workspace file".to_owned());
    }
    let mut operation = OperationCacheStats::default();
    let content = read_cached(state, &path, &mut operation, cancel)?;
    let bytes = content.bytes;
    let line_starts = content.line_starts;
    cancelled(cancel)?;
    if bytes.contains(&0) {
        return Err("file is binary".to_owned());
    }
    let start = request.start_line.saturating_sub(1).min(line_starts.len());
    let end = line_starts
        .len()
        .min(start.saturating_add(request.line_count));
    let mut selected = Vec::with_capacity(end.saturating_sub(start));
    for index in start..end {
        selected.push(line_text(&bytes, &line_starts, index)?);
    }
    let mut text = selected.join("\n");
    if end > start && bytes.ends_with(b"\n") && end == line_starts.len() {
        text.push('\n');
    }
    json(&ReadResponse {
        text,
        start_line: start + 1,
        end_line: end,
        total_lines: line_starts.len(),
        next_line: (end < line_starts.len()).then_some(end + 1),
        cache_hit: content.hit,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compiles_literal_and_regex_matchers() {
        let state = EngineState {
            cache: Mutex::new(Cache::new(1024 * 1024)),
            cancellations: Mutex::new(HashMap::new()),
        };
        let request = SearchRequest {
            common: CommonRequest {
                workspace: ".".to_owned(),
                path: ".".to_owned(),
                include: vec![],
                exclude: vec![],
                include_hidden: false,
                blocked: vec![],
                limit: 20,
            },
            pattern: "hello".to_owned(),
            literal: true,
            case_mode: CaseMode::Smart,
            before_context: 0,
            after_context: 0,
        };
        let (_, matcher) = compiled_matcher(&state, &request).expect("matcher");
        assert_eq!(matcher.find(b"say hello").unwrap().unwrap().start(), 4);
    }

    #[test]
    fn glob_sets_use_workspace_relative_slashes() {
        let set = glob_set(&["**/*.ts".to_owned()]).unwrap().unwrap();
        assert!(set.is_match("packages/query/index.ts"));
        assert!(!set.is_match("packages/query/index.rs"));
    }

    #[test]
    fn compiled_glob_sets_are_reused() {
        let state = EngineState {
            cache: Mutex::new(Cache::new(1024 * 1024)),
            cancellations: Mutex::new(HashMap::new()),
        };
        let patterns = vec!["**/*.ts".to_owned()];
        let first = compiled_glob_set(&state, "include", &patterns)
            .unwrap()
            .unwrap();
        let second = compiled_glob_set(&state, "include", &patterns)
            .unwrap()
            .unwrap();
        assert!(Arc::ptr_eq(&first, &second));
        assert_eq!(state.cache.lock().unwrap().globs.len(), 1);
    }

    #[test]
    fn line_index_preserves_lines_and_rejects_invalid_utf8() {
        let bytes = b"first\r\nsecond\n\n";
        let starts = index_lines(bytes).unwrap();
        assert_eq!(starts, vec![0, 7, 14]);
        assert_eq!(line_text(bytes, &starts, 0).unwrap(), "first");
        assert_eq!(line_text(bytes, &starts, 1).unwrap(), "second");
        assert_eq!(line_text(bytes, &starts, 2).unwrap(), "");
        assert!(index_lines(&[b'a', 0xff]).is_err());
    }
}
