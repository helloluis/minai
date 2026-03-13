module.exports = {
  apps: [
    {
      name: 'minai-api',
      cwd: './apps/api',
      script: 'dist/index.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
    {
      name: 'minai-web',
      cwd: './apps/web',
      script: 'node_modules/.bin/next',
      args: 'start -p 3007',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
  ],
};
