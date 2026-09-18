#!/usr/bin/env fish
# Installs the dashboard refresh timer as a systemd user unit.
# Run after `python3 vault_dashboard.py setup` and the Supabase SQL.
set -l here (status dirname)
set -l units ~/.config/systemd/user
mkdir -p $units
cp $here/forge-dashboard.service $here/forge-dashboard.timer $units/
systemctl --user daemon-reload
systemctl --user enable --now forge-dashboard.timer
systemctl --user start forge-dashboard.service
and echo "First push done. Timer:"
systemctl --user list-timers forge-dashboard.timer --no-pager
journalctl --user -u forge-dashboard.service -n 5 --no-pager
