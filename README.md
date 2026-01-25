# Claude Dev Hub

A web-based development environment with Claude AI integration for managing multiple projects.

## Features

- Load projects from Git repositories
- Interactive Claude terminal for each project
- File browser for project files
- Git operations (pull, status, push)
- SSH deployment to remote servers
- Multi-project management

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start development servers
npm run dev
```

Frontend: http://localhost:3000
Backend: http://localhost:3001

### Server Deployment

1. SSH into your server
2. Run the setup script:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/main/scripts/setup-server.sh | bash
   ```

3. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_REPO.git /opt/claude-dev-hub/app
   cd /opt/claude-dev-hub/app
   ```

4. Install and build:
   ```bash
   npm install
   npm run build
   ```

5. Configure environment:
   ```bash
   cp .env.example .env
   nano .env
   ```

6. Start with PM2:
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

7. Configure Nginx:
   ```bash
   cp nginx.conf /etc/nginx/sites-available/claude-dev-hub
   ln -s /etc/nginx/sites-available/claude-dev-hub /etc/nginx/sites-enabled/
   rm /etc/nginx/sites-enabled/default
   nginx -t && systemctl restart nginx
   ```

## Architecture

```
claude-dev-hub/
├── backend/          # Express.js API server
│   └── src/
│       ├── routes/   # API endpoints
│       ├── services/ # Business logic
│       └── models/   # Database operations
├── frontend/         # React web app
│   └── src/
│       ├── components/
│       ├── pages/
│       └── services/
└── scripts/          # Deployment scripts
```

## Requirements

- Node.js 20+
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)
- Git
