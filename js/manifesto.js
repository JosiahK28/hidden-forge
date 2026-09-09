/* ============================================================
   Manifesto — click-to-capture excerpts into the insight drawer
   ============================================================ */

const captured = new Map(); // element -> text

const drawerEl     = document.getElementById('drawer');
const badgeEl       = document.getElementById('drawer-badge');
const badgeCountEl  = document.getElementById('drawer-badge-count');
const panelEl       = document.getElementById('drawer-panel');
const listEl  = document.getElementById('drawer-list');
const countEl = document.getElementById('drawer-count');
const hintEl  = document.getElementById('drawer-hint');

function openPanel() {
  panelEl.hidden = false;
  badgeEl.setAttribute('aria-expanded', 'true');
}

function closePanel() {
  panelEl.hidden = true;
  badgeEl.setAttribute('aria-expanded', 'false');
}

function render() {
  listEl.innerHTML = '';
  captured.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text.length > 160 ? text.slice(0, 157) + '…' : text;
    listEl.appendChild(li);
  });

  const n = captured.size;
  countEl.textContent = n === 0
    ? 'Insight drawer — empty'
    : `Insight drawer — ${n} passage${n > 1 ? 's' : ''}`;
  hintEl.textContent = n === 0
    ? 'Click any passage above to capture it. Click it again to release it.'
    : 'Click a captured passage again to release it.';

  badgeCountEl.textContent = n;
  badgeEl.setAttribute('aria-label', n === 0 ? 'Insight drawer, empty' : `Insight drawer, ${n} passage${n > 1 ? 's' : ''} captured`);
  drawerEl.hidden = n === 0;
  if (n === 0) closePanel();
}

badgeEl.addEventListener('click', () => {
  if (panelEl.hidden) openPanel(); else closePanel();
});

document.addEventListener('click', (e) => {
  if (!drawerEl.hidden && !panelEl.hidden && !drawerEl.contains(e.target)) closePanel();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !panelEl.hidden) closePanel();
});

function toggle(el) {
  if (captured.has(el)) {
    captured.delete(el);
    el.classList.remove('captured');
    el.setAttribute('aria-pressed', 'false');
  } else {
    captured.set(el, el.textContent.trim());
    el.classList.add('captured');
    el.setAttribute('aria-pressed', 'true');
  }
  render();
}

document.querySelectorAll('.excerpt').forEach(el => {
  el.setAttribute('aria-pressed', 'false');
  el.addEventListener('click', () => toggle(el));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(el); }
  });
});

document.getElementById('drawer-save').addEventListener('click', (e) => {
  if (!captured.size) { hintEl.textContent = 'Nothing captured yet — click a passage first.'; return; }
  let text = 'Captured from the manifesto\n\n';
  captured.forEach(t => { text += `“${t}”\n\n`; });
  HF.add({ text: text.trim(), tags: ['manifesto'], source: 'manifesto' });
  hfFlash(e.target, 'Saved to journal');
});

document.getElementById('drawer-clear').addEventListener('click', () => {
  captured.forEach((_, el) => {
    el.classList.remove('captured');
    el.setAttribute('aria-pressed', 'false');
  });
  captured.clear();
  render();
});

render();
