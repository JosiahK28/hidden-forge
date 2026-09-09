/* ============================================================
   THE HIDDEN FORGE — journal store
   Everything lives in this browser. No server, no account.
   ============================================================ */

const HF_KEY = 'hf_journal_v1';

const HF = {
  /** Every entry, newest first. */
  all() {
    try {
      const raw = localStorage.getItem(HF_KEY);
      const entries = raw ? JSON.parse(raw) : [];
      return entries.sort((a, b) => b.ts - a.ts);
    } catch (e) {
      console.error('Hidden Forge: could not read the journal', e);
      return [];
    }
  },

  /** source: 'journal' | 'anvil' | 'creed-audit' | 'manifesto' | 'decoder' */
  add({ text, tags = [], source = 'journal' }) {
    const entries = HF.all();
    const entry = {
      id: 'e' + Date.now() + Math.random().toString(36).slice(2, 7),
      ts: Date.now(),
      text: String(text).trim(),
      tags: tags.filter(Boolean),
      source
    };
    entries.unshift(entry);
    try {
      localStorage.setItem(HF_KEY, JSON.stringify(entries));
    } catch (e) {
      console.error('Hidden Forge: could not save', e);
      return null;
    }
    return entry;
  },

  remove(id) {
    const entries = HF.all().filter(e => e.id !== id);
    localStorage.setItem(HF_KEY, JSON.stringify(entries));
  },

  tags() {
    const set = new Set();
    HF.all().forEach(e => e.tags.forEach(t => set.add(t)));
    return [...set].sort();
  },

  formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
      '  ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  },

  exportMarkdown() {
    const entries = HF.all();
    if (!entries.length) return false;
    let out = '# The Hidden Forge — Journal Export\n\n';
    out += `Exported ${new Date().toLocaleString()} — ${entries.length} entries\n\n---\n\n`;
    entries.forEach(e => {
      out += `### ${HF.formatDate(e.ts)}\n\n`;
      out += `source: ${e.source}${e.tags.length ? ' · tags: ' + e.tags.join(', ') : ''}\n\n`;
      out += `${e.text}\n\n---\n\n`;
    });
    const blob = new Blob([out], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hidden-forge-journal-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  }
};

/** Briefly replace a control's label to confirm an action. */
function hfFlash(el, message) {
  if (!el) return;
  const original = el.dataset.label || el.textContent;
  el.dataset.label = original;
  el.textContent = message;
  clearTimeout(el._hfTimer);
  el._hfTimer = setTimeout(() => { el.textContent = original; }, 1700);
}

/** Split a comma-separated tag field into clean tags. */
function hfParseTags(value) {
  return String(value || '')
    .split(',')
    .map(t => t.trim().toLowerCase().replace(/^#/, ''))
    .filter(Boolean);
}
