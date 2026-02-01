#!/usr/bin/env node
// webhook-server.js - Standalone webhook server with dry-run support

import { app, startWebhookServer, setDryRunMode, setDebugMode } from './lib/webhook-server.js';

const DRY_RUN = process.argv.includes('--dry-run');
const DEBUG = process.argv.includes('--debug');
const PORT = process.env.WEBHOOK_PORT || 3000;

// Configure modes
if (DRY_RUN) {
  setDryRunMode(true);
}

if (DEBUG) {
  setDebugMode(true);
}

// Startup message
console.log('========================================');
console.log('  Brokkr Webhook Server');
console.log('========================================');
console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
console.log(`Debug: ${DEBUG ? 'ON' : 'OFF'}`);
console.log(`Port: ${PORT}`);
console.log('----------------------------------------');

// Start server
startWebhookServer()
  .then((server) => {
    console.log('');
    console.log('Endpoints:');
    console.log(`  GET  http://localhost:${PORT}/health`);
    console.log(`  POST http://localhost:${PORT}/webhook`);
    console.log(`  POST http://localhost:${PORT}/webhook/:sessionCode`);
    console.log(`  GET  http://localhost:${PORT}/webhook/:sessionCode`);
    console.log('');
    console.log('Press Ctrl+C to stop');
    console.log('========================================');
  })
  .catch((err) => {
    console.error('Failed to start webhook server:', err.message);
    process.exit(1);
  });

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down...');
  process.exit(0);
});
