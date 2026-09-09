/* ============================================================
   Creed Audit — one statement per pillar, five-point scale, one verdict.
   Add or edit statements here; the page builds itself from this list.
   ============================================================ */

const AUDIT_ITEMS = [
  { id: 'a1', pillar: 'I',   text: 'I submitted a decision to a standard higher than my own convenience, even when no one would have known if I hadn\u2019t.' },
  { id: 'a2', pillar: 'II',  text: 'When something went wrong, I named my portion of it before naming anyone else\u2019s.' },
  { id: 'a3', pillar: 'III', text: 'I refused an appetite that usually wins.' },
  { id: 'a4', pillar: 'IV',  text: 'I gave my loyalty, effort, or protection only where it had actually been earned.' },
  { id: 'a5', pillar: 'V',   text: 'I looked squarely at something uncomfortable instead of the version of it I wanted to be true.' },
  { id: 'a6', pillar: 'VI',  text: 'I made the shrewd, strategic move without crossing a line I\u2019d already decided not to cross.' },
  { id: 'a7', pillar: 'VII', text: 'I did something this week that will outlast me, not just improve me.' }
];

const VERDICTS = [
  { min: 31, title: 'Forged', body: 'The creed is not aspirational for you this week — it is descriptive. Raise the bar; a standard you clear easily has stopped teaching you anything.' },
  { min: 24, title: 'Holding the line', body: 'Most days went the right way. The gap is in the specific pillars below, and gaps that stay small stay fixable. Pick one and close it.' },
  { min: 17, title: 'Split', body: 'You are two men this week, and the weaker one has been getting the mornings. Do not attempt a total reform. Take the lowest-scoring statement and make it non-negotiable for seven days.' },
  { min: 10, title: 'Slipping', body: 'The creed is currently something you agree with rather than something you do. That distance is the whole problem, and it closes with one kept promise, not a new system.' },
  { min: 0,  title: 'Cold iron', body: 'Nothing is being forged. This is not a verdict on your character; it is a reading of a week. Choose the single smallest act you cannot fail at, do it tomorrow, and audit again in seven days.' }
];

const itemsEl   = document.getElementById('audit-items');
const statusEl  = document.getElementById('audit-status');
const verdictEl = document.getElementById('verdict');

let lastResult = null;

/* --- build the form ------------------------------------------------ */

AUDIT_ITEMS.forEach((item, i) => {
  const wrap = document.createElement('div');
  wrap.className = 'audit-item';

  const q = document.createElement('p');
  q.textContent = `${i + 1}. ${item.text}`;
  wrap.appendChild(q);

  const scale = document.createElement('div');
  scale.className = 'scale';
  scale.setAttribute('role', 'group');
  scale.setAttribute('aria-label', item.text);

  const low = document.createElement('span');
  low.className = 'scale-legend';
  low.textContent = 'never';
  scale.appendChild(low);

  for (let v = 1; v <= 5; v++) {
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = item.id;
    input.value = String(v);
    input.id = `${item.id}-${v}`;
    input.addEventListener('change', updateStatus);

    const label = document.createElement('label');
    label.setAttribute('for', input.id);
    label.textContent = String(v);

    scale.appendChild(input);
    scale.appendChild(label);
  }

  const high = document.createElement('span');
  high.className = 'scale-legend';
  high.textContent = 'consistently';
  scale.appendChild(high);

  wrap.appendChild(scale);
  itemsEl.appendChild(wrap);
});

/* --- behaviour ----------------------------------------------------- */

function answers() {
  return AUDIT_ITEMS.map(item => {
    const checked = document.querySelector(`input[name="${item.id}"]:checked`);
    return { item, value: checked ? Number(checked.value) : null };
  });
}

function updateStatus() {
  const answered = answers().filter(a => a.value !== null).length;
  statusEl.textContent = `${answered} of ${AUDIT_ITEMS.length} answered`;
}

document.getElementById('audit-score').addEventListener('click', () => {
  const rows = answers();
  const missing = rows.filter(r => r.value === null);
  if (missing.length) {
    statusEl.textContent = `${missing.length} still unanswered — an audit with holes tells you nothing.`;
    return;
  }

  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const verdict = VERDICTS.find(v => total >= v.min);
  const weakest = rows.slice().sort((a, b) => a.value - b.value).slice(0, 2);

  document.getElementById('verdict-score').textContent = `${total} / ${AUDIT_ITEMS.length * 5}`;
  document.getElementById('verdict-title').textContent = verdict.title;
  document.getElementById('verdict-body').textContent = verdict.body;
  document.getElementById('verdict-weak').textContent =
    'Weakest ground: ' + weakest.map(w => `“${w.item.text}” (${w.value})`).join('  ·  ');

  verdictEl.hidden = false;
  verdictEl.scrollIntoView({ block: 'nearest' });

  lastResult = { total, verdict, rows };
  updateStatus();
});

document.getElementById('audit-reset').addEventListener('click', () => {
  document.getElementById('audit').reset();
  verdictEl.hidden = true;
  lastResult = null;
  updateStatus();
});

document.getElementById('audit-save').addEventListener('click', (e) => {
  if (!lastResult) return;
  const { total, verdict, rows } = lastResult;
  let text = `Creed Audit — ${total}/${AUDIT_ITEMS.length * 5} · ${verdict.title}\n\n`;
  rows.forEach((r, i) => { text += `${i + 1}. [${r.value}] ${r.item.text}\n`; });
  text += `\n${verdict.body}`;

  HF.add({ text, tags: ['creed', 'audit'], source: 'creed-audit' });
  hfFlash(e.target, 'Saved to journal');
});

updateStatus();
