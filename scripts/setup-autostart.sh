#!/bin/zsh

# Setup macOS LaunchAgent for RentFlow to run automatically on system boot / user login

PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/com.shubham.rentflow.plist"
PROJECT_DIR="/Users/shubhamraghawant/Documents/Projects/rentflow"
NODE_BIN="/opt/homebrew/bin/node"

if [ ! -f "$NODE_BIN" ]; then
  NODE_BIN="$(which node)"
fi

mkdir -p "$PLIST_DIR"

cat <<EOF > "$PLIST_FILE"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.shubham.rentflow</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$PROJECT_DIR/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$PROJECT_DIR/data/service.log</string>
    <key>StandardErrorPath</key>
    <string>$PROJECT_DIR/data/service-err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>PORT</key>
        <string>4000</string>
    </dict>
</dict>
</plist>
EOF

# Unload previous if exists
launchctl unload "$PLIST_FILE" 2>/dev/null

# Load LaunchAgent
launchctl load "$PLIST_FILE"

echo "=========================================================="
echo "✅ RentFlow Auto-Start Service is successfully installed!"
echo "⚡ RentFlow will now run automatically in the background"
echo "   whenever your Mac starts up or logs in."
echo "👉 Accessible anytime at: http://localhost:4000"
echo "=========================================================="
