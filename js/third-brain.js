/* ============================================================
   THE HIDDEN FORGE — private Third Brain map
   Reads one row from Supabase (`third_brain_map`). Row-level
   security hands it only to the owner's signed-in session; any
   other visitor gets nothing back. The row is written by
   _tools/third_brain_push.py on the owner's laptop.
   ============================================================ */

(function () {
  const REFRESH_MS = 5 * 60 * 1000;

  const header = document.getElementById('tb-header');
  const wrap = document.getElementById('tb-wrap');
  const gate = document.getElementById('tb-gate');
  const gateText = document.getElementById('tb-gate-text');
  const gateActions = document.getElementById('tb-gate-actions');
  const titleEl = document.getElementById('tb-title');
  const titleSub = document.getElementById('tb-title-sub');
  const searchWrap = document.getElementById('tb-search-wrap');
  const legendEl = document.getElementById('tb-legend');
  const resetHintEl = document.getElementById('tb-reset-hint');
  const detailEl = document.getElementById('tb-detail');
  const kickerEl = document.getElementById('tb-detail-kicker');
  const labelEl = document.getElementById('tb-detail-label');
  const bodyEl = document.getElementById('tb-detail-body');
  const searchEl = document.getElementById('tb-search');
  const searchCountEl = document.getElementById('tb-search-count');

  let loading = false;
  let rendered = false;

  function setHeaderHeight() {
    document.documentElement.style.setProperty('--tb-header-h', header.offsetHeight + 'px');
  }
  setHeaderHeight();
  window.addEventListener('resize', setHeaderHeight);

  function setGate(text, showSignIn) {
    gate.hidden = false;
    gateText.textContent = text;
    gateActions.hidden = !showSignIn;
  }
  function hideGate() { gate.hidden = true; }

  document.getElementById('tb-signin').addEventListener('click', () => {
    const form = document.getElementById('hf-account-form');
    if (form) { form.hidden = false; document.getElementById('hf-account-email').focus(); }
  });

  const DOMAIN_COLOR = {
    Philosophical: 'var(--dom-philosophical)', Political: 'var(--dom-political)',
    Epistemic: 'var(--dom-epistemic)', Personal: 'var(--dom-personal)', Biblical: 'var(--dom-biblical)',
  };
  const REL_COLOR = {
    supports: 'var(--rel-supports)', extends: 'var(--rel-extends)',
    qualifies: 'var(--rel-qualifies)', contradicts: 'var(--rel-contradicts)',
  };
  function resolveVar(v) {
    if (!v || !v.startsWith('var(')) return v;
    return getComputedStyle(document.documentElement).getPropertyValue(v.slice(4, -1)).trim();
  }

  function renderGraph(RAW) {
    if (rendered) return; // the graph is built once per page load from the freshest fetch
    rendered = true;

    hideGate();
    [titleEl, searchWrap, legendEl, resetHintEl].forEach(el => { el.hidden = false; });
    titleSub.textContent = `a web of me — ${RAW.principles.length} principles · ${RAW.works.length} works`;

    const W = 2200, H = 1500;
    // An ellipse, not a circle: the canvas is landscape, and a circular
    // orbit left its whole left and right thirds empty.
    const orbitX = W / 2 - 170, orbitY = H / 2 - 130;
    let nodes = [], links = [];
    const byId = {};

    const svg = d3.select('#tb-stage').attr('viewBox', `0 0 ${W} ${H}`);

    // A flat ring of domains treats them as equally related to each other,
    // which they aren't: relations between principles route overwhelmingly
    // through one domain (the "hub") rather than spreading evenly. Putting
    // the hub on the ring like everything else forces its many cross-domain
    // links to cut all the way across the canvas. Instead: find whichever
    // domain actually carries the most cross-domain relations and pin it at
    // the centre, with the rest ringed around it — the layout then mirrors
    // the graph's real shape instead of an arbitrary list order, and every
    // cross-domain link gets shorter and easier to trace.
    const domainOf = {};
    RAW.principles.forEach(p => { domainOf[p.id] = p.domain; });
    const crossDomainTouches = Object.fromEntries(RAW.domains.map(d => [d, 0]));
    RAW.principles.forEach(p => {
      p.relations.forEach(r => {
        const otherDomain = r.target_id && domainOf[r.target_id];
        if (otherDomain && otherDomain !== p.domain) {
          crossDomainTouches[p.domain]++;
          crossDomainTouches[otherDomain]++;
        }
      });
    });
    const domainCount = d => RAW.principles.filter(p => p.domain === d).length;
    const hubDomain = RAW.domains.slice().sort((a, b) =>
      crossDomainTouches[b] - crossDomainTouches[a] || domainCount(b) - domainCount(a) || a.localeCompare(b)
    )[0];
    const spokeDomains = RAW.domains.filter(d => d !== hubDomain).sort();

    RAW.domains.forEach(dname => {
      // Domains are pinned (fx/fy), not just seeded: they anchor their own
      // cluster, so cross-domain relation links can't drag two clusters
      // together and erase the gap between them. A drag still frees a
      // domain (the drag-end handler clears fx/fy), same as any node.
      let x, y;
      if (dname === hubDomain) {
        x = W / 2; y = H / 2;
      } else {
        const i = spokeDomains.indexOf(dname);
        const angle = (i / spokeDomains.length) * Math.PI * 2 - Math.PI / 2;
        x = W / 2 + Math.cos(angle) * orbitX; y = H / 2 + Math.sin(angle) * orbitY;
      }
      const n = { id: 'd-' + dname, kind: 'domain', label: dname, r: 40, x, y, fx: x, fy: y,
        count: domainCount(dname) };
      nodes.push(n); byId[n.id] = n;
    });
    // Each domain's principles sit on a ring around it, sized so they
    // don't overlap however many a domain holds. Their order on the ring
    // isn't arbitrary: a principle with relations into other domains is
    // slotted on the side facing those domains, so cross-domain links run
    // outward instead of cutting back across their own cluster.
    const ringRadius = d => Math.max(80, domainCount(d) * 72 / (2 * Math.PI));
    const slot = {};
    RAW.domains.forEach(dname => {
      const home = byId['d-' + dname];
      const members = RAW.principles.filter(p => p.domain === dname);
      const outward = Math.atan2(home.y - H / 2, home.x - W / 2);
      const pref = members.map((p, i) => {
        let sx = 0, sy = 0;
        p.relations.forEach(r => {
          const other = r.target_id && domainOf[r.target_id];
          if (other && other !== dname) { sx += byId['d-' + other].x - home.x; sy += byId['d-' + other].y - home.y; }
        });
        if (sx || sy) return { p, a: Math.atan2(sy, sx) };
        // No cross-domain pull: spokes face away from the hub; the hub spreads evenly.
        return { p, a: dname === hubDomain ? (i / members.length) * Math.PI * 2 : outward };
      }).sort((a, b) => a.a - b.a);
      const step = (Math.PI * 2) / (pref.length || 1);
      // Rotate the evenly spaced slots so that, on average, each one lands
      // as close as possible to the angle its principle wanted.
      let cs = 0, sn = 0;
      pref.forEach((e, i) => { cs += Math.cos(e.a - i * step); sn += Math.sin(e.a - i * step); });
      const offset = Math.atan2(sn, cs), R = ringRadius(dname);
      pref.forEach((e, i) => {
        const a = offset + i * step;
        slot[e.p.id] = { x: home.x + Math.cos(a) * R, y: home.y + Math.sin(a) * R };
      });
    });

    RAW.principles.forEach(p => {
      const parent = byId['d-' + p.domain];
      const hasContradiction = p.relations.some(r => r.type === 'contradicts');
      const n = { id: p.id, kind: 'principle', label: p.title, domain: p.domain,
        statement: p.statement, context: p.context, relations: p.relations,
        r: 9, hasContradiction, tx: slot[p.id].x, ty: slot[p.id].y,
        x: slot[p.id].x, y: slot[p.id].y };
      nodes.push(n); byId[n.id] = n;
      links.push({ source: parent.id, target: n.id, kind: 'cluster' });
    });
    RAW.works.forEach(w => {
      const used = w.principles.map(id => byId[id]).filter(Boolean);
      let cx = W / 2, cy = H / 2;
      if (used.length) {
        cx = used.reduce((s, n) => s + n.x, 0) / used.length;
        cy = used.reduce((s, n) => s + n.y, 0) / used.length;
      }
      // A work drawn from one domain has its centroid on top of that
      // domain's own node. Push it out past the ring instead, away from
      // the hub (or, for the hub, away from the canvas centre toward the
      // principles it actually uses).
      RAW.domains.forEach(dname => {
        const home = byId['d-' + dname];
        const clear = ringRadius(dname) + 85;
        let dx = cx - home.x, dy = cy - home.y, dist = Math.hypot(dx, dy);
        if (dist >= clear) return;
        if (dist < 1) {
          dx = home.x - W / 2; dy = home.y - H / 2;
          if (!dx && !dy) { const a = (RAW.works.indexOf(w) / RAW.works.length) * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }
          dist = Math.hypot(dx, dy);
        }
        cx = home.x + dx / dist * clear; cy = home.y + dy / dist * clear;
      });
      const n = { id: w.id, kind: 'work', label: w.title, status: w.status, project: w.project,
        summary: w.summary, principles: w.principles, r: 20, tx: cx, ty: cy, x: cx, y: cy };
      nodes.push(n); byId[n.id] = n;
      w.principles.forEach(pid => { if (byId[pid]) links.push({ source: n.id, target: pid, kind: 'uses' }); });
    });
    RAW.principles.forEach(p => {
      p.relations.forEach(r => {
        if (r.target_id && byId[r.target_id]) links.push({ source: p.id, target: r.target_id, kind: 'relation', type: r.type });
      });
    });

    const defs = svg.append('defs');
    function makeGlow(id, color) {
      const f = defs.append('filter').attr('id', id).attr('x', '-120%').attr('y', '-120%').attr('width', '340%').attr('height', '340%');
      f.append('feGaussianBlur').attr('stdDeviation', 5).attr('result', 'blur');
      const merge = f.append('feMerge');
      merge.append('feMergeNode').attr('in', 'blur');
      merge.append('feMergeNode').attr('in', 'SourceGraphic');
    }
    makeGlow('tb-glow-work', resolveVar('var(--tb-work-glow)'));
    makeGlow('tb-glow-dom', resolveVar('var(--gold-bright)'));
    makeGlow('tb-glow-warn', resolveVar('var(--rel-contradicts)'));

    const g = svg.append('g');
    const linkSel = g.append('g').attr('fill', 'none')
      .selectAll('line').data(links.filter(l => l.kind !== 'cluster')).join('line')
      .attr('stroke', d => d.kind === 'uses' ? 'rgba(184,137,74,0.28)' : resolveVar(REL_COLOR[d.type]))
      .attr('stroke-width', d => d.kind === 'uses' ? 1 : 1.8)
      .attr('stroke-dasharray', d => d.kind === 'uses' ? '2,3' : null)
      .attr('opacity', d => d.kind === 'uses' ? 0.7 : 0.85);
    const clusterSel = g.append('g')
      .selectAll('line').data(links.filter(l => l.kind === 'cluster')).join('line')
      .attr('stroke', 'rgba(58,53,42,0.6)').attr('stroke-width', 0.8);

    const nodeSel = g.append('g')
      .selectAll('g').data(nodes).join('g').attr('class', 'tb-node').style('cursor', 'pointer');

    nodeSel.filter(d => d.hasContradiction).append('circle')
      .attr('class', 'warn-ring').attr('r', d => d.r + 5).attr('fill', 'none')
      .attr('stroke', resolveVar('var(--rel-contradicts)')).attr('stroke-width', 1.6)
      .attr('opacity', 0.75).attr('filter', 'url(#tb-glow-warn)');

    nodeSel.append('path')
      .attr('d', d => d.kind === 'work' ? `M0,${-d.r} L${d.r},0 L0,${d.r} L${-d.r},0 Z` : null)
      .attr('fill', d => d.kind === 'work' ? 'var(--tb-work)' : null)
      .attr('filter', d => d.kind === 'work' ? 'url(#tb-glow-work)' : null)
      .style('display', d => d.kind === 'work' ? null : 'none');

    nodeSel.filter(d => d.kind !== 'work').append('circle')
      .attr('r', d => d.r)
      .attr('fill', d => resolveVar(d.kind === 'domain' ? DOMAIN_COLOR[d.label] : DOMAIN_COLOR[d.domain]))
      .attr('filter', d => d.kind === 'domain' ? 'url(#tb-glow-dom)' : null)
      .attr('opacity', d => d.kind === 'domain' ? 0.5 : 0.9)
      .attr('stroke', d => d.kind === 'domain' ? resolveVar(DOMAIN_COLOR[d.label]) : 'none')
      .attr('stroke-width', d => d.kind === 'domain' ? 1.5 : 0);

    nodeSel.filter(d => d.kind === 'domain').append('text')
      .attr('class', 'tb-dom-label').attr('text-anchor', 'middle').attr('dy', 5).attr('font-size', 13.5).text(d => d.label);
    nodeSel.filter(d => d.kind === 'work').append('text')
      .attr('class', 'tb-work-label').attr('text-anchor', 'middle').attr('dy', d => -(d.r + 8)).attr('font-size', 11)
      .text(d => d.label.length > 34 ? d.label.slice(0, 33) + '…' : d.label);
    nodeSel.filter(d => d.kind === 'principle').append('text')
      .attr('class', 'tb-node-label').attr('text-anchor', 'middle').attr('dy', d => -(d.r + 5)).attr('font-size', 11).attr('opacity', 0.7)
      .text(d => d.label.length > 30 ? d.label.slice(0, 29) + '…' : d.label);

    // Placement comes from the ring slots and work targets above, not from
    // the links: with 100+ relation and "uses" links all pulling, every
    // cluster used to collapse into one tangle in the middle of the canvas.
    // Links stay drawn but only nudge; collision keeps labels apart.
    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).strength(0))
      .force('x', d3.forceX(d => d.tx ?? d.x).strength(d => d.kind === 'principle' ? 0.35 : d.kind === 'work' ? 0.2 : 0))
      .force('y', d3.forceY(d => d.ty ?? d.y).strength(d => d.kind === 'principle' ? 0.35 : d.kind === 'work' ? 0.2 : 0))
      .force('charge', d3.forceManyBody().strength(d => d.kind === 'work' ? -260 : -60).distanceMax(260))
      .force('collide', d3.forceCollide().iterations(3).radius(d => d.kind === 'principle' ? d.r + 14 : d.kind === 'work' ? d.r + 55 : d.r + 20))
      .stop();
    // Settle before the first paint so the map opens already laid out
    // rather than wobbling into place.
    sim.tick(Math.ceil(Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay())));
    sim.on('tick', ticked);
    ticked();

    function ticked() {
      nodes.forEach(d => {
        d.x = Math.max(d.r + 30, Math.min(W - d.r - 30, d.x));
        d.y = Math.max(d.r + 40, Math.min(H - d.r - 30, d.y));
      });
      linkSel.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      clusterSel.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
    }

    nodeSel.call(d3.drag()
      .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    // A node's own mousedown bubbles up to the svg: without this filter,
    // zoom's pan gesture and a node's drag gesture both start from the same
    // event and fight over the same pointer, which is what made dragging a
    // node and panning/zooming the canvas feel random. Let drag own events
    // that start on a node; zoom takes everything else.
    // Principle labels only show once zoomed in far enough to read them
    // (or on hover, trace and search) — at full-map zoom 51 of them just
    // stack into noise over the links.
    const zoom = d3.zoom().scaleExtent([0.3, 4])
      .filter(event => (!event.ctrlKey || event.type === 'wheel') && !event.button && !event.target.closest('.tb-node'))
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        svg.classed('tb-zoomed', event.transform.k >= 1.6);
      });
    svg.call(zoom);

    const pad = 60;
    const [x0, x1] = d3.extent(nodes, d => d.x), [y0, y1] = d3.extent(nodes, d => d.y);
    const k = Math.min(W / (x1 - x0 + pad * 2), H / (y1 - y0 + pad * 2), 1.5);
    svg.call(zoom.transform, d3.zoomIdentity
      .translate(W / 2 - k * (x0 + x1) / 2, H / 2 - k * (y0 + y1) / 2).scale(k));

    function relRow(r) {
      const color = resolveVar(REL_COLOR[r.type]);
      const targetTitle = (byId[r.target_id] || {}).label || r.target;
      return `<div class="rel-item" data-target="${r.target_id || ''}">` +
        `<span class="rel-type" style="background:${color}22;color:${color}">${r.type}</span>` +
        `<span class="rel-target">${targetTitle}</span>` +
        `<div class="rel-note">${r.note || ''}</div></div>`;
    }
    function showDetail(d) {
      if (d.kind === 'domain') {
        kickerEl.textContent = 'Domain'; labelEl.textContent = d.label;
        bodyEl.innerHTML = `<div class="meta">${d.count} principle${d.count === 1 ? '' : 's'} in this domain. Click one to explore it.</div>`;
      } else if (d.kind === 'work') {
        kickerEl.textContent = 'Work · ' + (d.project || ''); labelEl.textContent = d.label;
        const plist = d.principles.map(pid => { const p = byId[pid]; return p ? `<div class="plink" data-target="${pid}">→ ${p.label}</div>` : ''; }).join('');
        bodyEl.innerHTML = `<div class="meta">status: ${d.status || '—'}</div>` +
          `<div class="statement">${d.summary}</div>` +
          `<div class="rels"><div class="meta" style="margin-bottom:4px;">Principles used</div><div class="plist">${plist}</div></div>`;
      } else {
        kickerEl.textContent = 'Principle · ' + d.domain; labelEl.textContent = d.label;
        const rels = (d.relations || []).map(relRow).join('');
        bodyEl.innerHTML = `<div class="statement">${d.statement}</div>` +
          `<div class="context">${d.context}</div>` + (rels ? `<div class="rels">${rels}</div>` : '');
      }
      bodyEl.querySelectorAll('[data-target]').forEach(el => {
        el.addEventListener('click', (ev) => { ev.stopPropagation(); const t = byId[el.getAttribute('data-target')]; if (t) focusNode(t); });
      });
      detailEl.classList.add('show');
    }
    function neighborsOf(id) {
      const s = new Set([id]);
      links.forEach(l => {
        const a = l.source.id ?? l.source, b = l.target.id ?? l.target;
        if (a === id) s.add(b); if (b === id) s.add(a);
      });
      return s;
    }
    function focusNode(d) {
      const near = neighborsOf(d.id);
      nodeSel.selectAll('circle:not(.warn-ring), path').transition().duration(200)
        .attr('opacity', n => near.has(n.id) ? (n.kind === 'domain' ? 0.6 : 0.95) : 0.08);
      nodeSel.selectAll('text').transition().duration(200)
        .attr('opacity', n => near.has(n.id) ? (n.kind === 'principle' ? 0.95 : 1) : 0.05);
      linkSel.transition().duration(200).attr('opacity', l => (near.has(l.source.id ?? l.source) && near.has(l.target.id ?? l.target)) ? 1 : 0.04);
      clusterSel.transition().duration(200).attr('opacity', l => (near.has(l.source.id ?? l.source) && near.has(l.target.id ?? l.target)) ? 0.5 : 0.04);
      nodeSel.classed('lit', n => near.has(n.id));
      showDetail(d);
    }
    nodeSel.on('click', (event, d) => { event.stopPropagation(); focusNode(d); });
    svg.on('click', () => {
      nodeSel.selectAll('circle:not(.warn-ring), path').transition().duration(200).attr('opacity', d => d.kind === 'domain' ? 0.5 : 0.9);
      nodeSel.selectAll('text').transition().duration(200).attr('opacity', d => d && d.kind === 'principle' ? 0.7 : 1);
      linkSel.transition().duration(200).attr('opacity', d => d.kind === 'uses' ? 0.7 : 0.85);
      clusterSel.transition().duration(200).attr('opacity', 1);
      nodeSel.classed('lit', false);
      detailEl.classList.remove('show');
    });

    searchEl.addEventListener('input', () => {
      const q = searchEl.value.trim().toLowerCase();
      if (!q) {
        nodeSel.selectAll('circle:not(.warn-ring), path').attr('opacity', d => d.kind === 'domain' ? 0.5 : 0.9);
        nodeSel.selectAll('text').attr('opacity', d => d && d.kind === 'principle' ? 0.7 : 1);
        nodeSel.classed('lit', false);
        searchCountEl.textContent = ''; return;
      }
      let count = 0;
      nodeSel.selectAll('circle:not(.warn-ring), path').attr('opacity', d => {
        if (d.kind === 'domain') return 0.15;
        const hit = d.label.toLowerCase().includes(q); if (hit) count++;
        return hit ? 1 : 0.06;
      });
      nodeSel.selectAll('text').attr('opacity', d => {
        if (!d) return 0; if (d.kind === 'domain') return 0.15;
        return d.label.toLowerCase().includes(q) ? 1 : 0.06;
      });
      nodeSel.classed('lit', d => d.kind !== 'domain' && d.label.toLowerCase().includes(q));
      searchCountEl.textContent = count + ' match' + (count === 1 ? '' : 'es');
    });
  }

  async function load() {
    if (loading || rendered) return;
    if (!hfClient) { setGate('Sign-in needs a network connection. Reconnect and reload.', false); return; }
    if (!hfSession) { setGate('This room is locked. Sign in with the owner email to open it.', true); return; }
    loading = true;
    try {
      const { data, error } = await hfClient.from('third_brain_map').select('data, generated_at').maybeSingle();
      if (error) { setGate(`Could not open the map: ${error.message}`, false); return; }
      if (!data) { setGate('Nothing here for this account.', false); return; }
      renderGraph(data.data);
    } finally {
      loading = false;
    }
  }

  window.addEventListener('hf:auth', load);
  setInterval(() => { if (!document.hidden && !rendered) load(); }, REFRESH_MS);

  if (!hfClient) {
    load();
  } else {
    setTimeout(() => { if (!rendered && !loading && gateText.textContent.startsWith('Checking')) load(); }, 2500);
  }
})();
