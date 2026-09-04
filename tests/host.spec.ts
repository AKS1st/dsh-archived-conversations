import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'

function request(headers: Record<string, string>, remoteAddress = '127.0.0.1', url = '/__archived-conversations/preview?sessionId=session-123'): any {
  return { method: 'GET', url, headers, socket: { remoteAddress } }
}

function response(): any {
  return {
    headers: {} as Record<string, unknown>,
    setHeader(name: string, value: unknown) { this.headers[name] = value },
    end: vi.fn(),
  }
}

describe('archived preview route security', () => {
  function setup() {
    let handler: any
    const dispose = vi.fn()
    const effect = vi.fn((setup: () => () => void) => setup())
    const ctx: any = {
      webServer: { host: '127.0.0.1', register: vi.fn((route: any) => { handler = route.handler; return dispose }) },
      get: vi.fn((name: string) => name === 'workspaceRegistry' ? { archivedSessionIds: ['session-123'] } : { readSession: vi.fn(async () => ({ events: [] })) }),
      effect,
    }
    apply(ctx)
    return { ctx, handler, effect, dispose }
  }

  it('registers through the current effect contract and disposes the route', () => {
    const { effect, dispose } = setup()
    expect(effect).toHaveBeenCalledOnce()
    const teardown = effect.mock.results[0]?.value as (() => void)
    teardown()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it.each([
    ['remote socket', request({ host: '127.0.0.1:3080' }, '192.168.1.5')],
    ['rebinding Host', request({ host: 'attacker.test:3080' })],
    ['cross-origin Origin', request({ host: '127.0.0.1:3080', origin: 'http://attacker.test:3080' })],
    ['mismatched-scheme Origin', request({ host: '127.0.0.1:3080', origin: 'https://127.0.0.1:3080' })],
    ['mismatched-scheme Referer', request({ host: '127.0.0.1:3080', referer: 'https://127.0.0.1:3080/settings' })],
    ['cross-site metadata', request({ host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' })],
  ])('rejects %s before reading the archive', (_name, req) => {
    const { handler, ctx } = setup()
    const res = response()
    handler(req, res)
    expect(res.statusCode).toBe(403)
    expect(ctx.get).not.toHaveBeenCalledWith('sessionQuery')
  })

  it.each([
    ['malformed session id', '/__archived-conversations/preview?sessionId=live-123', 400],
    ['non-archived session id', '/__archived-conversations/preview?sessionId=session-456', 404],
  ])('preserves the %s guard', (name, url, status) => {
    const { handler } = setup()
    const res = response()
    handler(request({ host: '127.0.0.1:3080' }, '127.0.0.1', url), res)
    expect(res.statusCode, name).toBe(status)
  })

  it('serves an archived preview from a loopback same-origin request', async () => {
    const { handler } = setup()
    const res = response()
    handler(request({ host: 'localhost:3080' }), res)
    await Promise.resolve()
    await Promise.resolve()
    expect(res.statusCode).toBe(200)
    expect(res.end).toHaveBeenCalledOnce()
  })
})
