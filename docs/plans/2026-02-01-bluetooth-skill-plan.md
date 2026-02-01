# Bluetooth Control Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILLS:
> - Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan
> - Use `superpowers:test-driven-development` for all implementation tasks

**Goal:** Create a self-contained Bluetooth skill that controls Bluetooth power, manages device connections, and automatically researches new devices to discover their capabilities and control scripts.

**Architecture:** Self-contained skill in `skills/bluetooth/` using blueutil CLI. Includes device reference system that deploys subagents to research newly paired devices, discovers functionality, and saves control scripts. Each device gets a reference directory with capabilities documentation and custom scripts.

**Tech Stack:** blueutil CLI (via Homebrew), Node.js (child_process), no additional npm dependencies

---

## Skill Directory Structure

```
skills/bluetooth/
  skill.md                      # Main skill documentation and agent instructions
  config.json                   # Skill configuration (blueutil path, timeouts, etc.)

  lib/
    blueutil.js                 # Core blueutil wrapper functions
    device-manager.js           # Device reference and discovery management
    device-researcher.js        # Subagent prompts for device research

  scripts/
    check-installation.sh       # Verify blueutil is installed
    list-devices.sh             # Quick device listing script

  devices/                      # Auto-generated device reference directories
    .gitkeep                    # Keep directory in git
    <device-name>/              # Created per-device (e.g., "airpods-pro/")
      reference.md              # Device capabilities and research findings
      metadata.json             # Device info (address, type, last seen, etc.)
      scripts/                  # Device-specific control scripts
        connect.sh
        disconnect.sh
        <custom-scripts>.sh     # Discovered functionality scripts

  research/                     # Research reference materials
    blueutil-commands.md        # All blueutil commands and options
    applescript-bluetooth.md    # AppleScript IOBluetooth bridge examples
    device-types.md             # Known device type capabilities

  tests/
    blueutil.test.js
    device-manager.test.js
```

---

## Research Summary

### Official Documentation Sources

- [blueutil GitHub Repository](https://github.com/toy/blueutil) - Primary CLI tool
- [Homebrew Formula - blueutil](https://formulae.brew.sh/formula/blueutil) - Installation
- [IOBluetooth Framework](https://developer.apple.com/documentation/iobluetooth) - Apple framework
- [IOBluetoothDevice Class](https://developer.apple.com/documentation/iobluetooth/iobluetoothdevice) - Device API
- [CoreBluetooth Framework](https://developer.apple.com/documentation/corebluetooth) - BLE API
- [@abandonware/noble npm](https://www.npmjs.com/package/@abandonware/noble) - Node.js BLE library

### blueutil Command Reference

**Installation:**
```bash
brew install blueutil
```

**Power Control:**
| Command | Description |
|---------|-------------|
| `blueutil -p 1` | Power on |
| `blueutil -p 0` | Power off |
| `blueutil -p toggle` | Toggle power |
| `blueutil -p` | Get power state (1 or 0) |
| `blueutil -d 1` | Make discoverable |
| `blueutil -d 0` | Make non-discoverable |

**Device Listing:**
| Command | Description |
|---------|-------------|
| `blueutil --paired` | List paired devices |
| `blueutil --connected` | List connected devices |
| `blueutil --inquiry 10` | Discover nearby devices (10 sec) |
| `blueutil --format json-pretty` | JSON output format |

**Device Management:**
| Command | Description |
|---------|-------------|
| `blueutil --connect <ID>` | Connect to device |
| `blueutil --disconnect <ID>` | Disconnect from device |
| `blueutil --is-connected <ID>` | Check connection (returns 1/0) |
| `blueutil --info <ID>` | Get device information |
| `blueutil --pair <ID>` | Pair with device (experimental) |
| `blueutil --unpair <ID>` | Unpair device (experimental) |

**Device ID Formats:**
- MAC address: `xx:xx:xx:xx:xx:xx`, `xx-xx-xx-xx-xx-xx`, `xxxxxxxxxxxx`
- Device name (searches paired/recent)

**Wait Commands:**
| Command | Description |
|---------|-------------|
| `blueutil --wait-connect <ID> [TIMEOUT]` | Wait for connection |
| `blueutil --wait-disconnect <ID> [TIMEOUT]` | Wait for disconnection |

### AppleScript IOBluetooth Bridge

For advanced device control, AppleScript can access IOBluetooth framework:

```applescript
use framework "IOBluetooth"
use scripting additions

-- Get all paired devices
set pairedDevices to current application's IOBluetoothDevice's pairedDevices() as list

-- Find device by name
on findDevice(deviceName)
  repeat with device in (current application's IOBluetoothDevice's pairedDevices() as list)
    if (device's nameOrAddress as string) contains deviceName then
      return device
    end if
  end repeat
  return missing value
end findDevice

-- Connect to device
on connectDevice(device)
  if device is missing value then return "Device not found"
  if device's isConnected() as boolean then return "Already connected"
  device's openConnection()
  delay 2
  if device's isConnected() as boolean then
    return "Connected"
  else
    return "Connection failed"
  end if
end connectDevice

-- Get device services
on getDeviceServices(device)
  return device's services() as list
end getDeviceServices
```

### Known Device Type Capabilities

| Device Type | Capabilities |
|-------------|--------------|
| **AirPods/Headphones** | Connect, disconnect, battery level (via System Information) |
| **Magic Keyboard** | Connect, disconnect, battery level |
| **Magic Mouse/Trackpad** | Connect, disconnect, battery level |
| **Speakers** | Connect, disconnect, volume control (via Music.app) |
| **Game Controllers** | Connect, disconnect, button mapping (varies) |
| **Generic Audio** | A2DP profile, AVRCP for media control |

### Limitations

1. **Pairing unreliable via CLI** - May require GUI or multiple attempts
2. **--favorites/--recent empty on macOS 12+** - Framework limitation
3. **No real-time notifications** - Must poll for status changes
4. **Battery level** - Not directly available via blueutil (use System Information)
5. **Device-specific features** - Require per-device research

---

## Device Research System Design

### Auto-Discovery Flow

```
1. Agent lists connected/paired devices
2. For each device, check: skills/bluetooth/devices/<device-name>/reference.md
3. If reference.md missing:
   a. Create device directory
   b. Save metadata.json with device info
   c. Deploy subagent to research device
4. Subagent researches:
   a. Device type and manufacturer
   b. Available control commands
   c. AppleScript capabilities
   d. System Information data
5. Subagent creates:
   a. reference.md with findings
   b. Control scripts in scripts/
6. Update device metadata with discovered capabilities
```

### Device Reference Template

```markdown
# [Device Name] Reference

**Device Type:** [Headphones/Keyboard/Mouse/Speaker/etc.]
**Manufacturer:** [Apple/Sony/etc.]
**MAC Address:** `xx:xx:xx:xx:xx:xx`
**Bluetooth Profile:** [A2DP/HID/SPP/etc.]

## Discovered Capabilities

| Capability | Command/Script | Status |
|------------|----------------|--------|
| Connect | `blueutil --connect "Device"` | Working |
| Disconnect | `blueutil --disconnect "Device"` | Working |
| Battery Level | `scripts/battery.sh` | Working |

## Control Scripts

### connect.sh
```bash
#!/bin/bash
blueutil --connect "xx:xx:xx:xx:xx:xx"
```

### disconnect.sh
```bash
#!/bin/bash
blueutil --disconnect "xx:xx:xx:xx:xx:xx"
```

## Research Notes

[Notes from subagent research...]

## Last Updated
YYYY-MM-DD
```

---

## Task Overview

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create skill directory structure and research docs | `skills/bluetooth/**` |
| 2 | Core blueutil wrapper module | `skills/bluetooth/lib/blueutil.js` |
| 3 | Device manager module | `skills/bluetooth/lib/device-manager.js` |
| 4 | Device researcher module | `skills/bluetooth/lib/device-researcher.js` |
| 5 | Skill documentation with agent instructions | `skills/bluetooth/skill.md` |
| 6 | Unit tests | `skills/bluetooth/tests/*.test.js` |
| 7 | Integration testing | Manual verification |

---

## Task 1: Create Skill Directory Structure and Research Docs

**Objective:** Set up the skill directory with research reference materials.

**Files to Create:**
- `/Users/brokkrbot/brokkr-agent/skills/bluetooth/` (directory)
- `/Users/brokkrbot/brokkr-agent/skills/bluetooth/config.json`
- `/Users/brokkrbot/brokkr-agent/skills/bluetooth/devices/.gitkeep`
- `/Users/brokkrbot/brokkr-agent/skills/bluetooth/research/blueutil-commands.md`
- `/Users/brokkrbot/brokkr-agent/skills/bluetooth/research/applescript-bluetooth.md`
- `/Users/brokkrbot/brokkr-agent/skills/bluetooth/research/device-types.md`
- `/Users/brokkrbot/brokkr-agent/skills/bluetooth/scripts/check-installation.sh`

### Step 1: Create directory structure

```bash
mkdir -p /Users/brokkrbot/brokkr-agent/skills/bluetooth/{lib,scripts,devices,research,tests}
touch /Users/brokkrbot/brokkr-agent/skills/bluetooth/devices/.gitkeep
```

### Step 2: Create config.json

```json
{
  "name": "bluetooth",
  "version": "1.0.0",
  "description": "Bluetooth control and device management skill",
  "blueutil": {
    "paths": [
      "/opt/homebrew/bin/blueutil",
      "/usr/local/bin/blueutil",
      "blueutil"
    ],
    "defaultTimeout": 30000,
    "inquiryTimeout": 15
  },
  "deviceResearch": {
    "enabled": true,
    "autoResearchNewDevices": true,
    "researchOnConnect": false
  }
}
```

### Step 3: Create blueutil-commands.md

```markdown
# blueutil Command Reference

Complete reference for blueutil CLI on macOS.

**Version:** 2.13.0+
**Installation:** `brew install blueutil`
**Repository:** https://github.com/toy/blueutil

## Power Control

| Command | Description | Output |
|---------|-------------|--------|
| `blueutil -p` | Get power state | `1` (on) or `0` (off) |
| `blueutil -p 1` | Turn Bluetooth on | (none) |
| `blueutil -p 0` | Turn Bluetooth off | (none) |
| `blueutil -p on` | Turn Bluetooth on | (none) |
| `blueutil -p off` | Turn Bluetooth off | (none) |
| `blueutil -p toggle` | Toggle power state | (none) |

## Discoverable State

| Command | Description | Output |
|---------|-------------|--------|
| `blueutil -d` | Get discoverable state | `1` or `0` |
| `blueutil -d 1` | Make discoverable | (none) |
| `blueutil -d 0` | Make non-discoverable | (none) |

**Note:** Opening System Settings > Bluetooth always enables discoverability.

## Device Listing

| Command | Description |
|---------|-------------|
| `blueutil --paired` | List all paired devices |
| `blueutil --connected` | List currently connected devices |
| `blueutil --inquiry [TIMEOUT]` | Discover nearby devices (default 10s) |
| `blueutil --recent [COUNT]` | List recent devices (empty on macOS 12+) |
| `blueutil --favourites` | List favorite devices (empty on macOS 12+) |

### Output Format Options

| Flag | Description |
|------|-------------|
| `--format default` | Human-readable text |
| `--format new-default` | Comma-separated key-value pairs |
| `--format json` | Compact JSON |
| `--format json-pretty` | Formatted JSON |

### Example Output (--paired)

```
address: 00-11-22-33-44-55, connected (paired, favourite, not connected), name: "AirPods Pro"
address: aa-bb-cc-dd-ee-ff, connected (paired, not favourite, connected), name: "Magic Keyboard"
```

## Device Information

| Command | Description |
|---------|-------------|
| `blueutil --info <ID>` | Display device information |
| `blueutil --is-connected <ID>` | Check if connected (returns `1` or `0`) |

### Device ID Formats

Devices can be identified by:
- Full MAC: `00:11:22:33:44:55`
- Dashed MAC: `00-11-22-33-44-55`
- Compact MAC: `001122334455`
- Device name: `"AirPods Pro"` (searches paired/recent)

## Connection Management

| Command | Description |
|---------|-------------|
| `blueutil --connect <ID>` | Connect to device |
| `blueutil --disconnect <ID>` | Disconnect from device |
| `blueutil --pair <ID> [PIN]` | Pair with device (experimental) |
| `blueutil --unpair <ID>` | Unpair device (experimental) |
| `blueutil --add-favourite <ID>` | Add to favorites |
| `blueutil --remove-favourite <ID>` | Remove from favorites |

## Wait Commands (for automation)

| Command | Description |
|---------|-------------|
| `blueutil --wait-connect <ID> [TIMEOUT]` | Wait for device to connect |
| `blueutil --wait-disconnect <ID> [TIMEOUT]` | Wait for device to disconnect |
| `blueutil --wait-rssi <ID> <OP> <VALUE> [PERIOD [TIMEOUT]]` | Monitor signal strength |

### RSSI Operators

| Operator | Description |
|----------|-------------|
| `-gt` | Greater than |
| `-ge` | Greater than or equal |
| `-lt` | Less than |
| `-le` | Less than or equal |
| `-eq` | Equal to |
| `-ne` | Not equal to |

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | General failure |
| 64 | Wrong usage |
| 69 | Bluetooth not available |
| 70 | Internal error |
| 71 | System error |
| 75 | Timeout error |
| 134 | Abort signal (no Bluetooth API access) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BLUEUTIL_ALLOW_ROOT=1` | Allow running as root |
| `BLUEUTIL_USE_SYSTEM_PROFILER=1` | Use system_profiler for connection status |

## Known Limitations

1. `--favourites` and `--recent` return empty on macOS 12+ (Monterey and later)
2. `--pair` is experimental and unreliable for some devices
3. `--unpair` is experimental
4. Cannot run as root without `BLUEUTIL_ALLOW_ROOT=1`
5. Some multi-point Bluetooth devices report incorrect status (use `BLUEUTIL_USE_SYSTEM_PROFILER=1`)
```

### Step 4: Create applescript-bluetooth.md

```markdown
# AppleScript Bluetooth Control Reference

Advanced Bluetooth control using AppleScript with IOBluetooth framework bridge.

**Use Case:** When blueutil doesn't provide needed functionality (e.g., device services, advanced pairing).

## IOBluetooth Framework Bridge

AppleScript can access IOBluetooth framework via Objective-C bridge:

```applescript
use framework "IOBluetooth"
use scripting additions
```

## Get Paired Devices

```applescript
use framework "IOBluetooth"
use scripting additions

set pairedDevices to current application's IOBluetoothDevice's pairedDevices() as list

repeat with device in pairedDevices
    set deviceName to device's nameOrAddress as string
    set isConnected to device's isConnected() as boolean
    log "Device: " & deviceName & " - Connected: " & isConnected
end repeat
```

## Find Device by Name

```applescript
use framework "IOBluetooth"
use scripting additions

on findDeviceByName(targetName)
    set devices to current application's IOBluetoothDevice's pairedDevices() as list
    repeat with device in devices
        if (device's nameOrAddress as string) contains targetName then
            return device
        end if
    end repeat
    return missing value
end findDeviceByName

-- Usage
set myDevice to findDeviceByName("AirPods")
```

## Connect to Device

```applescript
use framework "IOBluetooth"
use scripting additions

on connectToDevice(deviceName)
    set device to findDeviceByName(deviceName)

    if device is missing value then
        return "Device not found: " & deviceName
    end if

    if device's isConnected() as boolean then
        return "Already connected: " & deviceName
    end if

    device's openConnection()
    delay 3 -- Wait for connection

    if device's isConnected() as boolean then
        return "Connected to " & deviceName
    else
        return "Failed to connect to " & deviceName
    end if
end connectToDevice

on findDeviceByName(targetName)
    set devices to current application's IOBluetoothDevice's pairedDevices() as list
    repeat with device in devices
        if (device's nameOrAddress as string) contains targetName then
            return device
        end if
    end repeat
    return missing value
end findDeviceByName
```

## Disconnect from Device

```applescript
use framework "IOBluetooth"
use scripting additions

on disconnectFromDevice(deviceName)
    set device to findDeviceByName(deviceName)

    if device is missing value then
        return "Device not found: " & deviceName
    end if

    if not (device's isConnected() as boolean) then
        return "Already disconnected: " & deviceName
    end if

    device's closeConnection()
    delay 1

    return "Disconnected from " & deviceName
end disconnectFromDevice
```

## Get Device Information

```applescript
use framework "IOBluetooth"
use scripting additions

on getDeviceInfo(deviceName)
    set device to findDeviceByName(deviceName)

    if device is missing value then
        return {success:false, |error|:"Device not found"}
    end if

    set info to {}
    set info's |name| to device's nameOrAddress as string
    set info's |address| to device's addressString as string
    set info's |connected| to device's isConnected() as boolean
    set info's |paired| to device's isPaired() as boolean

    return {success:true, device:info}
end getDeviceInfo
```

## Get Device Services (Bluetooth Profiles)

```applescript
use framework "IOBluetooth"
use scripting additions

on getDeviceServices(deviceName)
    set device to findDeviceByName(deviceName)

    if device is missing value then
        return {}
    end if

    set services to device's services()
    if services is missing value then
        return {}
    end if

    set serviceList to {}
    repeat with svc in (services as list)
        set serviceName to svc's |name| as string
        set end of serviceList to serviceName
    end repeat

    return serviceList
end getDeviceServices
```

## Toggle Bluetooth Power (GUI Method)

When blueutil isn't available, use System Events GUI scripting:

```applescript
-- Toggle Bluetooth via Control Center (macOS Big Sur+)
tell application "System Events"
    tell process "ControlCenter"
        click menu bar item "Control Center" of menu bar 1
        delay 0.5
        click checkbox "Bluetooth" of group 1 of group 1 of window "Control Center"
        delay 0.3
        -- Click away to close
        key code 53 -- Escape
    end tell
end tell
```

**Warning:** GUI scripting is fragile and may break with macOS updates.

## Check Bluetooth Power State

```applescript
-- Using System Events
tell application "System Events"
    tell process "SystemUIServer"
        set btMenu to menu bar item 1 of menu bar 1 whose description contains "bluetooth"
        -- Menu exists if Bluetooth is shown in menu bar
        return true
    end tell
end tell
```

## Limitations

1. IOBluetooth bridge may not work for all operations
2. Some methods require Accessibility permissions
3. GUI scripting breaks between macOS versions
4. No direct battery level access (use System Information instead)
5. Requires running as user (not daemon)

## Best Practices

1. **Prefer blueutil** - More reliable than AppleScript for basic operations
2. **Use AppleScript for** - Device services, advanced pairing, GUI fallback
3. **Always error handle** - Wrap in try/on error blocks
4. **Add delays after connections** - Bluetooth operations are async
5. **Test device presence first** - Don't assume device exists
```

### Step 5: Create device-types.md

```markdown
# Bluetooth Device Types Reference

Known device types and their typical capabilities for automation.

## Audio Devices

### AirPods / AirPods Pro / AirPods Max

**Bluetooth Profile:** A2DP, HFP, AVRCP
**Capabilities:**
- Connect/disconnect via blueutil
- Battery level via System Information
- Automatic switching between Apple devices
- Noise cancellation toggle (AirPods Pro/Max) - requires Shortcuts

**Battery Level Script:**
```bash
#!/bin/bash
# Get AirPods battery via system_profiler
system_profiler SPBluetoothDataType 2>/dev/null | \
  grep -A 20 "AirPods" | \
  grep -E "(Battery|Case)" | \
  head -3
```

**Noise Control (via Shortcuts):**
```bash
shortcuts run "AirPods Noise Control"
```

### Bluetooth Headphones (Generic)

**Bluetooth Profile:** A2DP, AVRCP
**Capabilities:**
- Connect/disconnect via blueutil
- Volume control via system audio
- Media control (play/pause/skip) via Music.app or media keys

**Media Control Script:**
```applescript
-- Play/pause
tell application "Music" to playpause

-- Or use media key simulation
tell application "System Events"
    key code 16 using {command down, option down} -- Play/pause
end tell
```

### Bluetooth Speakers

**Bluetooth Profile:** A2DP
**Capabilities:**
- Connect/disconnect via blueutil
- Volume control via system audio
- Set as default output device

**Set as Audio Output:**
```bash
# Requires SwitchAudioSource (brew install switchaudio-osx)
SwitchAudioSource -s "Speaker Name"
```

## Input Devices

### Magic Keyboard

**Bluetooth Profile:** HID
**Capabilities:**
- Connect/disconnect via blueutil
- Battery level via System Information
- Key repeat rate (System Preferences)

**Battery Level:**
```bash
ioreg -c AppleDeviceManagementHIDEventService | \
  grep -i "keyboard" -A 20 | \
  grep "BatteryPercent"
```

### Magic Mouse / Magic Trackpad

**Bluetooth Profile:** HID
**Capabilities:**
- Connect/disconnect via blueutil
- Battery level via System Information
- Gesture configuration (System Preferences)

**Battery Level:**
```bash
ioreg -c AppleDeviceManagementHIDEventService | \
  grep -i "mouse\|trackpad" -A 20 | \
  grep "BatteryPercent"
```

### Game Controllers

**Bluetooth Profile:** HID
**Capabilities:**
- Connect/disconnect via blueutil
- Button mapping varies by controller
- May require third-party software for full control

**Supported Controllers:**
- Xbox Wireless Controller (macOS Catalina+)
- PlayStation DualShock 4 / DualSense
- Nintendo Switch Pro Controller
- MFi (Made for iPhone) controllers

## Research Prompts for New Devices

When researching a new device, investigate:

1. **Device Type:** What category? (audio, input, IoT, etc.)
2. **Bluetooth Profiles:** A2DP? HID? SPP? GATT?
3. **Manufacturer Tools:** Does manufacturer provide macOS software?
4. **System Information:** What does `system_profiler SPBluetoothDataType` show?
5. **AppleScript Access:** Can IOBluetooth framework access device services?
6. **Third-Party Tools:** Any community tools for this device?
7. **Battery Monitoring:** Can we read battery level?
8. **Custom Commands:** Any device-specific control commands?

## Device Research Subagent Prompt Template

```
Research Bluetooth device: [DEVICE NAME]

Device Info:
- MAC Address: [ADDRESS]
- Device Type: [TYPE if known]
- Manufacturer: [MANUFACTURER if known]

Tasks:
1. Identify the Bluetooth profiles this device supports
2. Find all available control commands (blueutil, AppleScript, CLI tools)
3. Determine if battery level monitoring is possible
4. Check for manufacturer-specific macOS software/APIs
5. Search for community scripts or tools for this device
6. Test discovered commands and document which work

Output:
- Create reference.md with findings
- Create working control scripts in scripts/
- Note any limitations or requirements
```
```

### Step 6: Create check-installation.sh

```bash
#!/bin/bash
# skills/bluetooth/scripts/check-installation.sh
# Verify blueutil is installed and working

echo "Checking Bluetooth skill requirements..."

# Check blueutil
if command -v blueutil &> /dev/null; then
    VERSION=$(blueutil --version)
    echo "✓ blueutil installed: v$VERSION"
else
    echo "✗ blueutil not found"
    echo "  Install with: brew install blueutil"
    exit 1
fi

# Check Bluetooth power
POWER=$(blueutil -p)
if [ "$POWER" = "1" ]; then
    echo "✓ Bluetooth is ON"
else
    echo "⚠ Bluetooth is OFF"
fi

# List paired devices
echo ""
echo "Paired devices:"
blueutil --paired | head -5
PAIRED_COUNT=$(blueutil --paired | wc -l | tr -d ' ')
echo "  Total: $PAIRED_COUNT devices"

# List connected devices
echo ""
echo "Connected devices:"
blueutil --connected | head -5
CONNECTED_COUNT=$(blueutil --connected | wc -l | tr -d ' ')
echo "  Total: $CONNECTED_COUNT devices"

echo ""
echo "✓ Bluetooth skill ready"
```

### Step 7: Run verification

```bash
chmod +x /Users/brokkrbot/brokkr-agent/skills/bluetooth/scripts/check-installation.sh
/Users/brokkrbot/brokkr-agent/skills/bluetooth/scripts/check-installation.sh
```

### Step 8: Commit

```bash
git add skills/bluetooth/
git commit -m "feat(bluetooth): create skill directory structure and research docs"
```

---

## Task 2: Core blueutil Wrapper Module

**Objective:** Create the blueutil execution wrapper with power and device listing functions.

**Files:**
- Create: `/Users/brokkrbot/brokkr-agent/skills/bluetooth/lib/blueutil.js`
- Create: `/Users/brokkrbot/brokkr-agent/skills/bluetooth/tests/blueutil.test.js`

### Step 1: Write the failing test

```javascript
// skills/bluetooth/tests/blueutil.test.js
import { describe, test, expect } from '@jest/globals';
import {
  runBlueutil,
  isBluetoothAvailable,
  getBluetoothPowerState,
  powerOn,
  powerOff,
  togglePower,
  setDiscoverable,
  getDiscoverable,
  listPairedDevices,
  listConnectedDevices,
  getDeviceInfo,
  connectDevice,
  disconnectDevice,
  isDeviceConnected
} from '../lib/blueutil.js';

describe('Blueutil Core', () => {
  test('runBlueutil executes command', async () => {
    const result = await runBlueutil('--version');
    expect(result.success).toBe(true);
    expect(result.output).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('isBluetoothAvailable returns boolean', async () => {
    const result = await isBluetoothAvailable();
    expect(typeof result).toBe('boolean');
  });

  test('getBluetoothPowerState returns power state', async () => {
    const result = await getBluetoothPowerState();
    expect(result.success).toBe(true);
    expect(typeof result.powered).toBe('boolean');
  });
});

describe('Blueutil Power Control', () => {
  test('powerOn turns Bluetooth on', async () => {
    const result = await powerOn();
    expect(result.success).toBe(true);
  });

  test('powerOff turns Bluetooth off', async () => {
    await powerOn(); // Ensure it's on first
    const result = await powerOff();
    expect(result.success).toBe(true);
    await powerOn(); // Restore
  });

  test('togglePower toggles state', async () => {
    const before = await getBluetoothPowerState();
    await togglePower();
    const after = await getBluetoothPowerState();
    expect(after.powered).toBe(!before.powered);
    await togglePower(); // Restore
  });
});

describe('Blueutil Device Listing', () => {
  test('listPairedDevices returns array', async () => {
    await powerOn();
    const result = await listPairedDevices();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.devices)).toBe(true);
  });

  test('listConnectedDevices returns array', async () => {
    await powerOn();
    const result = await listConnectedDevices();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.devices)).toBe(true);
  });
});

describe('Blueutil Device Connection', () => {
  test('isDeviceConnected checks connection', async () => {
    await powerOn();
    const paired = await listPairedDevices();
    if (paired.devices.length > 0) {
      const result = await isDeviceConnected(paired.devices[0].address);
      expect(result.success).toBe(true);
      expect(typeof result.connected).toBe('boolean');
    }
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test -- skills/bluetooth/tests/blueutil.test.js
```

**Expected:** FAIL - module not found.

### Step 3: Write implementation

```javascript
// skills/bluetooth/lib/blueutil.js
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.json');

// Load configuration
let config = {
  blueutil: {
    paths: ['/opt/homebrew/bin/blueutil', '/usr/local/bin/blueutil', 'blueutil'],
    defaultTimeout: 30000
  }
};

try {
  config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
} catch {
  // Use defaults if config not found
}

/**
 * Find the blueutil binary path
 * @returns {string|null}
 */
function findBlueutil() {
  for (const path of config.blueutil.paths) {
    try {
      execSync(`${path} --version`, { stdio: 'pipe' });
      return path;
    } catch {
      continue;
    }
  }
  return null;
}

const BLUEUTIL = findBlueutil();

/**
 * Execute a blueutil command
 * @param {string} args - Arguments for blueutil
 * @param {Object} options - Execution options
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function runBlueutil(args, options = {}) {
  const { timeout = config.blueutil.defaultTimeout } = options;

  if (!BLUEUTIL) {
    return {
      success: false,
      error: 'blueutil not found. Install with: brew install blueutil'
    };
  }

  try {
    const output = execSync(`${BLUEUTIL} ${args}`, {
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    return {
      success: false,
      error: error.stderr?.toString().trim() || error.message
    };
  }
}

/**
 * Check if blueutil is available
 * @returns {Promise<boolean>}
 */
export async function isBluetoothAvailable() {
  return BLUEUTIL !== null;
}

/**
 * Get Bluetooth power state
 * @returns {Promise<{success: boolean, powered?: boolean, error?: string}>}
 */
export async function getBluetoothPowerState() {
  const result = await runBlueutil('-p');
  if (result.success) {
    return { success: true, powered: result.output === '1' };
  }
  return { success: false, error: result.error };
}

/**
 * Turn Bluetooth on
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function powerOn() {
  const result = await runBlueutil('-p 1');
  return result.success ? { success: true } : { success: false, error: result.error };
}

/**
 * Turn Bluetooth off
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function powerOff() {
  const result = await runBlueutil('-p 0');
  return result.success ? { success: true } : { success: false, error: result.error };
}

/**
 * Toggle Bluetooth power
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function togglePower() {
  const result = await runBlueutil('-p toggle');
  return result.success ? { success: true } : { success: false, error: result.error };
}

/**
 * Set discoverable state
 * @param {boolean} discoverable
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function setDiscoverable(discoverable) {
  const result = await runBlueutil(`-d ${discoverable ? '1' : '0'}`);
  return result.success ? { success: true } : { success: false, error: result.error };
}

/**
 * Get discoverable state
 * @returns {Promise<{success: boolean, discoverable?: boolean, error?: string}>}
 */
export async function getDiscoverable() {
  const result = await runBlueutil('-d');
  if (result.success) {
    return { success: true, discoverable: result.output === '1' };
  }
  return { success: false, error: result.error };
}

/**
 * Parse device output line
 * @param {string} line
 * @returns {Object}
 */
function parseDeviceLine(line) {
  const device = {};

  const addressMatch = line.match(/address:\s*([0-9a-f:-]+)/i);
  if (addressMatch) device.address = addressMatch[1];

  const nameMatch = line.match(/name:\s*"([^"]+)"/i) || line.match(/name:\s*([^,]+)/i);
  if (nameMatch) device.name = nameMatch[1].trim();

  device.connected = /\bconnected\b/i.test(line) && !/not connected/i.test(line);
  device.paired = /\bpaired\b/i.test(line);

  return device;
}

/**
 * List paired devices
 * @returns {Promise<{success: boolean, devices?: Array, error?: string}>}
 */
export async function listPairedDevices() {
  const result = await runBlueutil('--paired');
  if (result.success) {
    if (!result.output) return { success: true, devices: [] };
    const devices = result.output.split('\n').filter(l => l.trim()).map(parseDeviceLine);
    return { success: true, devices };
  }
  return { success: false, error: result.error };
}

/**
 * List connected devices
 * @returns {Promise<{success: boolean, devices?: Array, error?: string}>}
 */
export async function listConnectedDevices() {
  const result = await runBlueutil('--connected');
  if (result.success) {
    if (!result.output) return { success: true, devices: [] };
    const devices = result.output.split('\n').filter(l => l.trim()).map(parseDeviceLine);
    return { success: true, devices };
  }
  return { success: false, error: result.error };
}

/**
 * Get device information
 * @param {string} deviceId - MAC address or name
 * @returns {Promise<{success: boolean, device?: Object, error?: string}>}
 */
export async function getDeviceInfo(deviceId) {
  const result = await runBlueutil(`--info "${deviceId}"`);
  if (result.success) {
    return { success: true, device: parseDeviceLine(result.output) };
  }
  return { success: false, error: result.error };
}

/**
 * Connect to device
 * @param {string} deviceId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function connectDevice(deviceId) {
  const power = await getBluetoothPowerState();
  if (!power.powered) {
    return { success: false, error: 'Bluetooth is powered off' };
  }

  const result = await runBlueutil(`--connect "${deviceId}"`, { timeout: 30000 });
  return result.success ? { success: true } : { success: false, error: result.error };
}

/**
 * Disconnect from device
 * @param {string} deviceId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function disconnectDevice(deviceId) {
  const result = await runBlueutil(`--disconnect "${deviceId}"`);
  return result.success ? { success: true } : { success: false, error: result.error };
}

/**
 * Check if device is connected
 * @param {string} deviceId
 * @returns {Promise<{success: boolean, connected?: boolean, error?: string}>}
 */
export async function isDeviceConnected(deviceId) {
  const result = await runBlueutil(`--is-connected "${deviceId}"`);
  if (result.success) {
    return { success: true, connected: result.output === '1' };
  }
  return { success: false, error: result.error };
}

/**
 * Discover nearby devices
 * @param {number} timeout - Seconds to scan
 * @returns {Promise<{success: boolean, devices?: Array, error?: string}>}
 */
export async function discoverDevices(timeout = 10) {
  const result = await runBlueutil(`--inquiry ${timeout}`, {
    timeout: (timeout + 5) * 1000
  });
  if (result.success) {
    if (!result.output) return { success: true, devices: [] };
    const devices = result.output.split('\n').filter(l => l.trim()).map(parseDeviceLine);
    return { success: true, devices };
  }
  return { success: false, error: result.error };
}
```

### Step 4: Run tests

```bash
npm test -- skills/bluetooth/tests/blueutil.test.js
```

**Expected:** All tests PASS.

### Step 5: Commit

```bash
git add skills/bluetooth/lib/blueutil.js skills/bluetooth/tests/blueutil.test.js
git commit -m "feat(bluetooth): add core blueutil wrapper module"
```

---

## Task 3: Device Manager Module

**Objective:** Create device reference management with auto-discovery.

**Files:**
- Create: `/Users/brokkrbot/brokkr-agent/skills/bluetooth/lib/device-manager.js`
- Create: `/Users/brokkrbot/brokkr-agent/skills/bluetooth/tests/device-manager.test.js`

### Step 1: Write the failing test

```javascript
// skills/bluetooth/tests/device-manager.test.js
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getDeviceDirectory,
  deviceHasReference,
  getDeviceReference,
  saveDeviceReference,
  getUnreferencedDevices,
  normalizeDeviceName
} from '../lib/device-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEVICES_DIR = join(__dirname, '..', 'devices');
const TEST_DEVICE_DIR = join(DEVICES_DIR, 'test-device');

describe('Device Manager', () => {
  beforeEach(() => {
    // Clean up test device directory
    if (existsSync(TEST_DEVICE_DIR)) {
      rmSync(TEST_DEVICE_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up after tests
    if (existsSync(TEST_DEVICE_DIR)) {
      rmSync(TEST_DEVICE_DIR, { recursive: true });
    }
  });

  test('normalizeDeviceName creates valid directory name', () => {
    expect(normalizeDeviceName('AirPods Pro')).toBe('airpods-pro');
    expect(normalizeDeviceName("Tommy's Keyboard")).toBe('tommys-keyboard');
    expect(normalizeDeviceName('Device (2)')).toBe('device-2');
  });

  test('getDeviceDirectory returns correct path', () => {
    const path = getDeviceDirectory('AirPods Pro');
    expect(path).toContain('devices');
    expect(path).toContain('airpods-pro');
  });

  test('deviceHasReference returns false for new device', async () => {
    const hasRef = await deviceHasReference('Test Device');
    expect(hasRef).toBe(false);
  });

  test('saveDeviceReference creates reference file', async () => {
    const reference = {
      name: 'Test Device',
      address: '00-11-22-33-44-55',
      type: 'headphones',
      capabilities: ['connect', 'disconnect']
    };

    await saveDeviceReference('Test Device', reference);

    const hasRef = await deviceHasReference('Test Device');
    expect(hasRef).toBe(true);
  });

  test('getDeviceReference retrieves saved reference', async () => {
    const reference = {
      name: 'Test Device',
      address: '00-11-22-33-44-55',
      type: 'headphones'
    };

    await saveDeviceReference('Test Device', reference);
    const retrieved = await getDeviceReference('Test Device');

    expect(retrieved.name).toBe('Test Device');
    expect(retrieved.address).toBe('00-11-22-33-44-55');
  });
});
```

### Step 2: Run test to verify it fails

```bash
npm test -- skills/bluetooth/tests/device-manager.test.js
```

### Step 3: Write implementation

```javascript
// skills/bluetooth/lib/device-manager.js
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { listPairedDevices, listConnectedDevices } from './blueutil.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEVICES_DIR = join(__dirname, '..', 'devices');

/**
 * Normalize device name for use as directory name
 * @param {string} name - Device name
 * @returns {string} Normalized name (lowercase, no special chars)
 */
export function normalizeDeviceName(name) {
  return name
    .toLowerCase()
    .replace(/['"`]/g, '')           // Remove quotes
    .replace(/[^a-z0-9]+/g, '-')     // Replace non-alphanumeric with dash
    .replace(/^-+|-+$/g, '')         // Remove leading/trailing dashes
    .replace(/-+/g, '-');            // Collapse multiple dashes
}

/**
 * Get the directory path for a device
 * @param {string} deviceName - Device name
 * @returns {string} Full path to device directory
 */
export function getDeviceDirectory(deviceName) {
  return join(DEVICES_DIR, normalizeDeviceName(deviceName));
}

/**
 * Check if device has a reference file
 * @param {string} deviceName - Device name
 * @returns {Promise<boolean>}
 */
export async function deviceHasReference(deviceName) {
  const refPath = join(getDeviceDirectory(deviceName), 'reference.md');
  return existsSync(refPath);
}

/**
 * Get device reference data
 * @param {string} deviceName - Device name
 * @returns {Promise<Object|null>}
 */
export async function getDeviceReference(deviceName) {
  const deviceDir = getDeviceDirectory(deviceName);
  const metadataPath = join(deviceDir, 'metadata.json');

  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(metadataPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Save device reference
 * @param {string} deviceName - Device name
 * @param {Object} reference - Device reference data
 * @returns {Promise<void>}
 */
export async function saveDeviceReference(deviceName, reference) {
  const deviceDir = getDeviceDirectory(deviceName);
  const scriptsDir = join(deviceDir, 'scripts');

  // Create directories
  if (!existsSync(deviceDir)) {
    mkdirSync(deviceDir, { recursive: true });
  }
  if (!existsSync(scriptsDir)) {
    mkdirSync(scriptsDir, { recursive: true });
  }

  // Save metadata.json
  const metadataPath = join(deviceDir, 'metadata.json');
  const metadata = {
    ...reference,
    lastUpdated: new Date().toISOString()
  };
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  // Generate reference.md
  const referencePath = join(deviceDir, 'reference.md');
  const markdown = generateReferenceMarkdown(reference);
  writeFileSync(referencePath, markdown);

  // Generate basic scripts
  await generateDeviceScripts(deviceDir, reference);
}

/**
 * Generate reference markdown for device
 * @param {Object} reference - Device data
 * @returns {string} Markdown content
 */
function generateReferenceMarkdown(reference) {
  const capabilities = reference.capabilities || ['connect', 'disconnect'];
  const capRows = capabilities.map(cap =>
    `| ${cap} | \`scripts/${cap}.sh\` | Available |`
  ).join('\n');

  return `# ${reference.name} Reference

**Device Type:** ${reference.type || 'Unknown'}
**Manufacturer:** ${reference.manufacturer || 'Unknown'}
**MAC Address:** \`${reference.address || 'Unknown'}\`
**Bluetooth Profile:** ${reference.profile || 'Unknown'}

## Discovered Capabilities

| Capability | Command/Script | Status |
|------------|----------------|--------|
${capRows}

## Control Scripts

See \`scripts/\` directory for available control scripts.

## Research Notes

${reference.researchNotes || 'No additional notes.'}

## Last Updated

${new Date().toISOString().split('T')[0]}
`;
}

/**
 * Generate device control scripts
 * @param {string} deviceDir - Device directory path
 * @param {Object} reference - Device data
 */
async function generateDeviceScripts(deviceDir, reference) {
  const scriptsDir = join(deviceDir, 'scripts');
  const address = reference.address || reference.name;

  // connect.sh
  const connectScript = `#!/bin/bash
# Connect to ${reference.name}
blueutil --connect "${address}"
`;
  writeFileSync(join(scriptsDir, 'connect.sh'), connectScript, { mode: 0o755 });

  // disconnect.sh
  const disconnectScript = `#!/bin/bash
# Disconnect from ${reference.name}
blueutil --disconnect "${address}"
`;
  writeFileSync(join(scriptsDir, 'disconnect.sh'), disconnectScript, { mode: 0o755 });

  // status.sh
  const statusScript = `#!/bin/bash
# Check connection status of ${reference.name}
CONNECTED=$(blueutil --is-connected "${address}")
if [ "$CONNECTED" = "1" ]; then
  echo "Connected"
else
  echo "Disconnected"
fi
`;
  writeFileSync(join(scriptsDir, 'status.sh'), statusScript, { mode: 0o755 });
}

/**
 * Get list of paired devices without reference files
 * @returns {Promise<Array>} Devices needing research
 */
export async function getUnreferencedDevices() {
  const paired = await listPairedDevices();

  if (!paired.success) {
    return [];
  }

  const unreferenced = [];

  for (const device of paired.devices) {
    const hasRef = await deviceHasReference(device.name);
    if (!hasRef) {
      unreferenced.push(device);
    }
  }

  return unreferenced;
}

/**
 * Get all referenced devices
 * @returns {Promise<Array>} Device references
 */
export async function getAllReferencedDevices() {
  if (!existsSync(DEVICES_DIR)) {
    return [];
  }

  const devices = [];
  const entries = readdirSync(DEVICES_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== '.gitkeep') {
      const metadataPath = join(DEVICES_DIR, entry.name, 'metadata.json');
      if (existsSync(metadataPath)) {
        try {
          const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
          devices.push(metadata);
        } catch {
          // Skip invalid metadata
        }
      }
    }
  }

  return devices;
}

/**
 * Update device capabilities
 * @param {string} deviceName - Device name
 * @param {Array} newCapabilities - New capabilities to add
 * @returns {Promise<void>}
 */
export async function addDeviceCapabilities(deviceName, newCapabilities) {
  const reference = await getDeviceReference(deviceName);

  if (!reference) {
    throw new Error(`Device reference not found: ${deviceName}`);
  }

  const existing = reference.capabilities || [];
  const combined = [...new Set([...existing, ...newCapabilities])];

  reference.capabilities = combined;
  await saveDeviceReference(deviceName, reference);
}

/**
 * Save a custom script for a device
 * @param {string} deviceName - Device name
 * @param {string} scriptName - Script filename (without .sh)
 * @param {string} scriptContent - Script content
 * @returns {Promise<string>} Path to saved script
 */
export async function saveDeviceScript(deviceName, scriptName, scriptContent) {
  const deviceDir = getDeviceDirectory(deviceName);
  const scriptsDir = join(deviceDir, 'scripts');

  if (!existsSync(scriptsDir)) {
    mkdirSync(scriptsDir, { recursive: true });
  }

  const scriptPath = join(scriptsDir, `${scriptName}.sh`);
  writeFileSync(scriptPath, scriptContent, { mode: 0o755 });

  return scriptPath;
}
```

### Step 4: Run tests

```bash
npm test -- skills/bluetooth/tests/device-manager.test.js
```

### Step 5: Commit

```bash
git add skills/bluetooth/lib/device-manager.js skills/bluetooth/tests/device-manager.test.js
git commit -m "feat(bluetooth): add device manager with reference system"
```

---

## Task 4: Device Researcher Module

**Objective:** Create subagent prompts for device research.

**Files:**
- Create: `/Users/brokkrbot/brokkr-agent/skills/bluetooth/lib/device-researcher.js`

### Step 1: Write the implementation

```javascript
// skills/bluetooth/lib/device-researcher.js
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESEARCH_DIR = join(__dirname, '..', 'research');

/**
 * Generate a research prompt for a new Bluetooth device
 * @param {Object} device - Device info from blueutil
 * @returns {string} Research prompt for subagent
 */
export function generateDeviceResearchPrompt(device) {
  return `# Research Bluetooth Device: ${device.name}

## Device Information
- **Name:** ${device.name}
- **MAC Address:** ${device.address}
- **Currently Connected:** ${device.connected ? 'Yes' : 'No'}
- **Paired:** ${device.paired ? 'Yes' : 'No'}

## Research Tasks

You are researching a newly discovered Bluetooth device to determine its capabilities and create control scripts.

### 1. Identify Device Type and Manufacturer

Determine what kind of device this is:
- Headphones/Earbuds (AirPods, Sony, Bose, etc.)
- Keyboard
- Mouse/Trackpad
- Speaker
- Game Controller
- Other

Look for manufacturer information in the device name or search online.

### 2. Discover Bluetooth Profiles

Check what Bluetooth profiles this device supports:
- A2DP (Audio)
- HFP (Hands-Free)
- AVRCP (Media Control)
- HID (Human Interface Device)
- SPP (Serial Port)

Use this command to get device info:
\`\`\`bash
blueutil --info "${device.address}"
\`\`\`

### 3. Find Control Commands

Test and document which commands work:

**Basic (always test these):**
\`\`\`bash
blueutil --connect "${device.address}"
blueutil --disconnect "${device.address}"
blueutil --is-connected "${device.address}"
\`\`\`

**If audio device, test:**
- Volume control via Music.app or system audio
- Media control (play/pause/skip)

**If input device (keyboard/mouse), test:**
- Battery level via ioreg

### 4. Check for Battery Monitoring

Try to get battery level:

\`\`\`bash
# For Apple devices
ioreg -c AppleDeviceManagementHIDEventService | grep -i "${device.name}" -A 20 | grep "BatteryPercent"

# Via System Information
system_profiler SPBluetoothDataType | grep -A 20 "${device.name}" | grep -i battery
\`\`\`

### 5. Search for Manufacturer-Specific Tools

Check if the manufacturer provides macOS tools or APIs:
- Official companion apps
- Command-line utilities
- Shortcuts actions

### 6. Test AppleScript Integration

If blueutil is insufficient, try AppleScript:

\`\`\`applescript
use framework "IOBluetooth"
use scripting additions

set devices to current application's IOBluetoothDevice's pairedDevices() as list
repeat with d in devices
  if (d's nameOrAddress as string) contains "${device.name}" then
    log d's services() as list
  end if
end repeat
\`\`\`

## Output Requirements

Create the following files in \`skills/bluetooth/devices/${device.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/\`:

### 1. metadata.json
\`\`\`json
{
  "name": "${device.name}",
  "address": "${device.address}",
  "type": "<device-type>",
  "manufacturer": "<manufacturer>",
  "profile": "<bluetooth-profile>",
  "capabilities": ["connect", "disconnect", ...],
  "batterySupported": true/false,
  "researchDate": "<date>"
}
\`\`\`

### 2. reference.md
Document all discovered capabilities, working commands, and any limitations.

### 3. scripts/ directory
Create shell scripts for each working capability:
- connect.sh
- disconnect.sh
- status.sh
- battery.sh (if supported)
- Any device-specific scripts discovered

## Success Criteria

- Identified device type and manufacturer
- Documented all working control commands
- Created functional control scripts
- Noted any limitations or special requirements
`;
}

/**
 * Get the blueutil commands reference for research
 * @returns {string} Reference content
 */
export function getBluetoothCommandsReference() {
  const refPath = join(RESEARCH_DIR, 'blueutil-commands.md');
  if (existsSync(refPath)) {
    return readFileSync(refPath, 'utf-8');
  }
  return '';
}

/**
 * Get the AppleScript reference for research
 * @returns {string} Reference content
 */
export function getAppleScriptReference() {
  const refPath = join(RESEARCH_DIR, 'applescript-bluetooth.md');
  if (existsSync(refPath)) {
    return readFileSync(refPath, 'utf-8');
  }
  return '';
}

/**
 * Get the device types reference for research
 * @returns {string} Reference content
 */
export function getDeviceTypesReference() {
  const refPath = join(RESEARCH_DIR, 'device-types.md');
  if (existsSync(refPath)) {
    return readFileSync(refPath, 'utf-8');
  }
  return '';
}

/**
 * Generate a full research context for subagent
 * @param {Object} device - Device to research
 * @returns {Object} Research context with prompt and references
 */
export function generateFullResearchContext(device) {
  return {
    prompt: generateDeviceResearchPrompt(device),
    references: {
      blueutilCommands: getBluetoothCommandsReference(),
      appleScript: getAppleScriptReference(),
      deviceTypes: getDeviceTypesReference()
    },
    outputPath: `skills/bluetooth/devices/${device.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`
  };
}
```

### Step 2: Commit

```bash
git add skills/bluetooth/lib/device-researcher.js
git commit -m "feat(bluetooth): add device researcher module with subagent prompts"
```

---

## Task 5: Skill Documentation

**Objective:** Create comprehensive skill.md with agent instructions.

**Files:**
- Create: `/Users/brokkrbot/brokkr-agent/skills/bluetooth/skill.md`

### Implementation

```markdown
# Bluetooth Control Skill

Control Bluetooth power, manage device connections, and automatically research new devices.

## Quick Reference

| Command | Description |
|---------|-------------|
| Turn Bluetooth on | `powerOn()` |
| Turn Bluetooth off | `powerOff()` |
| Toggle power | `togglePower()` |
| List paired devices | `listPairedDevices()` |
| List connected devices | `listConnectedDevices()` |
| Connect to device | `connectDevice(name)` |
| Disconnect from device | `disconnectDevice(name)` |
| Check connection | `isDeviceConnected(name)` |

## Agent Instructions

### When Connecting Devices

1. **Check for device reference first:**
   ```javascript
   import { deviceHasReference, getDeviceReference } from './lib/device-manager.js';

   const hasRef = await deviceHasReference('AirPods Pro');
   if (hasRef) {
     const ref = await getDeviceReference('AirPods Pro');
     // Use ref.capabilities to know what's possible
   }
   ```

2. **If no reference exists, trigger research:**
   ```javascript
   import { getUnreferencedDevices } from './lib/device-manager.js';
   import { generateDeviceResearchPrompt } from './lib/device-researcher.js';

   const unreferenced = await getUnreferencedDevices();
   for (const device of unreferenced) {
     const prompt = generateDeviceResearchPrompt(device);
     // Deploy subagent with this prompt
   }
   ```

### Device Research Protocol

When you encounter a new Bluetooth device without a reference:

1. **Identify the device** - Check `skills/bluetooth/devices/<device-name>/reference.md`
2. **If missing, deploy research subagent** with prompt from `device-researcher.js`
3. **Research subagent should:**
   - Identify device type and manufacturer
   - Test all blueutil commands
   - Check for battery monitoring
   - Try AppleScript integration
   - Create reference.md and metadata.json
   - Generate control scripts

### Adding New Device Capabilities

When you discover new functionality for a device:

```javascript
import { addDeviceCapabilities, saveDeviceScript } from './lib/device-manager.js';

// Add the capability
await addDeviceCapabilities('AirPods Pro', ['noise-control', 'battery-level']);

// Save the script
await saveDeviceScript('AirPods Pro', 'noise-control', `#!/bin/bash
shortcuts run "AirPods Noise Control"
`);
```

### Research Reference Materials

The `research/` directory contains reference documentation:

- `blueutil-commands.md` - All blueutil CLI commands
- `applescript-bluetooth.md` - AppleScript IOBluetooth examples
- `device-types.md` - Known device type capabilities

**Use these when researching new devices!**

## Directory Structure

```
skills/bluetooth/
  skill.md                    # This file
  config.json                 # Configuration
  lib/
    blueutil.js               # Core Bluetooth functions
    device-manager.js         # Device reference management
    device-researcher.js      # Research prompt generation
  devices/
    <device-name>/
      reference.md            # Device documentation
      metadata.json           # Device metadata
      scripts/
        connect.sh
        disconnect.sh
        status.sh
        <custom>.sh
  research/
    blueutil-commands.md      # blueutil reference
    applescript-bluetooth.md  # AppleScript reference
    device-types.md           # Device capabilities reference
  scripts/
    check-installation.sh     # Setup verification
  tests/
    blueutil.test.js
    device-manager.test.js
```

## Usage Examples

### Basic Bluetooth Control

```javascript
import { powerOn, powerOff, togglePower, getBluetoothPowerState } from './lib/blueutil.js';

// Check power state
const state = await getBluetoothPowerState();
console.log(`Bluetooth is ${state.powered ? 'ON' : 'OFF'}`);

// Toggle power
await togglePower();
```

### Device Connection

```javascript
import { listPairedDevices, connectDevice, disconnectDevice } from './lib/blueutil.js';

// List all paired devices
const paired = await listPairedDevices();
paired.devices.forEach(d => console.log(`${d.name} (${d.address})`));

// Connect to device by name
await connectDevice('AirPods Pro');

// Disconnect
await disconnectDevice('AirPods Pro');
```

### Device Research Workflow

```javascript
import { getUnreferencedDevices } from './lib/device-manager.js';
import { generateFullResearchContext } from './lib/device-researcher.js';

// Find devices needing research
const unreferenced = await getUnreferencedDevices();

if (unreferenced.length > 0) {
  console.log('New devices detected - deploying research subagent');

  for (const device of unreferenced) {
    const context = generateFullResearchContext(device);

    // Deploy subagent with context.prompt
    // Subagent has access to context.references
    // Output should go to context.outputPath
  }
}
```

## Error Handling

All functions return `{ success: boolean, data?, error? }`:

```javascript
const result = await connectDevice('Unknown Device');

if (!result.success) {
  console.error(`Failed: ${result.error}`);
  // Handle error appropriately
}
```

## Requirements

- **blueutil** - Install with: `brew install blueutil`
- **macOS 14+** (Sonoma) - Tested and compatible
- Run as user (not root/daemon)

## Troubleshooting

### blueutil not found
```bash
brew install blueutil
```

### Permission denied
- Ensure Terminal has Bluetooth access in System Settings > Privacy & Security > Bluetooth

### Device won't connect
- Ensure device is in range and powered on
- Check if already connected to another device
- Try toggling device power

## Future Enhancements

- [ ] Battery level monitoring for supported devices
- [ ] Auto-connect on wake
- [ ] Focus mode integration (auto-connect headphones for Work)
- [ ] Music skill integration (connect speaker before playing)
- [ ] Device health monitoring
```

### Step 2: Commit

```bash
git add skills/bluetooth/skill.md
git commit -m "docs(bluetooth): add comprehensive skill documentation"
```

---

## Task 6: Unit Tests

**Objective:** Ensure comprehensive test coverage.

Already created in Tasks 2 and 3. Run final verification:

```bash
npm test -- skills/bluetooth/tests/
```

**Expected:** All tests pass.

---

## Task 7: Integration Testing

**Objective:** End-to-end testing of the complete skill.

### Manual Test Script

Create `/Users/brokkrbot/brokkr-agent/skills/bluetooth/tests/integration-test.js`:

```javascript
// skills/bluetooth/tests/integration-test.js
import {
  isBluetoothAvailable,
  getBluetoothPowerState,
  powerOn,
  listPairedDevices,
  listConnectedDevices
} from '../lib/blueutil.js';
import {
  getUnreferencedDevices,
  deviceHasReference,
  saveDeviceReference,
  getDeviceDirectory
} from '../lib/device-manager.js';
import { generateDeviceResearchPrompt } from '../lib/device-researcher.js';
import { existsSync } from 'fs';

async function runIntegrationTest() {
  console.log('=== Bluetooth Skill Integration Test ===\n');

  // 1. Check blueutil
  console.log('1. Checking blueutil availability...');
  const available = await isBluetoothAvailable();
  if (!available) {
    console.error('blueutil not installed. Run: brew install blueutil');
    process.exit(1);
  }
  console.log('blueutil available\n');

  // 2. Check power
  console.log('2. Checking Bluetooth power...');
  const power = await getBluetoothPowerState();
  console.log(`Bluetooth is ${power.powered ? 'ON' : 'OFF'}`);
  if (!power.powered) {
    console.log('   Turning on...');
    await powerOn();
  }
  console.log();

  // 3. List devices
  console.log('3. Listing paired devices...');
  const paired = await listPairedDevices();
  if (paired.success && paired.devices.length > 0) {
    paired.devices.forEach(d => {
      console.log(`   - ${d.name} (${d.address})`);
    });
  } else {
    console.log('   No paired devices found');
  }
  console.log();

  // 4. List connected
  console.log('4. Listing connected devices...');
  const connected = await listConnectedDevices();
  if (connected.success && connected.devices.length > 0) {
    connected.devices.forEach(d => {
      console.log(`   - ${d.name} (${d.address})`);
    });
  } else {
    console.log('   No devices currently connected');
  }
  console.log();

  // 5. Check device references
  console.log('5. Checking device references...');
  const unreferenced = await getUnreferencedDevices();
  if (unreferenced.length > 0) {
    console.log(`   ${unreferenced.length} device(s) need research:`);
    unreferenced.forEach(d => {
      console.log(`   - ${d.name}`);
    });
  } else {
    console.log('   All devices have reference files');
  }
  console.log();

  // 6. Test device manager
  console.log('6. Testing device manager...');
  const testDevice = {
    name: 'Integration Test Device',
    address: '00-00-00-00-00-00',
    type: 'test',
    capabilities: ['connect', 'disconnect']
  };

  await saveDeviceReference('Integration Test Device', testDevice);
  const hasRef = await deviceHasReference('Integration Test Device');
  const dir = getDeviceDirectory('Integration Test Device');

  console.log(`   Reference created: ${hasRef}`);
  console.log(`   Directory exists: ${existsSync(dir)}`);
  console.log();

  // 7. Test research prompt generation
  console.log('7. Testing research prompt generation...');
  if (paired.devices.length > 0) {
    const prompt = generateDeviceResearchPrompt(paired.devices[0]);
    console.log(`   Generated ${prompt.length} character prompt for ${paired.devices[0].name}`);
  } else {
    console.log('   Skipped (no paired devices)');
  }
  console.log();

  console.log('=== Integration Test Complete ===');
}

runIntegrationTest().catch(console.error);
```

### Execution

```bash
node skills/bluetooth/tests/integration-test.js
```

### Commit

```bash
git add skills/bluetooth/tests/integration-test.js
git commit -m "test(bluetooth): add integration test script"
```

---

## Completion Checklist

- [ ] Skill directory structure created
- [ ] Research documentation (blueutil-commands.md, applescript-bluetooth.md, device-types.md)
- [ ] Core blueutil wrapper module
- [ ] Device manager with reference system
- [ ] Device researcher with subagent prompts
- [ ] Comprehensive skill.md documentation
- [ ] Unit tests passing
- [ ] Integration test passing

## Success Criteria

1. All tests pass (`npm test -- skills/bluetooth/tests/`)
2. Integration test completes successfully
3. Power control works
4. Device listing returns paired/connected devices
5. Device reference system creates directories and files
6. Research prompts generate properly
7. New devices trigger research flow

## Documentation Updates

After completion, update:
1. `/Users/brokkrbot/brokkr-agent/CLAUDE.md` - Add Bluetooth skill to capabilities
2. `/Users/brokkrbot/brokkr-agent/docs/plans/sprint-apple-integration.md` - Mark complete
