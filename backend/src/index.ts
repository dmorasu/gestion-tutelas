import colors from 'colors'
import server, { conectarBase } from './server'

const port = Number(process.env.PORT) || 4100
// HOST=127.0.0.1 cuando hay un Nginx delante (el puerto no queda expuesto a internet)
const host = process.env.HOST || '0.0.0.0'

conectarBase().then(() => {
  server.listen(port, host, () => console.log(colors.cyan.bold(`API de tutelas en el puerto ${port}`)))
})
