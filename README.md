# whatsapp-claude

connect whatsapp to claude code. send a message to yourself, claude code runs the task, sends the result back.

```
whatsapp → whatsapp-bot.js → claude code cli → response → whatsapp
```

## how it works

1. you message yourself on whatsapp: `/claude list files in this project`
2. the bot picks it up (polls every 2 seconds)
3. spawns `claude -p "list files in this project" --dangerously-skip-permissions`
4. claude code runs the task
5. result gets sent back to your whatsapp

## setup

### prerequisites

- [node.js](https://nodejs.org/) (v18+)
- [claude code cli](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

### install

```bash
git clone https://github.com/Ejae-dev/whatsapp-claude.git
cd whatsapp-claude
npm install
```

### run

```bash
node whatsapp-bot.js
```

1. scan the qr code with whatsapp (first time only)
2. send `/claude hello` to yourself
3. wait for the response

## usage

send any message starting with `/claude` to your own chat:

```
/claude what time is it
/claude summarize this project
/claude create a python script that prints hello world
```

claude code runs in your project directory with full access to your tools and files.

## run on a schedule (cron)

you can set up cron jobs to have claude code run tasks automatically on a schedule. add these to your crontab (`crontab -e`):

```bash
# run a daily summary every morning at 9am
0 9 * * * cd /path/to/your/project && claude -p "give me a summary of yesterday's git commits" --dangerously-skip-permissions >> /tmp/claude-cron.log 2>&1

# check for security updates every monday at 8am
0 8 * * 1 cd /path/to/your/project && claude -p "check for outdated npm packages and list any with security vulnerabilities" --dangerously-skip-permissions >> /tmp/claude-cron.log 2>&1

# run tests and report every night at midnight
0 0 * * * cd /path/to/your/project && claude -p "run the test suite and summarize any failures" --dangerously-skip-permissions >> /tmp/claude-cron.log 2>&1
```

you can also combine cron with whatsapp - have cron trigger a task and pipe the result to whatsapp using the bot.

## config

- `WORKSPACE` in `whatsapp-bot.js` - defaults to `process.cwd()`, change to set claude code's working directory
- `--dangerously-skip-permissions` - removes permission prompts so claude code runs autonomously. remove this flag if you want manual approval for each action
- `POLL_INTERVAL` - how often to check for new messages (default: 2000ms)

## how it works (technical)

- uses [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) to connect to whatsapp
- polls your "message yourself" chat every 2 seconds
- spawns claude code as a child process with `-p` (prompt mode)
- captures stdout, strips ansi codes, chunks to 4000 chars (whatsapp limit)
- sends result back with retry logic (3 attempts, 3s between)

## notes

- whatsapp-web.js is not an official api - it can break when whatsapp updates their web client
- first run opens a chromium browser for whatsapp web authentication
- session persists in `.wwebjs_auth/` so you only scan qr once
- claude code needs to be installed and authenticated separately (`claude login`)

## license

mit
