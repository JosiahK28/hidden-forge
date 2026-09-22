#!/usr/bin/env python3
"""
One keeper for everything that has to stay current.

Runs every 15 minutes from forge-sync.timer and does only what is needed:

  1. Vault backup   — commit + push ~/Documents/Obsidian-Vault-King, but only
                      when git says something changed.
  2. Dashboard      — rescan the vault and upload stats, but only when the
                      numbers actually moved since the last upload.
  3. Third Brain    — re-export the map, but only when a Principle or Work
                      changed since the last upload.

Idle runs make no network request and write nothing to the journal, so
`journalctl --user -u forge-sync` is a log of real events, not heartbeats.

  python3 forge_sync.py          # the real run (what the timer calls)
  python3 forge_sync.py --check  # say what it would do, change nothing

Replaces the old forge-dashboard.timer and vault-sync.timer.
Standard library only.
"""
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
HOME = Path.home()
CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME", HOME / ".config")) / "forge-dashboard"
CACHE_DIR = Path(os.environ.get("XDG_CACHE_HOME", HOME / ".cache")) / "forge-dashboard"
STATE_FILE = CACHE_DIR / "sync-state.json"
VAULT_SYNC = HOME / ".local" / "bin" / "vault-sync.fish"
DRY = "--check" in sys.argv

steps = []          # (name, ok, message) — only real events are printed


def say(name, ok, msg):
    steps.append((name, ok, msg))
    print(f"{'[would] ' if DRY else ''}{name}: {msg}", flush=True)


def run(cmd, cwd=None, timeout=300):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    return p.returncode, (p.stdout + p.stderr).strip()


def state():
    try:
        return json.loads(STATE_FILE.read_text())
    except (OSError, ValueError):
        return {}


def save_state(st):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(st))


def digest(payload):
    """Hash a payload ignoring its timestamp, so 'no change' means no upload."""
    body = {k: v for k, v in payload.items() if k != "generated_at"}
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()


def vault_path():
    try:
        return Path(json.loads((CONFIG_DIR / "config.json").read_text())["vault"]).expanduser()
    except (OSError, ValueError, KeyError):
        return HOME / "Documents" / "Obsidian-Vault-King"


# ---------------------------------------------------------------- steps

def backup(st):
    vault = vault_path()
    if not (vault / ".git").is_dir():
        return
    lock = vault / ".git" / "index.lock"
    if lock.exists() and not DRY:
        # A lock left by a crashed or sandboxed git blocks every commit until
        # it is cleared. Nothing else writes this repo, so it is always stale.
        try:
            lock.unlink()
            say("backup", True, "cleared a stale git lock")
        except OSError:
            pass
    code, out = run(["git", "status", "--porcelain"], cwd=vault)
    if code != 0:
        say("backup", False, f"git status failed: {out[:200]}")
        return
    changed = len([l for l in out.splitlines() if l.strip()])
    if not changed:
        return
    if DRY:
        say("backup", True, f"{changed} changed files would be committed and pushed")
        return
    if VAULT_SYNC.exists():
        code, out = run([str(VAULT_SYNC)], timeout=600)
    else:
        code, out = run(["git", "add", "-A"], cwd=vault)
        if code == 0:
            code, out = run(["git", "commit", "-m", "auto: keep the vault backed up"], cwd=vault)
        if code == 0:
            code, out = run(["git", "push"], cwd=vault, timeout=600)
    say("backup", code == 0, f"{changed} files — {'pushed' if code == 0 else 'FAILED: ' + out[-300:]}")


def push_payload(name, script, build_args, st):
    """Build a payload with the given pusher, upload only if it changed."""
    script = HERE / script
    if not script.exists():
        return
    code, out = run([sys.executable, str(script), "build"] + build_args, timeout=300)
    if code != 0:
        say(name, False, f"build failed: {out[-300:]}")
        return
    try:
        payload = json.loads(out)
    except ValueError:
        say(name, False, "build produced no JSON")
        return
    d = digest(payload)
    if st.get(name) == d:
        return
    if DRY:
        say(name, True, "changed — would upload")
        return
    code, out = run([sys.executable, str(script), "push"], timeout=300)
    if code != 0:
        say(name, False, f"upload failed: {out[-300:]}")
        return
    st[name] = d
    say(name, True, out.strip() or "uploaded")


def main():
    st = state()
    before = dict(st)
    try:
        backup(st)
        push_payload("dashboard", "vault_dashboard.py", [], st)
        if (CONFIG_DIR / "third_brain_config.json").exists():
            push_payload("third_brain", "third_brain_push.py", [], st)
    finally:
        if not DRY and st != before:
            save_state(st)
    if DRY and not steps:
        print("[would] nothing — everything is already current", flush=True)
    sys.exit(1 if any(not ok for _, ok, _ in steps) else 0)


if __name__ == "__main__":
    main()
