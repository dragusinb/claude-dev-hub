#!/bin/bash

# Claude Dev Hub - Deployment Script
# Run this on the server to deploy updates

set -e

APP_DIR="/opt/claude-dev-hub/app"
cd "$APP_DIR"

echo "=== Deploying Claude Dev Hub ==="

# Pull latest changes
echo "Pulling latest changes..."
git pull origin main

# Install dependencies
echo "Installing dependencies..."
npm install

# Build frontend
echo "Building frontend..."
npm run build

# Restart PM2
echo "Restarting application..."
pm2 restart claude-dev-hub || pm2 start ecosystem.config.js

echo ""
echo "=== Deployment Complete ==="
pm2 status
