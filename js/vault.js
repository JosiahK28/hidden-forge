/* ============================================================
   THE HIDDEN FORGE — private vault dashboard
   Reads one row from Supabase (`vault_dashboard`). Row-level
   security hands it only to the owner's signed-in session; any
   other visitor gets nothing back. The row is written by
   _tools/vault_dashboard.py on the owner's laptop.
   ============================================================ */

(function () {
  const REFRESH_MS = 5 * 60 * 1000;
  const STALE_MIN = 90;

  const gate = document.getElementById('vault-gate');
  const gateText = document.getElementById('vault-gate-text');
  const gateActions = document.getElementById('vault-gate-actions');
  const body = document.getElementById('vault-body');
  const fresh = document.getElementById('vault-fresh');
  const tip = document.getElementById('vault-tip');
  const SVG = 'http://www.w3.org/2000/svg';

  let lastData = null;
  let lastGenerated = null;
  let loading = false;

  /* ---------- small helpers ---------- */

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v);
    }
    kids.flat().forEach(k => { if (k != null && k !== false) el.append(k instanceof Node ? k : String(k)); });
    return el;
  }
  function s(tag, attrs) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  }
  const fmt = n => (n == null ? '—' : Number(n).toLocaleString());
  const signed = n => (n == null ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString());
  const plural = (n, w) => `${fmt(n)} ${w}${n === 1 ? '' : 's'}`;

  function parseLocal(iso) { return iso ? new Date(iso.length <= 10 ? iso + 'T00:00' : iso) : null; }
  function ago(iso) {
    const d = parseLocal(iso);
    if (!d || isNaN(d)) return '—';
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} h ago`;
    const days = Math.round(hrs / 24);
    if (days < 45) return `${days} d ago`;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const dayLabel = iso => parseLocal(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtBytes = b => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB';

  function showTip(evt, text) {
    tip.textContent = text;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = evt.clientX + 12, y = evt.clientY + 12;
    if (evt.clientX == null) { const b = evt.target.getBoundingClientRect(); x = b.right + 6; y = b.top; }
    if (x + r.width > window.innerWidth - 8) x = Math.max(8, x - r.width - 24);
    if (y + r.height > window.innerHeight - 8) y = Math.max(8, y - r.height - 24);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip() { tip.hidden = true; }
  function bindTip(el, text) {
    el.setAttribute('aria-label', text);
    el.addEventListener('mousemove', e => showTip(e, text));
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('focus', e => showTip(e, text));
    el.addEventListener('blur', hideTip);
  }

  function tile(label, value, sub, warn) {
    return h('div', { class: 'tile' },
      h('span', { class: 'label', text: label }),
      h('span', { class: 'value' + (warn ? ' warn' : ''), text: value }),
      sub ? h('span', { class: 'sub', text: sub }) : null);
  }
  function panel(num, title, ...kids) {
    return h('section', { class: 'vault-panel' },
      h('h2', {}, h('span', { class: 'panel-num', text: num }), title), ...kids);
  }
  const LIST_CAP = 8;
  function list(items, render, emptyText) {
    const ul = h('ul', { class: 'vlist' });
    if (!items || !items.length) { ul.append(h('li', { class: 'empty', text: emptyText })); return ul; }
    items.slice(0, LIST_CAP).forEach(i => ul.append(render(i)));
    if (items.length <= LIST_CAP) return ul;
    const more = h('ul', { class: 'vlist' });
    items.slice(LIST_CAP).forEach(i => more.append(render(i)));
    return h('div', {}, ul, h('details', {}, h('summary', { text: `Show ${items.length - LIST_CAP} more` }), more));
  }
  const row = (title, sub, right, cls) =>
    h('li', {}, h('span', { class: 't' + (cls ? ' ' + cls : '') }, title, sub ? h('small', { text: sub }) : null),
      h('span', { class: 'r', text: right }));
  function table(heads, rows) {
    return h('table', { class: 'vtable' },
      h('thead', {}, h('tr', {}, heads.map(x => h('th', { text: x })))),
      h('tbody', {}, rows.map(r => h('tr', {}, r.map((c, i) => h('td', { class: i && typeof c === 'number' ? 'n' : null, text: typeof c === 'number' ? c.toLocaleString() : c }))))));
  }

  /* ---------- charts ---------- */

  function heatmap(days) {
    const cols = Math.ceil(days.length / 7);
    const cell = 13, gap = 2, left = 26, top = 16;
    const W = left + cols * (cell + gap), H = top + 7 * (cell + gap);
    const max = Math.max(1, ...days.map(d => d.touched));
    const step = v => v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4));
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Notes touched per day, last six months' });
    ['Mon', 'Wed', 'Fri'].forEach((l, i) => {
      const t = s('text', { x: 0, y: top + (i * 2) * (cell + gap) + cell - 3 }); t.textContent = l; svg.append(t);
    });
    let lastMonth = -1;
    days.forEach((d, i) => {
      const c = Math.floor(i / 7), r = i % 7;
      const date = parseLocal(d.d);
      if (r === 0 && date.getMonth() !== lastMonth) {
        lastMonth = date.getMonth();
        const t = s('text', { x: left + c * (cell + gap), y: 10 });
        t.textContent = date.toLocaleDateString(undefined, { month: 'short' });
        svg.append(t);
      }
      const rect = s('rect', {
        class: 'cell', x: left + c * (cell + gap), y: top + r * (cell + gap),
        width: cell, height: cell, rx: 2, fill: `var(--heat-${step(d.touched)})`, tabindex: '-1'
      });
      bindTip(rect, `${dayLabel(d.d)} — ${plural(d.touched, 'note')} touched${d.created ? `, ${d.created} new` : ''}`);
      svg.append(rect);
    });
    const legend = h('div', { class: 'heat-legend' }, 'Less',
      [0, 1, 2, 3, 4].map(i => { const x = h('i'); x.style.background = `var(--heat-${i})`; return x; }), 'More');
    return h('div', { class: 'chart' }, h('p', { class: 'chart-title', text: 'Notes touched per day — 26 weeks' }), svg, legend);
  }

  function netBars(daily) {
    const wrap = h('div', { class: 'chart' }, h('p', { class: 'chart-title', text: 'Net words per day — last 30 days' }));
    if (!daily.length) {
      wrap.append(h('p', { class: 'hint', text: 'Needs two days of history. The line fills in as the timer runs.' }));
      return wrap;
    }
    const W = 520, H = 170, padL = 44, padB = 20, padT = 8;
    const vals = daily.map(d => d.net);
    const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals);
    const span = (hi - lo) || 1;
    const y = v => padT + (hi - v) / span * (H - padT - padB);
    const slot = (W - padL) / Math.max(daily.length, 12);
    const bw = Math.max(3, Math.min(18, slot - 4));
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Net words written per day' });
    const ticks = [hi, 0, lo].filter((v, i, a) => a.indexOf(v) === i);
    ticks.forEach(v => {
      svg.append(s('line', { class: v === 0 ? 'base' : 'grid', x1: padL, x2: W, y1: y(v), y2: y(v) }));
      const t = s('text', { x: padL - 6, y: y(v) + 3, 'text-anchor': 'end' }); t.textContent = signed(v); svg.append(t);
    });
    daily.forEach((d, i) => {
      const x = padL + i * slot + (slot - bw) / 2;
      const top = y(Math.max(d.net, 0)), bot = y(Math.min(d.net, 0));
      const hgt = Math.max(1, bot - top);
      const g = s('g');
      const hit = s('rect', { class: 'hit', x: padL + i * slot, y: padT, width: slot, height: H - padT - padB });
      // rounded at the data end only, square at the baseline
      const r = Math.min(4, bw / 2, hgt);
      const path = d.net >= 0
        ? `M${x},${bot} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${bot} Z`
        : `M${x},${top} V${bot - r} Q${x},${bot} ${x + r},${bot} H${x + bw - r} Q${x + bw},${bot} ${x + bw},${bot - r} V${top} Z`;
      const bar = s('path', { class: d.net >= 0 ? 'bar-pos' : 'bar-neg', d: path });
      bindTip(hit, `${dayLabel(d.d)} — ${signed(d.net)} words`);
      g.append(hit, bar);
      svg.append(g);
    });
    const first = s('text', { x: padL, y: H - 4 }); first.textContent = dayLabel(daily[0].d);
    const last = s('text', { x: W, y: H - 4, 'text-anchor': 'end' }); last.textContent = dayLabel(daily[daily.length - 1].d);
    svg.append(first, last);
    wrap.append(svg, h('details', {}, h('summary', { text: 'Show as table' }),
      table(['Day', 'Net words'], daily.slice().reverse().map(d => [dayLabel(d.d), signed(d.net)]))));
    return wrap;
  }

  function hbars(items, label) {
    const max = Math.max(1, ...items.map(i => i.value));
    const grid = h('div', { class: 'hbar', role: 'list', 'aria-label': label });
    items.forEach(i => {
      const fill = h('div', { class: 'fill' });
      fill.style.width = (i.value / max * 100) + '%';
      const track = h('div', { class: 'track' }, fill);
      bindTip(track, `${i.name}: ${fmt(i.value)} words`);
      grid.append(h('span', { class: 'name', title: i.name, role: 'listitem', text: i.name }), track,
        h('span', { class: 'num', text: fmt(i.value) }));
    });
    return grid;
  }

  /* ---------- panels ---------- */

  function writingPanel(w) {
    return panel('01', 'Writing output',
      h('div', { class: 'tiles' },
        tile('Words in the vault', fmt(w.total_words), plural(w.total_notes, 'note')),
        tile('Words, last 7 days', signed(w.words_7d), w.words_7d == null ? `history starts ${w.history_since || '—'}` : 'net change'),
        tile('New notes, 7 days', fmt(w.notes_created_7d)),
        tile('Current streak', plural(w.streak, 'day'), `longest ${w.longest_streak} · ${w.active_days_30}/30 active`)),
      h('div', { class: 'vault-grid' },
        h('div', { class: 'card' }, heatmap(w.heatmap)),
        h('div', { class: 'card' }, netBars(w.daily_net))));
  }

  function projectCard(p) {
    const days = p.last ? (Date.now() - parseLocal(p.last)) / 86400000 : 999;
    const chips = Object.entries(p.status).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
      h('span', { class: 'chip-s' + (/draft|open|raw|fragment|unanswered|partial/.test(k) ? ' open' : /locked|complete|resolved|canonical/.test(k) ? ' done' : ''), text: `${k} ${v}` }));
    const secItems = p.sections.filter(x => x.notes).map(x => ({ name: x.name.replace(/^\d+_/, ''), value: x.words }));
    const empty = p.sections.filter(x => !x.notes).map(x => x.name.replace(/^\d+_/, ''));
    const w7 = p.words_7d == null ? null : h('span', { class: p.words_7d >= 0 ? 'up' : 'down', text: ` · ${signed(p.words_7d)} this week` });
    const card = h('div', { class: 'card project' + (days < 3 ? ' recent' : '') },
      h('h3', { text: p.name }),
      h('p', { class: 'meta' }, `${plural(p.notes, 'note')} · ${fmt(p.words)} words · edited ${ago(p.last)}`, w7,
        p.open_tasks ? ` · ${p.open_tasks} open / ${p.done_tasks} done tasks` : ''),
      chips.length ? h('div', { class: 'chips' }, chips) : null,
      secItems.length ? hbars(secItems, `${p.name} words by section`) : null,
      empty.length ? h('p', { class: 'hint', text: `Empty: ${empty.join(', ')}` }) : null);
    if (p.pieces.length) {
      card.append(h('details', {}, h('summary', { text: `${p.pieces.length} chapters & drafts` }),
        table(['Piece', 'Words', 'Status', 'Edited'], p.pieces.map(x => [x.title, x.words, x.status || '—', ago(x.mtime)]))));
    }
    return card;
  }

  function projectsPanel(projects) {
    const sorted = projects.slice().sort((a, b) => (b.last || '').localeCompare(a.last || ''));
    return panel('02', 'Projects',
      h('div', { class: 'card' }, h('p', { class: 'chart-title', text: 'Words by project' }),
        hbars(projects.slice().sort((a, b) => b.words - a.words).map(p => ({ name: p.name, value: p.words })), 'Words by project')),
      h('div', { class: 'vault-grid', style: 'margin-top:1.25rem' }, sorted.map(projectCard)));
  }

  function healthPanel(hl) {
    const inboxSub = hl.inbox.count ? `oldest ${ago(hl.inbox.oldest)}${hl.inbox.needs_review ? ` · ${hl.inbox.needs_review} need review` : ''}` : 'clear';
    const unsyncedSub = `last backup ${ago(hl.last_commit)}`;
    return panel('03', 'Vault health',
      h('div', { class: 'tiles' },
        tile('Inbox', fmt(hl.inbox.count), inboxSub, hl.inbox.count > 10),
        tile('Broken links', fmt(hl.broken_links.count), null, hl.broken_links.count > 0),
        tile('Orphan notes', fmt(hl.orphans.count), `${hl.no_backlinks} with no backlinks`),
        tile('Untagged', fmt(hl.untagged), `${hl.no_frontmatter} without properties`),
        tile('Uncommitted files', fmt(hl.unsynced_changes), unsyncedSub, hl.unsynced_changes > 25),
        tile('Attachments', fmt(hl.attachments.count), `${fmtBytes(hl.attachments.bytes)} · ${hl.canvases} canvases`)),
      h('div', { class: 'vault-grid' },
        h('div', { class: 'card' }, h('p', { class: 'chart-title', text: 'Broken links' }),
          list(hl.broken_links.items, b => row(`[[${b.target}]]`, `in ${b.from}`, ''), 'Every link lands.')),
        h('div', { class: 'card' }, h('p', { class: 'chart-title', text: 'Orphans — no links in or out' }),
          list(hl.orphans.items, o => row(o.title, o.project, ''), 'No orphans.')),
        h('div', { class: 'card' }, h('p', { class: 'chart-title', text: 'Inbox — oldest first' }),
          list(hl.inbox.items, i => row(i.title, `${fmt(i.words)} words`, ago(i.mtime)), 'Inbox is empty. Capture something.'),
          hl.stubs.count ? h('p', { class: 'hint', text: `${hl.stubs.count} stub notes under 30 words.` }) : null,
          hl.empty_folders.length ? h('p', { class: 'hint', text: `Empty folders: ${hl.empty_folders.join(', ')}` }) : null)));
  }

  function workPanel(wk) {
    return panel('04', 'Recent & open work',
      h('div', { class: 'vault-grid' },
        h('div', { class: 'card' }, h('p', { class: 'chart-title', text: 'Recently edited' }),
          list(wk.recent, n => row(n.title, n.project + (n.section ? ' / ' + n.section.replace(/^\d+_/, '') : ''), ago(n.mtime)), 'Nothing edited yet.')),
        h('div', { class: 'card' }, h('p', { class: 'chart-title', text: `Open tasks — ${wk.open_tasks.count}` }),
          list(wk.open_tasks.items, t => row(t.task, `${t.title} · ${t.project}`, '', 'task'), 'No open tasks. Write the next one.'),
          wk.open_tasks.count > wk.open_tasks.items.length ? h('p', { class: 'hint', text: `Showing ${wk.open_tasks.items.length} of ${wk.open_tasks.count}.` }) : null),
        h('div', { class: 'card' }, h('p', { class: 'chart-title', text: `In progress — ${wk.in_progress.count}` }),
          list(wk.in_progress.items, n => row(n.title, `${n.project} · ${n.status}`, `${fmt(n.words)} w`), 'No drafts open.'),
          wk.top_tags.length ? h('div', {}, h('span', { class: 'mini-label', text: 'Top tags', style: 'margin-top:1rem' }),
            h('div', { class: 'chips' }, wk.top_tags.map(([t, c]) => h('span', { class: 'chip-s', text: `#${t} ${c}` })))) : null)));
  }

  /* ---------- state ---------- */

  function setGate(text, showSignIn) {
    gate.hidden = false;
    gateText.textContent = text;
    gateActions.hidden = !showSignIn;
    body.hidden = true;
    body.replaceChildren();
    fresh.textContent = '';
    lastData = null;
  }

  function renderFresh() {
    if (!lastGenerated) return;
    const mins = (Date.now() - new Date(lastGenerated)) / 60000;
    fresh.replaceChildren(`vault: ${lastData.vault_name} · updated ${ago(lastGenerated)}`,
      mins > STALE_MIN ? h('span', { class: 'stale', text: ' · stale — is the laptop on?' }) : '');
  }

  function render(data, generatedAt) {
    lastData = data;
    lastGenerated = generatedAt;
    gate.hidden = true;
    body.hidden = false;
    body.replaceChildren(
      writingPanel(data.writing),
      projectsPanel(data.projects),
      healthPanel(data.health),
      workPanel(data.work));
    renderFresh();
  }

  async function load() {
    if (loading) return;
    if (!hfClient) { setGate('Sign-in needs a network connection. Reconnect and reload.', false); return; }
    if (!hfSession) { setGate('This room is locked. Sign in with the owner email to open it.', true); return; }
    loading = true;
    try {
      const { data, error } = await hfClient.from('vault_dashboard').select('data, generated_at').maybeSingle();
      if (error) { setGate(`Could not open the vault: ${error.message}`, false); return; }
      if (!data) { setGate('Nothing here for this account.', false); return; }
      render(data.data, data.generated_at);
    } finally {
      loading = false;
    }
  }

  document.getElementById('vault-signin').addEventListener('click', () => {
    const form = document.getElementById('hf-account-form');
    if (form) { form.hidden = false; document.getElementById('hf-account-email').focus(); }
  });

  window.addEventListener('hf:auth', load);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
  setInterval(() => { if (lastData) renderFresh(); }, 60000);
  window.addEventListener('scroll', hideTip, { passive: true });

  // Test hook: vault.html?preview=<url-to-json> renders a local sample without Supabase.
  const preview = new URLSearchParams(location.search).get('preview');
  if (preview && /^(file:|http:\/\/(localhost|127\.0\.0\.1))/.test(new URL(preview, location.href).href)) {
    fetch(preview).then(r => r.json()).then(d => render(d, d.generated_at));
    window.removeEventListener('hf:auth', load);
  } else if (!hfClient) {
    load();
  } else {
    setTimeout(() => { if (!lastData && !loading && gateText.textContent.startsWith('Checking')) load(); }, 2500);
  }
})();
