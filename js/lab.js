/* ============================================================
   The Lab — Strike the Anvil + Red Pill Decoder
   ============================================================ */

/* ---------- Strike the Anvil ---------- */

const ANVIL_FIELDS = [
  { id: 'anvil-1', label: 'The strike' },
  { id: 'anvil-2', label: 'The story' },
  { id: 'anvil-3', label: 'My portion' },
  { id: 'anvil-4', label: 'The next act' },
  { id: 'anvil-5', label: 'The deadline' }
];

const anvilStatus = document.getElementById('anvil-status');

document.getElementById('anvil-save').addEventListener('click', (e) => {
  const values = ANVIL_FIELDS.map(f => ({
    label: f.label,
    value: document.getElementById(f.id).value.trim()
  }));

  const empty = values.filter(v => !v.value);
  if (empty.length) {
    anvilStatus.textContent = `${empty.length} step${empty.length > 1 ? 's' : ''} left blank — the blank one is usually the real one.`;
    return;
  }

  let text = 'Strike the Anvil\n\n';
  values.forEach(v => { text += `${v.label}: ${v.value}\n\n`; });

  const tags = hfParseTags(document.getElementById('anvil-tags').value);
  HF.add({ text: text.trim(), tags: ['anvil', ...tags], source: 'anvil' });

  anvilStatus.textContent = '';
  hfFlash(e.target, 'Struck — saved');
});

document.getElementById('anvil-clear').addEventListener('click', () => {
  ANVIL_FIELDS.forEach(f => { document.getElementById(f.id).value = ''; });
  document.getElementById('anvil-tags').value = '';
  anvilStatus.textContent = '';
});

/* ---------- Red Pill Decoder ---------- */

const PHRASE_MAP = [
  {
    match: ['right time', 'not the right time', 'timing isn\'t right', 'when things settle'],
    beneath: 'There is no right time; there is only a time when the cost of starting feels lower than it does today. Waiting does not lower that cost — it raises it, and calls the increase prudence.'
  },
  {
    match: ['not ready', 'need more experience', 'need to learn more', 'once i\'m qualified'],
    beneath: 'Readiness is manufactured by doing, not granted before it. What you are calling preparation is a place to stand where nobody can grade you.'
  },
  {
    match: ['too busy', 'no time', 'when i have time', 'swamped'],
    beneath: 'You have the time. You have assigned it elsewhere. Say what it went to instead — that sentence is the real one, and it is usually survivable.'
  },
  {
    match: ['they don\'t understand', 'nobody gets it', 'no one understands'],
    beneath: 'Possibly true. Also the most comfortable explanation available, because it requires nothing of you. Test it: explain it once more, plainly, to someone who has no reason to flatter you.'
  },
  {
    match: ['i\'m just being realistic', 'being realistic', 'just realistic'],
    beneath: 'Realism describes constraints. This describes a ceiling you installed yourself and would rather not test. Name the constraint precisely — if you can\'t, it isn\'t one.'
  },
  {
    match: ['it is what it is', 'nothing i can do', 'out of my control'],
    beneath: 'Something in it is yours. Not all of it — that would be a different lie. Find the smallest part that answers to you and act only on that.'
  },
  {
    match: ['i\'ll start monday', 'start tomorrow', 'start next week', 'from monday'],
    beneath: 'A future start date is a way to feel like the man who started without becoming him. The version of you who begins on Monday is the version who could begin tonight.'
  },
  {
    match: ['i don\'t care', 'doesn\'t bother me', 'i\'m over it'],
    beneath: 'Indifference is loud when it is real and louder when it is not. If it needed saying out loud, it needs looking at.'
  },
  {
    match: ['i work better under pressure', 'i need the deadline'],
    beneath: 'You work under pressure. Whether it is better has never been tested, because you have never given the alternative a fair trial.'
  },
  {
    match: ['self care', 'i deserve a break', 'being kind to myself'],
    beneath: 'Rest earned after work restores you. Rest taken instead of work is a debt with your name on it. Which one is this? You already know.'
  },
  {
    match: ['everyone does it', 'that\'s just how it is', 'normal these days'],
    beneath: 'Prevalence is not permission. The question was never what everyone does — it was what you would still defend if it were only you.'
  },
  {
    match: ['i\'m trying my best', 'doing all i can'],
    beneath: 'Best is a measurable claim. Write down what you actually did this week and read it back. If the claim survives, keep it and stop apologising.'
  }
];

const FALLBACKS = [
  'No entry for that phrase yet — so decode it yourself with three questions. What would be true if this sentence were false? What does keeping it save you from? What would you do this week if you dropped it?',
  'That one is not in the map. Try the test that works on all of them: does this sentence describe the world, or does it describe a door you would rather not open?',
  'Unmapped. Ask it directly — who benefits from you believing this? If the answer is the version of you that wants to stay put, you have your decoding.'
];

const decodeIn      = document.getElementById('decode-in');
const decodeOut     = document.getElementById('decode-out');
const decodeSurface = document.getElementById('decode-surface');
const decodeBeneath = document.getElementById('decode-beneath');
const samplesEl     = document.getElementById('decode-samples');

const SAMPLES = [
  'I\'m waiting for the right time',
  'I\'m not ready yet',
  'I\'m too busy',
  'It is what it is',
  'I\'ll start Monday'
];

SAMPLES.forEach(s => {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.textContent = s;
  chip.addEventListener('click', () => { decodeIn.value = s; decode(); });
  samplesEl.appendChild(chip);
});

function decode() {
  const raw = decodeIn.value.trim();
  if (!raw) return;
  const needle = raw.toLowerCase();

  const hit = PHRASE_MAP.find(p => p.match.some(m => needle.includes(m)));

  decodeSurface.textContent = `You said: “${raw}”`;
  if (hit) {
    decodeBeneath.textContent = hit.beneath;
    decodeBeneath.classList.remove('miss');
  } else {
    decodeBeneath.textContent = FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
    decodeBeneath.classList.add('miss');
  }
  decodeOut.hidden = false;
}

document.getElementById('decode-go').addEventListener('click', decode);
decodeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') decode(); });

document.getElementById('decode-save').addEventListener('click', (e) => {
  const text = `Decoded: “${decodeIn.value.trim()}”\n\n${decodeBeneath.textContent}`;
  HF.add({ text, tags: ['decoder'], source: 'decoder' });
  hfFlash(e.target, 'Saved to journal');
});
