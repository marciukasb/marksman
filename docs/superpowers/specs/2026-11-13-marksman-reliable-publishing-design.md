# Marksman — Reliable Publishing Design

**Date:** 2026-11-13
**Status:** Draft, awaiting approval
**Repos:** `marciukasb/marksman` (main work) and `marciukasb/GycioBiciukis` (small site change, see the end)

---

## Intent

Marksman is the user's client-side CMS for their static sites. It runs on GitHub Pages at https://marciukasb.github.io/marksman/, talks to GitHub through the REST API, and each site describes its content in a `.cms.json` file. It currently serves EmberInstruments (the user's own site) and now GycioBiciukis, a beekeeping site that is a Christmas 2026 present for the user's dad.

The dad will post on his own: what he built, what he learned, and updates from the hives. He is technical (he works in IT), so the aim isn't to simplify Marksman for a beginner. The aim is to make it **reliable and free of friction**, because if posting is fiddly or confusing he'll stop. He writes at a Windows computer, and photos come from his Android phone through Windows Phone Link.

What the user found confusing or unreliable in today's Marksman:
- You can't drag and drop images.
- It isn't clear what the separate thumbnail upload does and what the image button in the Markdown editor does.
- Every action commits straight to GitHub. Every image upload and every save is its own commit, and so its own deploy.
- The sync dot guesses its status from git history, so the user's own code commits can show up as "unsynced" and confuse the dad.
- Drafts are saved to a `cms-drafts` branch and can't be opened again.
- Uploading an image with a name that already exists silently overwrites the old file.
- Slugs drop Lithuanian letters ("Šablonas" becomes "ablonas").

## Goals

1. **Nothing is committed until Sync.** Creating, editing and deleting posts, and adding photos, all happen locally. **Sync** sends every submitted change in **one commit**, which triggers **one deploy**.
2. **A clear lifecycle for each post:** an author ends editing with **Submit** (ready to go live at the next Sync) or **Save draft** (stays behind).
3. **Photos the Vinted way:** drop several photos at once, drag to reorder; the first one is the cover. Inline placement in the text stays possible.
4. **Status the dad can trust:** it reflects only his pending changes and the deploy's progress, and never the user's code commits.
5. Photos are shrunk before upload, filenames never collide, and slugs keep Lithuanian letters by transliterating them.
6. The stats numbers can be edited as a **single entry**.
7. EmberInstruments keeps working.

## Non-goals

- Translating the Marksman UI (it stays **English**).
- Syncing drafts across devices or browsers.
- A mobile-first editor, or starting posts on the phone. Possibly later.
- Multi-user editing, roles or a backend. Marksman stays fully client-side.
- Replacing GitHub tokens with OAuth.

## Anti-goals (failure even if it technically works)

- The dad loses a post he wrote.
- The status says something is wrong when nothing is, or says everything is live when it isn't.
- Sync silently overwrites changes the user made to the repo.
- Pressing a button commits half-finished work to the live site.

---

## Behaviour (decided)

### Local workspace

- All edits live in the browser, per project. Photos are large, so store them in **IndexedDB** rather than `localStorage`.
- Each post the author touches is an **entry** with one of these local states:

| State | Meaning | Goes out on Sync? |
| --- | --- | --- |
| `draft` | saved with "Save draft" | no |
| `submitted` | new or edited post, saved with "Submit" | yes (create/update) |
| `deleted` | live post marked for deletion | yes (delete) |

  Live posts the author hasn't touched have no local entry; they're read from GitHub as they are now.
- **Unsynced work stays only on that computer.** The UI must make it obvious when something is waiting (see Status). It may also warn before the tab closes when submitted changes haven't been synced (builder's call).
- After a successful Sync, entries that went out are cleared from local storage. Drafts remain.

### Post list page

- Shows live posts from GitHub merged with local entries. Each post has a clear label: **Live**, **Draft**, **Waiting to sync** (new or edited) or **Will be deleted**.
- Opening a live post loads it from GitHub. If it already has a local entry, that local version opens instead.
- Deleting a live post marks it `deleted` (an undo is possible until Sync). Deleting a draft or a new unsynced post removes it locally straight away, after a confirmation.

### Editor page

- **No Sync button and no sync status** on this page.
- It ends with two buttons: **Submit** (state `submitted`) and **Save draft** (state `draft`). Both go back to the list.
- Leaving with unsaved edits asks for confirmation.
- Submitted and draft posts can be reopened and changed any number of times before Sync. Submitting a draft moves it to `submitted`.

### Sync

- The **Sync** button sits in the top bar on every screen except the editor. It's disabled when nothing is submitted.
- Sync takes every `submitted` and `deleted` entry (never drafts), uploads the photos they reference, and makes **one commit on the default branch**. Use the Git Data API: create blobs, create a tree on top of the **latest** default-branch commit, create the commit, then update the ref. The commit message starts with `cms:` and summarises the changes, e.g. `cms: publish "X", update "Y", delete "Z"`.
- **Only the touched files** (posts, their photos, the single entry) change in the tree. Everything else comes from the latest commit, so the user's code commits are never reverted.
- **Conflict check:** each entry remembers the blob SHA of the file it started from (or "new"). If that file changed on GitHub since then, or a "new" post's path now exists, Sync **makes no commit at all** and lists the affected posts. The author can then:
  - overwrite with their version,
  - discard their version,
  - or leave it waiting.

  (A conflict should be rare; the exact UI is the builder's call.)
- If the ref update fails because the branch moved during the Sync, retry once on the new head, as long as the conflict check still passes.
- After the commit, **trigger the deploy workflow** if `.cms.json` declares `deployWorkflow` and the push alone doesn't trigger it. Both sites' workflows also run on push, so the builder must make sure exactly **one** deploy runs per Sync (e.g. rely on the push trigger, and only dispatch when the workflow has no push trigger or the config says so).
- A failed Sync keeps every local entry intact and shows a clear error.

### Status (top bar, next to Sync)

Plain text, chosen in this order:
1. **"Syncing…"** while a Sync is running.
2. **"Updating the site…"** while the deploy workflow run for the latest Sync commit is queued or running.
3. **"Last update failed"** if that run failed. Link to the run on GitHub for the user.
4. **"N changes waiting"** when there are submitted or deleted entries.
5. **"Everything is live"** otherwise.

- Drafts don't count as changes waiting. They're shown on the list page only.
- The status tracks **the deploy run started by its own Sync commit**, matched by commit SHA. It ignores every other commit, so the user's code pushes never affect it. Remembering the last Sync commit SHA in local storage is enough.
- If the deploy workflow is disabled or missing (as on GycioBiciukis until launch), the status must not get stuck on "Updating the site…". After a reasonable wait with no run appearing, show **"Saved — site updates are switched off"** or similar. The exact wording is the builder's call.

### Photos (new `gallery` field type)

- In `.cms.json`, a field `{ "name": "photos", "type": "gallery" }` stores an **ordered list of image paths** in front matter:
  ```yaml
  photos:
    - /images/sablonas-aviliu-remams-1-k3x9.jpg
    - /images/sablonas-aviliu-remams-2-p7q2.jpg
  ```
- **Editor UI:** a photo strip at the top of the form:
  - drop several files onto it, or pick them with a button;
  - thumbnails can be **dragged to reorder**;
  - the first one has a **"Cover"** badge;
  - each one has a remove ✕.
- **Inline photos:** the Markdown editor's image button opens a picker showing this post's gallery photos (and can add new ones) and inserts `![](/images/…)` at the cursor. A photo placed inline is also left out of the gallery shown below the text on the site.
- The Markdown editor also accepts photos dropped or pasted into it, which adds them to the gallery and inserts them inline.
- **Processing before storage:** every photo is decoded in the browser, scaled so the long edge is at most **2000px**, and encoded as **JPEG** at about 0.82 quality. EXIF orientation must be respected. Unreadable files (e.g. HEIC where the browser can't decode it) show a clear message.
- **Filenames:** `<slug>-<n>-<random4>.jpg` (random part lowercase alphanumeric). Never reuse an existing name.
- Photos removed before Sync are never uploaded. Photos removed from an already-live post are **deleted from the repo** in the same Sync commit, but only if no other post references them.
- **Previews:** local photos use object URLs. Already-live photos keep using raw.githubusercontent.com, as today.
- The existing `image` and `markdown` field types keep working for collections that use them (Ember). Their uploads must also go through the local workspace and Sync, not commit immediately.

### Slugs

- When a post is first created, its slug comes from the title with Lithuanian letters (and other diacritics) **transliterated**: ą→a, č→c, ę→e, ė→e, į→i, š→s, ų→u, ū→u, ž→z. Example: "Šablonas avilių rėmams" → `sablonas-aviliu-remams`. Then lowercase, hyphens, no leading or trailing hyphens. An empty result falls back to `irasas-<date>`.
- **The slug is fixed** once the entry exists. Editing the title later doesn't change it.
- A slug that collides with an existing post or local entry gets a `-2`, `-3`… suffix.

### Single entries (new config type)

- `.cms.json` gains a top-level list of single entries, e.g.:
  ```json
  "singles": [
    {
      "name": "Bitynas skaičiais",
      "file": "app/_data/stats.md",
      "fields": [
        { "name": "aviliai", "type": "number" },
        { "name": "sodai", "type": "number" },
        { "name": "seimos", "type": "number", "label": "bičių šeimos" }
      ]
    }
  ]
  ```
  The exact shape is the builder's call, but it must be backwards compatible: configs without it keep working.
- Single entries appear in the sidebar under the collections and open straight into their form, with no list, new or delete.
- Changes follow the same **Submit / Save draft / Sync** flow as posts.
- A `number` field type (numeric input, stored as a YAML number) is added for this. An optional `label` on any field sets the display name.

### Front matter

- The serializer must support **lists of strings** (for `gallery`) and **numbers** (for `number`), as well as today's strings.
- Strings that YAML would read as another type must be quoted, e.g. `title: "2025"`, `true`, `null`. (The site now coerces such values defensively anyway.)
- Round-tripping an existing Ember or GycioBiciukis post without changes must produce identical front-matter values.

### Access for the dad

- He uses the same GitHub Pages URL on his Windows computer, with a **fine-grained token** created on the user's account. The token covers only GycioBiciukis, with Contents and Actions read/write.
- No code is needed for this beyond the existing "Add project" flow. Validation errors when adding a project should say which permission is missing when the GitHub API makes that possible.

---

## Constraints

- **Stack (existing):** Vite + React 18 + TypeScript, `react-router-dom` (HashRouter), `@octokit/rest`, `@uiw/react-md-editor`, SCSS modules, and Vitest + Testing Library (jsdom). It's deployed by `.github/workflows/deploy.yml` to GitHub Pages.
- Fully client-side. Tokens stay in `localStorage` per browser, as today.
- **The default branch is not always `master`.** Read it from the repo (`GET /repos/{owner}/{repo}`) instead of hard-coding it (that's hard-coded in several places today).
- **Ember must keep working.** Its `.cms.json` (with `image` + `markdown` fields) must load, edit and Sync correctly under the new flow.
- **GycioBiciukis's deploy workflow is disabled** until launch on purpose. Marksman must handle that cleanly (see Status) and must **not** re-enable it.
- **Deadline:** usable by the dad on **Christmas 2026**.

## Current state

The relevant files today:
- `src/lib/github.ts`: one API call per action (`putFile`, `uploadImage` commits immediately, `ensureDraftsBranch`, `fetchSyncStatus` compares commits, `triggerDeploy`).
- `src/lib/frontmatter.ts`: flat string front matter and the ASCII-only `generateSlug`.
- `src/pages/PostEditorPage.tsx`: Publish and Save draft both commit.
- `src/components/fields/*`: one component per field type.
- `src/components/layout/Layout.tsx`: the sidebar, project switcher, sync dot and Sync button.

Tests exist for `frontmatter` and `storage`.

## Left to the builder

- Component and module breakdown, and the IndexedDB wrapper (a tiny hand-written one or a small library).
- The drag-to-reorder implementation.
- The conflict-resolution UI details.
- How the status polls (interval, backoff).
- Status wording, beyond the states listed above.

---

## Related change: GycioBiciukis site

Make this change to the site repo alongside the Marksman work (it's small):

- `.cms.json`: replace the `thumbnail` field with `{ "name": "photos", "type": "gallery" }`, and add the `singles` entry for `app/_data/stats.md`.
- `BlogPost` gains `photos: string[]`. The thumbnail becomes `photos[0]`, or the old `thumbnail` field if present, so hand-written posts still work.
- **Post page:**
  - the cover photo large at the top (if any),
  - then the text,
  - then the remaining photos that aren't already used inline in the text, as a simple grid where tapping a photo opens the full image.
- RSS and cards keep using the cover photo.
- Tests cover a post with: no photos, one photo, several photos, some photos used inline, and a legacy `thumbnail` only.
