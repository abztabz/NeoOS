#!/bin/bash
set -euo pipefail
script="$(cd "$(dirname "$0")/.." && pwd)/Recover_NeoStudio_Background.command"
bash -n "$script"
failtemp="$(mktemp -d)"; trap 'rm -rf "$failtemp"' EXIT
mkdir -p "$failtemp/bin" "$failtemp/home"
cat > "$failtemp/bin/uname" <<'MOCK'
#!/bin/sh
echo Darwin
MOCK
cat > "$failtemp/bin/launchctl" <<'MOCK'
#!/bin/sh
case "$1" in
  print) case "$2" in gui/*/com.neostudio.background) echo "state = running";exit 0;; esac;;
  kickstart) printf "%s\n" "$*" > "$HOME/restart-request";exit 0;;
esac
exit 1
MOCK
cat > "$failtemp/bin/sleep" <<'MOCK'
#!/bin/sh
exit 0
MOCK
chmod +x "$failtemp/bin/"*
# Refuse path: no restart.
printf 'n\n' | HOME="$failtemp/home" PATH="$failtemp/bin:$PATH" bash "$script" > "$failtemp/declined.txt"
test ! -e "$failtemp/home/restart-request" && grep -q 'No changes made' "$failtemp/declined.txt"
# Allowed path: exactly scoped restart, diagnostics generated.
printf 'y\n' | HOME="$failtemp/home" PATH="$failtemp/bin:$PATH" bash "$script" > "$failtemp/approved.txt"
grep -q 'launchctl can read the service again' "$failtemp/approved.txt"
grep -Eq "^kickstart -k gui/[0-9]+/com.neostudio.background$" "$failtemp/home/restart-request"
find "$failtemp/home/NeoOS/diagnostics" -name after-launchctl.txt | grep -q .
# No service path: no extra action.
# No-service condition via a test-only replacement of the fake launchctl.
cat > "$failtemp/bin/launchctl" <<'MOCK'
#!/bin/sh
exit 1
MOCK
chmod +x "$failtemp/bin/launchctl"
rm -f "$failtemp/home/restart-request"
if printf 'y\n' | HOME="$failtemp/home" PATH="$failtemp/bin:$PATH" bash "$script" > "$failtemp/unregistered.txt"; then
  echo 'Expected refusal when service is unregistered' >&2; exit 1
fi
grep -q 'not registered' "$failtemp/unregistered.txt"
test ! -e "$failtemp/home/restart-request"
echo 'PASS: syntax, confirmation refusal, targeted restart and local diagnostic receipts'