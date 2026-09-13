/* ============================================================
   Homepage — the record widget. Reads the local journal through
   HF and shows how much has actually been forged, not just read.
   ============================================================ */

const HF_SOURCE_LABEL = {
  journal: 'a journal entry',
  anvil: 'an Anvil strike',
  'creed-audit': 'a Creed Audit',
  manifesto: 'a captured excerpt',
  decoder: 'a decoded phrase'
};

function hfDayKey(ts) {
  return new Date(ts).toDateString();
}

/** Consecutive days with at least one entry, counting back from the most
    recent entry — but only "live" if that entry was today or yesterday. */
function hfStreak(entries) {
  const days = [...new Set(entries.map(e => hfDayKey(e.ts)))]
    .map(d => new Date(d).getTime())
    .sort((a, b) => b - a);

  let streak = 1;
  for (let i = 0; i < days.length - 1; i++) {
    if (Math.round((days[i] - days[i + 1]) / 86400000) === 1) streak++;
    else break;
  }

  const mostRecent = new Date(days[0]).toDateString();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  return (mostRecent === today || mostRecent === yesterday) ? streak : 0;
}

function hfRenderRecord() {
  const el = document.getElementById('hf-record');
  if (!el) return;
  el.innerHTML = '';

  const entries = HF.all();

  if (!entries.length) {
    const wrap = document.createElement('div');
    wrap.className = 'record';

    const lede = document.createElement('p');
    lede.className = 'empty-lede';
    lede.textContent = 'Nothing forged yet.';
    wrap.appendChild(lede);

    const p = document.createElement('p');
    const a1 = document.createElement('a');
    a1.href = 'lab.html';
    a1.textContent = 'Strike the Anvil';
    const a2 = document.createElement('a');
    a2.href = 'creed.html';
    a2.textContent = 'run the Creed Audit';
    p.append('Reading about it forges nothing. ', a1, ' once, or ', a2, ' — either writes the first line.');
    wrap.appendChild(p);

    el.appendChild(wrap);
    return;
  }

  const streak = hfStreak(entries);
  const last = entries[0];
  const preview = last.text.length > 100 ? last.text.slice(0, 100).trim() + '…' : last.text;

  const wrap = document.createElement('div');
  wrap.className = 'record';

  const status = document.createElement('span');
  status.className = 'status';
  status.textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} in the record`;
  if (streak > 1) {
    const streakSpan = document.createElement('span');
    streakSpan.className = 'streak';
    streakSpan.textContent = ` · ${streak}-day streak`;
    status.appendChild(streakSpan);
  }
  wrap.appendChild(status);

  const quote = document.createElement('blockquote');
  quote.textContent = `“${preview}”`;
  wrap.appendChild(quote);

  const meta = document.createElement('p');
  meta.textContent = `${HF_SOURCE_LABEL[last.source] || 'an entry'} · ${HF.formatDate(last.ts)}`;
  wrap.appendChild(meta);

  const link = document.createElement('p');
  const a = document.createElement('a');
  a.href = 'journal.html';
  a.textContent = 'Read the full record →';
  link.appendChild(a);
  wrap.appendChild(link);

  el.appendChild(wrap);
}

hfRenderRecord();
window.addEventListener('hf:updated', hfRenderRecord);
