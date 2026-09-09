/* ============================================================
   THE HIDDEN FORGE — journal store
   Local-first: every entry always lands in this browser's storage
   first. Signing in (optional, magic-link email) additionally syncs
   entries to Supabase, so a journal can follow you across devices.
   ============================================================ */

const HF_KEY = 'hf_journal_v1';

const HF_SUPABASE_URL = 'https://fxaqqmdairhoeifapsyp.supabase.co';
const HF_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4YXFxbWRhaXJob2VpZmFwc3lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5Mzc4NDQsImV4cCI6MjEwNDUxMzg0NH0.hyishLl8xqZjnuA0Dghpop76auzFwWzzzL-dXaPotPU';

const hfClient = window.supabase
  ? window.supabase.createClient(HF_SUPABASE_URL, HF_SUPABASE_ANON_KEY)
  : null;

let hfSession = null;

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

  isSignedIn() {
    return !!hfSession;
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
    hfPushEntry(entry);
    return entry;
  },

  remove(id) {
    const entries = HF.all().filter(e => e.id !== id);
    localStorage.setItem(HF_KEY, JSON.stringify(entries));
    hfDeleteEntry(id);
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
  },

  /** Email a one-time sign-in link. No password is ever set or stored. */
  signInWithEmail(email) {
    if (!hfClient) return Promise.reject(new Error('Supabase not loaded'));
    return hfClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href }
    });
  },

  signOut() {
    if (!hfClient) return Promise.resolve();
    return hfClient.auth.signOut();
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

/* --- cloud sync ------------------------------------------------------
   Every write lands in localStorage first and always succeeds locally,
   regardless of network state. Cloud sync is best-effort on top of
   that, never a precondition for the app working. --------------------- */

function hfRow(entry, userId) {
  return { id: entry.id, user_id: userId, ts: entry.ts, text: entry.text, tags: entry.tags, source: entry.source };
}

async function hfPushEntry(entry) {
  if (!hfClient || !hfSession) return;
  const { error } = await hfClient.from('journal_entries').upsert(hfRow(entry, hfSession.user.id));
  if (error) console.error('Hidden Forge: cloud save failed', error);
}

async function hfDeleteEntry(id) {
  if (!hfClient || !hfSession) return;
  const { error } = await hfClient.from('journal_entries').delete().eq('id', id);
  if (error) console.error('Hidden Forge: cloud delete failed', error);
}

/** Two-way merge on sign-in: local-only entries get uploaded, cloud-only entries get pulled down. */
async function hfPullFromCloud() {
  if (!hfClient || !hfSession) return;
  const { data, error } = await hfClient.from('journal_entries').select('*');
  if (error) { console.error('Hidden Forge: cloud sync failed', error); return; }

  const local = HF.all();
  const localIds = new Set(local.map(e => e.id));
  const cloudIds = new Set((data || []).map(e => e.id));

  const toPush = local.filter(e => !cloudIds.has(e.id)).map(e => hfRow(e, hfSession.user.id));
  if (toPush.length) {
    const { error: pushErr } = await hfClient.from('journal_entries').upsert(toPush);
    if (pushErr) console.error('Hidden Forge: could not upload local entries', pushErr);
  }

  const merged = local.slice();
  (data || []).forEach(row => {
    if (!localIds.has(row.id)) {
      merged.push({ id: row.id, ts: row.ts, text: row.text, tags: row.tags || [], source: row.source });
    }
  });
  localStorage.setItem(HF_KEY, JSON.stringify(merged));
  window.dispatchEvent(new Event('hf:updated'));
}

/* --- account UI (shared across every page's header) ------------------- */

const hfAccountStatus = document.getElementById('hf-account-status');
const hfAccountToggle = document.getElementById('hf-account-toggle');
const hfAccountForm   = document.getElementById('hf-account-form');
const hfAccountEmail  = document.getElementById('hf-account-email');

function hfRenderAccount() {
  if (!hfAccountStatus || !hfAccountToggle) return;
  if (hfSession) {
    hfAccountStatus.textContent = hfSession.user.email;
    hfAccountToggle.textContent = 'Sign out';
    if (hfAccountForm) hfAccountForm.hidden = true;
  } else {
    hfAccountStatus.textContent = 'Guest';
    hfAccountToggle.textContent = 'Sign in';
  }
}

if (hfAccountToggle) {
  hfAccountToggle.addEventListener('click', () => {
    if (hfSession) {
      HF.signOut();
      return;
    }
    if (!hfAccountForm) return;
    hfAccountForm.hidden = !hfAccountForm.hidden;
    if (!hfAccountForm.hidden && hfAccountEmail) hfAccountEmail.focus();
  });
}

if (hfAccountForm) {
  hfAccountForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = hfAccountEmail.value.trim();
    if (!email) return;
    HF.signInWithEmail(email).then(({ error }) => {
      if (error) {
        hfAccountStatus.textContent = 'Could not send link';
        console.error('Hidden Forge: sign-in failed', error);
        return;
      }
      hfAccountForm.hidden = true;
      hfAccountStatus.textContent = `Link sent to ${email}`;
    });
  });
}

if (hfClient) {
  hfClient.auth.onAuthStateChange((event, session) => {
    const wasSignedIn = !!hfSession;
    hfSession = session;
    hfRenderAccount();
    if (session && !wasSignedIn) {
      hfPullFromCloud();
    }
    if (!session && wasSignedIn) {
      localStorage.removeItem(HF_KEY);
      window.dispatchEvent(new Event('hf:updated'));
    }
  });
}
