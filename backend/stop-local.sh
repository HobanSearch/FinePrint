#!/bin/bash

# Fine Print AI - Stop Local Development

echo "🛑 Stopping Fine Print AI services..."

# Kill tmux session
if tmux has-session -t fineprintai 2>/dev/null; then
    echo "Stopping service processes..."
    tmux kill-session -t fineprintai
fi

# Stop Docker services
echo "Stopping Docker containers..."
docker-compose -f docker-compose.local.yml down

echo "✅ All services stopped"