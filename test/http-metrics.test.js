'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { request } = require('undici')
const { Registry } = require('prom-client')
const httpMetrics = require('../index.js')
const { createHttpServer, calculateEpsilon } = require('./helper.js')

test('should calculate the http request duration histogram', async (t) => {
  const serverUrl = createHttpServer(t)

  const registry = new Registry()
  httpMetrics(registry)

  await Promise.all([
    request(serverUrl + '/500ms'),
    request(serverUrl + '/1s'),
    request(serverUrl + '/2s'),
  ])

  const expectedMeasurements = [0.501, 1.001, 2.001]
  const expectedEpsilon = 0.05

  const metrics = await registry.getMetricsAsJSON()
  assert.strictEqual(metrics.length, 2)

  const histogramMetric = metrics.find(
    (metric) => metric.name === 'http_request_duration_seconds'
  )
  assert.strictEqual(histogramMetric.name, 'http_request_duration_seconds')
  assert.strictEqual(histogramMetric.type, 'histogram')
  assert.strictEqual(histogramMetric.help, 'request duration in seconds histogram for all requests')
  assert.strictEqual(histogramMetric.aggregator, 'sum')

  const histogramValues = histogramMetric.values

  {
    const histogramCount = histogramValues.find(
      ({ metricName }) => metricName === 'http_request_duration_seconds_count'
    )
    assert.strictEqual(histogramCount.value, expectedMeasurements.length)
  }

  {
    const histogramSum = histogramValues.find(
      ({ metricName }) => metricName === 'http_request_duration_seconds_sum'
    )
    const value = histogramSum.value
    const expectedValue = expectedMeasurements.reduce((a, b) => a + b, 0)
    const epsilon = calculateEpsilon(value, expectedValue)
    assert.ok(
      epsilon < expectedEpsilon,
      `expected ${expectedValue}, got ${value}, epsilon ${epsilon}`
    )
  }

  for (const { metricName, labels, value } of histogramValues) {
    assert.strictEqual(labels.method, 'GET')
    assert.strictEqual(labels.status_code, 200)

    if (metricName !== 'http_request_duration_seconds_bucket') continue

    const expectedBucketMeasurements = expectedMeasurements.filter((m) => {
      let le = labels.le
      if (le === '+Inf') le = Infinity
      if (le === '-Inf') le = -Infinity
      return m < le
    })

    const expectedValue = expectedBucketMeasurements.length
    assert.strictEqual(
      value, expectedValue,
      `le ${labels.le}: expected ${JSON.stringify(expectedBucketMeasurements)}`
    )
  }

  const summaryMetric = metrics.find(
    (metric) => metric.name === 'http_request_summary_seconds'
  )
  assert.strictEqual(summaryMetric.name, 'http_request_summary_seconds')
  assert.strictEqual(summaryMetric.type, 'summary')
  assert.strictEqual(summaryMetric.help, 'request duration in seconds summary for all requests')
  assert.strictEqual(summaryMetric.aggregator, 'sum')

  const summaryValues = summaryMetric.values

  {
    const summaryCount = summaryValues.find(
      ({ metricName }) => metricName === 'http_request_summary_seconds_count'
    )
    assert.strictEqual(summaryCount.value, expectedMeasurements.length)
  }

  {
    const summarySum = summaryValues.find(
      ({ metricName }) => metricName === 'http_request_summary_seconds_sum'
    )
    const value = summarySum.value
    const expectedValue = expectedMeasurements.reduce((a, b) => a + b, 0)
    const epsilon = calculateEpsilon(value, expectedValue)
    assert.ok(
      epsilon < expectedEpsilon,
      `expected ${expectedValue}, got ${value}, epsilon ${epsilon}`
    )
  }

  const expectedSummaryValues = {
    0.01: expectedMeasurements[0],
    0.05: expectedMeasurements[0],
    0.5: expectedMeasurements[1],
    0.9: expectedMeasurements[2],
    0.95: expectedMeasurements[2],
    0.99: expectedMeasurements[2],
    0.999: expectedMeasurements[2],
  }

  for (const { labels, value } of summaryValues) {
    assert.strictEqual(labels.method, 'GET')
    assert.strictEqual(labels.status_code, 200)

    const quantile = labels.quantile
    if (quantile === undefined) continue

    const expectedValue = expectedSummaryValues[quantile]
    const epsilon = calculateEpsilon(value, expectedValue)

    assert.ok(
      epsilon < expectedEpsilon,
      `expected ${expectedValue}, got ${value}, epsilon ${epsilon}`
    )
  }
})

test('should ignore some methods and urls', async (t) => {
  const serverUrl = createHttpServer(t)

  const registry = new Registry()
  httpMetrics(registry, {
    customLabels: ['url'],
    ignoreUrls: ['/2s'],
    getCustomLabels: (req) => ({ url: req.url }),
  })

  await Promise.all([
    request(serverUrl + '/1s', { method: 'HEAD' }),
    request(serverUrl + '/1s', { method: 'POST' }),
    request(serverUrl + '/1s', { method: 'OPTION' }),
    request(serverUrl + '/1s', { method: 'DELETE' }),

    request(serverUrl + '/2s', { method: 'HEAD' }),
    request(serverUrl + '/2s', { method: 'POST' }),
    request(serverUrl + '/2s', { method: 'OPTION' }),
    request(serverUrl + '/2s', { method: 'DELETE' }),
  ])

  const metrics = await registry.getMetricsAsJSON()
  assert.strictEqual(metrics.length, 2)

  const histogramMetric = metrics.find(
    (metric) => metric.name === 'http_request_duration_seconds'
  )

  const histogramValues = histogramMetric.values

  {
    const head1sMetrics = histogramValues.filter(
      ({ labels }) => labels.method === 'HEAD' && labels.url === '/1s'
    )
    assert.strictEqual(head1sMetrics.length, 0)
  }

  {
    const option1sMetrics = histogramValues.filter(
      ({ labels }) => labels.method === 'OPTION' && labels.url === '/1s'
    )
    assert.strictEqual(option1sMetrics.length, 0)
  }

  {
    const post1sMetrics = histogramValues.filter(
      ({ labels }) => labels.method === 'POST' && labels.url === '/1s'
    )
    assert.strictEqual(post1sMetrics.length, 14)

    for (const { labels } of post1sMetrics) {
      assert.strictEqual(labels.method, 'POST')
      assert.strictEqual(labels.status_code, 200)
      assert.strictEqual(labels.url, '/1s')
    }
  }

  {
    const delete1sMetrics = histogramValues.filter(
      ({ labels }) => labels.method === 'DELETE' && labels.url === '/1s'
    )
    assert.strictEqual(delete1sMetrics.length, 14)

    for (const { labels } of delete1sMetrics) {
      assert.strictEqual(labels.method, 'DELETE')
      assert.strictEqual(labels.status_code, 200)
      assert.strictEqual(labels.url, '/1s')
    }
  }

  {
    const all2sMetrics = histogramValues.filter(
      ({ labels }) => labels.url === '/2s'
    )
    assert.strictEqual(all2sMetrics.length, 0)
  }
})

test('should ignore route with a callback', async (t) => {
  const serverUrl = createHttpServer(t)

  const registry = new Registry()
  httpMetrics(registry, {
    ignore: (req) => req.headers['x-ignore'] === 'true',
  })

  await Promise.all([
    request(serverUrl + '/1s', {
      method: 'GET',
      headers: { 'x-ignore': 'true' },
    }),
    request(serverUrl + '/1s', {
      method: 'POST',
      headers: { 'x-ignore': 'false' },
    }),
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
