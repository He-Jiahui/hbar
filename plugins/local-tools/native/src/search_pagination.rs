//! Stable matching-line pages. Complete plans retain indexes, never unbounded text.
use super::*;
use std::collections::BTreeMap;
use std::time::{Duration, Instant};

const PAGE_BYTES: usize = 60 * 1024;
const PLAN_BYTES: usize = 4 * 1024 * 1024;
const PLAN_TTL: Duration = Duration::from_secs(300);

struct PlannedFile {
    path: PathBuf,
    relative: String,
    version: FileVersion,
    lines: Arc<Vec<u64>>,
}

#[derive(Clone)]
pub(super) struct SearchPlan {
    files: Arc<Vec<PlannedFile>>,
    created: Instant,
    pub(super) estimated_bytes: usize,
    pub(super) last_used: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Pagination {
    from_index: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    next_index: Option<usize>,
    scan_complete: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_matches: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    remaining_matches: Option<usize>,
    cache_hit: bool,
    cache_stored: bool,
    cache_limited: bool,
    folders: Vec<FolderCount>,
    other_matches: usize,
    folders_compressed: bool,
}

#[derive(Serialize)]
struct FolderCount {
    path: String,
    matches: usize,
}

#[derive(Default)]
struct Summary {
    folders: BTreeMap<String, usize>,
    other: usize,
    compressed: bool,
}

impl Summary {
    fn add(&mut self, file: &str, count: usize) {
        if count == 0 {
            return;
        }
        let parent = file.rsplit_once('/').map_or(".", |(parent, _)| parent);
        if !self.compressed && self.folders.len() == 6 && !self.folders.contains_key(parent) {
            self.compressed = true;
            let previous = std::mem::take(&mut self.folders);
            for (folder, matches) in previous {
                self.add_folder(&folder, matches);
            }
        }
        self.add_folder(parent, count);
    }

    fn add_folder(&mut self, folder: &str, count: usize) {
        let folder = if self.compressed {
            folder.split('/').next().unwrap_or(".")
        } else {
            folder
        };
        if let Some(matches) = self.folders.get_mut(folder) {
            *matches += count;
        } else if self.folders.len() < 6 {
            self.folders.insert(folder.to_owned(), count);
        } else {
            self.other += count;
        }
    }

    fn finish(self) -> (Vec<FolderCount>, usize, bool) {
        let mut folders: Vec<_> = self
            .folders
            .into_iter()
            .map(|(path, matches)| FolderCount { path, matches })
            .collect();
        folders.sort_by(|a, b| b.matches.cmp(&a.matches).then_with(|| a.path.cmp(&b.path)));
        (folders, self.other, self.compressed)
    }
}

struct Page {
    matches: Vec<SearchMatch>,
    bytes: usize,
    closed: bool,
}

impl Page {
    fn new() -> Self {
        Self {
            matches: Vec::new(),
            bytes: 0,
            closed: false,
        }
    }

    fn add(
        &mut self,
        request: &SearchRequest,
        relative: &str,
        number: u64,
        content: &CachedContent,
        matcher: &RegexMatcher,
    ) -> ComputeResult<()> {
        if self.closed || self.matches.len() >= request.common.limit {
            self.closed = true;
            return Ok(());
        }
        let index = number.saturating_sub(1) as usize;
        let text = line_text(&content.bytes, &content.line_starts, index)?;
        let column = matcher
            .find(text.as_bytes())
            .map_err(|error| format!("search matcher failed: {error}"))?
            .map_or(1, |matched| matched.start() + 1);
        let before = (index.saturating_sub(request.before_context)..index)
            .map(|line| line_text(&content.bytes, &content.line_starts, line))
            .collect::<ComputeResult<Vec<_>>>()?;
        let after = (index + 1
            ..content
                .line_starts
                .len()
                .min(index + request.after_context + 1))
            .map(|line| line_text(&content.bytes, &content.line_starts, line))
            .collect::<ComputeResult<Vec<_>>>()?;
        let cost = text.len()
            + before
                .iter()
                .chain(&after)
                .map(|line| line.len())
                .sum::<usize>()
            + (relative.len() + 40) * (1 + before.len() + after.len());
        let available = PAGE_BYTES.saturating_sub(self.bytes);
        if cost > available && !self.matches.is_empty() {
            self.closed = true;
            return Ok(());
        }
        let shortened = cost > available;
        let text = if shortened {
            let mut end = text
                .len()
                .min(available.saturating_sub(relative.len() + 40));
            while !text.is_char_boundary(end) {
                end -= 1;
            }
            &text[..end]
        } else {
            text
        };
        self.bytes += if shortened {
            relative.len() + 40 + text.len()
        } else {
            cost
        };
        self.matches.push(SearchMatch {
            path: relative.to_owned(),
            line: number,
            column,
            text: text.to_owned(),
            before: if shortened {
                vec![]
            } else {
                before.into_iter().map(str::to_owned).collect()
            },
            after: if shortened {
                vec![]
            } else {
                after.into_iter().map(str::to_owned).collect()
            },
            text_truncated: shortened.then_some(true),
        });
        if shortened {
            self.closed = true;
        }
        Ok(())
    }
}

fn version(path: &Path) -> Option<FileVersion> {
    File::open(path)
        .ok()
        .and_then(|file| file_version(&file).ok())
}

fn valid_plan(
    plan: &SearchPlan,
    files: &[(PathBuf, String)],
    cancel: &AtomicBool,
) -> ComputeResult<bool> {
    if plan.created.elapsed() > PLAN_TTL || plan.files.len() != files.len() {
        return Ok(false);
    }
    for (planned, (path, relative)) in plan.files.iter().zip(files) {
        cancelled(cancel)?;
        if &planned.path != path
            || &planned.relative != relative
            || version(path).as_ref() != Some(&planned.version)
        {
            return Ok(false);
        }
    }
    Ok(true)
}

fn plan_key(request: &SearchRequest, matcher: &str) -> ComputeResult<String> {
    let (root, scope) = canonical_root(&request.common.workspace, &request.common.path)?;
    serde_json::to_string(&(
        root,
        scope,
        matcher,
        &request.common.include,
        &request.common.exclude,
        request.common.include_hidden,
        &request.common.blocked,
    ))
    .map_err(|error| error.to_string())
}

pub(super) fn search(
    state: &EngineState,
    request: SearchRequest,
    cancel: &AtomicBool,
) -> ComputeResult<String> {
    if request.common.limit == 0 || request.common.limit > 1000 {
        return Err("search limit must be between 1 and 1000".to_owned());
    }
    if request.from_index > 10_000_000 {
        return Err("search from_index must be between 0 and 10000000".to_owned());
    }
    if request.before_context > 20 || request.after_context > 20 {
        return Err("search context is limited to 20 lines on each side".to_owned());
    }
    let (matcher_key, matcher) = compiled_matcher(state, &request)?;
    let key = plan_key(&request, &matcher_key)?;
    // Discovery is still required for stable ordering, permissions, and added/deleted files.
    // Normal mode stops content matching at the requested limit, not directory discovery.
    let files = walk_files(state, &request.common, cancel, true)?;
    let candidate = state
        .cache
        .lock()
        .map_err(|_| "cache lock poisoned".to_owned())?
        .plans
        .get(&key)
        .cloned();
    let cached = match candidate {
        Some(plan) if valid_plan(&plan, &files, cancel)? => Some(plan),
        _ => {
            state
                .cache
                .lock()
                .map_err(|_| "cache lock poisoned".to_owned())?
                .remove_plan(&key);
            None
        }
    };
    let cache_hit = cached.is_some();
    let full = request.fully_scan || cache_hit;
    let budget = state
        .cache
        .lock()
        .map_err(|_| "cache lock poisoned".to_owned())?
        .max_bytes
        .min(PLAN_BYTES * 2)
        / 2;
    let mut planned = Some(Vec::new());
    let mut plan_bytes = key.len() + std::mem::size_of::<SearchPlan>();
    let mut page = Page::new();
    let mut operation = OperationCacheStats::default();
    let mut summary = Summary::default();
    let mut seen: usize = 0;
    let mut files_checked = 0;
    let mut scan_complete = true;
    for (file_index, (path, relative)) in files.iter().enumerate() {
        cancelled(cancel)?;
        let existing = cached.as_ref().map(|plan| &plan.files[file_index]);
        let start = seen;
        let mut content = None;
        let (lines, complete, identity) = if let Some(existing) = existing {
            // Reuse complete indexes; don't read files outside the displayed page.
            if !page.closed
                && page.matches.len() < request.common.limit
                && start + existing.lines.len() > request.from_index
            {
                files_checked += 1;
                let value = read_cached(state, path, &mut operation, cancel)?;
                if value.version.as_ref() != Some(&existing.version) {
                    return Err("file changed during cached search".to_owned());
                }
                content = Some(value);
                operation.match_hits += 1;
            }
            (existing.lines.clone(), true, Some(existing.version.clone()))
        } else {
            files_checked += 1;
            let value = match read_cached(state, path, &mut operation, cancel) {
                Ok(value) => Some(value),
                Err(error) if error.contains("not valid UTF-8") => None,
                Err(error) => return Err(error),
            };
            let identity = value
                .as_ref()
                .and_then(|value| value.version.clone())
                .or_else(|| version(path));
            let (lines, complete) = match value.as_ref().filter(|value| !value.bytes.contains(&0)) {
                Some(value) => matched_lines(
                    state,
                    path,
                    value.version.as_ref(),
                    &value.bytes,
                    (&matcher_key, &matcher),
                    &mut operation,
                    cancel,
                    (!full).then_some(
                        request
                            .from_index
                            .saturating_add(request.common.limit)
                            .saturating_sub(seen),
                    ),
                )?,
                None => (Arc::new(Vec::new()), true),
            };
            content = value;
            (lines, complete, identity)
        };
        seen += lines.len();
        if let Some(content) = content.as_ref() {
            for number in lines.iter().skip(request.from_index.saturating_sub(start)) {
                cancelled(cancel)?;
                if page.closed || page.matches.len() >= request.common.limit {
                    page.closed = true;
                    break;
                }
                page.add(&request, relative, *number, content, &matcher)?;
            }
        }
        let page_end = request.from_index.saturating_add(page.matches.len());
        summary.add(relative, seen.saturating_sub(page_end.max(start)));
        if full && !cache_hit {
            plan_bytes += std::mem::size_of::<PlannedFile>()
                + path.as_os_str().len() * 2
                + relative.len()
                + lines.len() * std::mem::size_of::<u64>();
            if plan_bytes > budget || identity.is_none() {
                planned = None;
            }
            if let (Some(planned), Some(version)) = (planned.as_mut(), identity) {
                planned.push(PlannedFile {
                    path: path.clone(),
                    relative: relative.clone(),
                    version,
                    lines,
                });
            }
        }
        if !full && (page.closed || page.matches.len() >= request.common.limit) {
            scan_complete = complete && file_index + 1 == files.len() && page_end >= seen;
            break;
        }
    }
    let mut cache_stored = false;
    let cache_limited = full && !cache_hit && planned.is_none();
    if cache_hit {
        let mut cache = state
            .cache
            .lock()
            .map_err(|_| "cache lock poisoned".to_owned())?;
        let used = cache.tick();
        if let Some(plan) = cache.plans.get_mut(&key) {
            plan.last_used = used;
            cache_stored = true;
        }
    } else if request.fully_scan {
        if let Some(planned) = planned {
            let mut cache = state
                .cache
                .lock()
                .map_err(|_| "cache lock poisoned".to_owned())?;
            let used = cache.tick();
            cache.remove_plan(&key);
            let plan = SearchPlan {
                files: Arc::new(planned),
                created: Instant::now(),
                estimated_bytes: plan_bytes,
                last_used: used,
            };
            // Do not publish a snapshot whose files changed during the full scan.
            drop(cache);
            if !valid_plan(&plan, &files, cancel)? {
                return Err("files changed during full search".to_owned());
            }
            let mut cache = state
                .cache
                .lock()
                .map_err(|_| "cache lock poisoned".to_owned())?;
            cache.bytes += plan.estimated_bytes;
            cache.plans.insert(key.clone(), plan);
            while cache.plans.len() > 32 {
                let oldest = cache
                    .plans
                    .iter()
                    .min_by_key(|(_, plan)| plan.last_used)
                    .map(|(key, _)| key.clone());
                if let Some(oldest) = oldest {
                    cache.remove_plan(&oldest);
                }
            }
            cache.evict();
            cache_stored = cache.plans.contains_key(&key);
        }
    }
    let next = request.from_index.saturating_add(page.matches.len());
    let remaining = scan_complete.then_some(seen.saturating_sub(next));
    let truncated = !scan_complete
        || remaining.is_some_and(|count| count > 0)
        || page
            .matches
            .iter()
            .any(|item| item.text_truncated == Some(true));
    let (folders, other_matches, folders_compressed) = summary.finish();
    json(&SearchResponse {
        matches: page.matches,
        truncated,
        files_checked,
        cache: operation,
        pagination: Pagination {
            from_index: request.from_index,
            next_index: (!scan_complete || remaining.is_some_and(|count| count > 0))
                .then_some(next),
            scan_complete,
            total_matches: scan_complete.then_some(seen),
            remaining_matches: remaining,
            cache_hit,
            cache_stored,
            cache_limited,
            folders: if scan_complete { folders } else { vec![] },
            other_matches: if scan_complete { other_matches } else { 0 },
            folders_compressed,
        },
    })
}
