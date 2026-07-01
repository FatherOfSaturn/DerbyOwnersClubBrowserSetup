const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const { readJson, writeJson } = require('./storage');

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAGIC_LINK_DURATION_MS = 15 * 60 * 1000;         // 15 minutes

function getTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
}

// ─── Invites ──────────────────────────────────────────────────────────────────

function isInvited(email) {
    const invites = readJson('invites.json');
    const allowedEmails = invites.allowedEmails || [];
    return allowedEmails.includes(email.toLowerCase());
}

function getInvites() {
    const data = readJson('invites.json');
    return data.allowedEmails || [];
}

function addInvite(email) {
    const inviteData = readJson('invites.json');
    const emails = inviteData.allowedEmails || [];
    const normalized = email.toLowerCase().trim();
    if (emails.includes(normalized)) return { error: 'Email already invited' };
    emails.push(normalized);
    writeJson('invites.json', { allowedEmails: emails });
    return { success: true };
}

function removeInvite(email) {
    const inviteData = readJson('invites.json');
    const emails = inviteData.allowedEmails || [];
    const normalized = email.toLowerCase().trim();
    const filtered = emails.filter(e => e !== normalized);
    if (filtered.length === emails.length) return { error: 'Email not found' };
    writeJson('invites.json', { allowedEmails: filtered });
    return { success: true };
}

// ─── Session pruning ──────────────────────────────────────────────────────────

function pruneSessions() {
    const sessionData = readJson('sessions.json');
    const sessions = sessionData.sessions || [];
    const now = Date.now();
    const active = sessions.filter(s => s.expiresAt > now && !s.used);
    writeJson('sessions.json', { sessions: active });
    console.log(`[auth] pruned sessions: ${sessions.length - active.length} removed, ${active.length} remaining`);
}

// ─── Magic link ───────────────────────────────────────────────────────────────

async function sendMagicLink(email) {
    const token = uuidv4();
    const now = Date.now();

    const sessionData = readJson('sessions.json');
    if (!sessionData.sessions) sessionData.sessions = [];

    sessionData.sessions.push({
        token,
        email,
        createdAt: now,
        expiresAt: now + MAGIC_LINK_DURATION_MS,
        used: false,
    });

    writeJson('sessions.json', sessionData);

    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const link = `${baseUrl}/login?token=${token}`;

    // Always log it so dev works without email configured
    console.log('');
    console.log('==============================');
    console.log('MAGIC LINK');
    console.log(link);
    console.log('==============================');
    console.log('');

    // Send email if nodemailer is configured
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        try {
            const transporter = getTransporter();

            const info = await transporter.sendMail({
                from: `"Derby Owners Club" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Your Derby Owners Club login link',
                html: `
                    <div style="font-family: monospace; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                        <h2 style="color: #f59e0b; letter-spacing: 0.1em;">DERBY OWNERS CLUB</h2>
                        <p>Click the link below to log in. It expires in 15 minutes.</p>
                        <a href="${link}" style="
                            display: inline-block;
                            margin: 24px 0;
                            padding: 12px 24px;
                            background: #f59e0b;
                            color: #000;
                            text-decoration: none;
                            font-weight: 700;
                            border-radius: 4px;
                            letter-spacing: 0.05em;
                        ">LOG IN</a>
                        <p style="color: #64748b; font-size: 12px;">
                            If you didn't request this, you can ignore it.<br/>
                            Link expires at ${new Date(now + MAGIC_LINK_DURATION_MS).toLocaleTimeString()}.
                        </p>
                    </div>
                `,
            });

            console.log(`[auth] magic link emailed to ${email} (${info.messageId})`);
        } catch (err) {
            console.error('[auth] email send failed:', err.message);
        }
    } else {
        console.log('[auth] email not configured — use the link above');
    }

    return token;
}

// ─── Token validation ─────────────────────────────────────────────────────────

function validateToken(token) {
    const sessionData = readJson('sessions.json');
    const sessions = sessionData.sessions || [];
    const session = sessions.find(s => s.token === token);
    if (!session) return null;
    if (session.used) return null;
    if (Date.now() > session.expiresAt) return null;
    return session;
}

function consumeToken(token) {
    const sessionData = readJson('sessions.json');
    const sessions = sessionData.sessions || [];

    const idx = sessions.findIndex(s => s.token === token);
    if (idx === -1) return null;

    const session = sessions[idx];
    if (session.used || Date.now() > session.expiresAt) return null;

    sessions[idx].used = true;

    const sessionToken = uuidv4();
    sessions.push({
        token: sessionToken,
        email: session.email,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_DURATION_MS,
        used: false,
    });

    writeJson('sessions.json', { sessions });
    return { token: sessionToken, email: session.email };
}

function validateSession(token) {
    const sessionData = readJson('sessions.json');
    const sessions = sessionData.sessions || [];
    const session = sessions.find(s => s.token === token);
    if (!session) return null;
    if (session.used) return null;
    if (Date.now() > session.expiresAt) return null;
    return session;
}

module.exports = {
    isInvited,
    getInvites,
    addInvite,
    removeInvite,
    pruneSessions,
    sendMagicLink,
    validateToken,
    consumeToken,
    validateSession,
};