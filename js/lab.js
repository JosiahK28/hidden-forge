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

const DECODER_GROUPS = [
  {
    label: 'Masculinity',
    phrases: [
      {
        surface: '“Toxic masculinity”',
        beneath: 'Cruelty, control, and cowardice dressed as strength are real, and calling them out costs the coward nothing to admit. But the phrase is usually aimed wider than that — at strength itself, so it never has to be pointed anywhere. What\'s toxic is force without dominion of self; ask whether the fix on offer is discipline or disarmament.'
      },
      {
        surface: '“Be an alpha”',
        beneath: 'Dominance is easy to fake and exhausting to maintain, and plenty of "alphas" are just loud men nobody has stood up to yet. Rank answers to nothing above itself — it\'s the biggest animal in the room, not the most just one. The standard was never top of the hierarchy; it was fit to lead one, which is a harder and different test.'
      },
      {
        surface: '“The patriarchy is the problem”',
        beneath: 'Some men have used authority as a shield for abuse — that\'s a real, old failure, not a myth invented to flatter anyone. But the pattern in front of you right now is usually the opposite one: not too much fatherhood, but too little — men who left, checked out, or never showed up to hold the line at all. Name which failure you\'re actually looking at before you diagnose it.'
      },
      {
        surface: '“Emotions are weakness”',
        beneath: 'Stoicism gets misquoted into anesthesia. The ancients who wrote it felt everything — grief, rage, longing — and governed it anyway; suppression was never the discipline, response was. An emotion you can\'t name runs you from underneath. One you can name is a fact you can act on.'
      }
    ]
  },
  {
    label: 'Self-Help & Hustle Culture',
    phrases: [
      {
        surface: '“Follow your heart” / “live your truth”',
        beneath: 'The heart is a real instrument, and ignoring it entirely produces its own kind of dishonesty. But it is not sovereign — it is fallen, it wants comfort more often than it wants right, and it will rationalize either with equal conviction. Let it inform the decision. Do not let it cast the deciding vote.'
      },
      {
        surface: '“Just be a good person”',
        beneath: 'Nobody sets out to be the villain of their own story, which is exactly the problem — "good" measured against your own mood will always clear the bar you set it. The word needs a standard outside yourself or it is decoration wearing morality\'s clothes. Ask what you\'d have to change if the standard weren\'t yours to grade.'
      },
      {
        surface: '“Chase your dreams”',
        beneath: 'Some dreams are worth the whole of a life spent on them — that\'s not in question. What\'s in question is whether this one has ever been tested by a single hard morning of actual discipline, or whether it\'s stayed a dream because a dream can\'t fail. Put one week of unglamorous work against it and see if it survives contact.'
      },
      {
        surface: '“Grind harder, no excuses”',
        beneath: 'Effort matters and laziness is a real vice, not a myth. But motion is not the same as direction — a man can grind sixty hours a week toward nothing he\'d defend and call it discipline because it\'s exhausting. Ask what the grind is actually building, not just whether it hurts enough to count.'
      },
      {
        surface: '“Manifest it” / “stay positive”',
        beneath: 'Attitude shapes outcomes more than cynics admit — that much is true. But refusing to see the terrain because the view is unpleasant isn\'t optimism, it\'s a liability wearing optimism\'s clothes. See the ground exactly as it is, then decide to move anyway; that\'s courage. Refusing to look is just hope with its eyes shut.'
      }
    ]
  },
  {
    label: 'Politics & Systems',
    phrases: [
      {
        surface: '“The system is rigged, so why bother”',
        beneath: 'Some systems are rigged. Saying so plainly is realism, not paranoia. But "why bother" is the same surrender as "it is what it is," wearing a political coat — the rigging becomes the reason to stop instead of the reason to move carefully. Name the one part of the system that still answers to your effort, and work that part.'
      },
      {
        surface: '“Vote and things will change”',
        beneath: 'A vote costs little and changes less than it\'s sold as; treating it as the whole of civic duty is a way to feel engaged without being responsible for anything. Renewal runs bottom-up — a household in order, a tribe that holds, a community that notices — long before it runs through a ballot. Build the thing your ballot can\'t build for you.'
      },
      {
        surface: '“God helps those who help themselves”',
        beneath: 'It sounds biblical and isn\'t — it\'s Franklin, not scripture — and the mix-up matters because it reverses the order. Self-reliance answering to nothing above it is just ambition with a halo painted on. Sovereignty comes first; the helping yourself comes after, and in service of something, not instead of it.'
      }
    ]
  },
  {
    label: 'Loyalty & Tribe',
    phrases: [
      {
        surface: '“Whatever it takes for my family/tribe”',
        beneath: 'Fierce loyalty to your own is not the flaw — a man who won\'t fight for what\'s his is missing something, not exceeding it. The flaw is loyalty with no discernment left in it, defending the tribe\'s worst the same as its best because it\'s yours. Ask whether you\'re protecting what\'s good in them, or just what\'s yours.'
      },
      {
        surface: '“It takes a village”',
        beneath: 'A village helps — real community catches what one man alone would drop. But it has quietly become the sentence that lets a father\'s specific job go unclaimed, spread thin enough across "the village" that no one part of it is actually responsible. Name the one thing here that is yours alone to carry, village or not.'
      },
      {
        surface: '“Men and women are interchangeable”',
        beneath: 'Equal in worth, categorically — that\'s not the argument, and anyone who makes it one is arguing against a position nobody serious holds. Equal does not mean identical; complementary roles aren\'t a hierarchy of value, they\'re a division of labor built for what each is actually built for. The question was never who\'s worth more. It was who\'s built for what.'
      }
    ]
  }
];

const decoderListEl = document.getElementById('decoder-list');

DECODER_GROUPS.forEach(group => {
  const details = document.createElement('details');
  details.className = 'subject';

  const summary = document.createElement('summary');
  summary.textContent = group.label;
  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'subject-body';

  group.phrases.forEach(phrase => {
    const entry = document.createElement('div');
    entry.className = 'decode-entry';

    const surface = document.createElement('p');
    surface.className = 'surface';
    surface.textContent = phrase.surface;
    entry.appendChild(surface);

    const beneath = document.createElement('p');
    beneath.className = 'beneath';
    beneath.textContent = phrase.beneath;
    entry.appendChild(beneath);

    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn quiet';
    saveBtn.textContent = 'Save to journal';
    saveBtn.addEventListener('click', () => {
      HF.add({
        text: `Decoded: ${phrase.surface}\n\n${phrase.beneath}`,
        tags: ['decoder'],
        source: 'decoder'
      });
      hfFlash(saveBtn, 'Saved to journal');
    });
    btnRow.appendChild(saveBtn);
    entry.appendChild(btnRow);

    body.appendChild(entry);
  });

  details.appendChild(body);
  decoderListEl.appendChild(details);
});
