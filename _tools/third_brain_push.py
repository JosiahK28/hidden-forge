#!/usr/bin/env python3
"""
Third Brain map pusher for The Hidden Forge.

Extracts Principles and Works from the Obsidian vault's Third Brain project
(03_Principles/, 04_Works/) and pushes them to Supabase, where the row is
readable only by the owner's signed-in account (see third_brain_setup.sql).

Unlike vault_dashboard.py this is meant to be run by hand after a session
that adds or edits Principles/Works, not on a timer — the map doesn't
change every few minutes the way vault stats do.

  python3 third_brain_push.py setup   # once: make config + push key, print SQL
  python3 third_brain_push.py build   # print the payload JSON (dry run)
  python3 third_brain_push.py push    # build and upload

Standard library only. The folder name starts with "_" so GitHub Pages
(Jekyll) never publishes it.
"""
import hashlib
import json
import os
import re
import secrets
import sys
import urllib.request
from pathlib import Path

HOME = Path.home()
CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME", HOME / ".config")) / "forge-dashboard"
CONFIG_FILE = CONFIG_DIR / "third_brain_config.json"
SITE_ROOT = Path(__file__).resolve().parent.parent

DEFAULT_VAULT = HOME / "Documents" / "Obsidian-Vault-King"
THIRD_BRAIN_REL = Path("01-Projects") / "Third Brain"

DOMAIN_MAP = {
    "philosophical": "Philosophical", "political": "Political", "epistemic": "Epistemic",
    "personal": "Personal", "biblical": "Biblical", "theological": "Biblical",
    "methodological": "Epistemic",
}

FM_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*(?:\n|\Z)", re.S)
KEY_RE = re.compile(r"^([A-Za-z_][\w]*):\s*(.*)$")
LIST_ITEM_RE = re.compile(r"^\s*-\s+(.*)$")
REL_START_RE = re.compile(r"^\s*-\s*type:\s*(.*)$")
REL_FIELD_RE = re.compile(r"^\s{4,}(target|note):\s*(.*)$")
WIKI_RE = re.compile(r"\[\[([^\]]+)\]\]")


# ---------------------------------------------------------------- config

def load_config():
    if not CONFIG_FILE.exists():
        sys.exit(f"No config at {CONFIG_FILE}. Run: python3 {__file__} setup")
    return json.loads(CONFIG_FILE.read_text())


def cmd_setup():
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(CONFIG_DIR, 0o700)
    existing = json.loads(CONFIG_FILE.read_text()) if CONFIG_FILE.exists() else {}
    vault = input(f"Vault path [{existing.get('vault', DEFAULT_VAULT)}]: ").strip() \
        or existing.get("vault", str(DEFAULT_VAULT))
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
    sql = (Path(__file__).parent / "third_brain_setup.sql").read_text()
    sql = sql.replace("__OWNER_EMAIL__", email.lower()).replace("__PUSH_KEY_SHA256__", key_hash)
    out = CONFIG_DIR / "third_brain_setup.sql"
    out.write_text(sql)
    os.chmod(out, 0o600)
    print(f"\nConfig written to {CONFIG_FILE} (mode 600).")
    print(f"SQL written to {out}.")
    print("Paste that file into Supabase -> SQL Editor -> Run, then:")
    print(f"  python3 {__file__} push")


def site_supabase():
    """Read the public project URL + anon key straight from js/store.js."""
    src = (SITE_ROOT / "js" / "store.js").read_text()
    url = re.search(r"HF_SUPABASE_URL\s*=\s*'([^']+)'", src).group(1)
    key = re.search(r"HF_SUPABASE_ANON_KEY\s*=\s*'([^']+)'", src).group(1)
    return url, key


# ---------------------------------------------------------------- parsing

def strip_quotes(s):
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        return s[1:-1]
    return s or None


def parse_frontmatter(text):
    """Line-based parser for this vault's Principle/Work frontmatter shape —
    flat scalars, flat lists, and one level of nested list-of-dicts
    (`relations:`). Not a general YAML parser; matches exactly what
    _Templates/Principle.md and _Templates/Work.md produce."""
    m = FM_RE.match(text)
    if not m:
        return {}, text
    lines = m.group(1).split("\n")
    body = text[m.end():]
    data = {}
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        km = KEY_RE.match(line)
        if not km:
            i += 1
            continue
        key, val = km.group(1), km.group(2).strip()
        i += 1
        if val:
            data[key] = strip_quotes(val)
            continue
        if key == "relations":
            items = []
            while i < len(lines) and REL_START_RE.match(lines[i]):
                rtype = strip_quotes(REL_START_RE.match(lines[i]).group(1))
                i += 1
                item = {"type": rtype, "target": None, "note": None}
                while i < len(lines) and REL_FIELD_RE.match(lines[i]):
                    fm = REL_FIELD_RE.match(lines[i])
                    item[fm.group(1)] = strip_quotes(fm.group(2))
                    i += 1
                items.append(item)
            data[key] = items
        else:
            items = []
            while i < len(lines) and LIST_ITEM_RE.match(lines[i]):
                items.append(strip_quotes(LIST_ITEM_RE.match(lines[i]).group(1)))
                i += 1
            data[key] = items
    return data, body


def section(body, heading, next_heading=None):
    if next_heading:
        m = re.search(rf"## {heading}\s*\n\n(.*?)\n\n## {next_heading}", body, re.S)
    else:
        m = re.search(rf"## {heading}\s*\n\n(.*?)\s*\Z", body, re.S)
    return m.group(1).strip() if m else ""


def link_name(raw):
    if not raw:
        return None
    inner = raw.strip("[]")
    if "|" in inner:
        inner = inner.split("|", 1)[0]
    return inner.strip().split("/")[-1]


def clean_links(text):
    if not text:
        return text

    def repl(m):
        inner = m.group(1)
        if "|" in inner:
            return inner.split("|", 1)[1]
        return inner.split("/")[-1]

    return WIKI_RE.sub(repl, re.sub(r"\s*\n\s*", " ", text))


def slugify(name):
    return re.sub(r"[^a-zA-Z0-9]+", "-", name).strip("-").lower()[:60]


# ---------------------------------------------------------------- build

def build(cfg):
    vault = Path(cfg["vault"]).expanduser()
    tb = vault / THIRD_BRAIN_REL
    principles_dir = tb / "03_Principles"
    works_dir = tb / "04_Works"
    if not principles_dir.is_dir():
        sys.exit(f"No Third Brain Principles folder at {principles_dir}")

    principles = {}
    for path in sorted(principles_dir.glob("*.md")):
        stem = path.stem
        fm, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        domain_raw = str(fm.get("domain") or "").split("/")[0].strip().lower()
        domain = DOMAIN_MAP.get(domain_raw, "Philosophical")
        rels = []
        for r in fm.get("relations") or []:
            if r and r.get("type"):
                rels.append({"type": r["type"], "target": link_name(r.get("target")),
                             "note": clean_links(r.get("note") or "")})
        principles[stem] = {
            "id": "p-" + slugify(stem), "title": stem, "domain": domain,
            "statement": clean_links(section(body, "Statement", "Context")),
            "context": clean_links(section(body, "Context")),
            "relations": rels,
        }
    for p in principles.values():
        for r in p["relations"]:
            r["target_id"] = principles[r["target"]]["id"] if r["target"] in principles else None

    works = {}
    if works_dir.is_dir():
        for path in sorted(works_dir.glob("*.md")):
            stem = path.stem
            fm, body = parse_frontmatter(path.read_text(encoding="utf-8"))
            names = [link_name(p) for p in (fm.get("principles") or [])]
            works[stem] = {
                "id": "w-" + slugify(stem), "title": stem, "status": fm.get("status") or "",
                "project": fm.get("project") or "",
                "summary": clean_links(section(body, "Summary", "Principles used")),
                "principles": [principles[n]["id"] for n in names if n in principles],
            }

    return {
        "domains": sorted({p["domain"] for p in principles.values()}),
        "principles": list(principles.values()),
        "works": list(works.values()),
    }


def cmd_push(cfg):
    payload = build(cfg)
    url, anon = site_supabase()
    body = json.dumps({"push_key": cfg["push_key"], "data": payload}).encode()
    req = urllib.request.Request(
        f"{url}/rest/v1/rpc/push_third_brain_map", data=body, method="POST",
        headers={"apikey": anon, "Authorization": f"Bearer {anon}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
    except urllib.error.HTTPError as e:
        sys.exit(f"Push failed: HTTP {e.code} {e.read().decode(errors='replace')[:300]}")
    except urllib.error.URLError as e:
        sys.exit(f"Push failed (offline?): {e.reason}")
    print(f"Pushed: {len(payload['principles'])} principles, {len(payload['works'])} works, "
          f"{len(payload['domains'])} domains.")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "push"
    if cmd == "setup":
        cmd_setup()
    elif cmd == "build":
        cfg = load_config() if CONFIG_FILE.exists() else {"vault": str(DEFAULT_VAULT)}
        print(json.dumps(build(cfg), indent=2))
    elif cmd == "push":
        cmd_push(load_config())
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
