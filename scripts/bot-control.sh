#!/bin/bash
# scripts/bot-control.sh - Control the Brokkr bot services
#
# Usage:
#   ./scripts/bot-control.sh stop    - Stop all services
#   ./scripts/bot-control.sh start   - Start via launchd
#   ./scripts/bot-control.sh live    - Start in live mode (manual)
#   ./scripts/bot-control.sh test    - Start in dry-run mode
#   ./scripts/bot-control.sh status  - Show status
#   ./scripts/bot-control.sh logs    - Show logs

set -e

PLIST="$HOME/Library/LaunchAgents/com.brokkr.whatsapp-claude.plist"
WORKSPACE="/Users/brokkrbot/brokkr-agent"
BOT_LOG="/tmp/whatsapp-bot.log"
WEBHOOK_LOG="/tmp/webhook-server.log"

# Use absolute path for sleep to avoid shell issues
SLEEP="/bin/sleep"

# Kill all bot-related processes
kill_all() {
    # Unload launchd if loaded
    launchctl unload "$PLIST" 2>/dev/null || true

    # Kill by process name
    pkill -9 -f "node.*whatsapp-bot" 2>/dev/null || true
    pkill -9 -f "node.*webhook-server" 2>/dev/null || true

    # Also kill by finding PIDs directly
    pgrep -f "whatsapp-bot" | xargs kill -9 2>/dev/null || true
    pgrep -f "webhook-server" | xargs kill -9 2>/dev/null || true

    # Remove lock file
    rm -f "$WORKSPACE/bot.lock"

    # Wait for processes to die
    $SLEEP 1
}

# Verify no processes are running
verify_stopped() {
    local count=$(pgrep -f "whatsapp-bot|webhook-server" 2>/dev/null | wc -l)
    if [ "$count" -gt 0 ]; then
        echo "Warning: Some processes still running, force killing..."
        pgrep -f "whatsapp-bot|webhook-server" | xargs kill -9 2>/dev/null || true
        $SLEEP 1
    fi
}

# Start whatsapp-bot and verify it started correctly
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

# Start webhook server and verify
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

# Show status
show_status() {
    echo "=== Process Status ==="
    ps aux | grep -E "whatsapp-bot|webhook-server" | grep -v grep || echo "No processes running"
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
        echo "Starting Brokkr services via launchd..."
        kill_all
        verify_stopped
        rm -f "$WORKSPACE/bot.lock"
        launchctl load "$PLIST"
        echo "WhatsApp bot started via launchd"
        $SLEEP 3
        start_webhook ""
        show_status
        ;;

    restart)
        echo "Restarting Brokkr services..."
        $0 stop
        $SLEEP 2
        $0 start
        ;;

    live)
        echo "Starting in LIVE mode (no launchd, real processing)..."
        kill_all
        verify_stopped

        if ! start_bot ""; then
            exit 1
        fi

        if ! start_webhook ""; then
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

        echo ""
        show_status
        ;;

    status)
        show_status
        ;;

    logs)
        echo "=== WhatsApp Bot Log (last 30 lines) ==="
        tail -30 "$BOT_LOG" 2>/dev/null || tail -30 "$WORKSPACE/logs/whatsapp-bot.log" 2>/dev/null || echo "No log file"
        echo ""
        echo "=== Webhook Server Log (last 30 lines) ==="
        tail -30 "$WEBHOOK_LOG" 2>/dev/null || echo "No log file"
        ;;

    tail)
        echo "Tailing logs (Ctrl+C to stop)..."
        tail -f "$BOT_LOG" "$WEBHOOK_LOG" 2>/dev/null
        ;;

    *)
        echo "Brokkr Bot Control Script"
        echo ""
        echo "Usage: $0 {stop|start|restart|live|test|status|logs|tail}"
        echo ""
        echo "Commands:"
        echo "  stop     - Stop all services (unload launchd + kill processes)"
        echo "  start    - Start via launchd (auto-restart enabled)"
        echo "  restart  - Stop then start via launchd"
        echo "  live     - Start in LIVE mode without launchd (for testing)"
        echo "  test     - Start in DRY-RUN mode (no real execution)"
        echo "  status   - Show running processes and health"
        echo "  logs     - Show last 30 lines of logs"
        echo "  tail     - Follow logs in real-time"
        exit 1
        ;;
esac
