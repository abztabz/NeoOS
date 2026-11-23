#!/bin/bash
# NeoStudio scoped background-worker recovery. Does not touch Qwen, Ollama,
# model weights, live jobs, app data, system launch daemons or unrelated services.
set -u
umask 077

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This recovery action runs only on macOS. No changes made."
  exit 2
fi

uid="$(id -u)"
label="com.neostudio.background"
logroot="${HOME}/NeoOS/diagnostics"
stamp="$(date +%Y%m%d-%H%M%S)"
logdir="${logroot}/queue-recovery-${stamp}-$$"
mkdir -p "$logdir" || { echo "Cannot make private diagnostics directory"; exit 3; }
chmod 700 "$logdir"
printf 'NeoStudio queue recovery — %s\nDiagnostics: %s\n' "$stamp" "$logdir"

service=""
for domain in "gui/${uid}" "user/${uid}"; do
  candidate="${domain}/${label}"
  if launchctl print "$candidate" > "$logdir/before-launchctl.txt" 2>&1; then
    service="$candidate"
    break
  fi
done
if [ -z "$service" ]; then
  echo "BLOCKED: the expected NeoStudio background service is not registered in this user session."
  echo "No service was restarted. Check that NeoStudio is installed and launched on this Mac."
  exit 4
fi

echo "Found service: $service"
echo "Only this service can be restarted. Other apps, Ollama and model weights will be untouched."
echo "IMPORTANT: If NeoStudio is currently rendering or running another active job,"
echo "do not restart the service: return after that work finishes."
printf 'Are all active NeoStudio jobs idle, and may I restart only %s? [y/N] ' "$label"
IFS= read -r confirm
case "$confirm" in
  y|Y|yes|YES) ;;
  *) echo "No changes made."; exit 0;;
esac

printf 'Restart initiated for %s\n' "$service" | tee "$logdir/action.txt"
if ! launchctl kickstart -k "$service" > "$logdir/kickstart-output.txt" 2>&1; then
  echo "Restart command failed. No fallback kill/unload attempted."
  echo "See local diagnostics: $logdir/kickstart-output.txt"
  exit 5
fi
sleep 3
if ! launchctl print "$service" > "$logdir/after-launchctl.txt" 2>&1; then
  echo "The service did not report a healthy registered state after restart."
  echo "No additional action attempted. See $logdir."
  exit 6
fi

echo "Restart command succeeded and launchctl can read the service again."
echo "This DOES NOT prove the NeoStudio cloud queue is fixed."
echo "Report to ChatGPT: 'NeoStudio background restarted', then verify the EXISTING"
echo "job IDs before submitting anything new, to prevent duplicates."
echo "Local diagnostic files: $logdir"
exit 0