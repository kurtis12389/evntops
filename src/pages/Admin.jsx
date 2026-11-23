import { useState } from 'react';
import { useStore, STAGES, STAGE_LABEL, isOverdue } from '../lib/store.jsx';
import { supabase, friendlyError } from '../lib/supabase.js';
import { Hero, fmtDate } from '../components/ui.jsx';

const ROLES = [['admin', 'Admin'], ['staff', 'Staff'], ['viewer', 'Viewer'], ['pending', 'Not approved']];

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function Admin() {
  const s = useStore();
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  if (!s.isAdmin) return <section className="band"><div className="wrap"><p className="empty">Admins only.</p></div></section>;

  const setRole = async (id, role) => {
    setErr('');
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    if (error) setErr(friendlyError(error)); else s.refresh();
  };
  const toggleSite = async (site) => {
    const { error } = await supabase.from('sites').update({ active: !site.active }).eq('id', site.id);
    if (error) setErr(friendlyError(error)); else s.refresh();
  };
  const exportAll = async () => {
    setErr(''); setMsg('Preparing export…');
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      for (const t of ['items', 'orders', 'order_lines', 'order_events', 'item_notes', 'sites']) {
        const { data, error } = await supabase.from(t).select('*').limit(10000);
        if (error) throw error;
        download(`evntops-${t}-${stamp}.csv`, toCsv(data));
      }
      setMsg('Export downloaded: one spreadsheet file per list.');
    } catch (e) { setErr(friendlyError(e)); setMsg(''); }
  };

  const active = s.orders.filter((o) => !['checked', 'cancelled'].includes(o.status));
  const pendingPeople = s.profiles.filter((p) => p.role === 'pending');

  return (
    <>
      <section className="band">
        <div className="wrap">
          <Hero eyebrow="Admin" title="Every order, every site" lede="All active orders across sites by stage. Overdue dates are highlighted." />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Order</th><th>Site</th><th>Dates</th>{STAGES.slice(0, 4).map((st, i) => <th key={st}>0{i + 1}. {STAGE_LABEL[st]}</th>)}</tr></thead>
              <tbody>
                {active.map((o) => {
                  const idx = STAGES.indexOf(o.status);
                  const site = s.sites.find((x) => x.id === o.site_id);
                  return (
                    <tr key={o.id}>
                      <td><a href={`#/order/${o.id}`}>{o.ref} · {o.title}</a></td>
                      <td className="small">{site?.code}</td>
                      <td className="small">{isOverdue(o, s.today) ? <span className="flag">{fmtDate(o.out_date)} to {fmtDate(o.due_date)}, overdue</span> : <>{fmtDate(o.out_date)} to {fmtDate(o.due_date)}</>}</td>
                      {STAGES.slice(0, 4).map((st, i) => <td key={st} aria-label={i <= idx ? 'done' : ''}>{i < idx ? <span style={{ color: 'var(--green)' }}>●</span> : i === idx ? <span className="pink">●</span> : <span className="muted">○</span>}</td>)}
                    </tr>
                  );
                })}
                {!active.length && <tr><td colSpan={7} className="muted">No active orders.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="band green">
        <div className="wrap">
          <div className="hero"><h2>People</h2>
            <div className="hero-side"><hr className="rule" /><p className="lede small muted" style={{ margin: 0 }}>New sign-ups wait as Not approved. Staff can scan and run orders; viewers can only look.</p></div></div>
          {pendingPeople.length > 0 && <p className="notice">{pendingPeople.length} person waiting for approval.</p>}
          <div className="list">
            {s.profiles.map((p) => (
              <div className="list-row" key={p.id}>
                <div className="title">{p.full_name || 'No name'}{p.id === s.profile.id ? ' (you)' : ''}</div>
                <select aria-label={`Role for ${p.full_name}`} value={p.role} onChange={(e) => setRole(p.id, e.target.value)} disabled={p.id === s.profile.id} style={{ width: 'auto' }}>
                  {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <h2>Sites</h2>
          <div className="cols">
            {s.sites.map((site, i) => (
              <div className="col" key={site.id}>
                <span className="num">0{i + 1}.</span>
                <h3>{site.name}</h3>
                <span className="small muted">{s.items.filter((x) => x.site_id === site.id).length} items · {site.active ? 'In use' : 'Switched off'}</span>
                <div><button className="btn ghost" onClick={() => toggleSite(site)}>{site.active ? 'Switch off' : 'Switch on'}</button></div>
              </div>
            ))}
          </div>
          <div className="hero" style={{ marginTop: 16 }}>
            <h2>Backup</h2>
            <div className="hero-side"><hr className="rule" /><p className="lede small muted" style={{ margin: 0 }}>The free plan has no automatic backups. Download everything as spreadsheets once a month.</p></div>
          </div>
          <div className="row"><button className="btn solid" onClick={exportAll} disabled={!s.online}>Export everything</button>{msg && <span className="small">{msg}</span>}</div>
          {err && <p className="error">{err}</p>}
        </div>
      </section>
    </>
  );
}
