import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { BroadcastHub } from './HttpServer'
import { PassThrough } from 'stream'
import http from 'http'
import type { OctanisProjectFile } from '@octanis/shared'

const TEST_PORT_BASE = 19400

let portCounter = 0
function getPort(): number {
  return TEST_PORT_BASE + portCounter++
}

function makeProject(): OctanisProjectFile {
  return {
    version: '0.1.0',
    audioFiles: {},
    project: {
      meta: { title: 'Test Broadcast', bpm: 120 },
      durationSec: 60,
      tracks: [],
    },
  } as OctanisProjectFile
}

function httpGet(url: string): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ statusCode: res.statusCode!, headers: res.headers, body }))
    }).on('error', reject)
  })
}

describe('BroadcastHub', () => {
  let hub: BroadcastHub

  beforeEach(() => {
    hub = new BroadcastHub()
  })

  afterEach(() => {
    hub.stop()
  })

  it('reports not running before start', () => {
    expect(hub.running).toBe(false)
    expect(hub.listenerCount).toBe(0)
    expect(hub.uptimeSec).toBe(0)
  })

  it('starts and reports running', async () => {
    const port = getPort()
    const stream = new PassThrough()
    await hub.start(port, 'mp3', stream, makeProject())

    expect(hub.running).toBe(true)
    expect(hub.uptimeSec).toBeGreaterThanOrEqual(0)
  })

  it('returns JSON status on GET /', async () => {
    const port = getPort()
    const stream = new PassThrough()
    await hub.start(port, 'mp3', stream, makeProject())

    const res = await httpGet(`http://127.0.0.1:${port}/`)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/json')

    const status = JSON.parse(res.body)
    expect(status).toHaveProperty('listeners', 0)
    expect(status).toHaveProperty('format', 'mp3')
    expect(status).toHaveProperty('uptime')
  })

  it('status includes project and track info', async () => {
    const port = getPort()
    const stream = new PassThrough()
    const project = makeProject()
    await hub.start(port, 'opus', stream, project)

    const res = await httpGet(`http://127.0.0.1:${port}/`)
    const status = JSON.parse(res.body)
    expect(status.format).toBe('opus')
    expect(status.tracks).toBe(0)
  })

  it('tracks listeners via connect/stop cycle', async () => {
    const port = getPort()
    const stream = new PassThrough()
    await hub.start(port, 'mp3', stream, makeProject())

    expect(hub.listenerCount).toBe(0)

    // Fire and forget a streaming connection — the server registers it
    http.get(`http://127.0.0.1:${port}/stream`)
    // Let the connection establish
    await new Promise((r) => setTimeout(r, 100))
    expect(hub.listenerCount).toBe(1)

    // Fire another connection
    http.get(`http://127.0.0.1:${port}/stream`)
    await new Promise((r) => setTimeout(r, 100))
    expect(hub.listenerCount).toBe(2)

    // Stop clears all listeners
    hub.stop()
    expect(hub.listenerCount).toBe(0)
    expect(hub.running).toBe(false)
  })

  it('rejects starting when already running', async () => {
    const port = getPort()
    const stream = new PassThrough()
    await hub.start(port, 'mp3', stream, makeProject())

    const stream2 = new PassThrough()
    await expect(hub.start(port + 1, 'mp3', stream2, makeProject())).rejects.toThrow(
      'Server already running'
    )
  })

  it('stops cleanly and allows restart', async () => {
    const port1 = getPort()
    const stream1 = new PassThrough()
    await hub.start(port1, 'mp3', stream1, makeProject())
    expect(hub.running).toBe(true)

    hub.stop()
    expect(hub.running).toBe(false)
    expect(hub.listenerCount).toBe(0)

    // Can restart on a different port
    const port2 = getPort()
    const stream2 = new PassThrough()
    await hub.start(port2, 'opus', stream2, makeProject())
    expect(hub.running).toBe(true)
  })

  it('drops listeners on stop and tracks uptime', async () => {
    const port = getPort()
    const stream = new PassThrough()
    await hub.start(port, 'mp3', stream, makeProject())

    // Add some listeners
    http.get(`http://127.0.0.1:${port}/stream`)
    http.get(`http://127.0.0.1:${port}/stream`)
    await new Promise((r) => setTimeout(r, 100))

    expect(hub.listenerCount).toBe(2)
    expect(hub.uptimeSec).toBeGreaterThanOrEqual(0)

    hub.stop()
    expect(hub.listenerCount).toBe(0)
    expect(hub.uptimeSec).toBe(0)
  })
})
