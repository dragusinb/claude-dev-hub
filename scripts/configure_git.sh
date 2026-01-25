#!/bin/bash
# Configure Git credentials on the server
# Usage: Run this on the server with the GitHub token

GITHUB_TOKEN="${1:-}"
GITHUB_USER="${2:-dragusinb}"

if [ -z "$GITHUB_TOKEN" ]; then
    echo "Usage: ./configure_git.sh <github_token> [github_user]"
    exit 1
fi

echo "Configuring Git credentials..."

# Set global git config
git config --global user.name "$GITHUB_USER"
git config --global user.email "$GITHUB_USER@users.noreply.github.com"

# Configure credential helper to store credentials
git config --global credential.helper store

# Store the credentials
echo "https://$GITHUB_USER:$GITHUB_TOKEN@github.com" > ~/.git-credentials
chmod 600 ~/.git-credentials

# Also configure for HTTPS URLs to use the token
git config --global url."https://$GITHUB_USER:$GITHUB_TOKEN@github.com/".insteadOf "https://github.com/"

echo "Git credentials configured for user: $GITHUB_USER"
echo "Testing connection..."
curl -s -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user | grep -E '"login"|"name"' | head -2
