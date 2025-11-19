'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { request } = require('undici')
const { Registry } = require('@platformatic/prom-client')
const httpMetrics = require('../index.js')
const { createHttpServer } = require('./helper.js')

test('should get logs only from one http server', async (t) => {
  const serverUrl1 = createHttpServer(t)
  const serverUrl2 = createHttpServer(t)

  const registry = new Registry()
  httpMetrics(registry, {
    ports: [new URL(serverUrl2).port],
  })

  await Promise.all([
    request(serverUrl1 + '/1s', { method: 'GET' }),
    request(serverUrl2 + '/1s', { method: 'POST' }),
  ])

  const metrics = await registry.getMetricsAsJSON()
  assert.strictEqual(metrics.length, 2)

  const histogramMetric = metrics.find(
    (metric) => metric.name === 'http_request_duration_seconds'
  )

  const histogramValues = histogramMetric.values

  {
    const ignoredMetrics = histogramValues.filter(
      ({ labels }) => labels.method === 'GET'
    )
    assert.strictEqual(ignoredMetrics.length, 0)
  }

  {
    const notIgnoredMetrics = histogramValues.filter(
      ({ labels }) => labels.method === 'POST'
    )
    assert.strictEqual(notIgnoredMetrics.length, 14)

    for (const { labels } of notIgnoredMetrics) {
      assert.strictEqual(labels.method, 'POST')
      assert.strictEqual(labels.status_code, 200)
    }
  }
})
