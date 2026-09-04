/**
 * dsh-archived-conversations — host half.
 *
 * The web UI hides archived sessions from every grouping surface on purpose
 * ("a hidden row must not stay open behind the list"), and there is no
 * unarchive API yet. This plugin therefore offers a read-only preview of the
 * archived conversations: the settings page entry lists archived session ids,
 * and clicking one fetches a short text preview served by this host half.
 *
 * Security posture:
 * - The preview route accepts only loopback sockets and loopback Host authorities;
 *   cross-site Fetch Metadata and mismatched Origin/Referer headers are rejected.
 * - The preview route only answers for session ids that are IN the registry's
 *   archived set (an IDOR guard: live/active sessions are never readable).
 * - The session id is validated as a DSH session-id-shaped string
 *   (`session-` prefix + uuid/counter) before use.
 * - The session log is read through the unified `sessionQuery` service
 *   (live-preferred, falls back to persistence), but only the most recent
 *   user/assistant text messages are extracted, each truncated to 400 chars,
 *   at most 6 returned — the minimal data the browser UI needs, never the
 *   full log. (A full-log read is only reachable for already-archived ids,
 *   which the same browser user already lists in the settings page.)
 * - Error responses use fixed text; internal error details are never echoed.
 *
 * Endpoint: GET /__archived-conversations/preview?sessionId=<id>
 * Response: { ok: true, sessionId, messages: [{ role, text, time }] }
 *           { ok: false, error } on failure (fixed error text).
 */
/** Stable Cordis plugin name. */
export const name = 'archived-conversations';
/** The route needs the HTTP carrier; other services are optional and read via ctx.get. */
export const inject = ['webServer'];
/** Hard cap on preview messages returned to the browser. */
const MAX_MESSAGES = 6;
/** Per-message text cap (UTF-16 code units). */
const MAX_TEXT = 400;
/**
 * DSH session id shape: `session-` prefix + UUID (with or without dashes) or
 * a numeric counter — the forms the session store mints (api-proxy, core
 * session, subagent/sdk). Bounded and cheap; the IDOR guard (registry
 * membership) is the real authorization.
 */
const SESSION_ID_RE = /^session-(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{32}|\d+)$/i;
/** Fixed user-facing error texts (never leak internals). */
const ERR_BAD_REQUEST = 'invalid request';
const ERR_NOT_ARCHIVED = 'conversation is not archived';
const ERR_UNAVAILABLE = 'preview service is unavailable';
const ERR_INTERNAL = 'preview failed';
/** Extract plain text blocks from a message content array (skips reasoning/tool-call). */
function extractText(content) {
    if (!Array.isArray(content))
        return '';
    const parts = [];
    for (const block of content) {
        if (block === null || typeof block !== 'object')
            continue;
        const b = block;
        if (b.type !== 'text' || typeof b.text !== 'string')
            continue;
        parts.push(b.text);
    }
    return parts.join('\n').trim();
}
/**
 * Fold one raw event into a preview message, or null when it is not a
 * user/assistant text message. Only genuine user-originated messages count
 * (plugin-injected runtime context is skipped).
 */
function previewFromEvent(ev) {
    if (ev === null || typeof ev !== 'object')
        return null;
    const event = ev;
    const data = event.data;
    if (data === null || typeof data !== 'object')
        return null;
    const record = data;
    let role = null;
    let content;
    if (event.type === 'user/message') {
        const source = record.source;
        if (source !== null && typeof source === 'object'
            && source.kind === 'user') {
            role = 'user';
            content = record.content;
        }
    }
    else if (event.type === 'assistant/message') {
        const msg = record.message;
        if (msg !== null && typeof msg === 'object') {
            role = 'assistant';
            content = msg.content;
        }
    }
    if (role === null)
        return null;
    const text = extractText(content);
    if (text === '')
        return null;
    return {
        role,
        text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text,
        time: typeof event.time === 'number' ? event.time : 0,
    };
}
/** Read the preview for one session through the session-query service. */
async function readPreview(sessionQuery, sessionId) {
    try {
        const snapshot = await sessionQuery.readSession(sessionId);
        const events = snapshot !== null && typeof snapshot === 'object' && Array.isArray(snapshot.events)
            ? snapshot.events
            : [];
        const messages = [];
        for (const ev of events) {
            const message = previewFromEvent(ev);
            if (message !== null)
                messages.push(message);
        }
        return { ok: true, messages: messages.slice(-MAX_MESSAGES) };
    }
    catch {
        return { ok: false, error: ERR_INTERNAL };
    }
}
/** Send a JSON response with the standard charset/length headers. */
function sendJson(res, data, status = 200) {
    const text = JSON.stringify(data);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(text));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(text);
}
/** Parse a bounded query string for the sessionId parameter (DSH id shape only). */
function sessionIdFrom(url) {
    if (url === undefined)
        return null;
    const parsed = new URL(url, 'http://dsh.local');
    const value = parsed.searchParams.get('sessionId');
    return typeof value === 'string' && SESSION_ID_RE.test(value) ? value : null;
}
/**
 * Whether the registry's archived set contains the id. The registry is the
 * single authority on what the sidebar lists as archived.
 */
function isArchived(ctx, sessionId) {
    const registry = ctx.get('workspaceRegistry');
    if (registry === undefined)
        return false;
    return registry.archivedSessionIds.includes(sessionId);
}
function isLoopbackAddress(address) {
    if (address === undefined)
        return false;
    if (address === '::1' || address === '0:0:0:0:0:0:0:1')
        return true;
    if (address.startsWith('::ffff:'))
        address = address.slice('::ffff:'.length);
    const octets = address.split('.');
    return octets.length === 4 && octets[0] === '127'
        && octets.slice(1).every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}
function isLoopbackHostname(hostname) {
    return hostname === 'localhost' || hostname === '[::1]'
        || (hostname.startsWith('127.') && hostname.slice(4).split('.').length === 3
            && hostname.slice(4).split('.').every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255));
}
/** Reject remote sockets, DNS-rebinding Hosts, and cross-origin browser markers. */
function isTrustedRequest(ctx, req) {
    // The current webServer contract exposes the bind host; regardless of whether
    // it binds loopback or all interfaces, this private preview stays loopback-only.
    if (ctx.webServer.host !== '127.0.0.1' && ctx.webServer.host !== '0.0.0.0')
        return false;
    if (!isLoopbackAddress(req.socket.remoteAddress))
        return false;
    const host = req.headers.host;
    if (host === undefined)
        return false;
    let hostUrl;
    try {
        hostUrl = new URL(`http://${host}`);
    }
    catch {
        return false;
    }
    if (!isLoopbackHostname(hostUrl.hostname))
        return false;
    if (req.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const requestMarkerMatches = (marker) => {
        try {
            const markerUrl = new URL(marker);
            return markerUrl.protocol === hostUrl.protocol && markerUrl.host === hostUrl.host;
        }
        catch {
            return false;
        }
    };
    const origin = req.headers.origin;
    if (origin !== undefined && !requestMarkerMatches(origin))
        return false;
    const referer = req.headers.referer;
    if (referer !== undefined && !requestMarkerMatches(referer))
        return false;
    return true;
}
/**
 * Plugin body: register the preview route.
 * @param ctx - host context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: '/__archived-conversations/preview',
        handler: (req, res) => {
            if (!isTrustedRequest(ctx, req)) {
                sendJson(res, { ok: false, error: ERR_BAD_REQUEST }, 403);
                return;
            }
            if (req.method !== 'GET') {
                sendJson(res, { ok: false, error: ERR_BAD_REQUEST }, 405);
                return;
            }
            const sessionId = sessionIdFrom(req.url);
            if (sessionId === null) {
                sendJson(res, { ok: false, error: ERR_BAD_REQUEST }, 400);
                return;
            }
            // IDOR guard: only archived conversations are readable through this route.
            if (!isArchived(ctx, sessionId)) {
                sendJson(res, { ok: false, error: ERR_NOT_ARCHIVED }, 404);
                return;
            }
            const sessionQuery = ctx.get('sessionQuery');
            if (sessionQuery === undefined) {
                sendJson(res, { ok: false, error: ERR_UNAVAILABLE }, 503);
                return;
            }
            readPreview(sessionQuery, sessionId).then((result) => { sendJson(res, result); }, () => { sendJson(res, { ok: false, error: ERR_INTERNAL }, 500); });
        },
    }), 'archived-conversations: preview route');
}
