'use strict'

const { Histogram, Summary } = require('prom-client')
const diagnosticChannel = require('node:diagnostics_channel')

const defaultLabels = ['method', 'route', 'status_code']
const defaultIgnoreMethods = ['HEAD', 'OPTIONS', 'TRACE', 'CONNECT']

module.exports = (registry, config = {}) => {
  const getCustomLabels = config.getCustomLabels || (() => ({}))
  const customLabelNames = config.customLabels || []
  const labelNames = [...new Set([...defaultLabels, ...customLabelNames])]

  const registers = registry ? [registry] : undefined

  const ignoreMethods = config.ignoreMethods || defaultIgnoreMethods
  const ignoreUrls = config.ignoreUrls || []
  const ignore = config.ignore || (() => false)
  const zeroFill = config.zeroFill || false

  const ignoreUrlsStrings = []
  const ignoreUrlsRegexps = []

  const ports = (config.ports || []).map((port) => parseInt(port, 10))

  for (const url of ignoreUrls) {
    if (url instanceof RegExp) {
      ignoreUrlsRegexps.push(url)
    } else {
      ignoreUrlsStrings.push(url)
    }
  }

  function ignoreRoute (request, server) {
    if (ignoreMethods.includes(request.method)) return true
    if (ignoreUrlsStrings.includes(request.url)) return true

    if (ports.length > 0) {
      const port = server.address().port
      if (!ports.includes(port)) return true
    }

    for (const url of ignoreUrlsRegexps) {
      if (url.test(request.url)) return true
    }

    return false
  }

  const summary = new Summary({
    name: 'http_request_summary_seconds',
    help: 'request duration in seconds summary',
    labelNames,
    registers,
    ...config.summary,
  })

  if (zeroFill) {
    summary.observe({ method: 'GET', route: '/__empty_metrics', status_code: 404 }, 0)
  }

  const histogram = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'request duration in seconds histogram',
    labelNames,
    registers,
    ...config.histogram,
  })

  if (zeroFill) {
    histogram.zero({ method: 'GET', route: '/__empty_metrics', status_code: 404 })
  }

  const timers = new WeakMap()

  function startTimer (options) {
    const { request, server } = options

    if (ignoreRoute(request, server)) return

    const summaryTimer = summary.startTimer()
    const histogramTimer = histogram.startTimer()

    timers.set(request, { summaryTimer, histogramTimer })
  }

  function endTimer (options) {
    const { request, response, server } = options

    if (ignoreRoute(request, server)) return

    const requestTimers = timers.get(request)
    if (!requestTimers) return

    const { summaryTimer, histogramTimer } = requestTimers
    timers.delete(request)

    if (ignore(request, response, server)) return

    const labels = {
      method: request.method,
      status_code: response.statusCode,
      ...getCustomLabels(request, response, server),
    }

    if (summaryTimer) summaryTimer(labels)
    if (histogramTimer) histogramTimer(labels)
  }

  diagnosticChannel.subscribe('http.server.request.start', event => startTimer(event))
  diagnosticChannel.subscribe('http.server.response.finish', event => endTimer(event))

  return { summary, histogram, startTimer, endTimer }
}
