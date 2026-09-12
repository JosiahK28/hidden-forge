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
```

## Deploy on GitHub Pages

1. Create a repository named `hidden-forge`. Set it to Public.
2. Upload every file and folder from this directory into the repository root. Drag-and-drop in the GitHub web UI works — no command line needed.
3. Go to **Settings → Pages**. Under Source, choose **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. The site goes live at `https://YOUR-USERNAME.github.io/hidden-forge/` within a couple of minutes.

Faster alternative with no account: drag the unzipped folder onto `app.netlify.com/drop`.

## Content status

- **Creed:** all seven pillars are complete — the verbatim text of the Synthesis of Order from the source Obsidian vault, not paraphrased.
- **Manifesto:** 6 of 14 planned chapters are drafted (Chapters I–VI). The rest are still to come.

## Editing content

**Add a Creed pillar.** Copy a `.pillar` block in `creed.html`. To include it in the audit, add an entry to `AUDIT_ITEMS` in `js/creed.js` — the form builds itself from that list, and the max possible score is always `AUDIT_ITEMS.length * 5`, so the `min` thresholds in `VERDICTS` need rescaling proportionally if you change the item count.

**Add a manifesto chapter.** Paste the text into `manifesto.html` and wrap each capturable passage in `<p class="excerpt" tabindex="0" role="button">`. No further wiring needed.

**Add decoder phrases.** Append to `PHRASE_MAP` in `js/lab.js`. Each entry needs `match` (an array of lowercase substrings) and `beneath` (the decoding).

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
