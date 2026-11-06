#!/bin/zsh

# Configure Homebrew PATH on Apple Silicon / Intel Mac
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ -f "/opt/homebrew/bin/brew" ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "======================================================"
echo "⚡ Starting RentFlow..."
echo "======================================================"

# Open default browser after a quick moment
(sleep 1 && open "http://localhost:4000") &

# Start server
node server.js
