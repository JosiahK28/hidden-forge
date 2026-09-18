#!/usr/bin/env python3
"""
Vault dashboard generator for The Hidden Forge.

Scans the Obsidian vault, computes stats (writing output, project status,
vault health, recent & open work) and pushes them to Supabase, where the
row is readable only by the owner's signed-in account (see setup.sql).

No note bodies ever leave the machine: only counts, titles, dates, task
lines and link names.

  python3 vault_dashboard.py setup   # once: make config + push key, print SQL
  python3 vault_dashboard.py build   # print the payload JSON (dry run)
  python3 vault_dashboard.py push    # build and upload (what the timer runs)

Standard library only. The folder name starts with "_" so GitHub Pages
(Jekyll) never publishes it.
"""
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

HOME = Path.home()
CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME", HOME / ".config")) / "forge-dashboard"
CACHE_DIR = Path(os.environ.get("XDG_CACHE_HOME", HOME / ".cache")) / "forge-dashboard"
CONFIG_FILE = CONFIG_DIR / "config.json"
CACHE_FILE = CACHE_DIR / "cache.json"
SITE_ROOT = Path(__file__).resolve().parent.parent

DEFAULTS = {
    "vault": str(HOME / "Documents" / "Obsidian-Vault-King"),
    # Folders never counted. Matched against each path segment.
    "skip_dirs": [".git", ".obsidian", ".trash", ".stfolder", ".stversions",
                  ".buildian", ".claude", "Claude"],
    # Notes that exist to hold structure, not writing.
    "structural": ["_Templates", "_Dashboards"],
    # Titles under these folders are shown as "(private note)".
    "redact": ["01-Projects/Second Brain/03_People"],
    "projects_dir": "01-Projects",
    "inbox_dir": "00-Inbox",
    "heatmap_weeks": 26,
}

WORD_RE = re.compile(r"[A-Za-z0-9À-ɏ]+(?:['’-][A-Za-z0-9À-ɏ]+)*")
FM_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*(?:\n|\Z)", re.S)
FENCE_RE = re.compile(r"^(```|~~~).*?^\1", re.S | re.M)
CODE_RE = re.compile(r"`[^`\n]*`")
COMMENT_RE = re.compile(r"<!--.*?-->|%%.*?%%", re.S)
WIKI_RE = re.compile(r"(!?)\[\[([^\]\|#\^]*)(?:[#\^][^\]\|]*)?(?:\|([^\]]*))?\]\]")
MDLINK_RE = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
TAG_RE = re.compile(r"(?:(?<=\s)|^)#([A-Za-z][\w/-]*)")
TASK_RE = re.compile(r"^\s*[-*+]\s+\[( |x|X)\]\s+(.*\S)", re.M)
DATE_PREFIX_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})")
OPEN_STATUSES = {"draft", "raw", "fragment", "open", "unanswered", "partially-answered",
                 "partially-resolved", "in-progress", "wip", "todo", "needs-review"}


# ---------------------------------------------------------------- config

def load_config():
    if not CONFIG_FILE.exists():
        sys.exit(f"No config at {CONFIG_FILE}. Run: python3 {__file__} setup")
    cfg = dict(DEFAULTS)
    cfg.update(json.loads(CONFIG_FILE.read_text()))
    return cfg


def site_supabase():
    """Read the public project URL + anon key straight from js/store.js."""
    src = (SITE_ROOT / "js" / "store.js").read_text()
    url = re.search(r"HF_SUPABASE_URL\s*=\s*'([^']+)'", src).group(1)
    key = re.search(r"HF_SUPABASE_ANON_KEY\s*=\s*'([^']+)'", src).group(1)
    return url, key


def cmd_setup():
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(CONFIG_DIR, 0o700)
    existing = json.loads(CONFIG_FILE.read_text()) if CONFIG_FILE.exists() else {}
    vault = input(f"Vault path [{existing.get('vault', DEFAULTS['vault'])}]: ").strip() \
        or existing.get("vault", DEFAULTS["vault"])
    email = input(f"Email you sign in to the site with [{existing.get('owner_email', '')}]: ").strip() \
        or existing.get("owner_email", "")
    if not email or "@" not in email:
        sys.exit("An email is required.")
    if existing.get("push_key") and input("Keep the existing push key? [Y/n]: ").strip().lower() != "n":
        key = existing["push_key"]
    else:
        key = secrets.token_urlsafe(32)
    cfg = dict(existing, vault=os.path.expanduser(vault), owner_email=email.lower(), push_key=key)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
    os.chmod(CONFIG_FILE, 0o600)

    key_hash = hashlib.sha256(key.encode()).hexdigest()
    sql = (Path(__file__).parent / "setup.sql").read_text()
    sql = sql.replace("__OWNER_EMAIL__", email.lower()).replace("__PUSH_KEY_SHA256__", key_hash)
    out = CONFIG_DIR / "setup.sql"
    out.write_text(sql)
    os.chmod(out, 0o600)
    print(f"\nConfig written to {CONFIG_FILE} (mode 600).")
    print(f"SQL written to {out}.")
    print("Paste that file into Supabase -> SQL Editor -> Run, then:")
    print(f"  python3 {__file__} push")


# ---------------------------------------------------------------- parsing

def parse_frontmatter(text):
    m = FM_RE.match(text)
    if not m:
        return {}, text
    data, key = {}, None
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        item = re.match(r"^\s*-\s+(.*)$", line)
        if item and key:
            if not isinstance(data.get(key), list):
                data[key] = []
            data[key].append(item.group(1).strip().strip("'\""))
            continue
        kv = re.match(r"^([A-Za-z_][\w -]*):\s*(.*)$", line)
        if kv:
            key = kv.group(1).strip().lower()
            val = kv.group(2).strip()
            if val.startswith("[") and val.endswith("]"):
                data[key] = [v.strip().strip("'\"") for v in val[1:-1].split(",") if v.strip()]
            else:
                data[key] = val.strip("'\"")
    return data, text[m.end():]


def as_list(v):
    if v is None or v == "":
        return []
    return v if isinstance(v, list) else [s.strip() for s in str(v).split(",") if s.strip()]


def plain_words(body):
    body = FENCE_RE.sub(" ", body)
    body = COMMENT_RE.sub(" ", body)
    body = CODE_RE.sub(" ", body)
    body = WIKI_RE.sub(lambda m: "" if m.group(1) else (m.group(3) or m.group(2)), body)
    body = MDLINK_RE.sub(lambda m: m.group(1), body)
    body = re.sub(r"https?://\S+", " ", body)
    return len(WORD_RE.findall(body))


def count_words(text):
    return plain_words(parse_frontmatter(text)[1])


def skipped(rel_parts, cfg):
    return any(p in cfg["skip_dirs"] for p in rel_parts[:-1])


# ---------------------------------------------------------------- git

def git(vault, *args):
    try:
        r = subprocess.run(["git", "-C", str(vault), *args], capture_output=True,
                           text=True, timeout=120)
        return r.stdout if r.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def load_cache():
    try:
        return json.loads(CACHE_FILE.read_text())
    except (OSError, ValueError):
        return {}


def save_cache(cache):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CACHE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache))
    tmp.replace(CACHE_FILE)


def git_history(vault, cfg, cache):
    """Per-day word totals (from the last commit of each day) and files touched per day."""
    blob_words = cache.setdefault("blob_words", {})
    day_totals = cache.setdefault("day_totals", {})

    last_of_day = {}
    for line in git(vault, "log", "--format=%H %cd", "--date=format-local:%Y-%m-%d").splitlines():
        sha, d = line.split()
        last_of_day.setdefault(d, sha)  # log is newest-first

    for d, sha in last_of_day.items():
        if day_totals.get(d, {}).get("sha") == sha:
            continue
        tree = git(vault, "ls-tree", "-r", "-z", sha)
        entries = []
        for rec in tree.split("\0"):
            if not rec or "\t" not in rec:
                continue
            meta, path = rec.split("\t", 1)
            parts = meta.split()
            if parts[1] != "blob" or not path.endswith(".md"):
                continue
            if skipped(path.split("/"), cfg):
                continue
            entries.append((parts[2], path))
        missing = sorted({b for b, _ in entries if b not in blob_words})
        if missing:
            proc = subprocess.run(["git", "-C", str(vault), "cat-file", "--batch"],
                                  input=("\n".join(missing) + "\n").encode(),
                                  capture_output=True, timeout=120)
            buf, pos = proc.stdout, 0
            for b in missing:
                nl = buf.index(b"\n", pos)
                header = buf[pos:nl].split()
                size = int(header[2])
                content = buf[nl + 1:nl + 1 + size].decode("utf-8", "replace")
                blob_words[b] = count_words(content)
                pos = nl + 1 + size + 1
        by_project = Counter()
        total = 0
        for b, path in entries:
            w = blob_words.get(b, 0)
            total += w
            by_project[project_of(path.split("/"), cfg)] += w
        day_totals[d] = {"sha": sha, "total": total, "by_project": dict(by_project)}

    touched = defaultdict(set)
    current = None
    for line in git(vault, "log", "--name-only", "--format=@%cd",
                    "--date=format-local:%Y-%m-%d").splitlines():
        if line.startswith("@"):
            current = line[1:]
        elif line.endswith(".md") and current and not skipped(line.split("/"), cfg):
            touched[current].add(line)

    added = {}
    current = None
    for line in git(vault, "log", "--diff-filter=A", "--name-only", "--format=@%cd",
                    "--date=format-local:%Y-%m-%d").splitlines():
        if line.startswith("@"):
            current = line[1:]
        elif line.endswith(".md") and current:
            added[line] = current  # oldest wins, log is newest-first
    return day_totals, touched, added


def project_of(parts, cfg):
    if len(parts) > 2 and parts[0] == cfg["projects_dir"]:
        return parts[1]
    return parts[0] if len(parts) > 1 else "(root)"


# ---------------------------------------------------------------- scan

def scan(cfg):
    vault = Path(cfg["vault"]).expanduser()
    if not vault.is_dir():
        sys.exit(f"Vault not found: {vault}")
    notes, all_names, canvases, attachments = [], {}, [], [0, 0]
    for root, dirs, files in os.walk(vault):
        rel_root = Path(root).relative_to(vault)
        dirs[:] = [d for d in dirs if d not in cfg["skip_dirs"] and not d.startswith(".")]
        for f in files:
            p = Path(root) / f
            rel = (rel_root / f).as_posix()
            all_names.setdefault(f.lower(), rel)
            all_names.setdefault(rel.lower(), rel)
            if f.endswith(".md"):
                all_names.setdefault(f[:-3].lower(), rel)
                all_names.setdefault(rel[:-3].lower(), rel)
                notes.append((p, rel))
            elif f.endswith(".canvas"):
                canvases.append((p, rel))
            elif not f.startswith("."):
                attachments[0] += 1
                attachments[1] += p.stat().st_size
    return vault, notes, all_names, canvases, attachments


def build(cfg):
    cache = load_cache()
    vault, note_files, names, canvases, attachments = scan(cfg)
    day_totals, touched, git_added = git_history(vault, cfg, cache)
    today = date.today()
    structural = set(cfg["structural"])
    redact = [r.rstrip("/") + "/" for r in cfg["redact"]]

    def title_for(rel):
        if any(rel.startswith(r) for r in redact):
            return "(private note)"
        return Path(rel).stem

    notes = []
    inbound = Counter()
    broken = []
    for p, rel in note_files:
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        st = p.stat()
        fm, body = parse_frontmatter(text)
        parts = rel.split("/")
        mtime = datetime.fromtimestamp(st.st_mtime)
        created = None
        for k in ("created", "date"):
            m = DATE_PREFIX_RE.match(str(fm.get(k, "")))
            if m:
                created = m.group(1)
                break
        if not created:
            m = DATE_PREFIX_RE.match(p.name)
            created = m.group(1) if m else None
        if not created:
            created = min(filter(None, [git_added.get(rel), mtime.date().isoformat()]))
        tags = {t.lstrip("#").lower() for t in as_list(fm.get("tags"))}
        clean = CODE_RE.sub(" ", COMMENT_RE.sub(" ", FENCE_RE.sub(" ", body)))
        tags |= {t.lower() for t in TAG_RE.findall(clean)}
        fm_block = text[:len(text) - len(body)]
        is_struct = any(s in parts for s in structural)
        links = set()
        for m in WIKI_RE.finditer(fm_block + "\n" + clean):
            target = m.group(2).strip()
            if not target:
                continue
            key = target.lower()
            hit = names.get(key) or names.get(key + ".md") or names.get(key.split("/")[-1])
            if hit:
                if hit != rel:
                    links.add(hit)
            elif not is_struct:
                broken.append({"from": title_for(rel), "path": rel, "target": target})
        for t in links:
            inbound[t] += 1
        tasks = TASK_RE.findall(clean)
        n = {
            "rel": rel,
            "title": title_for(rel),
            "project": project_of(parts, cfg),
            "section": parts[2] if len(parts) > 3 and parts[0] == cfg["projects_dir"] else "",
            "words": plain_words(body),
            "mtime": mtime.isoformat(timespec="minutes"),
            "created": created,
            "status": re.split(r"\s+[\u2014\u2013(-]\s*|\s*\|", str(fm.get("status", "")).strip().lower())[0][:24],
            "type": str(fm.get("type", "")).strip().lower(),
            "has_fm": bool(fm),
            "tags": sorted(tags),
            "links_out": len(links),
            "open_tasks": [t[1] for t in tasks if t[0] == " "],
            "done_tasks": sum(1 for t in tasks if t[0] != " "),
            "structural": is_struct or parts[-1] in ("CLAUDE.md",),
        }
        notes.append(n)

    for p, rel in canvases:
        try:
            data = json.loads(p.read_text())
            for node in data.get("nodes", []):
                if node.get("type") == "file" and node.get("file"):
                    inbound[node["file"]] += 1
        except (OSError, ValueError):
            pass

    content = [n for n in notes if not n["structural"]]

    # ---------- writing output
    fs_touched = Counter(n["mtime"][:10] for n in notes)
    days = {}
    for d, files in touched.items():
        days[d] = len(files)
    for d, c in fs_touched.items():
        days[d] = max(days.get(d, 0), c)
    created_per_day = Counter(n["created"] for n in content)
    start = today - timedelta(days=cfg["heatmap_weeks"] * 7 - 1)
    start -= timedelta(days=start.weekday())  # align to Monday
    heat = []
    d = start
    while d <= today:
        k = d.isoformat()
        heat.append({"d": k, "touched": days.get(k, 0), "created": created_per_day.get(k, 0)})
        d += timedelta(days=1)
    streak = 0
    d = today if days.get(today.isoformat()) else today - timedelta(days=1)
    while days.get(d.isoformat()):
        streak += 1
        d -= timedelta(days=1)
    longest, run = 0, 0
    for h in heat:
        run = run + 1 if h["touched"] else 0
        longest = max(longest, run)

    total_words = sum(n["words"] for n in content)
    snap = cache.setdefault("snapshots", {})
    by_project_now = Counter()
    for n in content:
        by_project_now[n["project"]] += n["words"]
    snap[today.isoformat()] = {"total": total_words, "by_project": dict(by_project_now)}
    # Merge git day totals with live snapshots; the live snapshot wins for its day.
    merged_days = dict(day_totals)
    merged_days.update(snap)
    series = {k: v["total"] for k, v in merged_days.items()}
    ordered = sorted(series.items())
    daily = []
    prev = None
    for k, tot in ordered:
        if prev is not None:
            daily.append({"d": k, "net": tot - prev})
        prev = tot
    daily = [x for x in daily if x["d"] >= (today - timedelta(days=29)).isoformat()]
    week_ago = (today - timedelta(days=7)).isoformat()
    base = [t for k, t in ordered if k <= week_ago]
    words_7d = total_words - base[-1] if base else None

    writing = {
        "total_words": total_words,
        "total_notes": len(content),
        "words_7d": words_7d,
        "notes_created_7d": sum(c for k, c in created_per_day.items() if k and k > week_ago),
        "streak": streak,
        "longest_streak": longest,
        "active_days_30": sum(1 for h in heat if h["d"] > (today - timedelta(days=30)).isoformat() and h["touched"]),
        "daily_net": daily,
        "heatmap": heat,
        "history_since": ordered[0][0] if ordered else None,
    }

    # ---------- projects
    projects = []
    pdir = vault / cfg["projects_dir"]
    pnames = sorted(d.name for d in pdir.iterdir() if d.is_dir() and not d.name.startswith(".")) if pdir.is_dir() else []
    for name in pnames:
        pn = [n for n in content if n["project"] == name]
        sections = []
        sec_dirs = sorted(d.name for d in (pdir / name).iterdir()
                          if d.is_dir() and not d.name.startswith(".") and d.name not in structural)
        for s in sec_dirs:
            sn = [n for n in pn if n["section"] == s]
            sections.append({
                "name": s, "notes": len(sn), "words": sum(n["words"] for n in sn),
                "last": max((n["mtime"] for n in sn), default=None),
            })
        pieces = []
        for s in sec_dirs:
            if re.search(r"chapter|draft", s, re.I):
                for n in sorted((n for n in pn if n["section"] == s), key=lambda n: n["rel"]):
                    pieces.append({"title": n["title"], "section": s, "words": n["words"],
                                   "status": n["status"], "mtime": n["mtime"]})
        prev7 = None
        for k, v in sorted(merged_days.items()):
            if k <= week_ago:
                prev7 = v.get("by_project", {}).get(name, 0)
        words = sum(n["words"] for n in pn)
        projects.append({
            "name": name,
            "notes": len(pn),
            "words": words,
            "words_7d": (words - prev7) if prev7 is not None else None,
            "last": max((n["mtime"] for n in pn), default=None),
            "status": dict(Counter(n["status"] for n in pn if n["status"])),
            "types": dict(Counter(n["type"] for n in pn if n["type"])),
            "open_tasks": sum(len(n["open_tasks"]) for n in pn),
            "done_tasks": sum(n["done_tasks"] for n in pn),
            "sections": sections,
            "pieces": pieces,
        })

    # ---------- health
    inbox = [n for n in notes if n["rel"].startswith(cfg["inbox_dir"] + "/")]
    orphan_pool = [n for n in content if not n["rel"].startswith(cfg["inbox_dir"] + "/")
                   and "/" in n["rel"] and not re.match(r"^0+_?(index|manual)", Path(n["rel"]).stem, re.I)]
    orphans = [n for n in orphan_pool if inbound[n["rel"]] == 0 and n["links_out"] == 0]
    unlinked_in = [n for n in orphan_pool if inbound[n["rel"]] == 0]
    empty_dirs = []
    for top in sorted(os.listdir(vault)):
        tp = vault / top
        if tp.is_dir() and not top.startswith(".") and top not in cfg["skip_dirs"] and not any(tp.iterdir()):
            empty_dirs.append(top)
    health = {
        "inbox": {
            "count": len(inbox),
            "needs_review": sum(1 for n in inbox if "/_needs-review/" in n["rel"]),
            "oldest": min((n["mtime"] for n in inbox), default=None),
            "items": [{"title": n["title"], "mtime": n["mtime"], "words": n["words"]}
                      for n in sorted(inbox, key=lambda n: n["mtime"])][:15],
        },
        "orphans": {"count": len(orphans),
                    "items": [{"title": n["title"], "project": n["project"]} for n in orphans][:40]},
        "no_backlinks": len(unlinked_in),
        "broken_links": {"count": len(broken),
                         "items": sorted(broken, key=lambda b: b["path"])[:40]},
        "untagged": sum(1 for n in content if not n["tags"]),
        "no_frontmatter": sum(1 for n in content if not n["has_fm"]),
        "stubs": {"count": sum(1 for n in content if n["words"] < 30),
                  "items": [{"title": n["title"], "project": n["project"], "words": n["words"]}
                            for n in content if n["words"] < 30][:25]},
        "empty_folders": empty_dirs,
        "attachments": {"count": attachments[0], "bytes": attachments[1]},
        "canvases": len(canvases),
        "unsynced_changes": len([l for l in git(vault, "status", "--porcelain").splitlines() if l.strip()]),
        "last_commit": git(vault, "log", "-1", "--format=%cI").strip() or None,
    }

    # ---------- recent & open
    recent = sorted(content, key=lambda n: n["mtime"], reverse=True)[:15]
    open_tasks = []
    for n in sorted(content, key=lambda n: n["mtime"], reverse=True):
        for t in n["open_tasks"]:
            open_tasks.append({"task": t[:200], "title": n["title"], "project": n["project"]})
    drafts = [n for n in content if n["status"] in OPEN_STATUSES
              or any(s.startswith("open") for s in [n["status"]])]
    work = {
        "recent": [{"title": n["title"], "project": n["project"], "section": n["section"],
                    "mtime": n["mtime"], "words": n["words"]} for n in recent],
        "open_tasks": {"count": len(open_tasks), "items": open_tasks[:40]},
        "in_progress": {"count": len(drafts),
                        "items": [{"title": n["title"], "project": n["project"], "status": n["status"],
                                   "words": n["words"], "mtime": n["mtime"]}
                                  for n in sorted(drafts, key=lambda n: n["mtime"], reverse=True)][:30]},
        "top_tags": Counter(t for n in content for t in n["tags"]).most_common(12),
    }

    # keep the snapshot cache from growing forever
    for k in sorted(snap)[:-400]:
        del snap[k]
    save_cache(cache)

    return {
        "version": 1,
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "vault_name": vault.name,
        "writing": writing,
        "projects": projects,
        "health": health,
        "work": work,
    }


def cmd_push(cfg):
    payload = build(cfg)
    url, anon = site_supabase()
    body = json.dumps({"push_key": cfg["push_key"], "data": payload}).encode()
    req = urllib.request.Request(
        f"{url}/rest/v1/rpc/push_vault_dashboard", data=body, method="POST",
        headers={"apikey": anon, "Authorization": f"Bearer {anon}",
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
    except urllib.error.HTTPError as e:
        sys.exit(f"Push failed: HTTP {e.code} {e.read().decode(errors='replace')[:300]}")
    except urllib.error.URLError as e:
        sys.exit(f"Push failed (offline?): {e.reason}")
    w = payload["writing"]
    print(f"Pushed {payload['generated_at']}: {w['total_notes']} notes, {w['total_words']} words.")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "push"
    if cmd == "setup":
        cmd_setup()
    elif cmd == "build":
        cfg = load_config() if CONFIG_FILE.exists() else dict(DEFAULTS)
        if len(sys.argv) > 2:
            cfg["vault"] = sys.argv[2]
        print(json.dumps(build(cfg), indent=2))
    elif cmd == "push":
        cmd_push(load_config())
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
