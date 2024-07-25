# @platformatic/http-metrics

The `http-metrics` package provides a simple way to collect prometheus metrics for your Node.js HTTP server. It can be used with any Node.js HTTP server framework, such as Express, Koa, or Fastify.

## Installation

```bash
npm install @platformatic/http-metrics
```

## Usage

```javascript
const { createServer } = require('node:http')
const { Registry } = require('prom-client')
const httpMetrics = require('./index')

const registry = new Registry()
httpMetrics(registry)

const server = createServer(async (req, res) => {
  if (req.url === '/metrics') {
    const metrics = await registry.metrics()

    res.setHeader('Content-Type', registry.contentType)
    res.end(metrics)
    return
  }
  res.end('Hello World\n')
})

server.listen(0, () => {
  const { port } = server.address()
  console.log(`Server listening on http://127.0.0.1:${port}`)
})
```

## API

#### httpMetrics(registry, [options])

- __`registry`__ `<Registry>` The prom-client registry to use for collecting metrics.
- __`options`__ `<object>` Options for configuring the metrics collection.
  - __`customLabels`__ `<array>` A list of custom labels names to add to the metrics.
  - __`getCustomLabels(req, res, server)`__ `<function>` A function that returns an object of custom labels to add to the metrics. The function receives the request object as a first argument and a response object as a second argument.
  - __`ignoreMethods`__ `<array>` A list of HTTP methods to ignore when collecting metrics. Default: `['OPTIONS', 'HEAD', 'CONNECT', 'TRACE']`.
  - __`ignoreUrls`__ `<array>` A list of URLs strings and regexps to ignore when collecting metrics. Default: `[]`.
  - __`ignore(req, res, server)`__ `<function>` A function that returns a boolean indicating whether to ignore the request when collecting metrics. The function receives the request object as a first argument and a response object as a second argument.
  - __`ports`__ `<array>` By default the http metrics are collected for all defined http servers. If you want to collect metrics only for specific http servers, you can provide an array of ports to collect metrics for.
  - __`histogram`__ `<object>` prom-client [histogram options](https://github.com/siimon/prom-client?tab=readme-ov-file#histogram). Use it if you want to customize the histogram.
  - __`summary`__ `<object>` prom-client [summary options](https://github.com/siimon/prom-client?tab=readme-ov-file#summary). Use it if you want to customize the summary.

## License

MIT

