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

## In Progress

- [ ] None currently

## Backlog

### High Priority
- [ ] Claude session launch issue - Gets stuck after theme selection (investigate Docker mount)
- [ ] Add "Restrict port to IP" action (allow specific IP only)

### Medium Priority
- [ ] Add SSH key-only authentication action
- [ ] Add automatic backup verification
- [ ] Add disk usage alerts
- [ ] Add network traffic monitoring
- [ ] Improve security score calculation (weighted categories)

### Low Priority
- [ ] Add dark/light theme toggle for UI
- [ ] Add export functionality for audit reports
- [ ] Add multi-user support with roles
- [ ] Add API rate limiting
- [ ] Code splitting for smaller bundle size

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
