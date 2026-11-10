// =====================================
// PM2: los tres procesos de Nodex Tutelas en el servidor de producción (Docs/PRODUCCION.md)
//   pm2 start ecosystem.config.cjs && pm2 save
// La API y el frontend escuchan solo en 127.0.0.1: Nginx los publica con HTTPS
// =====================================
module.exports = {
  apps: [
    {
      name: 'tutelas-api',
      cwd: './backend',
      script: 'dist/index.js',
      env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: 4100 },
      max_memory_restart: '700M',
      time: true
    },
    {
      // Uno solo: dos lecturas del buzón a la vez repetirían el mismo delta
      name: 'tutelas-worker',
      cwd: './backend',
      script: 'dist/worker.js',
      env: { NODE_ENV: 'production' },
      instances: 1,
      max_memory_restart: '500M',
      time: true
    },
    {
      name: 'tutelas-web',
      cwd: './frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3100 -H 127.0.0.1',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '700M',
      time: true
    }
  ]
}
