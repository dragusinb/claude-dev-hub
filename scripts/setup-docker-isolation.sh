#!/bin/bash

# Setup Docker-based session isolation for Claude Dev Hub
# Run this script on the server as root

set -e

echo "=== Setting up Docker-based session isolation ==="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

echo "Docker version: $(docker --version)"

# Build the claude-session image
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${SCRIPT_DIR}/.."

# Check if we're in the right directory
if [ ! -f "${APP_DIR}/docker/claude-session/Dockerfile" ]; then
    APP_DIR="/opt/claude-dev-hub/app"
fi

echo "Building claude-session Docker image..."
docker build -t claude-session:latest "${APP_DIR}/docker/claude-session"

# Create a .env file if it doesn't exist
ENV_FILE="${APP_DIR}/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env file..."
    cat > "$ENV_FILE" << EOF
USE_DOCKER=true
DOCKER_IMAGE=claude-session:latest
CLAUDE_CREDENTIALS_PATH=/root/.claude
JWT_SECRET=$(openssl rand -base64 32)
EOF
else
    # Add Docker settings if not present
    if ! grep -q "USE_DOCKER" "$ENV_FILE"; then
        echo "" >> "$ENV_FILE"
        echo "USE_DOCKER=true" >> "$ENV_FILE"
        echo "DOCKER_IMAGE=claude-session:latest" >> "$ENV_FILE"
        echo "CLAUDE_CREDENTIALS_PATH=/root/.claude" >> "$ENV_FILE"
    fi
fi

echo ""
echo "=== Docker isolation setup complete ==="
echo ""
echo "The claude-session image has been built."
echo "Each user's Claude session will now run in an isolated container."
echo ""
echo "Container features:"
echo "  - Process isolation (users can't see/kill other users' processes)"
echo "  - Resource limits (2GB RAM, 2 CPUs, 256 max processes)"
echo "  - Filesystem isolation (only project directory is mounted)"
echo "  - Automatic cleanup on disconnect"
echo ""
echo "Restart the application to apply changes:"
echo "  pm2 restart claude-dev-hub"
echo ""
