import { useEffect, useState } from 'react';
import Login from './Login';
import Dashboard from './Dashboard';
import { api } from './api';

function App() {
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState<string | null>(null);

    useEffect(() => {
        const init = async () => {
            const params = new URLSearchParams(window.location.search);
            const token = params.get('token');

            if (token) {
                try {
                    const res = await api.get(`/auth/login?token=${token}`);
                    setEmail(res.data.email);
                } catch {
                    setEmail(null);
                } finally {
                    window.history.replaceState({}, '', window.location.pathname);
                    setLoading(false);
                }
                return;
            }

            try {
                const res = await api.get('/auth/me');
                if (res.data.authenticated) {
                    setEmail(res.data.email);
                }
            } catch {
                setEmail(null);
            } finally {
                setLoading(false);
            }
        };

        init();
    }, []);

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                background: '#020817',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569',
                fontFamily: 'monospace',
                letterSpacing: '0.1em',
            }}>
                CONNECTING...
            </div>
        );
    }

    if (!email) {
        return <Login />;
    }

    return (
        <Dashboard
            email={email}
            onLogout={() => setEmail(null)}
        />
    );
}

export default App;