'use strict'

const { Histogram, Summary } = require('prom-client')
const diagnosticChannel = require('node:diagnostics_channel')

const defaultLabels = ['method', 'status_code']
const defaultIgnoreMethods = ['HEAD', 'OPTIONS', 'TRACE', 'CONNECT']

module.exports = (registry, config = {}) => {
  const getCustomLabels = config.getCustomLabels || (() => ({}))
  const customLabelNames = config.customLabels || []
  const labelNames = [...new Set([...defaultLabels, ...customLabelNames])]

  const registers = registry ? [registry] : undefined

  const ignoreMethods = config.ignoreMethods || defaultIgnoreMethods
  const ignoreUrls = config.ignoreUrls || []
  const ignore = config.ignore || (() => false)

  const ignoreUrlsStrings = []
  const ignoreUrlsRegexps = []

  for (const url of ignoreUrls) {
    if (url instanceof RegExp) {
      ignoreUrlsRegexps.push(url)
    } else {
      ignoreUrlsStrings.push(url)
    }
  }

  function ignoreRoute (request) {
    if (ignoreMethods.includes(request.method)) return true
    if (ignoreUrlsStrings.includes(request.url)) return true

    for (const url of ignoreUrlsRegexps) {
      if (url.test(request.url)) return true
    }

    return false
  }

  const summary = new Summary({
    name: 'http_request_summary_seconds',
    help: 'request duration in seconds summary for all requests',
    labelNames,
    registers,
    ...config.summary,
  })

  const histogram = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'request duration in seconds histogram for all requests',
    labelNames,
    registers,
    ...config.histogram,
  })

  const timers = new WeakMap()

  diagnosticChannel.subscribe('http.server.request.start', (event) => {
    const { request } = event

    if (ignoreRoute(request)) return

    const summaryTimer = summary.startTimer()
    const histogramTimer = histogram.startTimer()

    timers.set(request, { summaryTimer, histogramTimer })
  })

  diagnosticChannel.subscribe('http.server.response.finish', (event) => {
    const { request, response } = event

    if (ignoreRoute(request)) return

    const { summaryTimer, histogramTimer } = timers.get(request)
    timers.delete(request)

    if (ignore(request, response)) return

    const labels = {
      method: request.method,
      status_code: response.statusCode,
      ...getCustomLabels(request, response),
    }

    if (summaryTimer) summaryTimer(labels)
    if (histogramTimer) histogramTimer(labels)
  })
}
