# Bluetooth Skill Concept

> **Status:** Research Complete - Ready for Planning
>
> **Sprint:** Apple Integration
>
> **Dependencies:** None (standalone capability)

## Overview

Enable the Brokkr agent to control Bluetooth on macOS 14 (Sonoma), including power state management, device discovery, connection/disconnection, and integration with Focus modes.

## Research Summary (2026-02-01)

### Key Finding: Use blueutil CLI

**AppleScript has no native Bluetooth scripting dictionary.** The recommended approach is using `blueutil`, a CLI tool that wraps the IOBluetooth framework.

| Approach | Reliability | Capabilities |
|----------|-------------|--------------|
| **blueutil CLI** | High | Power, discovery, connect, disconnect, pair |
| AppleScript + IOBluetooth bridge | Medium | Limited, requires Objective-C bridge |
| GUI scripting | Low | Fragile, breaks between macOS versions |
| Shortcuts app | Low | Only power toggle, no device connections |

### blueutil Capabilities

**Installation:**
```bash
brew install blueutil
```

**Core Commands:**
```bash
blueutil -p 1                    # Power on
blueutil -p 0                    # Power off
blueutil -p toggle               # Toggle power
blueutil -d 1                    # Make discoverable
blueutil --paired                # List paired devices
blueutil --connected             # List connected devices
blueutil --inquiry 10            # Scan for devices (10 seconds)
blueutil --connect "AirPods"     # Connect by name
blueutil --connect xx:xx:xx:xx   # Connect by MAC
blueutil --disconnect "Device"   # Disconnect
blueutil --pair xx:xx:xx:xx      # Pair new device
blueutil --is-connected "Device" # Check status (returns 1 or 0)
blueutil --format json-pretty    # JSON output for parsing
```

**Device ID Formats:**
- MAC address: `xxxxxxxxxxxx`, `xx-xx-xx-xx-xx-xx`, or `xx:xx:xx:xx:xx:xx`
- Device name (searches paired/recent devices)

### Node.js Integration Options

| Library | Type | Status |
|---------|------|--------|
| **@abandonware/noble** | BLE only | Active, recommended |
| bluetooth-serial-port@2.2.7 | Classic | macOS support dropped after 2.2.7 |

**Recommendation:** Use blueutil via `child_process.execSync()` for simplicity and full Classic Bluetooth support.

### Permission Requirements

| Permission | Required For | How to Grant |
|------------|--------------|--------------|
| Bluetooth | API access | System Settings > Privacy & Security > Bluetooth |
| Accessibility | GUI scripting (not needed with blueutil) | System Settings > Privacy & Security > Accessibility |

**Important Limitation:** Background daemons cannot get Bluetooth TCC permissions. The agent process must run as a user-level launch agent, which Brokkr already does.

### macOS Sonoma Compatibility

- blueutil v2.13.0 fully compatible with Sonoma (both Intel and Apple Silicon)
- `--favorites` and `--recent` commands return empty on macOS 12+ (Monterey and later)
- Bluetooth notifications via IOBluetooth work as launch agent (not as daemon)

### Known Limitations

1. **Pairing unreliable via CLI** - May require multiple attempts or manual GUI pairing
2. **Magic Keyboard** - May get stuck during CLI pairing
3. **No real-time notifications** - Must poll for connection status changes
4. **Inquiry misses some devices** - Not all devices in pairing mode are detected

## Use Cases for Brokkr Agent

### Primary Use Cases

1. **Connect headphones/speakers** - "Connect my AirPods"
2. **Disconnect devices** - "Disconnect Bluetooth keyboard"
3. **List paired devices** - "What Bluetooth devices are paired?"
4. **Check connection status** - "Is my Magic Mouse connected?"
5. **Toggle Bluetooth power** - "Turn off Bluetooth"

### Integration with Other Skills

| Skill | Integration |
|-------|-------------|
| **Focus Modes** | Auto-connect headphones when entering Work focus |
| **Music** | Connect speaker before playing music |
| **Notifications** | Alert when expected device disconnects |

## Proposed Architecture

### File Structure
```
scripts/applescript/bluetooth/
├── power-on.sh
├── power-off.sh
├── list-paired.sh
├── list-connected.sh
├── connect.sh
├── disconnect.sh
└── is-connected.sh
```

### lib/bluetooth.js Module
```javascript
// Core functions
async function powerOn()
async function powerOff()
async function toggle()
async function listPaired()
async function listConnected()
async function connect(deviceIdOrName)
async function disconnect(deviceIdOrName)
async function isConnected(deviceIdOrName)
async function discover(timeout = 10)
```

### Integration with Existing Infrastructure
- Add to job queue as skill type
- Parse commands: "connect bluetooth <device>", "disconnect bluetooth <device>"
- Return JSON-formatted device lists for structured responses

## Documentation Sources

### Official Apple Documentation
- [IOBluetooth Framework](https://developer.apple.com/documentation/iobluetooth)
- [IOBluetoothDevice Class](https://developer.apple.com/documentation/iobluetooth/iobluetoothdevice)
- [CoreBluetooth Framework](https://developer.apple.com/documentation/corebluetooth)
- [Apple Bluetooth Developer Page](https://developer.apple.com/bluetooth/)

### Third-Party Tools
- [blueutil GitHub Repository](https://github.com/toy/blueutil)
- [Homebrew Formula - blueutil](https://formulae.brew.sh/formula/blueutil)
- [@abandonware/noble npm](https://www.npmjs.com/package/@abandonware/noble)

### Reference Implementations
- [Hammerspoon Bluetooth Automation](https://github.com/Muhammed770/hammerspoon-bluetooth-automation)
- [mac-device-connect-daemon](https://github.com/himbeles/mac-device-connect-daemon)

## Estimated Tasks

| Category | Tasks |
|----------|-------|
| Shell scripts | 7 |
| lib/bluetooth.js | 1 |
| Tests | 2 |
| Documentation | 1 |
| **Total** | ~11 |

## Next Steps

1. Create formal plan document: `docs/plans/2026-02-01-bluetooth-skill-plan.md`
2. Add to sprint index under Phase 4: Extended Apps
3. Implement using TDD approach
