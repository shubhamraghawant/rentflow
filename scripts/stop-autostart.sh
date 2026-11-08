#!/bin/zsh

PLIST_FILE="$HOME/Library/LaunchAgents/com.shubham.rentflow.plist"

if [ -f "$PLIST_FILE" ]; then
  launchctl unload "$PLIST_FILE" 2>/dev/null
  rm -f "$PLIST_FILE"
  echo "✅ RentFlow Auto-Start service has been uninstalled."
else
  echo "ℹ️ No Auto-Start service was found."
fi
