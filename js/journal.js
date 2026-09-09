/* ============================================================
   Journal — render, filter, add, delete, export
   ============================================================ */

const entriesEl = document.getElementById('entries');
const filtersEl = document.getElementById('filters');
const newStatus = document.getElementById('new-status');
const searchEl  = document.getElementById('search');

const auditTrendSection = document.getElementById('audit-trend-section');
const auditTrendEl      = document.getElementById('audit-trend');

let activeTag = null;
let activeQuery = '';

function renderFilters() {
  filtersEl.innerHTML = '';
  const tags = HF.tags();
  if (!tags.length) return;

  const all = makeChip('everything', activeTag === null, () => { activeTag = null; render(); });
  filtersEl.appendChild(all);

  tags.forEach(t => {
    filtersEl.appendChild(makeChip(t, activeTag === t, () => {
      activeTag = activeTag === t ? null : t;
      render();
    }));
  });
}

function makeChip(label, pressed, onClick) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.textContent = label;
  chip.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  chip.addEventListener('click', onClick);
  return chip;
}

function renderEntries() {
  const all = HF.all();
  let shown = activeTag ? all.filter(e => e.tags.includes(activeTag)) : all;
  if (activeQuery) shown = shown.filter(e => e.text.toLowerCase().includes(activeQuery));

  entriesEl.innerHTML = '';

  if (!all.length) {
    entriesEl.innerHTML = '<div class="empty">Nothing recorded yet. Run a Creed Audit, strike the anvil, or write the first entry above.</div>';
    return;
  }
  if (!shown.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const parts = [];
    if (activeQuery) parts.push(`matching “${activeQuery}”`);
    if (activeTag) parts.push(`tagged “${activeTag}”`);
    empty.textContent = `No entries ${parts.join(' and ')}.`;
    entriesEl.appendChild(empty);
    return;
  }

  shown.forEach(entry => {
    const wrap = document.createElement('article');
    wrap.className = 'entry';

    const meta = document.createElement('div');
    meta.className = 'entry-meta';
    const date = document.createElement('span');
    date.textContent = HF.formatDate(entry.ts);
    meta.appendChild(date);
    const src = document.createElement('span');
    src.className = 'src';
    src.textContent = entry.source;
    meta.appendChild(src);
    if (entry.tags.length) {
      const tg = document.createElement('span');
      tg.textContent = entry.tags.map(t => '#' + t).join(' ');
      meta.appendChild(tg);
    }
    wrap.appendChild(meta);

    const body = document.createElement('p');
    body.className = 'entry-body';
    body.textContent = entry.text;
    wrap.appendChild(body);

    const row = document.createElement('div');
    row.className = 'btn-row';
    row.style.marginTop = '0';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      if (!confirm('Delete this entry? It cannot be recovered.')) return;
      HF.remove(entry.id);
      render();
    });
    row.appendChild(del);
    wrap.appendChild(row);

    entriesEl.appendChild(wrap);
  });
}

function renderAuditTrend() {
  if (!auditTrendSection) return;

  const audits = HF.all()
    .filter(e => e.source === 'creed-audit')
    .map(e => {
      const m = e.text.match(/^Creed Audit — (\d+)\/45 · (.+)$/m);
      return m ? { ts: e.ts, score: Number(m[1]), title: m[2] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);

  if (!audits.length) {
    auditTrendSection.hidden = true;
    return;
  }
  auditTrendSection.hidden = false;
  auditTrendEl.innerHTML = '';

  audits.forEach(a => {
    const row = document.createElement('div');
    row.className = 'trend-row';

    const label = document.createElement('span');
    label.className = 'trend-label';
    label.textContent = HF.formatDate(a.ts).split('  ')[0];
    row.appendChild(label);

    const track = document.createElement('div');
    track.className = 'trend-track';
    const bar = document.createElement('div');
    bar.className = 'trend-bar';
    bar.style.width = `${Math.round((a.score / 45) * 100)}%`;
    track.appendChild(bar);
    row.appendChild(track);

    const score = document.createElement('span');
    score.className = 'trend-score';
    score.textContent = `${a.score}/45 · ${a.title}`;
    row.appendChild(score);

    auditTrendEl.appendChild(row);
  });
}

function render() {
  renderFilters();
  renderEntries();
  renderAuditTrend();
}

document.getElementById('new-save').addEventListener('click', (e) => {
  const text = document.getElementById('new-text').value.trim();
  if (!text) { newStatus.textContent = 'Write something first.'; return; }

  HF.add({ text, tags: hfParseTags(document.getElementById('new-tags').value), source: 'journal' });
  document.getElementById('new-text').value = '';
  document.getElementById('new-tags').value = '';
  newStatus.textContent = '';
  hfFlash(e.target, 'Added');
  render();
});

document.getElementById('export').addEventListener('click', (e) => {
  const ok = HF.exportMarkdown();
  if (!ok) hfFlash(e.target, 'Nothing to export');
});

searchEl.addEventListener('input', (e) => {
  activeQuery = e.target.value.trim().toLowerCase();
  renderEntries();
});

window.addEventListener('hf:updated', render);

render();
