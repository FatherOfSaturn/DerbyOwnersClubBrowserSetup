const express = require('express');
const cors = require('cors');
const http = require('http');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const ViGEmClient = require('vigemclient');
const path = require('path');
require('dotenv').config();

const {
    isInvited,
    sendMagicLink,
    pruneSessions,
    consumeToken,
    validateSession,
    getInvites,
    addInvite,
    removeInvite
} = require('./services/auth');
const reservations = require('./services/reservations');

async function createController(client, name) {
    const controller = client.createX360Controller();
    controller.connect();
    console.log(`${name} connected`);
    return {
        controller,
        dpad: { up: false, down: false, left: false, right: false },
    };
}

function updateDpad(sat) {
    let x = 0;
    if (sat.dpad.left) x = -1;
    else if (sat.dpad.right) x = 1;

    let y = 0;
    if (sat.dpad.up) y = 1;
    else if (sat.dpad.down) y = -1;

    sat.controller.axis.dpadHorz.setValue(x);
    sat.controller.axis.dpadVert.setValue(y);
}

async function main() {
    const app = express();

    app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
    app.use(express.json());
    app.use(cookieParser());

    const server = http.createServer(app);

    const io = new Server(server, {
        cors: { origin: 'http://localhost:5173', credentials: true },
    });

    require('dotenv').config();
    pruneSessions(); // clean up expired sessions on startup
    const client = new ViGEmClient();
    await client.connect();
    console.log('ViGEm client connected');

    const satellites = {
        sat1: await createController(client, 'sat1'),
        sat2: await createController(client, 'sat2'),
        sat3: await createController(client, 'sat3'),
        sat4: await createController(client, 'sat4'),
    };

    console.log('All satellite controllers connected');

    function broadcastState() {
        io.emit('reservations', reservations.getAll());
    }

    // =========================
    // AUTH MIDDLEWARE
    // =========================

    function requireAuth(req, res, next) {
        const token = req.cookies.session;
        if (!token) return res.status(401).json({ error: 'Not authenticated' });
        const session = validateSession(token);
        if (!session) return res.status(401).json({ error: 'Invalid session' });
        req.user = session;
        next();
    }

    // =========================
    // AUTH ENDPOINTS
    // =========================

    app.post('/auth/request-link', async (req, res) => {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });
        if (!isInvited(email)) return res.status(403).json({ error: 'Email not invited' });
    
        await sendMagicLink(email);
        res.json({ success: true });
    });

    app.get('/auth/login', (req, res) => {
        const result = consumeToken(req.query.token);
        if (!result) return res.status(401).json({ error: 'Invalid or expired token' });
    
        res.cookie('session', result.token, {
            httpOnly: true,
            sameSite: 'none',
            secure: true,
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });
    
        res.json({ success: true, email: result.email });
    });

    app.get('/auth/me', (req, res) => {
        const token = req.cookies.session;
        if (!token) return res.status(401).json({ authenticated: false });
        const session = validateSession(token);
        if (!session) return res.status(401).json({ authenticated: false });
        res.json({ authenticated: true, email: session.email });
    });

    app.post('/auth/logout', requireAuth, (req, res) => {
        res.clearCookie('session');
        res.json({ success: true });
    });

    // =========================
    // RESERVATION ENDPOINTS
    // =========================

    app.get('/reservations', requireAuth, (req, res) => {
        res.json(reservations.getAll());
    });

    app.post('/reservations/:satellite', requireAuth, (req, res) => {
        const { satellite } = req.params;
        const { email } = req.user;
        const { socketId } = req.body;

        // Prevent reserving more than one satellite at a time
        const existing = reservations.getAll();
        const alreadyHasOne = Object.values(existing).some(r => r?.email === email);
        if (alreadyHasOne) {
            return res.status(400).json({ error: 'You already have a reservation' });
        }

        const result = reservations.reserve(satellite, email, socketId, (sat, reason) => {
            console.log(`[reservation] ${sat} expired — ${reason}`);
            broadcastState();
        });

        if (result.error) return res.status(400).json(result);

        broadcastState();
        res.json({ success: true });
    });

    app.delete('/reservations/:satellite', requireAuth, (req, res) => {
        const { satellite } = req.params;
        const { email } = req.user;

        const result = reservations.release(satellite, email);
        if (result.error) return res.status(400).json(result);

        broadcastState();
        res.json({ success: true });
    });

    // Admin: force-release any satellite
    app.delete('/admin/reservations/:satellite', requireAuth, (req, res) => {
        const { satellite } = req.params;

        const result = reservations.release(satellite, null); // null = system override
        if (result.error) return res.status(400).json(result);

        broadcastState();
        res.json({ success: true });
    });

    // Admin: get all connected socket info + reservation state
    app.get('/admin/state', requireAuth, (req, res) => {
        const connectedSockets = [];
        for (const [id, socket] of io.sockets.sockets) {
            connectedSockets.push({ id, email: socket.user?.email });
        }
        res.json({
            reservations: reservations.getAll(),
            connected: connectedSockets,
        });
    });
    
    app.get('/admin/invites', requireAuth, (req, res) => {
        res.json({ emails: getInvites() });
    });
    
    app.post('/admin/invites', requireAuth, (req, res) => {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });
        const result = addInvite(email);
        if (result.error) return res.status(400).json(result);
        res.json({ success: true });
    });
    
    app.delete('/admin/invites/:email', requireAuth, (req, res) => {
        const result = removeInvite(decodeURIComponent(req.params.email));
        if (result.error) return res.status(400).json(result);
        res.json({ success: true });
    });

    // =========================
    // HEALTH
    // =========================

    app.get('/health', (req, res) => {
        res.json({ satellites: Object.keys(satellites) });
    });

    // =========================
    // SOCKET AUTH MIDDLEWARE
    // =========================

    io.use((socket, next) => {
        const cookies = socket.handshake.headers.cookie || '';
        const match = cookies.match(/session=([^;]+)/);
        const token = match ? match[1] : null;
        if (!token) return next(new Error('Not authenticated'));
        const session = validateSession(token);
        if (!session) return next(new Error('Invalid session'));
        socket.user = session;
        next();
    });

    // =========================
    // SOCKETS
    // =========================

    io.on('connection', (socket) => {
        const { email } = socket.user;
        console.log(`[socket] connected ${socket.id} (${email})`);

        socket.emit('reservations', reservations.getAll());

        socket.on('heartbeat', () => {
            reservations.heartbeat(socket.id);
        });

        socket.on('controller', (data) => {
            const { satellite, button, pressed } = data;

            const res = reservations.getReservation(satellite);
            if (!res || res.email !== email) {
                socket.emit('error', { message: `No control of ${satellite}` });
                return;
            }

            const sat = satellites[satellite];
            if (!sat) return;

            console.log(`[ctrl] ${satellite} ${button} ${pressed ? 'DOWN' : 'UP'} (${email})`);

            switch (button) {
                case 'UP':    sat.dpad.up = pressed;    updateDpad(sat); break;
                case 'DOWN':  sat.dpad.down = pressed;  updateDpad(sat); break;
                case 'LEFT':  sat.dpad.left = pressed;  updateDpad(sat); break;
                case 'RIGHT': sat.dpad.right = pressed; updateDpad(sat); break;
                case 'A':     sat.controller.button.A.setValue(pressed); break;
                case 'START': sat.controller.button.START.setValue(pressed); break;
                case 'BACK':  sat.controller.button.BACK.setValue(pressed); break;
                case 'WHIP':  sat.controller.button.Y.setValue(pressed); break;
                case 'HOLD':  sat.controller.button.X.setValue(pressed); break;
                default: console.log('[ctrl] unknown button:', button);
            }
        });

        socket.on('disconnect', () => {
            console.log(`[socket] disconnected ${socket.id} (${email})`);
            const released = reservations.releaseBySocket(socket.id);
            if (released.length > 0) {
                console.log(`[reservation] released on disconnect: ${released.join(', ')}`);
                broadcastState();
            }
        });
    });

    // Serve built React frontend in production
    const distPath = path.join(__dirname, '..', 'frontend', 'dist');
    
    if (require('fs').existsSync(distPath)) {
        app.use(express.static(distPath));
    
        // For any route that isn't an API route, serve index.html
        // This lets React handle its own routing
        app.get('/{*path}', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    
        console.log('Serving frontend from', distPath);
    } else {
        console.log('No frontend build found — run: cd frontend && npm run build');
    }

    const PORT = process.env.PORT || 3001;

    server.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on ${PORT}`);
    });
}

main().catch(console.error);