# Docker image for isolated Claude sessions
FROM ubuntu:22.04

# Avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install required packages (without nodejs/npm first to avoid conflicts)
RUN apt-get update && apt-get install -y \
    curl \
    git \
    python3 \
    python3-pip \
    build-essential \
    vim \
    nano \
    htop \
    procps \
    sudo \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x (clean install without conflicts)
RUN mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create a non-root user for running sessions
RUN useradd -m -s /bin/bash claude && \
    echo "claude ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Create workspace directory
RUN mkdir -p /workspace && chown claude:claude /workspace

# Create .claude directory with proper permissions for Claude CLI
RUN mkdir -p /home/claude/.claude && chown -R claude:claude /home/claude/.claude

# Set working directory
WORKDIR /workspace

# Switch to non-root user
USER claude

# Set environment variables
ENV TERM=xterm-256color
ENV HOME=/home/claude

# Default command - keep container running
CMD ["tail", "-f", "/dev/null"]
