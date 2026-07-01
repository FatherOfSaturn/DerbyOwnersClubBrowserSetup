import { useState } from 'react';
import { api } from './api';

export default function Login() {

    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');

    const sendLink = async () => {

        try {

            await api.post('/auth/request-link', {
                email
            });

            setMessage(
                'Magic link created. Check backend console.'
            );

        } catch {

            setMessage(
                'Email is not invited.'
            );
        }
    };

    return (
        <div
            style={{
                maxWidth: '400px',
                margin: '100px auto',
                textAlign: 'center'
            }}
        >
            <h1>Derby Owners Club</h1>

            <input
                style={{
                    width: '100%',
                    padding: '10px',
                    marginBottom: '10px'
                }}
                value={email}
                onChange={(e) =>
                    setEmail(e.target.value)
                }
                placeholder="Email"
            />

            <button
                onClick={sendLink}
            >
                Send Magic Link
            </button>

            <p>{message}</p>
        </div>
    );
}