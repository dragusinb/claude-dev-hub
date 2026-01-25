module.exports = {
  apps: [{
    name: 'claude-dev-hub',
    script: 'backend/src/index.js',
    cwd: '/opt/claude-dev-hub/app',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      PROJECTS_DIR: '/opt/claude-dev-hub/projects',
      DATA_DIR: '/opt/claude-dev-hub/data'
    }
  }]
};
