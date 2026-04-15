'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const supabase = createSupabaseBrowserClient();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setMessage('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/dashboard`
            : undefined,
      },
    });
    if (error) {
      setStatus('error');
      setMessage(error.message);
    } else {
      setStatus('sent');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="font-mono text-2xl font-semibold tracking-tight block mb-8 text-center"
        >
          Car<span className="text-accent">Scout</span>
        </Link>

        <div className="card p-6">
          <h1 className="text-xl font-semibold mb-1">Welkom terug</h1>
          <p className="text-sm text-muted mb-6">
            Vul je email in. We sturen een veilige login-link.
          </p>

          {status === 'sent' ? (
            <div className="rounded-md bg-good/10 border border-good/40 p-4 text-sm text-good">
              Mail verstuurd naar <strong>{email}</strong>. Klik op de link om in te
              loggen — vergeet je spamfolder niet te checken.
            </div>
          ) : (
            <form onSubmit={send}>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
                placeholder="naam@bedrijf.be"
                autoFocus
              />
              <button
                disabled={status === 'sending'}
                className="btn btn-primary w-full mt-4"
              >
                {status === 'sending' ? 'Versturen…' : 'Stuur magic link'}
              </button>
              {status === 'error' && (
                <p className="mt-3 text-xs text-bad">{message}</p>
              )}
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted mt-6">
          Nog geen account? Vul gewoon je email in — we maken er automatisch een aan.
        </p>
      </div>
    </div>
  );
}
