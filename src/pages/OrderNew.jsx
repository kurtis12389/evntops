import { useMemo, useState } from 'react';
import { useStore, stockOf } from '../lib/store.jsx';
import { supabase, friendlyError } from '../lib/supabase.js';
import { Hero } from '../components/ui.jsx';

export default function OrderNew() {
  const s = useStore();
  const site = s.currentSite;
  const [f, setF] = useState({ title: '', venue: '', out_date: s.today, due_date: s.today, notes: '' });
  const [qty, setQty] = useState({});
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const items = useMemo(() => s.items
    .filter((i) => i.site_id === site?.id && i.status !== 'retired')
    .filter((i) => !q.trim() || `${i.name} ${i.label_code} ${i.category}`.toLowerCase().includes(q.trim().toLowerCase())),
  [s.items, site, q]);
  const pastOrders = s.orders.filter((o) => o.site_id === site?.id).slice(0, 20);

  const copyFrom = (orderId) => {
    const next = {};
    s.lines.filter((l) => l.order_id === orderId).forEach((l) => { next[l.item_id] = l.qty; });
    setQty(next);
  };
  const bump = (item, d) => {
    const max = item.is_bulk ? item.quantity : 1;
    const v = Math.min(Math.max((qty[item.id] || 0) + d, 0), max);
    setQty({ ...qty, [item.id]: v });
  };
  const chosen = Object.entries(qty).filter(([, n]) => n > 0);

  const save = async (e) => {
    e.preventDefault(); setErr('');
    if (!chosen.length) { setErr('Add at least one item to the order.'); return; }
    if (f.due_date < f.out_date) { setErr('The return date must be on or after the out date.'); return; }
    setBusy(true);
    try {
      const { data: order, error } = await supabase.from('orders').insert({
        site_id: site.id, title: f.title.trim(), venue: f.venue || null, out_date: f.out_date, due_date: f.due_date, notes: f.notes || null
      }).select().single();
      if (error) throw error;
      const { error: e2 } = await supabase.from('order_lines').insert(chosen.map(([item_id, n]) => ({ order_id: order.id, item_id, qty: n })));
      if (e2) throw e2;
      await s.refresh();
      location.hash = `#/order/${order.id}`;
    } catch (e3) { setErr(friendlyError(e3)); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={save}>
      <section className="band">
        <div className="wrap">
          <Hero eyebrow={site?.code} title="New order" lede="Type in the job from WhatsApp or email, then pick the kit. The picking list is ready as soon as you save." />
          <div className="form-grid">
            <div className="field"><label htmlFor="o-title">Client or event</label>
              <input id="o-title" type="text" required value={f.title} onChange={set('title')} placeholder="Smith wedding" /></div>
            <div className="field"><label htmlFor="o-venue">Venue</label>
              <input id="o-venue" type="text" value={f.venue} onChange={set('venue')} placeholder="Grand Hotel" /></div>
            <div className="field"><label htmlFor="o-out">Goes out</label>
              <input id="o-out" type="date" required value={f.out_date} onChange={set('out_date')} /></div>
            <div className="field"><label htmlFor="o-due">Due back</label>
              <input id="o-due" type="date" required value={f.due_date} onChange={set('due_date')} /></div>
          </div>
          <div className="field"><label htmlFor="o-notes">Notes</label>
            <textarea id="o-notes" value={f.notes} onChange={set('notes')} placeholder="Load-in 4pm, side door" /></div>
        </div>
      </section>
      <section className="band green">
        <div className="wrap">
          <div className="spread">
            <h2>Kit for this order</h2>
            <span className="small tabular">{chosen.length} item{chosen.length === 1 ? '' : 's'} chosen</span>
          </div>
          <div className="form-grid">
            <div className="field"><label htmlFor="o-q">Find kit</label>
              <input id="o-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or label" /></div>
            {pastOrders.length > 0 && (
              <div className="field"><label htmlFor="o-copy">Copy kit from a past order</label>
                <select id="o-copy" defaultValue="" onChange={(e) => e.target.value && copyFrom(e.target.value)}>
                  <option value="">Choose an order</option>
                  {pastOrders.map((o) => <option key={o.id} value={o.id}>{o.ref} · {o.title}</option>)}
                </select></div>
            )}
          </div>
          <div className="list">
            {items.map((i) => {
              const st = stockOf(i, s.availById[i.id]);
              const n = qty[i.id] || 0;
              const short = n > st.free;
              return (
                <div className="list-row" key={i.id}>
                  <div style={{ minWidth: 0 }}>
                    <div className="title">{i.name}</div>
                    <div className="meta">{i.label_code} · {i.category} · <span className="tabular">{st.free} of {st.total} free now</span>
                      {short && <strong style={{ color: 'var(--ink)' }}> · already booked or out, check before promising</strong>}</div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn ghost" style={{ padding: '4px 12px' }} onClick={() => bump(i, -1)} aria-label={`One less ${i.name}`}>−</button>
                    <span className="tabular" style={{ minWidth: 22, textAlign: 'center' }}>{n}</span>
                    <button type="button" className="btn ghost" style={{ padding: '4px 12px' }} onClick={() => bump(i, 1)} aria-label={`One more ${i.name}`}>+</button>
                  </div>
                </div>
              );
            })}
            {!items.length && <p className="empty">No kit found. Add kit first from Stock.</p>}
          </div>
          {err && <p className="error" style={{ color: '#3b0d0d' }}>{err}</p>}
          <div className="row"><button className="btn solid" disabled={busy || !s.online} type="submit">Create order</button>
            {!s.online && <span className="small">Creating orders needs signal.</span>}</div>
        </div>
      </section>
    </form>
  );
}
