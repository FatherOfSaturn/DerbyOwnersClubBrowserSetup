import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Reservation {
    email: string;
    reservedAt: number;
    expiresAt: number;
}

type ReservationState = Record<string, Reservation | null>;

interface ConnectedUser {
    id: string;
    email: string;
}

interface Props {
    email: string;
    onLogout: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SATELLITES = ['sat1', 'sat2', 'sat3', 'sat4'];
const SAT_LABELS: Record<string, string> = {
    sat1: 'SAT 1', sat2: 'SAT 2', sat3: 'SAT 3', sat4: 'SAT 4',
};
const ADMIN_EMAILS = ['hitma1221@gmail.com'];
const SOCKET_URL = import.meta.env.DEV
    ? 'http://localhost:3000'
    : import.meta.env.VITE_API_URL;
// Near the top of Dashboard.tsx with your other constants
const MEDIA_URL = import.meta.env.DEV
    ? 'http://localhost:8889'
    : import.meta.env.VITE_MEDIA_URL;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeLeft(expiresAt: number): string {
    const ms = Math.max(0, expiresAt - Date.now());
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function shortEmail(email: string): string {
    return email.split('@')[0];
}

// ─── Satellite Card ───────────────────────────────────────────────────────────

function SatCard({
    id, reservation, myEmail, isActive, isControlling, onSelect, onReserve, onRelease,
}: {
    id: string;
    reservation: Reservation | null;
    myEmail: string;
    isActive: boolean;       // currently viewed in the feed
    isControlling: boolean;  // isActive AND we own it
    onSelect: () => void;
    onReserve: () => void;
    onRelease: () => void;
}) {
    const [timeLeft, setTimeLeft] = useState('');
    const isMine = reservation?.email === myEmail;
    const isTaken = !!reservation && !isMine;

    useEffect(() => {
        if (!reservation) return;
        const iv = setInterval(() => setTimeLeft(formatTimeLeft(reservation.expiresAt)), 1000);
        setTimeLeft(formatTimeLeft(reservation.expiresAt));
        return () => clearInterval(iv);
    }, [reservation]);

    const borderColor = isControlling
        ? '#22c55e'
        : isActive
        ? '#f59e0b'
        : '#1e293b';

    // Status badge: color + label
    const statusColor = isMine ? '#f59e0b' : isTaken ? '#ef4444' : '#22c55e';
    const statusLabel = isMine ? 'RESERVED' : isTaken ? 'RESERVED' : 'AVAILABLE';

    // Who holds it
    const ownerLabel = isMine
        ? 'you'
        : isTaken
        ? shortEmail(reservation!.email)
        : null;

    return (
        <div
            onClick={onSelect}
            style={{
                background: isActive ? '#1e293b' : '#0f172a',
                border: `2px solid ${borderColor}`,
                borderRadius: 8,
                padding: '12px 14px',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
                userSelect: 'none',
                position: 'relative',
            }}
        >
            {/* Controlling pill */}
            {isControlling && (
                <div style={{
                    position: 'absolute',
                    top: -10,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#22c55e',
                    color: '#000',
                    fontSize: 9,
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    letterSpacing: '0.1em',
                    padding: '1px 8px',
                    borderRadius: 999,
                    whiteSpace: 'nowrap',
                }}>
                    ● CONTROLLING
                </div>
            )}

            {/* Title row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#e2e8f0', letterSpacing: '0.05em' }}>
                    {SAT_LABELS[id]}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: statusColor, fontFamily: 'monospace' }}>
                    {statusLabel}
                </span>
            </div>

            {/* Owner + timer */}
            <div style={{ marginBottom: 8, minHeight: 28 }}>
                {ownerLabel && (
                    <div style={{ fontSize: 11, color: isMine ? '#f59e0b' : '#94a3b8', fontFamily: 'monospace', marginBottom: 1 }}>
                        {ownerLabel}
                    </div>
                )}
                {reservation && (
                    <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{timeLeft}</div>
                )}
            </div>

            {/* Action button */}
            <div onClick={(e) => e.stopPropagation()}>
                {!reservation && (
                    <button onClick={onReserve} style={btnStyle('#22c55e')}>
                        Reserve
                    </button>
                )}
                {isMine && (
                    <button onClick={onRelease} style={btnStyle('#ef4444')}>
                        Release
                    </button>
                )}
                {isTaken && (
                    <div style={{
                        width: '100%',
                        padding: '3px 0',
                        fontSize: 11,
                        fontFamily: 'monospace',
                        color: '#475569',
                        textAlign: 'center',
                        border: '1px solid #1e293b',
                        borderRadius: 4,
                    }}>
                        spectating
                    </div>
                )}
            </div>
        </div>
    );
}

function btnStyle(color: string): React.CSSProperties {
    return {
        background: 'transparent',
        border: `1px solid ${color}`,
        color,
        borderRadius: 4,
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        letterSpacing: '0.05em',
        fontFamily: 'monospace',
        width: '100%',
    };
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
// Replace the entire AdminPanel component in Dashboard.tsx with this:

function AdminPanel({ onForceRelease }: { onForceRelease: (sat: string) => void }) {
    const [state, setState] = useState<{ reservations: ReservationState; connected: ConnectedUser[] } | null>(null);
    const [invites, setInvites] = useState<string[]>([]);
    const [newEmail, setNewEmail] = useState('');
    const [inviteError, setInviteError] = useState('');
    const [loading, setLoading] = useState(false);

    const refresh = async () => {
        setLoading(true);
        try {
            const [stateRes, inviteRes] = await Promise.all([
                api.get('/admin/state'),
                api.get('/admin/invites'),
            ]);
            setState(stateRes.data);
            setInvites(inviteRes.data.emails);
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
        const iv = setInterval(refresh, 5000);
        return () => clearInterval(iv);
    }, []);

    const handleAddInvite = async () => {
        setInviteError('');
        if (!newEmail.trim()) return;
        try {
            await api.post('/admin/invites', { email: newEmail.trim() });
            setNewEmail('');
            refresh();
        } catch (e: any) {
            setInviteError(e.response?.data?.error ?? 'Failed to add');
        }
    };

    const handleRevokeInvite = async (email: string) => {
        try {
            await api.delete(`/admin/invites/${encodeURIComponent(email)}`);
            refresh();
        } catch (e: any) {
            alert(e.response?.data?.error ?? 'Failed to revoke');
        }
    };

    const row: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '7px 0',
        borderBottom: '1px solid #1e293b',
        fontSize: 12,
        fontFamily: 'monospace',
    };

    return (
        <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: 20,
            marginTop: 16,
        }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#f59e0b', letterSpacing: '0.1em' }}>
                    ADMIN
                </span>
                <button
                    onClick={refresh}
                    style={{ background: 'transparent', border: '1px solid #334155', color: '#64748b', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace' }}
                >
                    {loading ? '...' : 'REFRESH'}
                </button>
            </div>

            {/* Reservations */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.1em', marginBottom: 8, fontFamily: 'monospace' }}>
                    RESERVATIONS
                </div>
                {SATELLITES.map((sat) => {
                    const res = state?.reservations[sat];
                    return (
                        <div key={sat} style={row}>
                            <span style={{ color: '#94a3b8', width: 48 }}>{SAT_LABELS[sat]}</span>
                            {res ? (
                                <>
                                    <span style={{ color: '#e2e8f0', flex: 1, paddingLeft: 12 }}>{res.email}</span>
                                    <span style={{ color: '#64748b', paddingRight: 16 }}>{formatTimeLeft(res.expiresAt)}</span>
                                    <button
                                        onClick={() => onForceRelease(sat)}
                                        style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace' }}
                                    >
                                        FORCE RELEASE
                                    </button>
                                </>
                            ) : (
                                <span style={{ color: '#22c55e', flex: 1, paddingLeft: 12 }}>available</span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Connected users */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.1em', marginBottom: 8, fontFamily: 'monospace' }}>
                    CONNECTED ({state?.connected.length ?? 0})
                </div>
                {!state?.connected.length && (
                    <div style={{ fontSize: 12, color: '#334155', fontFamily: 'monospace' }}>No active connections</div>
                )}
                {state?.connected.map((u) => (
                    <div key={u.id} style={row}>
                        <span style={{ color: '#e2e8f0' }}>{u.email}</span>
                        <span style={{ color: '#334155' }}>{u.id.slice(0, 8)}</span>
                    </div>
                ))}
            </div>

            {/* Invite management */}
            <div>
                <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.1em', marginBottom: 10, fontFamily: 'monospace' }}>
                    INVITED USERS ({invites.length})
                </div>

                {/* Add new email */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => { setNewEmail(e.target.value); setInviteError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddInvite()}
                        placeholder="new@email.com"
                        style={{
                            flex: 1,
                            background: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: 4,
                            padding: '6px 10px',
                            color: '#e2e8f0',
                            fontSize: 12,
                            fontFamily: 'monospace',
                            outline: 'none',
                        }}
                    />
                    <button
                        onClick={handleAddInvite}
                        style={{
                            background: 'transparent',
                            border: '1px solid #22c55e',
                            color: '#22c55e',
                            borderRadius: 4,
                            padding: '6px 14px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        + ADD
                    </button>
                </div>
                {inviteError && (
                    <div style={{ fontSize: 11, color: '#ef4444', fontFamily: 'monospace', marginBottom: 8 }}>
                        {inviteError}
                    </div>
                )}

                {/* Scrollable invite list */}
                <div style={{
                    maxHeight: 200,
                    overflowY: 'auto',
                    border: '1px solid #1e293b',
                    borderRadius: 4,
                }}>
                    {invites.length === 0 && (
                        <div style={{ padding: '12px', fontSize: 12, color: '#334155', fontFamily: 'monospace' }}>
                            No invited users
                        </div>
                    )}
                    {invites.map((email) => (
                        <div key={email} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 12px',
                            borderBottom: '1px solid #1e293b',
                            fontSize: 12,
                            fontFamily: 'monospace',
                        }}>
                            <span style={{ color: '#e2e8f0' }}>{email}</span>
                            <button
                                onClick={() => handleRevokeInvite(email)}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid #ef4444',
                                    color: '#ef4444',
                                    borderRadius: 4,
                                    padding: '2px 10px',
                                    fontSize: 11,
                                    cursor: 'pointer',
                                    fontFamily: 'monospace',
                                    marginLeft: 12,
                                }}
                            >
                                REVOKE
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── D-Pad ────────────────────────────────────────────────────────────────────

function DPad({ send, disabled }: { send: (btn: string, pressed: boolean) => void; disabled: boolean }) {
    const dBtn = (dir: string, label: string) => (
        <button
            disabled={disabled}
            style={{
                width: 56, height: 56, fontSize: 20,
                background: '#1e293b', color: disabled ? '#334155' : '#e2e8f0',
                border: '1px solid #334155', borderRadius: 6,
                cursor: disabled ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                touchAction: 'none',
            }}
            onMouseDown={() => send(dir, true)}
            onMouseUp={() => send(dir, false)}
            onMouseLeave={() => send(dir, false)}
            onTouchStart={(e) => { e.preventDefault(); send(dir, true); }}
            onTouchEnd={(e) => { e.preventDefault(); send(dir, false); }}
        >
            {label}
        </button>
    );

    return (
        <div>
            <div style={{ textAlign: 'center', marginBottom: 6, fontSize: 11, color: '#475569', fontFamily: 'monospace', letterSpacing: '0.1em' }}>D-PAD</div>
            <div style={{ display: 'grid', gridTemplateColumns: '56px 56px 56px', gridTemplateRows: '56px 56px 56px', gap: 4 }}>
                <div />{dBtn('UP', '↑')}<div />
                {dBtn('LEFT', '←')}
                <div style={{ width: 56, height: 56, background: '#0f172a', borderRadius: 6, border: '1px solid #1e293b' }} />
                {dBtn('RIGHT', '→')}
                <div />{dBtn('DOWN', '↓')}<div />
            </div>
        </div>
    );
}

// ─── Action Buttons ───────────────────────────────────────────────────────────

function ActionButtons({ send, disabled }: { send: (btn: string, pressed: boolean) => void; disabled: boolean }) {
    const makeBtn = (label: string, key: string) => (
        <button
            disabled={disabled}
            style={{
                width: 64, height: 36,
                background: '#1e293b', color: disabled ? '#334155' : '#e2e8f0',
                border: '1px solid #334155', borderRadius: 6,
                cursor: disabled ? 'default' : 'pointer',
                fontSize: 12, fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.05em',
                touchAction: 'none',
            }}
            onMouseDown={() => send(key, true)}
            onMouseUp={() => send(key, false)}
            onMouseLeave={() => send(key, false)}
            onTouchStart={(e) => { e.preventDefault(); send(key, true); }}
            onTouchEnd={(e) => { e.preventDefault(); send(key, false); }}
        >
            {label}
        </button>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#475569', fontFamily: 'monospace', letterSpacing: '0.1em' }}>ACTIONS</div>
            <div style={{ display: 'flex', gap: 8 }}>
                {makeBtn('BACK', 'BACK')}
                {makeBtn('START', 'START')}
                {makeBtn('WHIP', 'WHIP')}
                {makeBtn('HOLD', 'HOLD')}
            </div>
            <button
                disabled={disabled}
                style={{
                    width: 96, height: 96, borderRadius: '50%',
                    background: disabled ? '#0f172a' : '#1e3a5f',
                    color: disabled ? '#334155' : '#60a5fa',
                    border: `2px solid ${disabled ? '#1e293b' : '#3b82f6'}`,
                    cursor: disabled ? 'default' : 'pointer',
                    fontSize: 28, fontWeight: 700, fontFamily: 'monospace',
                    touchAction: 'none',
                }}
                onMouseDown={() => send('A', true)}
                onMouseUp={() => send('A', false)}
                onMouseLeave={() => send('A', false)}
                onTouchStart={(e) => { e.preventDefault(); send('A', true); }}
                onTouchEnd={(e) => { e.preventDefault(); send('A', false); }}
            >
                A
            </button>
        </div>
    );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard({ email, onLogout }: Props) {
    const [activeSat, setActiveSat] = useState('sat1');
    const [reservationState, setReservationState] = useState<ReservationState>({});
    const [socketStatus, setSocketStatus] = useState('connecting...');
    const socketRef = useRef<Socket | null>(null);
    const socketIdRef = useRef<string>('');
    const isAdmin = ADMIN_EMAILS.includes(email);

    const myReservation = Object.entries(reservationState).find(
        ([, r]) => r?.email === email
    )?.[0] ?? null;

    const canControl = myReservation === activeSat;

    // Socket setup
    useEffect(() => {
        const socket = io(SOCKET_URL, {
            withCredentials: true,
            transports: ['polling'],
        });
        socketRef.current = socket;
        socket.on('connect', () => {
            console.log('Socket connected:', socket.id, 'transport:', socket.io.engine.transport.name);
        });

        socket.on('connect_error', (err) => {
            console.error('Socket connect error:', err.message, err);
        });

        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
        });

        socket.on('connect', () => {
            socketIdRef.current = socket.id ?? '';
            setSocketStatus(`connected via ${socket.io.engine.transport.name}`);
        });

        socket.on('connect_error', (err) => {
            setSocketStatus(`error: ${err.message}`);
        });

        socket.on('disconnect', (reason) => {
            setSocketStatus(`disconnected: ${reason}`);
        });
        socket.on('connect_error', (err) => console.error('Socket error:', err.message));
        socket.on('reservations', (state: ReservationState) => setReservationState(state));
        socket.on('error', (err: { message: string }) => console.warn('Socket:', err.message));

        const heartbeat = setInterval(() => socket.emit('heartbeat'), 30000);
        return () => { clearInterval(heartbeat); socket.disconnect(); };
    }, []);

    // Keyboard controls — only active when controlling
    useEffect(() => {
        if (!canControl) return;

        const send = (btn: string, pressed: boolean) =>
            socketRef.current?.emit('controller', { satellite: activeSat, button: btn, pressed });

        const down = (e: KeyboardEvent) => {
            if (e.repeat) return;
            switch (e.code) {
                case 'KeyW': send('UP', true); break;
                case 'KeyS': send('DOWN', true); break;
                case 'KeyA': send('LEFT', true); break;
                case 'KeyD': send('RIGHT', true); break;
                case 'KeyC': send('WHIP', true); break;
                case 'KeyX': send('HOLD', true); break;
                case 'Space':  e.preventDefault(); send('A', true); break;
                case 'Enter':  e.preventDefault(); send('START', true); break;
                case 'Escape': e.preventDefault(); send('BACK', true); break;
            }
        };

        const up = (e: KeyboardEvent) => {
            switch (e.code) {
                case 'KeyW': send('UP', false); break;
                case 'KeyS': send('DOWN', false); break;
                case 'KeyA': send('LEFT', false); break;
                case 'KeyD': send('RIGHT', false); break;
                case 'KeyC': send('WHIP', false); break;
                case 'KeyX': send('HOLD', false); break;
                case 'Space':  send('A', false); break;
                case 'Enter':  send('START', false); break;
                case 'Escape': send('BACK', false); break;
            }
        };

        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
        };
    }, [canControl, activeSat]);

    const send = (btn: string, pressed: boolean) => {
        if (!canControl) return;
        socketRef.current?.emit('controller', { satellite: activeSat, button: btn, pressed });
    };

    // Clicking a sat card switches feed AND controller target atomically
    const handleSelectSat = (sat: string) => {
        setActiveSat(sat);
    };

    const handleReserve = async (sat: string) => {
        try {
            await api.post(`/reservations/${sat}`, { socketId: socketIdRef.current });
            // Auto-switch to the satellite you just reserved
            setActiveSat(sat);
        } catch (e: any) {
            alert(e.response?.data?.error ?? 'Could not reserve');
        }
    };

    const handleRelease = async (sat: string) => {
        try {
            await api.delete(`/reservations/${sat}`);
        } catch (e: any) {
            alert(e.response?.data?.error ?? 'Could not release');
        }
    };

    const handleForceRelease = async (sat: string) => {
        try {
            await api.delete(`/admin/reservations/${sat}`);
        } catch (e: any) {
            alert(e.response?.data?.error ?? 'Force release failed');
        }
    };

    const handleLogout = async () => {
        await api.post('/auth/logout');
        onLogout();
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: '#020817',
            color: '#e2e8f0',
            fontFamily: 'system-ui, sans-serif',
            padding: 16,
            boxSizing: 'border-box',
        }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #1e293b', paddingBottom: 12 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 18, color: '#f59e0b', letterSpacing: '0.1em' }}>
                    DERBY OWNERS CLUB
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {isAdmin && (
                        <span style={{ fontSize: 10, color: '#f59e0b', fontFamily: 'monospace', border: '1px solid #f59e0b', borderRadius: 3, padding: '1px 6px' }}>
                            ADMIN
                        </span>
                    )}
                    <span style={{ fontSize: 12, color: '#475569', fontFamily: 'monospace' }}>{email}</span>
                    <button
                        onClick={handleLogout}
                        style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'monospace' }}
                    >
                        LOG OUT
                    </button>
                </div>
            </div>
            <div style={{ 
                fontSize: 11, 
                color: '#f59e0b', 
                fontFamily: 'monospace', 
                marginBottom: 8,
                padding: '4px 0'
            }}>
                SOCKET: {socketStatus}
            </div>

            {/* Master Screens */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                {['masterLeft', 'masterRight'].map((stream, i) => (
                    <div key={stream}>
                        <div style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 4 }}>
                            MASTER {i + 1}
                        </div>
                        <iframe
                            title={stream}
                            src={`${MEDIA_URL}/${stream}/`}
                            width="100%"
                            height="220"
                            allow="autoplay; fullscreen; picture-in-picture; display-capture; camera; microphone"
                            allowFullScreen
                            style={{ border: '1px solid #1e293b', background: '#000', display: 'block', borderRadius: 4 }}
                        />
                    </div>
                ))}
            </div>

            {/* Satellite Feed + Cards side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 10, marginBottom: 12, alignItems: 'start' }}>

                {/* Big feed */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                            {SAT_LABELS[activeSat]} FEED
                        </span>
                        {canControl
                            ? <span style={{ fontSize: 10, color: '#22c55e', fontFamily: 'monospace', fontWeight: 700 }}>● LIVE CONTROL</span>
                            : myReservation
                            ? <span style={{ fontSize: 10, color: '#f59e0b', fontFamily: 'monospace' }}>● RESERVED: {SAT_LABELS[myReservation]}</span>
                            : <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>● SPECTATING</span>
                        }
                    </div>
                    <iframe
                        title="satellite"
                        src={`${MEDIA_URL}/${activeSat}/`}
                        width="100%"
                        height="420"
                        allow="autoplay; fullscreen; picture-in-picture; display-capture; camera; microphone"
                        allowFullScreen
                        style={{ border: '1px solid #1e293b', background: '#000', display: 'block', borderRadius: 4 }}
                    />
                </div>

                {/* Satellite cards — vertical stack */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 22 }}>
                    {SATELLITES.map((sat) => (
                        <SatCard
                            key={sat}
                            id={sat}
                            reservation={reservationState[sat] ?? null}
                            myEmail={email}
                            isActive={activeSat === sat}
                            isControlling={canControl && activeSat === sat}
                            onSelect={() => handleSelectSat(sat)}
                            onReserve={() => handleReserve(sat)}
                            onRelease={() => handleRelease(sat)}
                        />
                    ))}
                </div>
            </div>

            {/* Controls */}
            <div style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: 20,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 40,
            }}>
                <DPad send={send} disabled={!canControl} />

                <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: '#475569', fontFamily: 'monospace' }}>
                    {!canControl ? (
                        <div style={{ lineHeight: 2 }}>
                            {myReservation
                                ? <>You control <span style={{ color: '#f59e0b' }}>{SAT_LABELS[myReservation]}</span><br />click its card to switch feed</>
                                : 'Reserve a satellite to take control'
                            }
                        </div>
                    ) : (
                        <div style={{ lineHeight: 1.9 }}>
                            <div style={{ color: '#64748b', marginBottom: 4, letterSpacing: '0.05em', fontSize: 11 }}>KEYBOARD</div>
                            <div>WASD → D-Pad</div>
                            <div>Space → A</div>
                            <div>C → Whip</div>
                            <div>X → Hold</div>
                            <div>Enter → Start</div>
                            <div>Esc → Back</div>
                        </div>
                    )}
                </div>

                <ActionButtons send={send} disabled={!canControl} />
            </div>

            {/* Admin Panel */}
            {isAdmin && <AdminPanel onForceRelease={handleForceRelease} />}
        </div>
    );
}