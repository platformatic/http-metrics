'use strict'

const { createServer } = require('node:http')
const { setTimeout: sleep } = require('node:timers/promises')

function createHttpServer (t) {
  const server = createServer(
    async (req, res) => {
      if (req.url === '/500ms') {
        await sleep(500)
      }
      if (req.url === '/1s') {
        await sleep(1000)
      }
      if (req.url === '/2s') {
        await sleep(2000)
      }
      if (req.url === '/10s') {
        await sleep(10000)
      }
      res.end('Hello World\n')
    }
  )

  server.listen(0)
  t.after(() => server.close())

  const url = `http://localhost:${server.address().port}`
  return url
}

function calculateEpsilon (value, expectedValue) {
  return Math.abs(value - expectedValue) / expectedValue
}

module.exports = {
  createHttpServer,
  calculateEpsilon,
}
