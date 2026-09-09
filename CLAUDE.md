# The Hidden Forge — project notes

A five-page static philosophy site. Hand-written HTML, CSS and JavaScript.
Deployed on GitHub Pages from the `main` branch, root folder.

## Hard constraints

- **No frameworks, no build step, no bundler.** No React, no Tailwind, no
  package.json. If a change seems to need one, say so and stop rather than
  introducing it.
- **Local storage remains the default and the fallback.** Every read/write goes
  through the `HF` store in `js/store.js`, never `localStorage` directly from a
  page script. Nothing should ever require an account to work.
- **Backend is Supabase (auth + journal sync), and it is a deliberate, approved
  exception** to "no backend," not accidental scope creep. Don't add any other
  backend or database. Every feature must keep working fully offline/signed-out.
- **External dependencies:** the Google Fonts import in `css/style.css`, and the
  Supabase JS CDN script loaded on every page before `store.js`. Don't add any
  other CDN scripts without updating this file.
- Every page must work from a `file://` open, not just a server, for everything
  that doesn't require the network (sign-in and cloud sync obviously need it).

## Layout

```
index.html        Home
creed.html        The Chimera Creed + Creed Audit
lab.html          Strike the Anvil + Red Pill Decoder
manifesto.html    Chapter excerpts + insight drawer
journal.html      The record — filter, add, delete, export
css/style.css     Design system, shared by all pages
js/store.js       localStorage journal store, loaded by all pages
js/creed.js       Audit items, scoring, verdicts
js/lab.js         Anvil ritual + decoder phrase map
js/manifesto.js   Click-to-capture excerpts
js/journal.js     Journal rendering and filtering
```

Every page loads `js/store.js` first, then its own script. Page scripts assume
`HF`, `hfFlash` and `hfParseTags` are already defined.

## Design system

Colours are CSS variables at the top of `css/style.css`. Never hardcode a hex
value in a page or a new rule — use the variables.

- Iron: `--ink`, `--ink-soft`, `--ink-card`, `--iron-line`
- Parchment: `--parchment`, `--parchment-70`, `--parchment-45`
- Forge gold marks what is earned: `--gold`, `--gold-bright`
- Ember red marks what is contested: `--red`, `--red-bright`

Type: Fraunces for display, Source Serif 4 for body, JetBrains Mono for chrome
(nav, labels, status lines). Body column is capped at `--col` (42rem). Content is
left-aligned throughout.

Keep motion minimal and user-triggered. `prefers-reduced-motion` is already
respected at the bottom of the stylesheet — don't add animation that bypasses it.

## Content conventions

- **Adding a Creed pillar**: copy a `.pillar` block in `creed.html`. To include it
  in the audit, add to `AUDIT_ITEMS` in `js/creed.js` — the max score is always
  `AUDIT_ITEMS.length * 5` (currently 35, 7 items × 5), computed dynamically, so
  only the `VERDICTS` `min` thresholds need rescaling if the item count changes.
- **Adding a manifesto passage**: wrap it in
  `<p class="excerpt" tabindex="0" role="button">`. The capture system picks it up
  with no further wiring.
- **Adding a decoder phrase**: append to `PHRASE_MAP` in `js/lab.js`. `match` is an
  array of lowercase substrings; `beneath` is the decoding.
- No page currently has placeholder/"draft scaffolding" prose — all live content is
  either sourced from the Obsidian vault or explicitly approved rewritten prose.
  If you add a placeholder `.callout` again, remove it once real content lands.

## Voice

Declarative and aphoristic. Concrete imagery over abstraction. Where a claim is
contested, state the opposing case at full strength before answering it. Sections
that give guidance end with a protocol — a specific act, not a sentiment.

Interface copy is plain and active: a button says what happens when it's pressed,
and the same action keeps the same name everywhere. Empty states give a direction,
not an apology.

## Before committing

- Open every page you touched and click through its tools.
- Check the journal still reads and writes after any change to `js/store.js`.
- Check the layout at a narrow width; the site must hold at phone size.
- Confirm keyboard focus is visible on anything interactive you added.
