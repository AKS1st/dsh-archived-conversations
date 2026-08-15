/**
 * dsh-archived-conversations — host half.
 *
 * The web UI hides archived sessions from every grouping surface on purpose
 * ("a hidden row must not stay open behind the list"), and there is no
 * unarchive API yet. This plugin therefore offers a read-only preview of the
 * archived conversations: the sidebar footer entry lists archived session ids,
 * and clicking one fetches a short text preview served by this host half.
 *
 * Security posture:
 * - The preview route only answers for session ids that are IN the registry's
 *   archived set (an IDOR guard: live/active sessions are never readable).
 * - The session id is validated as a UUID-shaped string before use.
 * - The session log is read through the unified `sessionQuery` service
 *   (live-preferred, falls back to persistence), but only the most recent
 *   user/assistant text messages are extracted, each truncated to 400 chars,
 *   at most 6 returned — the minimal data the browser UI needs, never the
 *   full log. (A full-log read is only reachable for already-archived ids,
 *   which the same browser user already lists in the sidebar.)
 * - Error responses use fixed text; internal error details are never echoed.
 *
 * Endpoint: GET /__archived-conversations/preview?sessionId=<id>
 * Response: { ok: true, sessionId, messages: [{ role, text, time }] }
 *           { ok: false, error } on failure (fixed error text).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
/** Stable Cordis plugin name. */
export declare const name = "archived-conversations";
/** The route needs the HTTP carrier; other services are optional and read via ctx.get. */
export declare const inject: string[];
/** Minimal host context shape this plugin consumes. */
interface ArchivedHostContext {
    get(name: string): unknown;
    webServer: {
        register(route: {
            kind: 'exact' | 'prefix';
            path: string;
            handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
        }): () => void;
    };
}
/**
 * Plugin body: register the preview route.
 * @param ctx - host context.
 */
export declare function apply(ctx: ArchivedHostContext): void;
export {};
