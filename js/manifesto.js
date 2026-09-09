/* ============================================================
   Manifesto — click-to-capture excerpts into the insight drawer
   ============================================================ */

const captured = new Map(); // element -> text

const listEl  = document.getElementById('drawer-list');
const countEl = document.getElementById('drawer-count');
const hintEl  = document.getElementById('drawer-hint');

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
}

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
