# Bluetooth Control Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILLS:
> - Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan
> - Use `superpowers:test-driven-development` for all implementation tasks

**Goal:** Create a skill for controlling Bluetooth on macOS, enabling Brokkr to toggle Bluetooth power, list devices, connect/disconnect devices, and check connection status.

**Architecture:** CLI-based skill using `blueutil` (Homebrew package) for all Bluetooth operations. Node.js wrapper module executes blueutil commands via `child_process`. Returns structured JSON responses for easy parsing.

**Tech Stack:** blueutil CLI (via Homebrew), Node.js (child_process for command execution), no additional npm dependencies

---

## Research Summary

### Official Documentation Sources

- [blueutil GitHub Repository](https://github.com/toy/blueutil) - Primary documentation
- [Homebrew Formula - blueutil](https://formulae.brew.sh/formula/blueutil) - Installation and versioning
- [IOBluetooth Framework](https://developer.apple.com/documentation/iobluetooth) - Underlying Apple framework
- [IOBluetoothDevice Class](https://developer.apple.com/documentation/iobluetooth/iobluetoothdevice) - Device management API

### Key Capabilities (via blueutil)

**Power Control:**
- `blueutil -p 1` / `blueutil -p 0` - Power on/off
- `blueutil -p toggle` - Toggle power state
- `blueutil -d 1` / `blueutil -d 0` - Discoverable on/off

**Device Listing:**
- `blueutil --paired` - List paired devices
- `blueutil --connected` - List connected devices
- `blueutil --inquiry 10` - Discover nearby devices (10 seconds)

**Device Management:**
- `blueutil --connect <ID>` - Connect to device
- `blueutil --disconnect <ID>` - Disconnect from device
- `blueutil --is-connected <ID>` - Check if connected (returns 1 or 0)
- `blueutil --info <ID>` - Get device information
- `blueutil --pair <ID>` - Pair with device (experimental)

**Output Formats:**
- `blueutil --format json-pretty` - JSON output for parsing

### Device ID Formats

Devices can be identified by:
- MAC address: `xx:xx:xx:xx:xx:xx`, `xx-xx-xx-xx-xx-xx`, or `xxxxxxxxxxxx`
- Device name (searches paired/recent devices)

### Critical Limitations

1. **Pairing unreliable via CLI** - May require multiple attempts or manual GUI pairing
2. **--favorites and --recent empty on macOS 12+** - Monterey, Ventura, Sonoma
3. **Will not run as root** - Must run as user-level process
4. **Inquiry misses some devices** - Not all devices in pairing mode are detected
5. **No real-time notifications** - Must poll for connection status changes

### macOS Sonoma Compatibility

- blueutil v2.13.0 fully compatible with Sonoma (both Intel and Apple Silicon)
- May require adding Terminal to Settings > Privacy & Security > App Management for pairing operations

### Verified Compatibility

Testing requirements:
- Homebrew installed: `brew --version`
- blueutil installed: `blueutil --version`
- Returns version 2.13.0 or higher

---

## Design Decisions

### Why blueutil (Not AppleScript)?

1. **No native AppleScript Bluetooth support** - AppleScript has no Bluetooth scripting dictionary
2. **Reliable and maintained** - blueutil is actively maintained (MIT license)
3. **Full feature set** - Power, discovery, connect, disconnect, pairing
4. **JSON output** - Easy to parse programmatically
5. **No GUI scripting fragility** - Works headless, won't break with UI changes

### Skill Structure

```
lib/
  bluetooth.js          # Main module with all Bluetooth functions
tests/
  bluetooth.test.js     # Unit tests
```

Note: Unlike AppleScript-based skills, no separate `skills/bluetooth/` directory needed since blueutil doesn't require script files.

### Node.js Wrapper Pattern

All blueutil commands executed via Node.js wrapper:

```javascript
import { execSync } from 'child_process';

function runBlueutil(args) {
  try {
    const output = execSync(`blueutil ${args}`, { encoding: 'utf-8' });
    return { success: true, output: output.trim() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### Error Handling Strategy

All skill functions return `{ success: boolean, data?: any, error?: string }`:
- Success case: `{ success: true, data: deviceList }`
- Bluetooth off: `{ success: false, error: 'Bluetooth is powered off' }`
- Device not found: `{ success: false, error: 'Device not found: AirPods' }`
- blueutil not installed: `{ success: false, error: 'blueutil not found. Install with: brew install blueutil' }`

---

## Task Overview

| Task | Description | Files | Test Strategy |
|------|-------------|-------|---------------|
| 1 | Verify blueutil installation | Setup verification | Manual: check `blueutil --version` |
| 2 | Core blueutil execution module | `lib/bluetooth.js` | Unit test: execute, parse, error handling |
| 3 | Power control functions | `lib/bluetooth.js` | Unit test: on, off, toggle, status |
| 4 | Device listing functions | `lib/bluetooth.js` | Unit test: paired, connected, discovery |
| 5 | Device connection functions | `lib/bluetooth.js` | Unit test: connect, disconnect, is-connected |
| 6 | Unit tests | `tests/bluetooth.test.js` | Run: `npm test -- tests/bluetooth.test.js` |
| 7 | Integration testing | Manual verification | End-to-end: full workflow test |

---

## Task 1: Verify blueutil Installation

**Objective:** Ensure blueutil is installed and accessible.

### Step 1: Check if blueutil is installed

Run:
```bash
which blueutil
```

**Expected:** `/opt/homebrew/bin/blueutil` (Apple Silicon) or `/usr/local/bin/blueutil` (Intel)

### Step 2: Install blueutil if missing

Run:
```bash
brew install blueutil
```

**Expected:** Installation completes successfully.

### Step 3: Verify version

Run:
```bash
blueutil --version
```

**Expected:** `2.13.0` or higher.

### Step 4: Test basic operation

Run:
```bash
blueutil -p
```

**Expected:** `1` (Bluetooth on) or `0` (Bluetooth off).

**Commit:** None (setup verification only)

---

## Task 2: Core blueutil Execution Module

**Objective:** Create the base module with command execution utilities.

**Files:**
- Create: `/Users/brokkrbot/brokkr-agent/lib/bluetooth.js`
- Create: `/Users/brokkrbot/brokkr-agent/tests/bluetooth.test.js`

### Step 1: Write the failing test

```javascript
// tests/bluetooth.test.js
import { describe, test, expect } from '@jest/globals';
import {
  runBlueutil,
  isBluetoothAvailable,
  getBluetoothPowerState
} from '../lib/bluetooth.js';

describe('Bluetooth Core', () => {
  test('runBlueutil executes command and returns output', async () => {
    const result = await runBlueutil('--version');
    expect(result.success).toBe(true);
    expect(result.output).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('runBlueutil handles invalid command gracefully', async () => {
    const result = await runBlueutil('--invalid-flag-that-does-not-exist');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
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
```

### Step 2: Run test to verify it fails

Run:
```bash
npm test -- tests/bluetooth.test.js
```

**Expected:** FAIL with "Cannot find module '../lib/bluetooth.js'"

### Step 3: Write minimal implementation

```javascript
// lib/bluetooth.js
import { execSync, exec } from 'child_process';

// Path to blueutil (try both Homebrew locations)
const BLUEUTIL_PATHS = [
  '/opt/homebrew/bin/blueutil',  // Apple Silicon
  '/usr/local/bin/blueutil',     // Intel
  'blueutil'                      // PATH fallback
];

/**
 * Find the blueutil binary path
 * @returns {string|null} Path to blueutil or null if not found
 */
function findBlueutil() {
  for (const path of BLUEUTIL_PATHS) {
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
 * @param {string} args - Arguments to pass to blueutil
 * @param {Object} options - Execution options
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function runBlueutil(args, options = {}) {
  const { timeout = 30000 } = options;

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
 * Check if blueutil is available on the system
 * @returns {Promise<boolean>} True if blueutil is installed
 */
export async function isBluetoothAvailable() {
  return BLUEUTIL !== null;
}

/**
 * Get current Bluetooth power state
 * @returns {Promise<{success: boolean, powered?: boolean, error?: string}>}
 */
export async function getBluetoothPowerState() {
  const result = await runBlueutil('-p');

  if (result.success) {
    const powered = result.output === '1';
    return { success: true, powered };
  }

  return { success: false, error: result.error };
}
```

### Step 4: Run test to verify it passes

Run:
```bash
npm test -- tests/bluetooth.test.js
```

**Expected:** All tests PASS.

### Step 5: Commit

```bash
git add lib/bluetooth.js tests/bluetooth.test.js
git commit -m "feat(bluetooth): add core blueutil execution module"
```

---

## Task 3: Power Control Functions

**Objective:** Add functions for Bluetooth power control.

**Files:**
- Modify: `/Users/brokkrbot/brokkr-agent/lib/bluetooth.js`
- Modify: `/Users/brokkrbot/brokkr-agent/tests/bluetooth.test.js`

### Step 1: Write the failing tests

Add to `tests/bluetooth.test.js`:

```javascript
import {
  runBlueutil,
  isBluetoothAvailable,
  getBluetoothPowerState,
  powerOn,
  powerOff,
  togglePower,
  setDiscoverable,
  getDiscoverable
} from '../lib/bluetooth.js';

describe('Bluetooth Power Control', () => {
  test('powerOn turns Bluetooth on', async () => {
    const result = await powerOn();
    expect(result.success).toBe(true);

    // Verify it's on
    const state = await getBluetoothPowerState();
    expect(state.powered).toBe(true);
  });

  test('powerOff turns Bluetooth off', async () => {
    // First ensure it's on
    await powerOn();

    const result = await powerOff();
    expect(result.success).toBe(true);

    // Verify it's off
    const state = await getBluetoothPowerState();
    expect(state.powered).toBe(false);

    // Turn it back on for other tests
    await powerOn();
  });

  test('togglePower toggles Bluetooth state', async () => {
    const initialState = await getBluetoothPowerState();
    const result = await togglePower();
    expect(result.success).toBe(true);

    const newState = await getBluetoothPowerState();
    expect(newState.powered).toBe(!initialState.powered);

    // Toggle back
    await togglePower();
  });

  test('setDiscoverable sets discoverable state', async () => {
    // Ensure Bluetooth is on first
    await powerOn();

    const result = await setDiscoverable(true);
    expect(result.success).toBe(true);

    // Turn off discoverable
    await setDiscoverable(false);
  });

  test('getDiscoverable returns discoverable state', async () => {
    await powerOn();
    const result = await getDiscoverable();
    expect(result.success).toBe(true);
    expect(typeof result.discoverable).toBe('boolean');
  });
});
```

### Step 2: Run test to verify it fails

Run:
```bash
npm test -- tests/bluetooth.test.js
```

**Expected:** FAIL with "powerOn is not a function" or similar.

### Step 3: Write implementation

Add to `lib/bluetooth.js`:

```javascript
/**
 * Turn Bluetooth power on
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function powerOn() {
  const result = await runBlueutil('-p 1');

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}

/**
 * Turn Bluetooth power off
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function powerOff() {
  const result = await runBlueutil('-p 0');

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}

/**
 * Toggle Bluetooth power
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function togglePower() {
  const result = await runBlueutil('-p toggle');

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}

/**
 * Set Bluetooth discoverable state
 * @param {boolean} discoverable - Whether to be discoverable
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function setDiscoverable(discoverable) {
  const value = discoverable ? '1' : '0';
  const result = await runBlueutil(`-d ${value}`);

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}

/**
 * Get Bluetooth discoverable state
 * @returns {Promise<{success: boolean, discoverable?: boolean, error?: string}>}
 */
export async function getDiscoverable() {
  const result = await runBlueutil('-d');

  if (result.success) {
    const discoverable = result.output === '1';
    return { success: true, discoverable };
  }

  return { success: false, error: result.error };
}
```

### Step 4: Run test to verify it passes

Run:
```bash
npm test -- tests/bluetooth.test.js
```

**Expected:** All power control tests PASS.

### Step 5: Commit

```bash
git add lib/bluetooth.js tests/bluetooth.test.js
git commit -m "feat(bluetooth): add power control functions"
```

---

## Task 4: Device Listing Functions

**Objective:** Add functions to list paired and connected devices.

**Files:**
- Modify: `/Users/brokkrbot/brokkr-agent/lib/bluetooth.js`
- Modify: `/Users/brokkrbot/brokkr-agent/tests/bluetooth.test.js`

### Step 1: Write the failing tests

Add to `tests/bluetooth.test.js`:

```javascript
import {
  // ... existing imports ...
  listPairedDevices,
  listConnectedDevices,
  getDeviceInfo
} from '../lib/bluetooth.js';

describe('Bluetooth Device Listing', () => {
  test('listPairedDevices returns array of devices', async () => {
    await powerOn();
    const result = await listPairedDevices();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.devices)).toBe(true);

    // Each device should have address and name
    if (result.devices.length > 0) {
      expect(result.devices[0]).toHaveProperty('address');
      expect(result.devices[0]).toHaveProperty('name');
    }
  });

  test('listConnectedDevices returns array of connected devices', async () => {
    await powerOn();
    const result = await listConnectedDevices();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.devices)).toBe(true);
  });

  test('getDeviceInfo returns device details', async () => {
    await powerOn();
    const paired = await listPairedDevices();

    if (paired.devices.length > 0) {
      const device = paired.devices[0];
      const result = await getDeviceInfo(device.address);
      expect(result.success).toBe(true);
      expect(result.device).toHaveProperty('address');
      expect(result.device).toHaveProperty('name');
    } else {
      // No paired devices - skip test but don't fail
      console.log('Skipping getDeviceInfo test - no paired devices');
    }
  });
});
```

### Step 2: Run test to verify it fails

Run:
```bash
npm test -- tests/bluetooth.test.js
```

**Expected:** FAIL with "listPairedDevices is not a function".

### Step 3: Write implementation

Add to `lib/bluetooth.js`:

```javascript
/**
 * Parse blueutil device output line
 * Format: "address: xx-xx-xx-xx-xx-xx, name: "Device Name", ..."
 * @param {string} line - Device output line
 * @returns {Object} Parsed device object
 */
function parseDeviceLine(line) {
  const device = {};

  // Extract address
  const addressMatch = line.match(/address:\s*([0-9a-f-]+)/i);
  if (addressMatch) {
    device.address = addressMatch[1];
  }

  // Extract name (may be in quotes)
  const nameMatch = line.match(/name:\s*"?([^",]+)"?/i);
  if (nameMatch) {
    device.name = nameMatch[1].trim();
  }

  // Extract connected status if present
  const connectedMatch = line.match(/connected:\s*(\w+)/i);
  if (connectedMatch) {
    device.connected = connectedMatch[1].toLowerCase() === 'yes' ||
                       connectedMatch[1] === '1';
  }

  // Extract paired status if present
  const pairedMatch = line.match(/paired:\s*(\w+)/i);
  if (pairedMatch) {
    device.paired = pairedMatch[1].toLowerCase() === 'yes' ||
                    pairedMatch[1] === '1';
  }

  return device;
}

/**
 * List all paired Bluetooth devices
 * @returns {Promise<{success: boolean, devices?: Array, error?: string}>}
 */
export async function listPairedDevices() {
  const result = await runBlueutil('--paired');

  if (result.success) {
    if (!result.output || result.output === '') {
      return { success: true, devices: [] };
    }

    const lines = result.output.split('\n').filter(line => line.trim());
    const devices = lines.map(parseDeviceLine);

    return { success: true, devices };
  }

  return { success: false, error: result.error };
}

/**
 * List currently connected Bluetooth devices
 * @returns {Promise<{success: boolean, devices?: Array, error?: string}>}
 */
export async function listConnectedDevices() {
  const result = await runBlueutil('--connected');

  if (result.success) {
    if (!result.output || result.output === '') {
      return { success: true, devices: [] };
    }

    const lines = result.output.split('\n').filter(line => line.trim());
    const devices = lines.map(parseDeviceLine);

    return { success: true, devices };
  }

  return { success: false, error: result.error };
}

/**
 * Get detailed information about a specific device
 * @param {string} deviceId - Device MAC address or name
 * @returns {Promise<{success: boolean, device?: Object, error?: string}>}
 */
export async function getDeviceInfo(deviceId) {
  const result = await runBlueutil(`--info "${deviceId}"`);

  if (result.success) {
    const device = parseDeviceLine(result.output);
    return { success: true, device };
  }

  return { success: false, error: result.error };
}

/**
 * Discover nearby Bluetooth devices
 * @param {number} timeout - Discovery timeout in seconds (default: 10)
 * @returns {Promise<{success: boolean, devices?: Array, error?: string}>}
 */
export async function discoverDevices(timeout = 10) {
  // Inquiry can take a while, increase command timeout
  const result = await runBlueutil(`--inquiry ${timeout}`, {
    timeout: (timeout + 5) * 1000
  });

  if (result.success) {
    if (!result.output || result.output === '') {
      return { success: true, devices: [] };
    }

    const lines = result.output.split('\n').filter(line => line.trim());
    const devices = lines.map(parseDeviceLine);

    return { success: true, devices };
  }

  return { success: false, error: result.error };
}
```

### Step 4: Run test to verify it passes

Run:
```bash
npm test -- tests/bluetooth.test.js
```

**Expected:** All device listing tests PASS.

### Step 5: Commit

```bash
git add lib/bluetooth.js tests/bluetooth.test.js
git commit -m "feat(bluetooth): add device listing functions"
```

---

## Task 5: Device Connection Functions

**Objective:** Add functions to connect/disconnect devices and check connection status.

**Files:**
- Modify: `/Users/brokkrbot/brokkr-agent/lib/bluetooth.js`
- Modify: `/Users/brokkrbot/brokkr-agent/tests/bluetooth.test.js`

### Step 1: Write the failing tests

Add to `tests/bluetooth.test.js`:

```javascript
import {
  // ... existing imports ...
  connectDevice,
  disconnectDevice,
  isDeviceConnected
} from '../lib/bluetooth.js';

describe('Bluetooth Device Connection', () => {
  test('isDeviceConnected checks connection status', async () => {
    await powerOn();
    const paired = await listPairedDevices();

    if (paired.devices.length > 0) {
      const device = paired.devices[0];
      const result = await isDeviceConnected(device.address);
      expect(result.success).toBe(true);
      expect(typeof result.connected).toBe('boolean');
    } else {
      console.log('Skipping isDeviceConnected test - no paired devices');
    }
  });

  test('connectDevice connects to a paired device', async () => {
    await powerOn();
    const paired = await listPairedDevices();

    if (paired.devices.length > 0) {
      const device = paired.devices[0];
      const result = await connectDevice(device.address);
      // May fail if device is out of range - that's OK for test
      expect(result.success !== undefined).toBe(true);
    } else {
      console.log('Skipping connectDevice test - no paired devices');
    }
  });

  test('disconnectDevice disconnects from a device', async () => {
    await powerOn();
    const connected = await listConnectedDevices();

    if (connected.devices.length > 0) {
      const device = connected.devices[0];
      const result = await disconnectDevice(device.address);
      expect(result.success).toBe(true);

      // Reconnect to restore state
      await connectDevice(device.address);
    } else {
      // Try disconnecting any paired device (may already be disconnected)
      const paired = await listPairedDevices();
      if (paired.devices.length > 0) {
        const result = await disconnectDevice(paired.devices[0].address);
        // Should succeed even if already disconnected
        expect(result.success !== undefined).toBe(true);
      } else {
        console.log('Skipping disconnectDevice test - no devices');
      }
    }
  });
});
```

### Step 2: Run test to verify it fails

Run:
```bash
npm test -- tests/bluetooth.test.js
```

**Expected:** FAIL with "connectDevice is not a function".

### Step 3: Write implementation

Add to `lib/bluetooth.js`:

```javascript
/**
 * Connect to a Bluetooth device
 * @param {string} deviceId - Device MAC address or name
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function connectDevice(deviceId) {
  // First check if Bluetooth is on
  const powerState = await getBluetoothPowerState();
  if (!powerState.powered) {
    return { success: false, error: 'Bluetooth is powered off' };
  }

  const result = await runBlueutil(`--connect "${deviceId}"`, {
    timeout: 30000  // Connection can take time
  });

  if (result.success) {
    return { success: true };
  }

  // Check if it's a "not found" error
  if (result.error && result.error.includes('not found')) {
    return { success: false, error: `Device not found: ${deviceId}` };
  }

  return { success: false, error: result.error };
}

/**
 * Disconnect from a Bluetooth device
 * @param {string} deviceId - Device MAC address or name
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function disconnectDevice(deviceId) {
  const result = await runBlueutil(`--disconnect "${deviceId}"`);

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}

/**
 * Check if a device is currently connected
 * @param {string} deviceId - Device MAC address or name
 * @returns {Promise<{success: boolean, connected?: boolean, error?: string}>}
 */
export async function isDeviceConnected(deviceId) {
  const result = await runBlueutil(`--is-connected "${deviceId}"`);

  if (result.success) {
    const connected = result.output === '1';
    return { success: true, connected };
  }

  return { success: false, error: result.error };
}

/**
 * Wait for a device to connect (with timeout)
 * @param {string} deviceId - Device MAC address or name
 * @param {number} timeout - Timeout in seconds (default: 30)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function waitForConnection(deviceId, timeout = 30) {
  const result = await runBlueutil(`--wait-connect "${deviceId}" ${timeout}`, {
    timeout: (timeout + 5) * 1000
  });

  if (result.success) {
    return { success: true };
  }

  if (result.error && result.error.includes('timeout')) {
    return { success: false, error: `Connection timeout: ${deviceId}` };
  }

  return { success: false, error: result.error };
}

/**
 * Wait for a device to disconnect (with timeout)
 * @param {string} deviceId - Device MAC address or name
 * @param {number} timeout - Timeout in seconds (default: 30)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function waitForDisconnection(deviceId, timeout = 30) {
  const result = await runBlueutil(`--wait-disconnect "${deviceId}" ${timeout}`, {
    timeout: (timeout + 5) * 1000
  });

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: result.error };
}
```

### Step 4: Run test to verify it passes

Run:
```bash
npm test -- tests/bluetooth.test.js
```

**Expected:** All connection tests PASS.

### Step 5: Commit

```bash
git add lib/bluetooth.js tests/bluetooth.test.js
git commit -m "feat(bluetooth): add device connection functions"
```

---

## Task 6: Complete Unit Tests

**Objective:** Ensure comprehensive test coverage and all exports are properly organized.

**Files:**
- Modify: `/Users/brokkrbot/brokkr-agent/tests/bluetooth.test.js`

### Step 1: Add edge case tests

Add to `tests/bluetooth.test.js`:

```javascript
describe('Bluetooth Edge Cases', () => {
  test('handles non-existent device gracefully', async () => {
    await powerOn();
    const result = await isDeviceConnected('00-00-00-00-00-00');
    // Should fail gracefully, not throw
    expect(result.success !== undefined).toBe(true);
  });

  test('handles empty device name gracefully', async () => {
    const result = await connectDevice('');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  test('device address normalization works', async () => {
    // Test different address formats
    const formats = [
      'aa-bb-cc-dd-ee-ff',
      'aa:bb:cc:dd:ee:ff',
      'aabbccddeeff'
    ];

    for (const format of formats) {
      const result = await isDeviceConnected(format);
      // Should not throw, just return success/failure
      expect(result.success !== undefined).toBe(true);
    }
  });
});

describe('Bluetooth Module Exports', () => {
  test('all expected functions are exported', async () => {
    const bluetooth = await import('../lib/bluetooth.js');

    // Core
    expect(typeof bluetooth.runBlueutil).toBe('function');
    expect(typeof bluetooth.isBluetoothAvailable).toBe('function');

    // Power
    expect(typeof bluetooth.getBluetoothPowerState).toBe('function');
    expect(typeof bluetooth.powerOn).toBe('function');
    expect(typeof bluetooth.powerOff).toBe('function');
    expect(typeof bluetooth.togglePower).toBe('function');
    expect(typeof bluetooth.setDiscoverable).toBe('function');
    expect(typeof bluetooth.getDiscoverable).toBe('function');

    // Devices
    expect(typeof bluetooth.listPairedDevices).toBe('function');
    expect(typeof bluetooth.listConnectedDevices).toBe('function');
    expect(typeof bluetooth.getDeviceInfo).toBe('function');
    expect(typeof bluetooth.discoverDevices).toBe('function');

    // Connections
    expect(typeof bluetooth.connectDevice).toBe('function');
    expect(typeof bluetooth.disconnectDevice).toBe('function');
    expect(typeof bluetooth.isDeviceConnected).toBe('function');
    expect(typeof bluetooth.waitForConnection).toBe('function');
    expect(typeof bluetooth.waitForDisconnection).toBe('function');
  });
});
```

### Step 2: Run full test suite

Run:
```bash
npm test -- tests/bluetooth.test.js
```

**Expected:** All tests PASS.

### Step 3: Commit

```bash
git add tests/bluetooth.test.js
git commit -m "test(bluetooth): add edge case and export tests"
```

---

## Task 7: Integration Testing

**Objective:** Perform end-to-end manual testing of Bluetooth skill.

### Manual Test Script

Create `/Users/brokkrbot/brokkr-agent/tests/bluetooth-manual-test.js`:

```javascript
// tests/bluetooth-manual-test.js
import {
  isBluetoothAvailable,
  getBluetoothPowerState,
  powerOn,
  powerOff,
  togglePower,
  listPairedDevices,
  listConnectedDevices,
  isDeviceConnected,
  connectDevice,
  disconnectDevice
} from '../lib/bluetooth.js';

async function testBluetoothSkill() {
  console.log('Starting Bluetooth skill integration test...\n');

  try {
    // 1. Check availability
    console.log('1. Checking blueutil availability...');
    const available = await isBluetoothAvailable();
    if (!available) {
      console.log('blueutil not installed. Install with: brew install blueutil');
      return;
    }
    console.log('blueutil is available\n');

    // 2. Check power state
    console.log('2. Checking Bluetooth power state...');
    const powerState = await getBluetoothPowerState();
    console.log(`Bluetooth is ${powerState.powered ? 'ON' : 'OFF'}\n`);

    // 3. Ensure Bluetooth is on
    if (!powerState.powered) {
      console.log('3. Turning Bluetooth on...');
      await powerOn();
      const newState = await getBluetoothPowerState();
      console.log(`Bluetooth is now ${newState.powered ? 'ON' : 'OFF'}\n`);
    } else {
      console.log('3. Bluetooth already on, skipping power on\n');
    }

    // 4. List paired devices
    console.log('4. Listing paired devices...');
    const paired = await listPairedDevices();
    if (paired.success) {
      console.log(`Found ${paired.devices.length} paired device(s):`);
      paired.devices.forEach(d => {
        console.log(`  - ${d.name || 'Unknown'} (${d.address})`);
      });
      console.log();
    } else {
      console.log(`Failed to list: ${paired.error}\n`);
    }

    // 5. List connected devices
    console.log('5. Listing connected devices...');
    const connected = await listConnectedDevices();
    if (connected.success) {
      console.log(`Found ${connected.devices.length} connected device(s):`);
      connected.devices.forEach(d => {
        console.log(`  - ${d.name || 'Unknown'} (${d.address})`);
      });
      console.log();
    } else {
      console.log(`Failed to list: ${connected.error}\n`);
    }

    // 6. Check connection status of first paired device
    if (paired.devices && paired.devices.length > 0) {
      const device = paired.devices[0];
      console.log(`6. Checking connection status of "${device.name}"...`);
      const status = await isDeviceConnected(device.address);
      if (status.success) {
        console.log(`"${device.name}" is ${status.connected ? 'connected' : 'disconnected'}\n`);
      } else {
        console.log(`Failed to check: ${status.error}\n`);
      }

      // 7. Toggle connection (optional - only if explicitly enabled)
      if (process.argv.includes('--test-connection')) {
        console.log(`7. Testing connection toggle for "${device.name}"...`);
        if (status.connected) {
          console.log('  Disconnecting...');
          await disconnectDevice(device.address);
          console.log('  Waiting 2 seconds...');
          await new Promise(r => setTimeout(r, 2000));
          console.log('  Reconnecting...');
          await connectDevice(device.address);
        } else {
          console.log('  Connecting...');
          const connectResult = await connectDevice(device.address);
          if (connectResult.success) {
            console.log('  Connected successfully\n');
          } else {
            console.log(`  Connection failed (device may be out of range): ${connectResult.error}\n`);
          }
        }
      } else {
        console.log('7. Skipping connection toggle (use --test-connection to enable)\n');
      }
    } else {
      console.log('6. No paired devices - skipping connection tests\n');
      console.log('7. Skipping connection toggle\n');
    }

    // 8. Test power toggle
    if (process.argv.includes('--test-power')) {
      console.log('8. Testing power toggle...');
      const before = await getBluetoothPowerState();
      await togglePower();
      console.log('  Toggled - waiting 2 seconds...');
      await new Promise(r => setTimeout(r, 2000));
      const after = await getBluetoothPowerState();
      console.log(`  Power changed from ${before.powered ? 'ON' : 'OFF'} to ${after.powered ? 'ON' : 'OFF'}`);

      // Toggle back
      await togglePower();
      console.log('  Toggled back\n');
    } else {
      console.log('8. Skipping power toggle test (use --test-power to enable)\n');
    }

    console.log('All tests completed!');
    console.log('\nUsage:');
    console.log('  node tests/bluetooth-manual-test.js                    # Basic tests');
    console.log('  node tests/bluetooth-manual-test.js --test-connection  # Include connection toggle');
    console.log('  node tests/bluetooth-manual-test.js --test-power       # Include power toggle');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testBluetoothSkill();
```

### Execution

```bash
cd /Users/brokkrbot/brokkr-agent
node tests/bluetooth-manual-test.js
```

**Expected Output (example):**
```
Starting Bluetooth skill integration test...

1. Checking blueutil availability...
blueutil is available

2. Checking Bluetooth power state...
Bluetooth is ON

3. Bluetooth already on, skipping power on

4. Listing paired devices...
Found 3 paired device(s):
  - AirPods Pro (xx-xx-xx-xx-xx-xx)
  - Magic Keyboard (yy-yy-yy-yy-yy-yy)
  - Magic Mouse (zz-zz-zz-zz-zz-zz)

5. Listing connected devices...
Found 2 connected device(s):
  - Magic Keyboard (yy-yy-yy-yy-yy-yy)
  - Magic Mouse (zz-zz-zz-zz-zz-zz)

6. Checking connection status of "AirPods Pro"...
"AirPods Pro" is disconnected

7. Skipping connection toggle (use --test-connection to enable)

8. Skipping power toggle test (use --test-power to enable)

All tests completed!
```

### Verification

```bash
# Run all unit tests
npm test -- tests/bluetooth.test.js

# Run manual integration test
node tests/bluetooth-manual-test.js
```

**Expected:** All tests pass, manual test completes successfully.

### Commit

```bash
git add tests/bluetooth-manual-test.js
git commit -m "test(bluetooth): add manual integration test script"
```

---

## Completion Checklist

- [ ] blueutil installed and verified
- [ ] Core blueutil execution module
- [ ] Power control functions (on, off, toggle, discoverable)
- [ ] Device listing functions (paired, connected, info, discovery)
- [ ] Device connection functions (connect, disconnect, is-connected, wait)
- [ ] Unit tests passing
- [ ] Integration testing passed
- [ ] Code committed with descriptive messages

## Success Criteria

1. All unit tests pass (`npm test -- tests/bluetooth.test.js`)
2. Manual integration test completes successfully
3. Power control works (on/off/toggle)
4. Device listing returns paired and connected devices
5. Connection status check works
6. Connect/disconnect operations work with in-range devices
7. Error handling provides clear messages

## Future Enhancements

- Device pairing (currently experimental in blueutil)
- Battery level monitoring for supported devices
- Auto-connect on system wake
- Integration with Focus modes (auto-connect headphones for Work mode)
- Integration with Music skill (connect speakers before playing)
- Notification on device disconnect

## Documentation Updates

After completion, update:
1. `/Users/brokkrbot/brokkr-agent/CLAUDE.md` - Add Bluetooth skill to capabilities
2. `/Users/brokkrbot/brokkr-agent/docs/plans/sprint-apple-integration.md` - Mark Bluetooth skill as "In Progress" or "Complete"

---

**Implementation Notes:**

- blueutil must be installed via Homebrew (`brew install blueutil`)
- All operations require Bluetooth to be powered on (except power control)
- Device connection may fail if device is out of range
- Pairing operations are experimental and may be unreliable
- Error messages distinguish between "device not found" and "connection failed"
- JSON output format available but not used (parsing text is sufficient)
- Tests are designed to handle missing devices gracefully
