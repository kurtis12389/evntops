import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

/**
 * Camera QR scanner with a typed fallback.
 * Calls onCode(code) for each new code; the same code is ignored for 2.5s so one label isn't counted twice.
 */
export default function Scanner({ onCode }) {
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState('');
  const [typed, setTyped] = useState('');
  const qr = useRef(null);
  const last = useRef({ code: '', at: 0 });
  const cb = useRef(onCode);
  cb.current = onCode;

  const handle = (raw) => {
    const code = String(raw).trim().toUpperCase();
    const now = Date.now();
    if (code === last.current.code && now - last.current.at < 2500) return;
    last.current = { code, at: now };
    if (navigator.vibrate) navigator.vibrate(60);
    cb.current(code);
  };

  const start = async () => {
    setErr('');
    try {
      qr.current = new Html5Qrcode('reader', { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128], verbose: false });
      await qr.current.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } }, handle, () => {});
      setRunning(true);
    } catch (e) {
      setErr('Camera not available. Allow camera access, or type the label code below.');
      setRunning(false);
    }
  };
  const stop = async () => {
    try { if (qr.current?.isScanning) await qr.current.stop(); } catch { /* already stopped */ }
    setRunning(false);
  };
  useEffect(() => () => { stop(); }, []);

  return (
    <div className="field" style={{ gap: 12 }}>
      <div className="scanner" hidden={!running}><div id="reader" /></div>
      <div className="row">
        {!running ? <button className="btn solid" type="button" onClick={start}>Start camera</button>
          : <button className="btn ghost" type="button" onClick={stop}>Stop camera</button>}
      </div>
      {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
      <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { handle(typed); setTyped(''); } }}>
        <div className="field" style={{ flex: '1 1 160px' }}>
          <label htmlFor="typed-code">Or type a label code</label>
          <input id="typed-code" type="text" placeholder="EVN-0001" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" />
        </div>
        <button className="btn" type="submit">Add</button>
      </form>
    </div>
  );
}
