# Claude Dev Hub - Task List

This is a persistent task list for tracking ongoing work and improvements.

## Completed

- [x] SSL Certificate Monitor - Track SSL expiry dates with alerts
- [x] Uptime History - Server uptime tracking with timeline visualization
- [x] Backup Scheduler - Cron-based backup jobs for MySQL, PostgreSQL, files
- [x] Security Audit - Security scoring with findings and recommendations
- [x] Security Quick Actions - "Fix Now" buttons to remediate issues
- [x] Scheduled Security Audits - Run every 24 hours automatically
- [x] Port blocking actions - Block risky ports via UFW
- [x] Detect existing solutions - Check if fail2ban/firewall already active
- [x] Fix SMTP sender address issue
- [x] Fix credential decryption logging (silent skip)
- [x] Fix DATA_DIR/VAULT_KEY lazy loading (bootstrap.js)
- [x] Prevent duplicate SSL domains (409 Conflict on duplicate domain:port)
- [x] SSL domain discovery - Scan servers for nginx/apache/letsencrypt domains
- [x] SSL discover Add All button + visual feedback (green checkmark on added)
- [x] Monitoring history - Show all server graphs at once (removed dropdown)
- [x] Security scoring improvements:
  - Score caps per category (ports: 30, firewall: 15, ssh: 25, updates: 25)
  - Recognize mail server ports (993, 995, 465, 587) as legitimate
  - Auto-detect mail servers and don't penalize mail ports
  - Minimum score of 10 if firewall is active
- [x] Disable security email alerts (log only)
- [x] Fix SSL collector log showing "undefined days" on errors
- [x] Add 'low' severity styling in Security page
- [x] Testing Infrastructure - Vitest setup with comprehensive test suite:
  - Unit tests: security scoring, cron parser, backup scheduler, SSL collector
  - Integration tests: SSL API, Security API, Servers API, Backups API
  - Test helpers: mock data generators, mock request/response utilities
- [x] Security Fix Now improvements:
  - Auto-run security audit after successful action to update findings
  - Better visual feedback showing audit progress after action
  - Fixed localhost-only port detection (ports restricted to 127.0.0.1 no longer flagged as exposed)

## In Progress

- [ ] None currently

## Recently Completed

- [x] Network Traffic Monitoring - Track download/upload rates with historical graphs
- [x] Contabo Integration - View VPS/VDS instances, specs, pricing, start/stop/restart
- [x] Contabo-Server Linking - Match Contabo instances to Servers by IP address
- [x] Local Server Support - Execute monitoring/security/exec commands locally without SSH
- [x] Port Management - Block, restrict to localhost, or restrict to specific IP

## Backlog

### High Priority
- [ ] Improve security for credentials storage:
  - Move all API keys/passwords to Vault (Contabo, SMTP, etc.)
  - Ensure all sensitive data is encrypted at rest
  - Add credential rotation support
- [x] Claude session launch improvements (partially addressed):
  - Improved theme selection pattern detection (case-insensitive, multiple patterns)
  - Added handling for trust project prompts
  - Added handling for y/n confirmation prompts
  - Added debouncing to prevent multiple auto-responses
  - Added better logging for debugging
  - NOTE: Needs testing on production server

### Medium Priority
- [x] Add "Restrict port to IP" action (allow specific IP only)
  - Port management actions now show options: Block, Localhost, or Specific IP
  - Non-standard ports (like 8000) now have Fix Now button
- [ ] Add SSH key-only authentication action
- [ ] Add automatic backup verification
- [x] Add disk usage alerts (already implemented)
- [x] Add network traffic monitoring
  - Added network_rx_bytes, network_tx_bytes, network_rx_rate, network_tx_rate columns to server_health_history
  - Health collector now captures total bytes from /proc/net/dev and calculates rate
  - Monitoring page shows network traffic chart (KB/s) with download (RX) and upload (TX) lines

### Low Priority
- [ ] Add dark/light theme toggle for UI
- [ ] Add export functionality for audit reports
- [ ] Add multi-user support with roles
- [ ] Add API rate limiting
- [ ] Code splitting for smaller bundle size

### Ideas for Future
- [ ] Server Groups/Tags - Organize servers by project or environment
- [ ] Scheduled Tasks - Run commands on servers via cron-like schedules
- [ ] Cost Dashboard - Track monthly costs across providers, show trends
- [ ] Deployment Pipelines - Simple deploy workflows (git pull, build, restart)
- [ ] Log Aggregation - View logs from multiple servers in one place
- [ ] Docker Container Monitoring - Track containers running on servers
- [ ] Two-Factor Authentication - Add 2FA for login security
- [ ] Audit Log - Track who did what and when
- [ ] Mobile App - React Native companion app

## Configuration Notes

### Server: 194.163.144.206
- PM2 process: `claude-dev-hub`
- Working directory: `/opt/claude-dev-hub/app/backend`
- Database: `/opt/claude-dev-hub/data/claude-dev-hub.db`
- Environment: `/opt/claude-dev-hub/app/backend/.env`

### Environment Variables
```
USE_DOCKER=false
SMTP_HOST=box.coffeepot.ro
SMTP_PORT=465
SMTP_USER=admin@coffeepot.ro
SMTP_PASS=c0ffee123
SMTP_FROM=admin@coffeepot.ro
VAULT_KEY=claude-dev-hub-vault-secret-2025
DATA_DIR=/opt/claude-dev-hub/data
```

### Scheduled Services
- Health Collector: Every 5 minutes
- SSL Collector: Every 6 hours
- Backup Scheduler: Checks every minute
- Security Auditor: Every 24 hours (first run 5 min after start)

## Server Credentials
See `server-credentials.md` (gitignored, local only)
