# tele-snipe-sui

[![test](https://github.com/padit8035-glitch/tele-snipe-sui/actions/workflows/test.yml/badge.svg)](https://github.com/padit8035-glitch/tele-snipe-sui/actions/workflows/test.yml) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Alert-only Telegram bot that watches X accounts and project websites for new token contract addresses (SUI, EVM, SOL) and pushes them to a private chat, grouped per project. It never places trades and never holds keys — it only tells you where a contract address showed up.

## Architecture

```
X accounts ──poll──┐
                   ├──> chainFilter (SUI/EVM/SOL CA) ──> dedup ──> Telegram alert
websites  ──poll──┘
```

| File | Role |
| --- | --- |
| `src/index.ts` | Entry point; two poll loops (X, sites), dedup, alert dispatch |
| `src/bot.ts` | grammy commands, owner-only, project/source management |
| `src/xMonitor.ts` | X account polling, tweet id + post age |
| `src/siteMonitor.ts` | Website polling, content-hash change detection |
| `src/chainFilter.ts` | Extracts + classifies contract addresses per chain |
| `src/caFilter.ts` | Raw coin-type / address extraction helpers |
| `src/db.ts` | SQLite schema, detection dedup, buy-history log |
| `src/config.ts` | SQLite-backed runtime settings (intervals, projects, sources) |
| `src/format.ts` | Alert message formatting |

Config and state live in SQLite (`DB_PATH`), so restarts do not re-alert on the same detection.

## Prerequisites

- Node.js 24
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your own Telegram chat id (get it from [@userinfobot](https://t.me/userinfobot))

## Setup

```bash
npm install
cp .env.example .env
chmod 600 .env
nano .env          # fill TELEGRAM_BOT_TOKEN and OWNER_CHAT_ID
```

| Variable | Required | Notes |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | yes | From @BotFather |
| `OWNER_CHAT_ID` | yes | Only this chat can run commands |
| `SUI_RPC_URL` | no | Defaults to the public Sui mainnet fullnode |
| `PAPER_MODE` | no | `true` by default; alert-only in both modes |
| `DB_PATH` | no | Defaults to `./snipe.db` |

## Run

```bash
npm run dev     # tsx watch-free run from source
npm run build   # compile to dist/
npm start       # run compiled output
```

Bot commands (private chat, owner only):

```
/addproject <name>              create a project group
/attach <project> <@handle|url>  attach an X account or a website
/detach <project> <@handle|url>  remove a source
/rmproject <name>               delete a project
/list                           show projects and their sources
/set_interval <sec>             X poll interval
/set_site_interval <sec>        website poll interval
/start | /stop                  kill switch for monitoring
/status                         enabled state, intervals, last checks
```

### systemd

```ini
[Unit]
Description=tele-snipe-sui
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/tele-snipe-sui
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now tele-snipe-sui
journalctl -u tele-snipe-sui -f
```

## Testing

```bash
npx vitest run       # unit + integration tests
npx tsc --noEmit     # typecheck
```

## Disclaimer

Alert-only and paper mode: this project does not execute trades, does not manage funds, and does not require a wallet key. Detections come from public posts and pages, are unverified, and can be wrong, delayed, or spoofed — never treat an alert as an investment signal. No credentials, keys, or databases are committed to this repository; `.env`, `*.db`, and `bot.log` are git-ignored.
