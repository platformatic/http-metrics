# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@platformatic/http-metrics` is a Node.js package that collects Prometheus metrics for HTTP servers using Node.js diagnostic channels. It works with any Node.js HTTP server framework (Express, Koa, Fastify, etc.) by subscribing to `http.server.request.start` and `http.server.response.finish` diagnostic channel events.

## Development Commands

- **Run tests**: `npm test` (runs linting and tests via borp)
- **Run tests only**: `npx borp`
- **Run single test file**: `npx borp test/http-metrics.test.js`
- **Lint**: `npm run lint` (uses neostandard eslint config)

## Architecture

### Core Implementation (index.js)

The package exports a single function that sets up metrics collection:

1. **Diagnostic Channel Integration**: Uses Node.js `diagnostics_channel` to automatically hook into HTTP server lifecycle
   - Subscribes to `http.server.request.start` to start timers
   - Subscribes to `http.server.response.finish` to end timers and record metrics

2. **Metrics Storage**: Uses `WeakMap` to store timers keyed by request objects, ensuring automatic cleanup

3. **Two Metric Types**: Creates both a Summary and Histogram for request duration with identical labels
   - `http_request_summary_seconds`: Summary metric
   - `http_request_duration_seconds`: Histogram metric

4. **Filtering System**: Three-layer filtering approach
   - `ignoreMethods`: Filter by HTTP method (default ignores HEAD, OPTIONS, TRACE, CONNECT)
   - `ignoreUrls`: Filter by URL strings or RegExp patterns
   - `ignore(req, res, server)`: Custom function filter applied after timing (still measures, just doesn't record)
   - `ports`: Optional array to collect metrics only from specific server ports

5. **Custom Labels**: Supports custom labels via `customLabels` array and `getCustomLabels(req, res, server)` function

6. **Manual Timing**: Exports `startTimer` and `endTimer` functions for custom measurements not using diagnostic channels

## Test Structure

Tests use Node.js built-in test runner and are located in `test/`:

- **http-metrics.test.js**: Main tests using real HTTP servers via diagnostic channels
- **inject.test.js**: Tests manual timing with `startTimer`/`endTimer` for custom measurements
- **multiple-servers.test.js**: Tests port-based filtering
- **helper.js**: Shared test utilities including `createHttpServer` and `calculateEpsilon`

All tests use `t.after()` for cleanup and measure timing accuracy with epsilon calculations (typically 5% tolerance).

## Important Implementation Details

- The `ignore()` function is called AFTER timing ends but BEFORE metrics are recorded, allowing conditional recording based on response data
- The `ignoreRoute()` internal function is called at timer start to skip timing entirely for filtered requests
- Custom labels must be declared in `customLabels` array AND returned by `getCustomLabels()` function
- The package doesn't create a registry - users must provide their own `prom-client` Registry
- Both Summary and Histogram use the same labelNames and configuration
