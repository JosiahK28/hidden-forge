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

## Editing content

**Add a Creed pillar.** Copy a `.pillar` block in `creed.html`. To include it in the audit, add an entry to `AUDIT_ITEMS` in `js/creed.js` — the form builds itself from that list, and the scoring bands in `VERDICTS` are keyed to a 45-point maximum, so adjust `min` values if you change the item count.

**Add a manifesto chapter.** Paste the text into `manifesto.html` and wrap each capturable passage in `<p class="excerpt" tabindex="0" role="button">`. No further wiring needed.

**Add decoder phrases.** Append to `PHRASE_MAP` in `js/lab.js`. Each entry needs `match` (an array of lowercase substrings) and `beneath` (the decoding).

**Change the palette.** All colours are CSS variables at the top of `css/style.css`.

## Data

The journal lives in browser localStorage under the key `hf_journal_v1`. It never leaves the device. Clearing browser data deletes it — use Export Markdown for anything worth keeping.
