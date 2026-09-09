/* ============================================================
   Journal — render, filter, add, delete, export
   ============================================================ */

const entriesEl = document.getElementById('entries');
const filtersEl = document.getElementById('filters');
const newStatus = document.getElementById('new-status');

let activeTag = null;

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
  const shown = activeTag ? all.filter(e => e.tags.includes(activeTag)) : all;

  entriesEl.innerHTML = '';

  if (!all.length) {
    entriesEl.innerHTML = '<div class="empty">Nothing recorded yet. Run a Creed Audit, strike the anvil, or write the first entry above.</div>';
    return;
  }
  if (!shown.length) {
    entriesEl.innerHTML = `<div class="empty">No entries tagged “${activeTag}”.</div>`;
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

function render() {
  renderFilters();
  renderEntries();
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

window.addEventListener('hf:updated', render);

render();
