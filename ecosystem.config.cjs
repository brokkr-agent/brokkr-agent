// ecosystem.config.cjs
// PM2 configuration for Brokkr bot services

module.exports = {
  apps: [
    {
      name: 'whatsapp-bot',
      script: 'whatsapp-bot.js',
      cwd: '/Users/brokkrbot/brokkr-agent',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: '/tmp/whatsapp-bot.log',
      out_file: '/tmp/whatsapp-bot.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'webhook-server',
      script: 'lib/webhook-server.js',
      cwd: '/Users/brokkrbot/brokkr-agent',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      error_file: '/tmp/webhook-server.log',
      out_file: '/tmp/webhook-server.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'notification-monitor',
      script: 'notification-monitor.js',
      cwd: '/Users/brokkrbot/brokkr-agent',
      args: '--live',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      error_file: '/tmp/notification-monitor.log',
      out_file: '/tmp/notification-monitor.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
