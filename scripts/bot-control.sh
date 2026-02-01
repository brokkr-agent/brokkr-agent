#!/bin/bash
# scripts/bot-control.sh - Control the Brokkr bot services
#
# Usage:
#   ./scripts/bot-control.sh stop    - Stop all services
#   ./scripts/bot-control.sh start   - Start via PM2 (auto-restart on crash)
#   ./scripts/bot-control.sh restart - Restart services
#   ./scripts/bot-control.sh live    - Start in live mode (manual, no auto-restart)
#   ./scripts/bot-control.sh test    - Start in dry-run mode
#   ./scripts/bot-control.sh status  - Show status
#   ./scripts/bot-control.sh logs    - Show logs
#   ./scripts/bot-control.sh tail    - Follow logs in real-time

set -e

PLIST="$HOME/Library/LaunchAgents/com.brokkr.whatsapp-claude.plist"
WORKSPACE="/Users/brokkrbot/brokkr-agent"
BOT_LOG="/tmp/whatsapp-bot.log"
WEBHOOK_LOG="/tmp/webhook-server.log"
NOTIFY_LOG="/tmp/notification-monitor.log"

# Use absolute path for sleep to avoid shell issues
SLEEP="/bin/sleep"

# Kill all bot-related processes from ALL managers
kill_all() {
    echo "Stopping all process managers..."

    # Stop PM2 processes
    if command -v npx &> /dev/null; then
        npx pm2 stop whatsapp-bot 2>/dev/null || true
        npx pm2 stop webhook-server 2>/dev/null || true
        npx pm2 stop notification-monitor 2>/dev/null || true
        npx pm2 delete whatsapp-bot 2>/dev/null || true
        npx pm2 delete webhook-server 2>/dev/null || true
        npx pm2 delete notification-monitor 2>/dev/null || true
    fi

    # Unload launchd if loaded
    launchctl unload "$PLIST" 2>/dev/null || true

    # Kill any remaining processes by name
    pkill -9 -f "node.*whatsapp-bot" 2>/dev/null || true
    pkill -9 -f "node.*webhook-server" 2>/dev/null || true
    pkill -9 -f "node.*notification-monitor" 2>/dev/null || true

    # Also kill by finding PIDs directly
    pgrep -f "whatsapp-bot" | xargs kill -9 2>/dev/null || true
    pgrep -f "webhook-server" | xargs kill -9 2>/dev/null || true
    pgrep -f "notification-monitor" | xargs kill -9 2>/dev/null || true

    # Remove lock files
    rm -f "$WORKSPACE/bot.lock"
    rm -f "$WORKSPACE/notification-monitor.lock"

    # Wait for processes to die
    $SLEEP 1
}

# Verify no processes are running
verify_stopped() {
    local count=$(pgrep -f "whatsapp-bot|webhook-server|notification-monitor" 2>/dev/null | wc -l)
    if [ "$count" -gt 0 ]; then
        echo "Warning: Some processes still running, force killing..."
        pgrep -f "whatsapp-bot|webhook-server|notification-monitor" | xargs kill -9 2>/dev/null || true
        $SLEEP 1
    fi
}

# Start services via PM2 (production mode with auto-restart)
start_pm2() {
    local mode="$1"  # "" for live, "--dry-run" for test

    cd "$WORKSPACE"

    # Start whatsapp-bot via PM2
    if [ -z "$mode" ]; then
        npx pm2 start whatsapp-bot.js --name whatsapp-bot --output "$BOT_LOG" --error "$BOT_LOG" --no-autorestart
        # Note: --no-autorestart because we want controlled restarts, not infinite loops on errors
    else
        npx pm2 start whatsapp-bot.js --name whatsapp-bot --output "$BOT_LOG" --error "$BOT_LOG" -- $mode
    fi

    echo "Started whatsapp-bot.js via PM2"
    $SLEEP 3

    # Verify bot started
    if ! npx pm2 show whatsapp-bot | grep -q "online"; then
        echo "ERROR: whatsapp-bot.js failed to start!"
        npx pm2 logs whatsapp-bot --lines 20 --nostream
        return 1
    fi

    # Start webhook-server via PM2
    if [ -z "$mode" ]; then
        npx pm2 start webhook-server.js --name webhook-server --output "$WEBHOOK_LOG" --error "$WEBHOOK_LOG" -- --debug
    else
        npx pm2 start webhook-server.js --name webhook-server --output "$WEBHOOK_LOG" --error "$WEBHOOK_LOG" -- --debug $mode
    fi

    echo "Started webhook-server.js via PM2"
    $SLEEP 2

    # Verify health endpoint
    if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo "ERROR: Health endpoint not responding!"
        npx pm2 logs webhook-server --lines 20 --nostream
        return 1
    fi

    # Start notification-monitor via PM2
    if [ -z "$mode" ]; then
        npx pm2 start notification-monitor.js --name notification-monitor --output "$NOTIFY_LOG" --error "$NOTIFY_LOG" -- --live
    else
        npx pm2 start notification-monitor.js --name notification-monitor --output "$NOTIFY_LOG" --error "$NOTIFY_LOG" -- --dry-run --debug
    fi

    echo "Started notification-monitor.js via PM2"
    $SLEEP 2

    echo "All services started successfully via PM2"
    return 0
}

# Start whatsapp-bot manually (no PM2)
start_bot() {
    local mode="$1"  # "" for live, "--dry-run" for test

    cd "$WORKSPACE"
    node whatsapp-bot.js $mode > "$BOT_LOG" 2>&1 &
    local pid=$!

    echo "Started whatsapp-bot.js (PID: $pid)"

    # Wait for startup
    $SLEEP 3

    # Verify it's running
    if ! kill -0 $pid 2>/dev/null; then
        echo "ERROR: whatsapp-bot.js failed to start!"
        echo "=== Log ==="
        cat "$BOT_LOG"
        return 1
    fi

    # Verify it acquired the lock (not "already running")
    if grep -q "already running" "$BOT_LOG"; then
        echo "ERROR: Another instance was already running!"
        cat "$BOT_LOG"
        return 1
    fi

    # Verify correct mode
    if [ -z "$mode" ]; then
        if ! grep -q "LIVE MODE" "$BOT_LOG"; then
            echo "WARNING: Expected LIVE MODE but not found in log"
        fi
    else
        if ! grep -q "DRY-RUN MODE" "$BOT_LOG"; then
            echo "WARNING: Expected DRY-RUN MODE but not found in log"
        fi
    fi

    echo "whatsapp-bot.js started successfully"
    return 0
}

# Start webhook server manually (no PM2)
start_webhook() {
    local mode="$1"  # "" for live, "--dry-run" for test

    cd "$WORKSPACE"
    node webhook-server.js --debug $mode > "$WEBHOOK_LOG" 2>&1 &
    local pid=$!

    echo "Started webhook-server.js (PID: $pid)"

    # Wait for startup
    $SLEEP 2

    # Verify it's running
    if ! kill -0 $pid 2>/dev/null; then
        echo "ERROR: webhook-server.js failed to start!"
        cat "$WEBHOOK_LOG"
        return 1
    fi

    # Verify health endpoint
    if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo "ERROR: Health endpoint not responding!"
        return 1
    fi

    echo "webhook-server.js started successfully"
    return 0
}

# Start notification monitor manually (no PM2)
start_notify() {
    local mode="$1"  # "" for live, "--dry-run" for test

    cd "$WORKSPACE"
    if [ -z "$mode" ]; then
        node notification-monitor.js --live > "$NOTIFY_LOG" 2>&1 &
    else
        node notification-monitor.js --dry-run --debug > "$NOTIFY_LOG" 2>&1 &
    fi
    local pid=$!

    echo "Started notification-monitor.js (PID: $pid)"

    # Wait for startup
    $SLEEP 2

    # Verify it's running
    if ! kill -0 $pid 2>/dev/null; then
        echo "ERROR: notification-monitor.js failed to start!"
        cat "$NOTIFY_LOG"
        return 1
    fi

    echo "notification-monitor.js started successfully"
    return 0
}

# Show status from all sources
show_status() {
    echo "=== PM2 Status ==="
    npx pm2 list 2>/dev/null || echo "PM2 not available"
    echo ""
    echo "=== Process Status ==="
    ps aux | grep -E "whatsapp-bot|webhook-server|notification-monitor" | grep -v grep || echo "No processes running"
    echo ""
    echo "=== LaunchD Status ==="
    launchctl list 2>/dev/null | grep brokkr || echo "Not loaded"
    echo ""
    echo "=== Health Check ==="
    curl -s http://localhost:3000/health 2>/dev/null || echo "Webhook server not responding"
    echo ""
}

case "$1" in
    stop)
        echo "Stopping all Brokkr services..."
        kill_all
        verify_stopped
        echo "All services stopped"
        ;;

    start)
        echo "Starting Brokkr services via PM2 (auto-restart enabled)..."
        kill_all
        verify_stopped
        rm -f "$WORKSPACE/bot.lock"

        if ! start_pm2 ""; then
            exit 1
        fi

        echo ""
        show_status
        ;;

    restart)
        echo "Restarting Brokkr services..."
        $0 stop
        $SLEEP 2
        $0 start
        ;;

    live)
        echo "Starting in LIVE mode (manual, no auto-restart)..."
        kill_all
        verify_stopped

        if ! start_bot ""; then
            exit 1
        fi

        if ! start_webhook ""; then
            exit 1
        fi

        if ! start_notify ""; then
            exit 1
        fi

        echo ""
        show_status
        ;;

    test)
        echo "Starting in TEST mode (dry-run, no real execution)..."
        kill_all
        verify_stopped

        if ! start_bot "--dry-run"; then
            exit 1
        fi

        if ! start_webhook "--dry-run"; then
            exit 1
        fi

        if ! start_notify "--dry-run"; then
            exit 1
        fi

        echo ""
        show_status
        ;;

    status)
        show_status
        ;;

    logs)
        echo "=== WhatsApp Bot Log (last 30 lines) ==="
        if npx pm2 show whatsapp-bot &>/dev/null; then
            npx pm2 logs whatsapp-bot --lines 30 --nostream 2>/dev/null || tail -30 "$BOT_LOG" 2>/dev/null || echo "No log file"
        else
            tail -30 "$BOT_LOG" 2>/dev/null || echo "No log file"
        fi
        echo ""
        echo "=== Webhook Server Log (last 30 lines) ==="
        if npx pm2 show webhook-server &>/dev/null; then
            npx pm2 logs webhook-server --lines 30 --nostream 2>/dev/null || tail -30 "$WEBHOOK_LOG" 2>/dev/null || echo "No log file"
        else
            tail -30 "$WEBHOOK_LOG" 2>/dev/null || echo "No log file"
        fi
        echo ""
        echo "=== Notification Monitor Log (last 30 lines) ==="
        if npx pm2 show notification-monitor &>/dev/null; then
            npx pm2 logs notification-monitor --lines 30 --nostream 2>/dev/null || tail -30 "$NOTIFY_LOG" 2>/dev/null || echo "No log file"
        else
            tail -30 "$NOTIFY_LOG" 2>/dev/null || echo "No log file"
        fi
        ;;

    tail)
        echo "Tailing logs (Ctrl+C to stop)..."
        if npx pm2 list 2>/dev/null | grep -q "whatsapp-bot"; then
            npx pm2 logs
        else
            tail -f "$BOT_LOG" "$WEBHOOK_LOG" "$NOTIFY_LOG" 2>/dev/null
        fi
        ;;

    *)
        echo "Brokkr Bot Control Script"
        echo ""
        echo "Usage: $0 {stop|start|restart|live|test|status|logs|tail}"
        echo ""
        echo "Commands:"
        echo "  stop     - Stop all services (PM2, launchd, and manual processes)"
        echo "  start    - Start via PM2 (recommended for production)"
        echo "  restart  - Stop then start via PM2"
        echo "  live     - Start manually without PM2 (for debugging)"
        echo "  test     - Start in DRY-RUN mode (no real execution)"
        echo "  status   - Show running processes and health"
        echo "  logs     - Show last 30 lines of logs"
        echo "  tail     - Follow logs in real-time"
        echo ""
        echo "Process Managers:"
        echo "  PM2      - Used by 'start' command, provides auto-restart"
        echo "  Manual   - Used by 'live' and 'test', no auto-restart"
        echo "  LaunchD  - Legacy, will be stopped but not used for new starts"
        exit 1
        ;;
esac
