// =====================================
// PM2: los tres procesos de Nodex Tutelas (Docs/PRODUCCION.md §0.2)
// Va en el mismo servidor que Nodex, con el PM2 de root:
//   pm2 start /home/desarrolloti/tutelas/ecosystem.config.cjs && pm2 save
// Puertos 9100 (API) y 9101 (web), fuera de los de Nodex (9000–9003) y del Monitor (9010). Escuchan
// solo en 127.0.0.1: Nginx los publica con HTTPS. Las rutas salen de la ubicación de este archivo, así
// que da igual desde qué carpeta se ejecute pm2
// =====================================
const path = require('path')
const raiz = __dirname

module.exports = {
  apps: [
    {
      name: 'tutelas-api',
      cwd: path.join(raiz, 'backend'),
      script: 'dist/index.js',
      env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: 9100 },
      max_memory_restart: '700M',
      time: true
    },
    {
      // Uno solo: dos lecturas del buzón a la vez repetirían el mismo delta
      name: 'tutelas-worker',
      cwd: path.join(raiz, 'backend'),
      script: 'dist/worker.js',
      env: { NODE_ENV: 'production' },
      // fork explícito: con "instances" solo, PM2 lo arranca en modo cluster
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      time: true
    },
    {
      name: 'tutelas-web',
      cwd: path.join(raiz, 'frontend'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 9101 -H 127.0.0.1',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '700M',
      time: true
    }
  ]
}
