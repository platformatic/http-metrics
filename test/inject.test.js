'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { setTimeout: sleep } = require('node:timers/promises')
const { Registry } = require('prom-client')
const httpMetrics = require('../index.js')
const { calculateEpsilon } = require('./helper.js')

test('should calculate the http inject request duration histogram', async (t) => {
  const registry = new Registry()
  const { startTimer, endTimer } = httpMetrics(registry)

  async function inject (url, ms) {
    const request = { method: 'GET', url }
    const response = { statusCode: 200 }

    startTimer({ request })
    await sleep(ms)
    endTimer({ request, response })
  }

  await Promise.all([
    inject('/500ms', 500),
    inject('/1s', 1000),
    inject('/2s', 2000),
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
  assert.strictEqual(histogramMetric.help, 'request duration in seconds histogram')
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
  assert.strictEqual(summaryMetric.help, 'request duration in seconds summary')
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
