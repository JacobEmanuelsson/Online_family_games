import { buildServer } from './index'
const remoteUrl = process.env.LEADERBOARD_DATABASE_URL
if (process.env.RENDER === 'true' && (!remoteUrl || !/^(libsql|https):\/\//.test(remoteUrl) || !process.env.LEADERBOARD_DATABASE_TOKEN)) {
  throw new Error('Configure a persistent leaderboard database URL and token in Render.')
}
const { app } = await buildServer({
  url: remoteUrl ?? 'file:yatzy-results.db',
  authToken: process.env.LEADERBOARD_DATABASE_TOKEN,
})
try {
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.RENDER === 'true' ? '0.0.0.0' : '127.0.0.1' })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
