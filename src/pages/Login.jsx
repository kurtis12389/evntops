import { useState } from 'react';
import { supabase, friendlyError } from '../lib/supabase.js';
import { Ring, Squiggle } from '../components/ui.jsx';

export default function Login() {
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { full_name: name }, emailRedirectTo: location.origin }
        });
        if (error) throw error;
        if (!data.session) setMsg('Check your email and tap the link to confirm, then sign in.');
      }
    } catch (e2) {
      setErr(friendlyError(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="topbar"><div className="topbar-inner"><span className="brand"><span className="brand-star">✦</span> EVNT OPS</span></div></header>
      <section className="band">
        <div className="wrap">
          <div className="hero" style={{ alignItems: 'center' }}>
            <Ring />
            <div className="field" style={{ gap: 14 }}>
              <h1>Kit in. Kit out. Nothing missing.</h1>
              <div className="hero-side"><hr className="rule" /><p className="lede muted small" style={{ margin: 0 }}>Check Evnt Inspirations kit in and out of the BTR container, by order, from your phone.</p></div>
            </div>
          </div>
        </div>
      </section>
      <section className="band green" style={{ position: 'relative' }}>
        <Squiggle style={{ position: 'absolute', top: -30, left: 16 }} />
        <div className="wrap" style={{ maxWidth: 520 }}>
          <h2>{mode === 'in' ? 'Sign in' : 'Create your account'}</h2>
          <form className="field" style={{ gap: 18 }} onSubmit={submit}>
            {mode === 'up' && (
              <div className="field"><label htmlFor="name">Your name</label>
                <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></div>
            )}
            <div className="field"><label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
            <div className="field"><label htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></div>
            {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
            {msg && <p style={{ margin: 0 }}>{msg}</p>}
            <div className="spread">
              <button className="btn solid" disabled={busy} type="submit">{mode === 'in' ? 'Sign in' : 'Create account'}</button>
              <button className="explore" type="button" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr(''); setMsg(''); }}>
                {mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}
