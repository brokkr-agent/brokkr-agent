---
name: bluetooth
description: Control Bluetooth power, manage device connections, and automatically research new devices
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Bluetooth Control Skill

> **For Claude:** This skill is part of the Apple Integration suite.
> See `docs/concepts/2026-02-01-apple-integration-architecture.md` for patterns.

Control Bluetooth power, manage device connections, and automatically research new devices.

## Capabilities

- Turn Bluetooth on/off/toggle
- List paired and connected devices
- Connect/disconnect specific devices
- Check device connection status
- Auto-research new devices via device-researcher subagent
- Store device research in iCloud via lib/icloud-storage.js

## Usage

### Via Command (Manual)
```
/bluetooth power on
/bluetooth list
/bluetooth connect "AirPods Pro"
/bluetooth disconnect "AirPods Pro"
/bluetooth status "AirPods Pro"
/bluetooth research "New Device"
```

### Via Notification (Automatic)
Triggered by notification monitor when a new Bluetooth device connects.

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

## Directory Structure

```
skills/bluetooth/
  SKILL.md                    # This file
  config.json                 # Configuration
  lib/
    blueutil.js               # Core Bluetooth functions
    device-manager.js         # Device reference management
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
    .gitkeep                  # Placeholder for research docs
  scripts/
    check-installation.sh     # Setup verification
  tests/
    blueutil.test.js
    device-manager.test.js
```

## Requirements

- **blueutil** - Install with: `brew install blueutil`
- **macOS 14+** (Sonoma) - Tested and compatible
- Run as user (not root/daemon)

## Error Handling

All functions return `{ success: boolean, data?, error? }`:

```javascript
const result = await connectDevice('Unknown Device');

if (!result.success) {
  console.error(`Failed: ${result.error}`);
  // Handle error appropriately
}
```

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
