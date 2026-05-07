/**
 * @module api/server
 * REST + WebSocket API server — Kotlin Native bridge layer.
 *
 * Exposes the entire fitness-fatigue-system over HTTP + WebSocket so that
 * any native client (Kotlin, Swift, etc.) can control the engine and
 * receive real-time data without touching the JS internals.
 *
 * Endpoints:
 *   GET  /health              → system status
 *   GET  /snapshot            → current signal snapshot (JSON)
 *   POST /session/start       → start workout session
 *   POST /session/set-done    → record set complete
 *   POST /session/end         → end workout
 *   POST /ingest/hr           → push a HR reading (from native camera)
 *   POST /ingest/emg          → push EMG data batch
 *   POST /ingest/velocity     → push a rep velocity
 *   WS   /ws                  → real-time event stream
 *
 * WebSocket messages from server → client:
 *   { type: 'state',    data: StateEvent }
 *   { type: 'progress', data: RestProgressEvent }
 *   { type: 'snapshot', data: SignalSnapshot }
 *
 * WebSocket messages from client → server:
 *   { type: 'hr',       data: HeartRateMeasurement }
 *   { type: 'emg',      data: { samples: number[] } }
 *   { type: 'velocity', data: { velocityMps: number } }
 *   { type: 'set-done' }
 *   { type: 'end-workout' }
 */
export declare function createAPIServer(port?: number): {
    app: import("express-serve-static-core").Express;
    httpServer: import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>;
    wss: import("ws").Server<typeof import("ws"), typeof import("http").IncomingMessage>;
};
//# sourceMappingURL=server.d.ts.map