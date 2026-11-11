module.exports = {
  apps: [
    {
      name: "ig-server",
      cwd: "./apps/server",
      script: "dist/index.js",   // run compiled JS
      // remove interpreter override; default Node is fine
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 4000
      }
    }
  ]
}
