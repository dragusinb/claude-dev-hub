#!/bin/bash

# Claude Dev Hub - Server Setup Script
# Run this on your Contabo server to set up the environment

set -e

echo "=== Claude Dev Hub Server Setup ==="
echo ""

# Update system
echo "Updating system packages..."
apt update && apt upgrade -y

# Install Node.js 20.x
echo "Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install build essentials (needed for node-pty)
echo "Installing build essentials..."
apt install -y build-essential python3

# Install Git
echo "Installing Git..."
apt install -y git

# Install PM2
echo "Installing PM2..."
npm install -g pm2

# Install Claude Code CLI
echo "Installing Claude Code CLI..."
npm install -g @anthropic-ai/claude-code

# Install Nginx
echo "Installing Nginx..."
apt install -y nginx

# Create app directory
echo "Creating app directory..."
mkdir -p /opt/claude-dev-hub
mkdir -p /opt/claude-dev-hub/projects
mkdir -p /opt/claude-dev-hub/data

# Clone the repository (will be set up later via git)
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Clone your repository: git clone <your-repo-url> /opt/claude-dev-hub/app"
echo "2. cd /opt/claude-dev-hub/app"
echo "3. npm install"
echo "4. npm run build"
echo "5. Configure environment: cp .env.example .env && nano .env"
echo "6. Start with PM2: pm2 start ecosystem.config.js"
echo "7. Configure Nginx: cp nginx.conf /etc/nginx/sites-available/claude-dev-hub"
echo "8. ln -s /etc/nginx/sites-available/claude-dev-hub /etc/nginx/sites-enabled/"
echo "9. nginx -t && systemctl restart nginx"
echo ""
