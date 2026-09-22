# The Hidden Forge

A five-page static site. Hand-written HTML, CSS and JavaScript. No framework, no build step, no backend.

## Files

```
index.html        Home
creed.html        The Chimera Creed + Creed Audit
lab.html          Strike the Anvil + Red Pill Decoder
manifesto.html    Chapter excerpts + insight drawer
journal.html      The record — filter, add, delete, export
css/style.css     Design system (all pages)
js/store.js       localStorage journal store (all pages)
js/creed.js       Audit statements, scoring, verdicts
js/lab.js         Anvil ritual + decoder phrase map
js/manifesto.js   Click-to-capture excerpts
js/journal.js     Journal rendering and filtering
vault.html        Private vault dashboard (owner only, not in nav)
js/vault.js       Vault dashboard rendering
third-brain.html  Private Third Brain map (owner only, in nav)
js/third-brain.js Third Brain force-graph rendering
```

## Deploy on GitHub Pages

1. Create a repository named `hidden-forge`. Set it to Public.
2. Upload every file and folder from this directory into the repository root. Drag-and-drop in the GitHub web UI works — no command line needed.
3. Go to **Settings → Pages**. Under Source, choose **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. The site goes live at `https://YOUR-USERNAME.github.io/hidden-forge/` within a couple of minutes.

Faster alternative with no account: drag the unzipped folder onto `app.netlify.com/drop`.

## Content status

- **Creed:** all seven pillars are complete — the verbatim text of the Synthesis of Order from the source Obsidian vault, not paraphrased.
- **Manifesto:** all 14 chapters are drafted (Chapters I–XIV). Complete.

## Editing content

**Add a Creed pillar.** Copy a `.pillar` block in `creed.html`. To include it in the audit, add an entry to `AUDIT_ITEMS` in `js/creed.js` — the form builds itself from that list, and the max possible score is always `AUDIT_ITEMS.length * 5`, so the `min` thresholds in `VERDICTS` need rescaling proportionally if you change the item count.

**Add a manifesto chapter.** Paste the text into `manifesto.html` and wrap each capturable passage in `<p class="excerpt" tabindex="0" role="button">`. No further wiring needed.

**Add decoder phrases.** The Red Pill Decoder is a static, no-input list. Append a `{ surface, beneath }` entry to the right group's `phrases` array in `DECODER_GROUPS` in `js/lab.js` (or add a new group for a new subject). Each group renders as its own collapsed `<details>` dropdown.

**Change the palette.** All colours are CSS variables at the top of `css/style.css`.

## Data

The journal always lives in browser localStorage under the key `hf_journal_v1` first. Clearing browser data deletes the local copy — use Export Markdown for anything worth keeping.

Signing in (optional, magic-link email, top right of every page) additionally syncs entries to a Supabase project, so a journal can follow you to another browser or device. Signing out clears the local copy on that device but leaves the account's data untouched in the cloud. Skip sign-in entirely and the journal behaves exactly as before: local-only, nowhere else.

### Cloud sync setup (for anyone forking this)

The Supabase project URL and anon public key are hardcoded in `js/store.js` — the anon key is meant to be public and is safe to commit; access control is enforced by Postgres row-level security, not by keeping the key secret. To point this at your own Supabase project:

1. Create a free project at supabase.com.
2. In the SQL editor, create a `journal_entries` table (`id text primary key`, `user_id uuid references auth.users`, `ts bigint`, `text text`, `tags text[]`, `source text`) with row-level security enabled and select/insert/delete policies scoped to `auth.uid() = user_id`.
3. In Authentication → Providers, enable Email with magic links. In Authentication → URL Configuration, add this site's URL(s) to the allowed redirect list.
4. Replace `HF_SUPABASE_URL` and `HF_SUPABASE_ANON_KEY` at the top of `js/store.js` with your project's values (Project Settings → API).

## Private vault dashboard

`vault.html` shows live stats from the owner's Obsidian vault — writing output, project status, vault health, recent and open work — only to the owner's signed-in account. It isn't linked from the nav; bookmark it.

One-time setup on the laptop (fish shell):

1. `python3 ~/hidden-forge/_tools/vault_dashboard.py setup` — asks for the vault path and your sign-in email, creates a private push key in `~/.config/forge-dashboard/`, and writes a filled-in `setup.sql` there.
2. Open Supabase → SQL Editor, paste `~/.config/forge-dashboard/setup.sql`, run it.
3. `fish ~/hidden-forge/_tools/install.fish` — installs the keeper timer and does the first push.

### The keeper

`_tools/forge_sync.py` is the one scheduled job (`forge-sync.timer`, every 15 minutes). Each run: pushes the vault to GitHub only if git says something changed, uploads dashboard stats only if the numbers moved, and re-exports the Third Brain map only if a Principle or Work changed. An idle run makes no network request and logs nothing, so `journalctl --user -u forge-sync` reads as a list of real events. It also clears a stale `.git/index.lock` in the vault, which otherwise silently blocks every backup. `python3 _tools/forge_sync.py --check` says what it would do and changes nothing. Installing it retires the older `forge-dashboard.timer` and `vault-sync.timer`.

`python3 _tools/vault_dashboard.py build` prints the payload without uploading it. Titles under `01-Projects/Second Brain/03_People` are redacted by default; change `redact` in `~/.config/forge-dashboard/config.json`.

## Private Third Brain map

`third-brain.html` is an interactive force graph of the owner's beliefs, values and
argumentative principles — mapped from the vault's `01-Projects/Third Brain` project — visible
only to the owner's signed-in account. Unlike the vault dashboard it **is** linked from the nav
("Third Brain"); the page itself is still gated, `noindex` keeps it out of search results.

One-time setup:

1. `python3 ~/hidden-forge/_tools/third_brain_push.py setup` — asks for the vault path and your
   sign-in email, creates a private push key in `~/.config/forge-dashboard/`, and writes a
   filled-in `third_brain_setup.sql` there.
2. Open Supabase → SQL Editor, paste `~/.config/forge-dashboard/third_brain_setup.sql`, run it.
3. `python3 ~/hidden-forge/_tools/third_brain_push.py push` — does the first push.

Re-run `push` by hand whenever Principles or Works change in the vault; unlike the vault
dashboard this isn't on a timer. `third_brain_push.py build` prints the payload without
uploading it.
