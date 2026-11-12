import { buildServer } from './index'
const { app } = await buildServer()
try {
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.RENDER === 'true' ? '0.0.0.0' : '127.0.0.1' })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
