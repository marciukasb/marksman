# Marksman Reliable Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Marksman into a local workspace where Submit / Save draft never touch GitHub and a single Sync makes one commit (one deploy), with a Vinted-style photo strip, trustworthy status, transliterated slugs and single entries, then teach the GycioBiciukis site to render the new `photos` field.

**Architecture:** Local state (entries + processed photo blobs) lives in IndexedDB via `idb-keyval`. Pure modules decide everything that can be decided without the network (front matter, slugs, photo naming, sync planning, status) and are unit-tested; a thin GitHub layer executes plans with the Git Data API. React pages read a `WorkspaceContext` that merges live repo files with local entries.

**Tech Stack:** Vite + React 18 + TypeScript, react-router-dom (HashRouter), @octokit/rest, @uiw/react-md-editor, SCSS modules, Vitest + Testing Library (jsdom), new: `idb-keyval` (runtime), `fake-indexeddb` (dev).

**Spec:** `docs/superpowers/specs/2026-11-13-marksman-reliable-publishing-design.md`

## Global Constraints

- Nothing may write to GitHub except `runSync` (Task 6). Delete `putFile`, `uploadImage`, `deleteFile`, `ensureDraftsBranch`, `fetchSyncStatus`, `triggerDeploy` once unused.
- Exactly one commit per Sync, message prefixed `cms:`; only touched paths change; base is the **latest** default-branch head.
- Default branch is read from GitHub (`repos.get().default_branch`), never hard-coded `master`.
- Marksman UI copy stays English.
- Photos: long edge ≤ 2000px, JPEG quality 0.82, EXIF orientation respected; filenames `<slug>-<n>-<rand4>.jpg`, `rand4` = 4 chars `[a-z0-9]`.
- Slug transliteration: ą→a č→c ę→e ė→e į→i š→s ų→u ū→u ž→z (and any other Latin diacritic via NFD stripping); fallback `irasas-<YYYY-MM-DD>`; collisions get `-2`, `-3`…; slug fixed after creation.
- Status strings (exact): `Syncing…`, `Updating the site…`, `Last update failed`, `N change(s) waiting` (`1 change waiting` / `3 changes waiting`), `Everything is live`, `Saved — site updates are switched off`.
- Entry labels on the list (exact): `Live`, `Draft`, `Waiting to sync`, `Will be deleted`.
- Never enable, disable or edit a target repo's workflows.
- Existing `.cms.json` files (EmberInstruments: `image` + `markdown` fields, no `singles`) must keep loading and syncing.
- `npm test -- --run`, `npm run lint` and `npm run build` pass at the end of every task.

## Review Focus

1. **Browser storage fails** (quota exceeded with many photos, IndexedDB unavailable in a private window) — Submit/Save draft shows an error and keeps the editor open; nothing is reported as saved that wasn't.
2. **The user edited the same post on GitHub while the dad had it open** — Sync makes no commit and names the post; other unchanged repo files are never reverted by any Sync.
3. **Sync fails midway** (network drops after blobs were created, or the ref update is rejected twice) — all local entries and photos remain, status doesn't claim success, the next Sync works.
4. **EmberInstruments' legacy collection** (`thumbnail` image field + markdown images, existing unquoted values) — opens, round-trips without changing untouched front-matter values, uploads go through the workspace, Sync commits once.
5. **Deploy workflow disabled or missing** (GycioBiciukis today) — after Sync the status shows `Saved — site updates are switched off`, never hangs on `Updating the site…`, and Marksman never dispatches it.

---

## File Structure

```
src/types/index.ts                 (modify) FieldType + 'gallery' | 'number', FieldConfig.label, SingleConfig, CmsConfig.singles, FieldValue, LocalEntry, LocalPhoto, RepoInfo
src/lib/frontmatter.ts             (modify) lists + numbers + safe quoting; generateSlug removed
src/lib/slug.ts                    slugify, uniqueSlug
src/lib/photos.ts                  fitWithin, photoFilename, processPhoto, photoUrlToPath, referencedPhotos, galleryOutsideBody
src/lib/workspace.ts               IndexedDB store for entries + photos
src/lib/github.ts                  (rewrite) read-only helpers + commitChanges + deploy/run queries
src/lib/sync.ts                    planSync (pure) + runSync
src/lib/status.ts                  deriveStatus (pure)
src/context/ProjectContext.tsx     (modify) stores RepoInfo (default branch)
src/context/WorkspaceContext.tsx   entries, photos, pending count, sync state
src/components/fields/GalleryField.tsx, NumberField.tsx, PhotoPicker.tsx (+ scss)
src/components/fields/ImageField.tsx, MarkdownField.tsx (modify) local photos
src/components/sync/SyncBar.tsx, ConflictDialog.tsx (+ scss)
src/components/layout/Layout.tsx   (modify) singles in sidebar, SyncBar outside editor
src/pages/PostListPage.tsx         (modify) merged list + labels
src/pages/PostEditorPage.tsx       (modify) Submit / Save draft
src/pages/SingleEditorPage.tsx     single entries
src/App.tsx                        (modify) route /:owner/:repo/single/:single
```

Site repo (`../GycioBiciukis`): `app/types/BlogPost.ts`, `app/utils/blog.ts`, `app/utils/photos.ts`, `app/_components/BlogPost/*`, `.cms.json`.

---

### Task 1: Front matter with lists, numbers and safe quoting

**Files:** Modify `src/types/index.ts`, `src/lib/frontmatter.ts`, `src/lib/frontmatter.test.ts`

**Interfaces:**
- Produces: `type FieldValue = string | number | string[]`; `parsePost(raw: string): { data: Record<string, FieldValue>; body: string }`; `serializePost(data: Record<string, FieldValue>, body: string): string`. `generateSlug` is removed (Task 2 replaces it; delete its tests).

- [ ] **Step 1: Failing tests**

```ts
// lists
parsePost('---\nphotos:\n  - /images/a.jpg\n  - "/images/b c.jpg"\n---\n\nT').data.photos
  // → ['/images/a.jpg', '/images/b c.jpg']
serializePost({ photos: ['/images/a.jpg'] }, 'T') // contains 'photos:\n  - /images/a.jpg'
serializePost({ photos: [] }, 'T')                 // contains 'photos: []'
// numbers
parsePost('---\naviliai: 24\n---\n').data.aviliai  // → 24 (number)
serializePost({ aviliai: 24 }, '')                 // contains 'aviliai: 24'
// strings YAML would misread are quoted
serializePost({ title: '2025' }, '')   // contains 'title: "2025"'
serializePost({ title: 'true' }, '')   // contains 'title: "true"'
serializePost({ title: 'null' }, '')   // contains 'title: "null"'
// Ember round-trip: values unchanged
const ember = '---\ntitle: "Hello"\nsummary: Plain text\ntopic: Tech\ndate: "2026-01-15"\nthumbnail: /images/x.png\n---\n\nBody';
parsePost(serializePost(parsePost(ember).data, parsePost(ember).body)).data // toEqual parsePost(ember).data
```

- [ ] **Step 2: Run, verify fail** — `npx vitest --run src/lib/frontmatter.test.ts` → FAIL.
- [ ] **Step 3: Implement** — extend the existing hand-written parser (keep it; no gray-matter at runtime): a key with empty value followed by `  - x` lines is a list; `key: []` is an empty list; an unquoted value matching `/^-?\d+(\.\d+)?$/` is a number; quoted values stay strings. Serializer quotes strings that are empty, numeric, `true/false/null/yes/no/~` (case-insensitive), date-like, contain YAML specials, or have surrounding whitespace.
- [ ] **Step 4: Run, verify pass** — all frontmatter tests PASS.
- [ ] **Step 5: Commit** — `feat: front matter lists, numbers and safe quoting`

---

### Task 2: Transliterated, unique slugs

**Files:** Create `src/lib/slug.ts`, `src/lib/slug.test.ts`

**Interfaces:**
- Produces: `slugify(title: string, today: string): string` (`today` = `YYYY-MM-DD`, used for the fallback); `uniqueSlug(base: string, taken: Set<string>): string`.

- [ ] **Step 1: Failing tests**

```ts
expect(slugify('Šablonas avilių rėmams', '2026-11-13')).toBe('sablonas-aviliu-remams');
expect(slugify('Ąžuolas, ęė į ū!', '2026-11-13')).toBe('azuolas-ee-i-u');
expect(slugify('  --Hello   World--  ', '2026-11-13')).toBe('hello-world');
expect(slugify('!!!', '2026-11-13')).toBe('irasas-2026-11-13');
expect(uniqueSlug('medus', new Set())).toBe('medus');
expect(uniqueSlug('medus', new Set(['medus', 'medus-2']))).toBe('medus-3');
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — `normalize('NFD')` + strip combining marks, lowercase, non-`[a-z0-9]` runs → `-`, trim hyphens.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat: transliterated unique slugs`

---

### Task 3: Photo utilities

**Files:** Create `src/lib/photos.ts`, `src/lib/photos.test.ts`

**Interfaces:**
- Produces:
  - `fitWithin(width: number, height: number, max = 2000): { width: number; height: number }` (never upscales; rounds to integers)
  - `photoFilename(slug: string, n: number, rand: string): string` → `${slug}-${n}-${rand}.jpg`
  - `randomSuffix(): string` (4 chars `[a-z0-9]`)
  - `processPhoto(file: Blob): Promise<Blob>` — browser only: `createImageBitmap(file, { imageOrientation: 'from-image' })`, draw at `fitWithin` size on a canvas, `toBlob('image/jpeg', 0.82)`; rejects with `Error('Could not read this photo')` when decoding fails
  - `photoUrlToPath(url: string, imageFolder: string, imageUrlPrefix?: string): string` (`/images/a.jpg` + `public/images` + `/images` → `public/images/a.jpg`)
  - `referencedPhotos(data: Record<string, FieldValue>, body: string, fields: FieldConfig[]): string[]` — URLs from `image` fields, `gallery` fields and `![...](url)` in the body; unique, in order; only URLs starting with `/`
  - `galleryOutsideBody(photos: string[], body: string): string[]`

- [ ] **Step 1: Failing tests**

```ts
expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
expect(fitWithin(3000, 4000)).toEqual({ width: 1500, height: 2000 });
expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
expect(photoFilename('medus', 2, 'k3x9')).toBe('medus-2-k3x9.jpg');
expect(randomSuffix()).toMatch(/^[a-z0-9]{4}$/);
expect(photoUrlToPath('/images/a.jpg', 'public/images', '/images')).toBe('public/images/a.jpg');
expect(photoUrlToPath('/public/images/a.jpg', 'public/images')).toBe('public/images/a.jpg');
expect(referencedPhotos({ thumbnail: '/images/t.jpg', photos: ['/images/a.jpg', '/images/b.jpg'] },
  'x ![](/images/b.jpg) ![](https://e.com/x.png)', fields)).toEqual(['/images/t.jpg', '/images/a.jpg', '/images/b.jpg']);
expect(galleryOutsideBody(['/images/a.jpg', '/images/b.jpg'], '![x](/images/b.jpg)')).toEqual(['/images/a.jpg']);
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** (`processPhoto` has no unit test — jsdom has no canvas; it is exercised in Task 12's manual check).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat: photo sizing, naming and reference helpers`

---

### Task 4: Local workspace store

**Files:** Create `src/lib/workspace.ts`, `src/lib/workspace.test.ts`; modify `src/types/index.ts`, `src/test-setup.ts` (`import 'fake-indexeddb/auto'`), `package.json` (`idb-keyval`, dev `fake-indexeddb`)

**Interfaces:**
- Produces (types):

```ts
type EntryState = 'draft' | 'submitted' | 'deleted';
interface LocalEntry {
  key: string;                 // `${projectId}:${path}`
  projectId: string;
  kind: 'post' | 'single';
  scope: string;               // collection name or single name
  path: string;                // repo path of the .md file
  slug: string | null;         // null for singles
  state: EntryState;
  baseSha: string | null;      // blob sha it started from; null = new file
  livePhotos: string[];        // referencedPhotos of the live version when first opened ([] for new)
  data: Record<string, FieldValue>;
  body: string;
  updatedAt: number;
}
interface LocalPhoto { key: string; projectId: string; url: string; path: string; blob: Blob }
```
- Produces (functions, all async): `listEntries(projectId)`, `getEntry(key)`, `saveEntry(entry)`, `removeEntry(key)`, `savePhoto(photo)`, `getPhoto(projectId, url)`, `listPhotos(projectId)`, `removePhoto(projectId, url)`, `entryKey(projectId, path)`. Two `idb-keyval` stores (`marksman-entries`, `marksman-photos`). Errors propagate (callers show them).

- [ ] **Step 1: Failing tests** — save/get/list/remove round-trips for entries and photos; `listEntries('a')` excludes project `b`; a saved photo's `blob.size` is preserved.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Install and implement** — `npm i idb-keyval && npm i -D fake-indexeddb`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat: IndexedDB workspace for entries and photos`

---

### Task 5: GitHub layer

**Files:** Rewrite `src/lib/github.ts`; create `src/lib/github.test.ts`; modify `src/types/index.ts`

**Interfaces:**
- Produces:
  - `type RepoInfo = { defaultBranch: string }`; `fetchRepoInfo(pat, owner, repo): Promise<RepoInfo>`
  - keep `fetchConfig`, `listFiles`, `fetchFile` (now `fetchFile(..., path, ref?)`)
  - `fetchTreeShas(pat, owner, repo, branch): Promise<{ commitSha: string; treeSha: string; shas: Map<string, string> }>` (recursive tree of the branch head: path → blob sha)
  - `type TreeChange = { path: string; content: string; encoding: 'utf-8' | 'base64' } | { path: string; delete: true }`
  - `commitChanges(pat, owner, repo, branch, parentSha, changes: TreeChange[], message): Promise<string>` — blobs → `createTree({ base_tree, tree })` (deletions as `sha: null`) → `createCommit` → `updateRef` (non-force); returns the new commit sha; throws `RefMovedError` when the ref update is rejected as non-fast-forward
  - `fetchDeployInfo(pat, owner, repo, workflow): Promise<{ exists: boolean; active: boolean; runsOnPush: boolean }>` — `actions.getWorkflow` (`state === 'active'`) + workflow file text from `.github/workflows/<workflow>` checked for an `on:` push trigger (`/^\s*push\s*:/m` or `on: push` / `on: [push`)
  - `fetchRunForCommit(pat, owner, repo, workflow, sha): Promise<{ status: string; conclusion: string | null; url: string } | null>` (`listWorkflowRuns({ head_sha })`)
  - `dispatchDeploy(pat, owner, repo, workflow, branch): Promise<void>`
- Removes: `putFile`, `uploadImage`, `deleteFile`, `ensureDraftsBranch`, `fetchSyncStatus`, `triggerDeploy` (callers updated in later tasks; keep them until Task 10/11 if removal breaks the build — rule and ledger).

- [ ] **Step 1: Failing tests** with a fake Octokit injected via `client` (export `setClientFactory(fn)` for tests):

```ts
// commitChanges: createTree called with base_tree = parent tree and
//   [{ path:'a.md', mode:'100644', type:'blob', sha:<blob> }, { path:'old.jpg', mode:'100644', type:'blob', sha:null }]
// commitChanges: updateRef called with force:false; a 422 "Update is not a fast forward" → RefMovedError
// fetchDeployInfo: workflow state 'disabled_manually' → active:false; file with 'on:\n  push:' → runsOnPush:true;
//   file with only 'workflow_dispatch:' → runsOnPush:false; 404 on getWorkflow → exists:false
// fetchRepoInfo → { defaultBranch: 'master' } from repos.get
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat: Git Data commit and deploy queries`

---

### Task 6: Sync planner and runner

**Files:** Create `src/lib/sync.ts`, `src/lib/sync.test.ts`

**Interfaces:**
- Consumes: `LocalEntry`, `LocalPhoto`, `TreeChange`, `serializePost`, `referencedPhotos`, `photoUrlToPath`, GitHub layer.
- Produces:
  - `type Conflict = { key: string; title: string; reason: 'changed' | 'exists' | 'deleted' }`
  - `planSync(input: { entries: LocalEntry[]; photos: LocalPhoto[]; repoShas: Map<string, string>; liveRefs: Map<string, string[]>; config: CmsConfig }): { changes: TreeChange[]; conflicts: Conflict[]; message: string; syncedKeys: string[]; uploadedPhotoUrls: string[] }`
    - `liveRefs`: post path → photo URLs it references on GitHub (for "used by another post" checks)
    - only `submitted` and `deleted` entries; drafts ignored
    - conflict when `baseSha` ≠ current sha (`changed`), `baseSha === null` but path exists (`exists`), or `baseSha` set but path gone (`deleted`)
    - submitted → file change (serialized) + base64 change for each referenced **local** photo
    - photos in `livePhotos` but no longer referenced, and not in any other path's `liveRefs` nor any other submitted entry → delete change
    - deleted entry → delete the `.md` + its `livePhotos` under the same rule
    - message: `cms: publish "A", update "B", delete "C"` (titles from `data.title`, singles by name)
  - `runSync(deps): Promise<{ commitSha: string }>` — fetch tree shas → `planSync` → if conflicts throw `SyncConflictError(conflicts)` → `commitChanges` → on `RefMovedError` retry once from a fresh tree → after success remove synced entries and uploaded photos from the workspace → if deploy `exists && active && !runsOnPush` call `dispatchDeploy`. Returns the commit sha. Workspace is untouched on any failure.

- [ ] **Step 1: Failing tests** (pure `planSync`; `runSync` with fakes):

```ts
// new submitted post + 2 local photos → 3 changes; message 'cms: publish "Medus"'
// draft entry → no changes
// baseSha 'abc' vs repo 'def' → conflicts [{ reason: 'changed' }], changes []
// new entry whose path exists → reason 'exists'
// edit removes /images/x.jpg still used by other.md (liveRefs) → no delete for x.jpg
// edit removes /images/y.jpg used nowhere → { path: 'public/images/y.jpg', delete: true }
// deleted entry → deletes .md and its unused photos; message 'cms: delete "Senas"'
// runSync: RefMovedError once then success → commitChanges called twice, entries removed
// runSync: commitChanges throws → workspace entries still present
// runSync: deploy { exists:true, active:true, runsOnPush:true } → dispatchDeploy not called;
//          { runsOnPush:false, active:true } → called once; { active:false } → not called
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat: one-commit sync with conflict checks`

---

### Task 7: Status and the sync bar

**Files:** Create `src/lib/status.ts`, `src/lib/status.test.ts`, `src/context/WorkspaceContext.tsx`, `src/components/sync/SyncBar.tsx`, `src/components/sync/ConflictDialog.tsx` (+ scss); modify `src/components/layout/Layout.tsx`, `src/context/ProjectContext.tsx`, `src/main.tsx` or `App.tsx` (provider)

**Interfaces:**
- Produces:
  - `deriveStatus(s: { syncing: boolean; pending: number; lastSync: { sha: string; at: number } | null; run: { status: string; conclusion: string | null } | null; deploy: { exists: boolean; active: boolean } | null; now: number }): { kind: 'syncing' | 'updating' | 'failed' | 'waiting' | 'live' | 'off'; text: string }`
    - order: syncing → (lastSync and deploy exists & active: run missing & < 10 min old or run not completed → updating; run completed & conclusion ≠ success → failed) → (lastSync and deploy missing/inactive → off, until pending > 0) → pending > 0 → waiting → live
  - `WorkspaceContext`: `{ entries, refresh(), pendingCount, sync(): Promise<void>, syncing, status, conflicts, resolveConflict(key, 'mine' | 'theirs' | 'later') }`; persists `lastSync` per project in `localStorage` (`marksman:lastSync:<projectId>`); polls the run every 15s only while status is `updating`.
  - `ProjectContext` stores `repoInfo: RepoInfo` (fetched with the config on open/switch).
- [ ] **Step 1: Failing tests** for `deriveStatus` — one per row of the order above, with exact `text` strings from Global Constraints (`1 change waiting`, `3 changes waiting`, `Saved — site updates are switched off`, …).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `deriveStatus`, the context, `SyncBar` (status text + `Sync` button disabled when `pendingCount === 0` or syncing; `Last update failed` links to the run URL), `ConflictDialog` (lists conflicts with buttons `Use mine` → set `baseSha` to current sha and keep `submitted`; `Use GitHub's` → remove entry; `Decide later` → close). Layout: remove the old dot/deploy code; render `SyncBar` in the top bar **except** on `/new` and `/edit/` routes.
- [ ] **Step 4: Run, verify pass**; `npm run build` passes.
- [ ] **Step 5: Commit** — `feat: sync bar with trustworthy status`

---

### Task 8: Config types, singles in the sidebar

**Files:** Modify `src/types/index.ts`, `src/components/layout/Layout.tsx`, `src/App.tsx`; create `src/lib/config.test.ts` (or extend an existing test)

**Interfaces:**
- Produces: `FieldType` adds `'gallery' | 'number'`; `FieldConfig.label?: string`; `interface SingleConfig { name: string; file: string; imageFolder?: string; imageUrlPrefix?: string; fields: FieldConfig[] }`; `CmsConfig.singles?: SingleConfig[]`; `fieldLabel(field: FieldConfig): string` (label ?? name). Route `/:owner/:repo/single/:single` (name URI-encoded).
- [ ] **Step 1: Failing test** — `fieldLabel({ name: 'seimos', type: 'number', label: 'bičių šeimos' })` → `'bičių šeimos'`; without label → name.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**; sidebar lists singles under collections (same nav item style); all field components use `fieldLabel`. Add-project / open errors distinguish GitHub 401 (`Token is invalid or expired`), 403 (`Token lacks access — needs Contents and Actions read/write on this repo`) and 404 (`Repo or .cms.json not found`).
- [ ] **Step 4: Verify** — tests pass; build passes; a config without `singles` renders as before.
- [ ] **Step 5: Commit** — `feat: single entries and field labels in config`

---

### Task 9: Fields — gallery, number, local photos

**Files:** Create `src/components/fields/GalleryField.tsx`, `NumberField.tsx`, `PhotoPicker.tsx` (+ scss), `src/components/fields/GalleryField.test.tsx`, `src/lib/order.ts`, `src/lib/order.test.ts`; modify `ImageField.tsx`, `MarkdownField.tsx`, `src/context/WorkspaceContext.tsx` (photo helpers)

**Interfaces:**
- Consumes: `processPhoto`, `photoFilename`, `randomSuffix`, `savePhoto`, `getPhoto`.
- Produces:
  - `moveItem<T>(list: T[], from: number, to: number): T[]`
  - Workspace helper `addPhotos(files: File[], slug: string, folder: string, prefix?: string): Promise<{ urls: string[]; errors: string[] }>` (numbers continue after the highest `n` already used for that slug); `photoSrc(url: string): string` (object URL for local photos, else `https://raw.githubusercontent.com/<owner>/<repo>/<defaultBranch>/<path>`)
  - `GalleryField` props `{ field, value: string[], onChange(urls), slug }`: drop zone + "Add photos" button (multiple), thumbnails with HTML5 drag-to-reorder **and** ←/→ buttons, `Cover` badge on index 0, ✕ remove, per-file error messages.
  - `NumberField` stores a `number` (empty input → field removed from data).
  - `PhotoPicker` (used by MarkdownField's image button): shows the post's gallery photos + "Add new"; picking inserts `![](url)` at the cursor; dropping/pasting files into the editor adds them to the gallery (via an `onAddToGallery(urls)` prop) and inserts them inline.
  - `ImageField` (Ember thumbnail) uploads through `addPhotos` instead of committing.
- [ ] **Step 1: Failing tests** — `moveItem(['a','b','c'], 2, 0)` → `['c','a','b']`; GalleryField: renders `Cover` on the first thumbnail; clicking the → button on the first photo calls `onChange` with the first two swapped; ✕ removes it.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, verify pass**; build passes.
- [ ] **Step 5: Commit** — `feat: photo strip, number field and local photo uploads`

---

### Task 10: Editor pages — Submit / Save draft, singles

**Files:** Modify `src/pages/PostEditorPage.tsx`; create `src/pages/SingleEditorPage.tsx`, `src/pages/PostEditorPage.test.tsx`

**Interfaces:**
- Consumes: workspace store, `fetchFile`, `parsePost`, `slugify`, `uniqueSlug`, `referencedPhotos`, field components.
- Behaviour:
  - Open existing slug: local entry if any, else GitHub file (record `baseSha` = file sha, `livePhotos` = `referencedPhotos(...)`).
  - New post: slug assigned on first Submit/Save draft from `slugify(title, today)` made unique against live file names + local entries; path `${folder}/${slug}.md`; never changes afterwards. Photos added before a title exists use a temporary slug `irasas-<today>` for filenames (acceptable; filenames need not match the final slug).
  - Buttons `Submit` and `Save draft` → `saveEntry` with state `submitted` / `draft` → navigate to the list. On storage error show `Couldn't save on this computer: <message>` and stay.
  - Unsaved-changes guard: `useBlocker` (react-router 6.30) / `beforeunload` while the form differs from what was loaded.
  - `SingleEditorPage`: same buttons, `kind: 'single'`, path = `single.file`, opens local entry or GitHub file (missing file → empty form, `baseSha: null`).
- [ ] **Step 1: Failing tests** (Testing Library, workspace via fake-indexeddb, `fetchFile` mocked): typing a title `Šablonas` and clicking `Submit` stores an entry with `slug: 'sablonas'`, `state: 'submitted'`, `baseSha: null`; `Save draft` stores `state: 'draft'`; editing an existing post keeps its slug when the title changes; no element with text `Sync` is rendered on the editor route.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat: submit and draft editing, single entry editor`

---

### Task 11: Post list — merged view, labels, delete/undo

**Files:** Modify `src/pages/PostListPage.tsx` (+ scss); create `src/lib/listing.ts`, `src/lib/listing.test.ts`; delete now-unused GitHub write functions and the `cms-drafts` code

**Interfaces:**
- Produces: `mergeListing(live: { path: string; title: string; date: string }[], entries: LocalEntry[]): { path: string; title: string; date: string; label: 'Live' | 'Draft' | 'Waiting to sync' | 'Will be deleted'; entryKey: string | null }[]` sorted by date desc (new local entries included).
- Behaviour: Delete on a live post → entry `state: 'deleted'` (with `baseSha`, `livePhotos`) and an `Undo` button; Delete on a draft or new post → confirm, then `removeEntry` + `removePhoto` for photos only it used. `beforeunload` warning on every page whenever `pendingCount > 0`.
- [ ] **Step 1: Failing tests** for `mergeListing`: live-only → `Live`; live + submitted entry → `Waiting to sync` with the entry's title; new submitted → included; draft → `Draft`; deleted → `Will be deleted`; order by date desc.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**; remove `putFile`, `uploadImage`, `deleteFile`, `ensureDraftsBranch`, `fetchSyncStatus`, `triggerDeploy` and their imports.
- [ ] **Step 4: Verify** — `npm test -- --run && npm run lint && npm run build`; `grep -rn "createOrUpdateFileContents\|deleteFile\|cms-drafts" src` returns nothing.
- [ ] **Step 5: Commit** — `feat: merged post list with sync labels`

---

### Task 12: GycioBiciukis renders `photos`

**Files (in `../GycioBiciukis`):** Modify `app/types/BlogPost.ts`, `app/utils/blog.ts`, `app/utils/blog.test.ts`, `app/_components/BlogPost/BlogPost.tsx` (+ scss), `.cms.json`; create `app/utils/photos.ts`, `app/utils/photos.test.ts`

**Interfaces:**
- Produces: `BlogPost.photos: string[]`; `thumbnail` = `photos[0]` ?? legacy `thumbnail` ?? `''`; `galleryOutsideBody(photos: string[], bodyMarkdown: string): string[]` (same contract as Marksman's); `BlogPost` gains `galleryPhotos: string[]` = photos after the cover that aren't inline.
- [ ] **Step 1: Failing tests** — no photos → `photos: []`, `thumbnail: ''`, `galleryPhotos: []`; one photo → thumbnail = it, gallery empty; three photos with the 2nd inline → gallery = [3rd]; legacy `thumbnail: /images/t.jpg` only → thumbnail = it, photos `[]`; `photos` given as a single string → treated as one-item list.
- [ ] **Step 2: Run, verify fail** — `npx vitest --run` in the site repo.
- [ ] **Step 3: Implement**; post page: cover (if any) full content width above the text, then `galleryPhotos` in a 2-column (1 on phones) grid of links to the full image. `.cms.json`: replace `thumbnail` with `{ "name": "photos", "type": "gallery" }`; add `"singles": [{ "name": "Bitynas skaičiais", "file": "app/_data/stats.md", "fields": [{ "name": "aviliai", "type": "number" }, { "name": "sodai", "type": "number" }, { "name": "seimos", "type": "number", "label": "bičių šeimos" }] }]`.
- [ ] **Step 4: Verify** — site `npx vitest --run && npm run lint && npm run build`.
- [ ] **Step 5: Commit (site repo, do not push)** — `feat: render photo galleries from Marksman`

---

### Task 13: End-to-end check (checkpoint with the user)

- [ ] **Step 1:** `npm run dev` in marksman; ask the user to approve a live test against **GycioBiciukis only** (its deploy is disabled, so nothing goes public; it does add commits to its `master`). Never test Sync against EmberInstruments — that would deploy the live site.
- [ ] **Step 2 (if approved):** with the site repo's Task 12 commit pushed first (ask), in the browser: create a post with 3 phone-size photos (reorder, set a cover, one inline), Save draft, reopen, Submit; edit the stats single; check the list labels; Sync; confirm exactly one new commit on GitHub containing the post, 3 JPEGs ≤ 2000px and `stats.md`, and status `Saved — site updates are switched off`. Then delete the test post and Sync again (one more commit removing the post and its photos).
- [ ] **Step 3:** open the EmberInstruments project and confirm it lists posts and opens one in the editor (no Sync).
- [ ] **Step 4:** report results; Marksman stays unpushed until the user decides (pushing deploys Marksman to GitHub Pages).
