"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAPIServer = createAPIServer;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const ws_1 = require("ws");
const cors_1 = __importDefault(require("cors"));
const aggregator_1 = require("../aggregator");
const emg_1 = require("../emg");
const barbell_1 = require("../barbell");
const heart_rate_1 = require("../heart-rate");
const fatigue_engine_1 = require("../fatigue-engine");
// ─── Factory: build a wired-up system instance ────────────────────────────────
function buildSystem(hrMax) {
    const hrProxy = new heart_rate_1.HeartRateMonitorServerProxy();
    const emg = new emg_1.EMGMonitor({
        sampleRateHz: 1000,
        baselineRMS: 100,
        baselineMedianFreq: 80,
    });
    const barbell = new barbell_1.BarbellVelocityTracker({
        velocityLossThreshold: 20,
    });
    const aggregator = new aggregator_1.DataAggregator({
        hrMax,
        snapshotIntervalMs: 500,
    });
    hrProxy.on('reading', (hr) => aggregator.ingestHeartRate(hr));
    emg.on('reading', (sample) => aggregator.ingestEMG(sample));
    barbell.on('rep', (rep) => aggregator.ingestVelocity(rep));
    const engine = new fatigue_engine_1.FatigueEngine(aggregator, { hrMax });
    return { hrProxy, emg, barbell, aggregator, engine };
}
// ─── Server ───────────────────────────────────────────────────────────────────
function createAPIServer(port = 3001) {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    const httpServer = (0, http_1.createServer)(app);
    const wss = new ws_1.WebSocketServer({ server: httpServer });
    // Active session (one session at a time — extend for multi-user)
    let session = null;
    const wsClients = new Set();
    // Broadcast to all WS clients
    const broadcast = (type, data) => {
        const msg = JSON.stringify({ type, data });
        wsClients.forEach(ws => {
            if (ws.readyState === ws_1.WebSocket.OPEN)
                ws.send(msg);
        });
    };
    // ── REST endpoints ─────────────────────────────────────────────────────
    app.get('/health', (_req, res) => {
        res.json({
            ok: true,
            sessionActive: session !== null,
            state: session?.engine.getState() ?? 'idle',
            setNumber: session?.engine.getSetNumber() ?? 0,
        });
    });
    app.get('/snapshot', (_req, res) => {
        if (!session)
            return res.status(400).json({ error: 'No active session' });
        res.json(session.aggregator.snapshot());
    });
    app.post('/session/start', (req, res) => {
        const { hrMax = 185 } = req.body;
        if (session) {
            session.aggregator.destroy();
            session = null;
        }
        session = buildSystem(hrMax);
        // Wire engine events → WebSocket broadcast
        session.engine
            .on('state', (e) => broadcast('state', e))
            .on('progress', (e) => broadcast('progress', e));
        // Wire aggregator snapshots → WebSocket broadcast
        session.aggregator.on('snapshot', (snap) => broadcast('snapshot', snap));
        session.engine.startWorkout();
        res.json({ ok: true, hrMax });
    });
    app.post('/session/set-done', (_req, res) => {
        if (!session)
            return res.status(400).json({ error: 'No active session' });
        session.engine.recordSetComplete();
        res.json({ ok: true });
    });
    app.post('/session/end', (_req, res) => {
        if (!session)
            return res.status(400).json({ error: 'No active session' });
        session.engine.endWorkout();
        session.aggregator.destroy();
        session = null;
        res.json({ ok: true });
    });
    // ── Ingest endpoints (for Kotlin to push sensor data) ─────────────────
    app.post('/ingest/hr', (req, res) => {
        if (!session)
            return res.status(400).json({ error: 'No active session' });
        const { bpm, confidence } = req.body;
        session.hrProxy.ingest({ bpm, confidence, timestamp: Date.now() });
        res.json({ ok: true });
    });
    app.post('/ingest/emg', (req, res) => {
        if (!session)
            return res.status(400).json({ error: 'No active session' });
        const { samples } = req.body;
        session.emg.push(samples);
        res.json({ ok: true });
    });
    app.post('/ingest/velocity', (req, res) => {
        if (!session)
            return res.status(400).json({ error: 'No active session' });
        const { velocityMps } = req.body;
        const result = session.barbell.push(velocityMps);
        res.json({ ok: true, reading: result });
    });
    // ── WebSocket handler ──────────────────────────────────────────────────
    wss.on('connection', (ws) => {
        wsClients.add(ws);
        // Send initial snapshot immediately on connect
        if (session) {
            ws.send(JSON.stringify({ type: 'snapshot', data: session.aggregator.snapshot() }));
        }
        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (!session)
                    return;
                switch (msg.type) {
                    case 'hr': {
                        const hr = msg.data;
                        session.hrProxy.ingest({ ...hr, timestamp: Date.now() });
                        break;
                    }
                    case 'emg': {
                        const { samples } = msg.data;
                        session.emg.push(samples);
                        break;
                    }
                    case 'velocity': {
                        const { velocityMps } = msg.data;
                        session.barbell.push(velocityMps);
                        break;
                    }
                    case 'set-done':
                        session.engine.recordSetComplete();
                        break;
                    case 'end-workout':
                        session.engine.endWorkout();
                        break;
                }
            }
            catch {
                // Ignore malformed messages
            }
        });
        ws.on('close', () => wsClients.delete(ws));
    });
    // ── Start ──────────────────────────────────────────────────────────────
    httpServer.listen(port, () => {
        console.log(`[fitness-fatigue-system] API server running on http://localhost:${port}`);
        console.log(`[fitness-fatigue-system] WebSocket available at  ws://localhost:${port}/ws`);
    });
    return { app, httpServer, wss };
}
// Allow direct execution: `ts-node src/api/server.ts`
if (require.main === module) {
    createAPIServer(Number(process.env.PORT) || 3001);
}
//# sourceMappingURL=server.js.map