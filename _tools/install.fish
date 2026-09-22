#!/usr/bin/env fish
# Installs the single keeper timer (forge-sync) and retires the older,
# separate timers it replaces. Run after `vault_dashboard.py setup` and
# the Supabase SQL. Safe to re-run.
set -l here (status dirname)
set -l units ~/.config/systemd/user
mkdir -p $units
cp $here/forge-sync.service $here/forge-sync.timer $units/

# Retire the timers forge-sync now covers. Their unit files stay on disk.
for old in forge-dashboard.timer vault-sync.timer
    if systemctl --user is-enabled $old >/dev/null 2>&1
        systemctl --user disable --now $old
        echo "retired $old"
    end
end

systemctl --user daemon-reload
systemctl --user enable --now forge-sync.timer
systemctl --user start forge-sync.service
echo ""
echo "Keeper installed. Next runs:"
systemctl --user list-timers forge-sync.timer --no-pager
echo ""
journalctl --user -u forge-sync.service -n 15 --no-pager
