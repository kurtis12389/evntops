import { useState } from 'react';
import { useStore, STAGE_LABEL, isOverdue } from '../lib/store.jsx';
import { supabase, friendlyError } from '../lib/supabase.js';
import { queueScan, dismissScan } from '../lib/offline.js';
import Scanner from '../components/Scanner.jsx';
import { Hero, StageTrack, Explore, fmtDate, fmtDateTime } from '../components/ui.jsx';

const NEXT = {
  picking: { to: 'ready', label: 'Mark ready', hint: 'Everything is packed and waiting to be collected.' },
  ready: { to: 'collected', label: 'Mark collected', hint: 'Record who is taking it.' },
  collected: { to: 'returned', label: 'Mark returned', hint: 'The kit has been dropped back at the site.' },
  returned: { to: 'checked', label: 'Mark checked', hint: 'Every item has been scanned back in and looked over.' }
};

export default function OrderPage({ id }) {
  const s = useStore();
  const order = s.orders.find((o) => o.id === id);
  const [flash, setFlash] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [collector, setCollector] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [addId, setAddId] = useState('');

  if (!order) return <section className="band"><div className="wrap"><p className="empty">Order not found. It may be older than 120 days.</p><Explore href="#/orders">All orders</Explore></div></section>;

  const lines = s.lines.filter((l) => l.order_id === order.id).sort((a, b) => (s.itemById[a.item_id]?.name || '').localeCompare(s.itemById[b.item_id]?.name || ''));
  const mode = order.status === 'picking' || order.status === 'ready' ? 'pick' : order.status === 'returned' || order.status === 'collected' ? 'return' : null;
  const allPicked = lines.length > 0 && lines.every((l) => l.picked_qty >= l.qty);
  const missing = lines.filter((l) => l.returned_qty < l.picked_qty);
  const failedScans = s.queue.filter((q) => q.order_id === order.id && q.error);
  const events = s.events.filter((e) => e.order_id === order.id);
  const late = isOverdue(order, s.today);

  const onCode = (code) => {
    setErr('');
    const item = s.items.find((i) => i.label_code.toUpperCase() === code);
    if (!item) { setFlash({ ok: false, text: `${code} isn't a known label.` }); return; }
    const line = lines.find((l) => l.item_id === item.id);
    if (mode === 'return' && !line) { setFlash({ ok: false, text: `${item.name} isn't on this order.` }); return; }
    if (mode === 'pick' && item.site_id !== order.site_id) { setFlash({ ok: false, text: `${item.name} belongs to another site.` }); return; }
    if (item.is_bulk) {
      const remaining = mode === 'pick' ? (line ? line.qty - line.picked_qty : 1) : (line ? line.picked_qty - line.returned_qty : 0);
      setBulk({ item, qty: Math.max(remaining, 1) });
      return;
    }
    if (line && mode === 'pick' && line.picked_qty >= line.qty) { setFlash({ ok: false, text: `${item.name} is already picked.` }); return; }
    if (line && mode === 'return' && line.returned_qty >= Math.max(line.picked_qty, 1)) { setFlash({ ok: false, text: `${item.name} is already back.` }); return; }
    queueScan({ orderId: order.id, label: item.label_code, kind: mode, qty: 1 });
    setFlash({ ok: true, text: `${item.name} ${mode === 'pick' ? 'picked' : 'back in'}${line ? '' : ' and added to the order'}${s.online ? '' : ' · saved, will sync'}` });
  };

  const confirmBulk = (e) => {
    e.preventDefault();
    const n = parseInt(bulk.qty, 10);
    if (!(n > 0)) return;
    queueScan({ orderId: order.id, label: bulk.item.label_code, kind: mode, qty: n });
    setFlash({ ok: true, text: `${n} × ${bulk.item.name} ${mode === 'pick' ? 'picked' : 'back in'}${s.online ? '' : ' · saved, will sync'}` });
    setBulk(null);
  };

  const move = async (to) => {
    setErr(''); setBusy(true);
    const { error } = await supabase.rpc('set_order_status', { p_order: order.id, p_status: to, p_collected_by: to === 'collected' ? collector.trim() : null });
    setBusy(false);
    if (error) setErr(friendlyError(error)); else s.refresh();
  };
  const updateLine = async (l, patch) => {
    setErr('');
    const { error } = await supabase.from('order_lines').update(patch).eq('id', l.id);
    if (error) setErr(friendlyError(error)); else s.refresh();
  };
  const removeLine = async (l) => {
    const { error } = await supabase.from('order_lines').delete().eq('id', l.id);
    if (error) setErr(friendlyError(error)); else s.refresh();
  };
  const addLine = async () => {
    if (!addId) return;
    const { error } = await supabase.from('order_lines').insert({ order_id: order.id, item_id: addId, qty: 1 });
    if (error) setErr(friendlyError(error)); else { setAddId(''); s.refresh(); }
  };
  const resolveLine = async (l) => {
    await updateLine(l, { resolved: true });
    const it = s.itemById[l.item_id];
    if (it && !it.is_bulk && it.status === 'missing') await supabase.from('items').update({ status: 'available' }).eq('id', it.id);
    s.refresh();
  };

  const next = NEXT[order.status];
  const canMove = s.isStaff && next && s.online && !busy &&
    (order.status !== 'picking' || allPicked || s.isAdmin) &&
    (order.status !== 'ready' || collector.trim() || order.collected_by);

  return (
    <>
      <section className="band">
        <div className="wrap">
          <Hero eyebrow={order.ref} title={order.title}
            lede={`${fmtDate(order.out_date)} to ${fmtDate(order.due_date)}${order.venue ? ` · ${order.venue}` : ''}${order.collected_by ? ` · collected by ${order.collected_by}` : ''}`}>
            <div className="row">
              {late && <span className="tag out">Overdue</span>}
              <button className="btn ghost no-print" onClick={() => window.print()}>Print picking list</button>
            </div>
          </Hero>
          <StageTrack status={order.status} />
          {order.notes && <p className="muted" style={{ maxWidth: '65ch', margin: 0 }}>{order.notes}</p>}
        </div>
      </section>

      {s.isStaff && mode && (
        <section className="band green no-print">
          <div className="wrap">
            <div className="hero">
              <h2>{mode === 'pick' ? 'Scan kit out' : 'Scan kit back in'}</h2>
              <div className="hero-side"><hr className="rule" />
                <p className="lede small muted" style={{ margin: 0 }}>{mode === 'pick'
                  ? 'Scan each label as you pack it. Kit not on the list is added. Works without signal; scans sync when you are back online.'
                  : 'Scan each label as it comes off the van. Works without signal; scans sync when you are back online.'}</p></div>
            </div>
            {order.status === 'collected' && <p className="notice">Scanning kit back in will mark this order returned once you press Mark returned below.</p>}
            <Scanner onCode={onCode} />
            {flash && <div className={'scan-flash ' + (flash.ok ? 'ok' : 'bad')} role="status">{flash.text}</div>}
            {bulk && (
              <form className="row" onSubmit={confirmBulk}>
                <div className="field" style={{ maxWidth: 200 }}><label htmlFor="bulk-qty">How many {bulk.item.name}?</label>
                  <input id="bulk-qty" type="number" min="1" value={bulk.qty} onChange={(e) => setBulk({ ...bulk, qty: e.target.value })} autoFocus /></div>
                <button className="btn solid" type="submit">Confirm</button>
                <button className="btn ghost" type="button" onClick={() => setBulk(null)}>Cancel</button>
              </form>
            )}
            {failedScans.map((f) => (
              <div className="notice warn" key={f.client_id}>
                {f.label}: {friendlyError({ message: f.error })} <button className="explore" onClick={() => dismissScan(f.client_id)}>Dismiss</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="band">
        <div className="wrap">
          <div className="spread"><h2>Picking list</h2><span className="small muted tabular">{lines.length} line{lines.length === 1 ? '' : 's'}</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th className="hide-sm">Label</th><th className="hide-sm">Shelf</th><th className="tabular">Need</th><th className="tabular">Out</th><th className="tabular">Back</th><th className="no-print"></th></tr></thead>
              <tbody>
                {lines.map((l) => {
                  const it = s.itemById[l.item_id] || {};
                  const short = ['returned', 'checked'].includes(order.status) && l.returned_qty < l.picked_qty;
                  return (
                    <tr key={l.id}>
                      <td><a href={`#/item/${it.id}`}>{it.name}</a><span className="show-sm small muted"> {it.label_code}{it.shelf ? ` · ${it.shelf}` : ''}</span>{l.pending ? <span className="small pink"> · {l.pending} waiting to sync</span> : null}{l.damaged ? <span className="tag repair" style={{ marginLeft: 6 }}>Damaged</span> : null}</td>
                      <td className="small hide-sm">{it.label_code}</td>
                      <td className="small hide-sm">{it.shelf || ''}</td>
                      <td className="tabular">{l.qty}</td>
                      <td className="tabular" style={{ color: l.picked_qty >= l.qty ? 'var(--green)' : undefined }}>{l.picked_qty}</td>
                      <td className="tabular">{short ? <span className="flag" title="Short">{l.returned_qty}</span> : l.returned_qty}</td>
                      <td className="no-print">
                        {s.isStaff && order.status === 'picking' && !String(l.id).startsWith('pending') && <button className="explore" onClick={() => removeLine(l)}>Remove</button>}
                        {s.isStaff && order.status === 'returned' && <label className="check small"><input type="checkbox" checked={l.damaged} onChange={(e) => updateLine(l, { damaged: e.target.checked })} /> Damaged</label>}
                        {s.isAdmin && order.status === 'checked' && l.returned_qty < l.qty && !l.resolved && <button className="explore" onClick={() => resolveLine(l)}>Found or written off</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {s.isStaff && ['picking', 'ready'].includes(order.status) && (
            <div className="row no-print">
              <div className="field" style={{ flex: '1 1 240px' }}><label htmlFor="add-item">Add kit by hand</label>
                <select id="add-item" value={addId} onChange={(e) => setAddId(e.target.value)}>
                  <option value="">Choose an item</option>
                  {s.items.filter((i) => i.site_id === order.site_id && i.status !== 'retired' && !lines.some((l) => l.item_id === i.id))
                    .map((i) => <option key={i.id} value={i.id}>{i.label_code} · {i.name}</option>)}
                </select></div>
              <button className="btn" onClick={addLine} disabled={!addId || !s.online}>Add</button>
            </div>
          )}
        </div>
      </section>

      {s.isStaff && next && (
        <section className="band green no-print">
          <div className="wrap">
            <h2>Next: {STAGE_LABEL[next.to]}</h2>
            <p className="lede" style={{ margin: 0 }}>{next.hint}</p>
            {order.status === 'picking' && !allPicked && <p className="small" style={{ margin: 0 }}>{lines.filter((l) => l.picked_qty < l.qty).length} line(s) still to pick.{s.isAdmin ? ' As admin you can mark it ready anyway.' : ''}</p>}
            {order.status === 'ready' && (
              <div className="field" style={{ maxWidth: 360 }}><label htmlFor="collector">Collected by</label>
                <input id="collector" type="text" value={collector} onChange={(e) => setCollector(e.target.value)} placeholder="Name, and phone if a customer" /></div>
            )}
            {order.status === 'returned' && missing.length > 0 && (
              <p className="small" style={{ margin: 0 }}>{missing.reduce((n, l) => n + l.picked_qty - l.returned_qty, 0)} item(s) not scanned back. Checking now flags them as missing.</p>
            )}
            {!s.online && <p className="small" style={{ margin: 0 }}>Moving to the next stage needs signal. Your scans are saved.</p>}
            {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
            <div className="row">
              <button className="btn solid" disabled={!canMove} onClick={() => move(next.to)}>{next.label}</button>
              {order.status === 'ready' && <button className="btn" disabled={!s.online} onClick={() => move('picking')}>Back to picking</button>}
              {['picking', 'ready'].includes(order.status) && <button className="btn danger" disabled={!s.online} onClick={() => move('cancelled')}>Cancel order</button>}
            </div>
          </div>
        </section>
      )}

      <section className="band no-print">
        <div className="wrap">
          <h2>Activity</h2>
          <div className="list">
            {events.map((e) => (
              <div className="list-row" key={e.id}>
                <div><div className="title" style={{ fontSize: 15 }}>{e.from_status ? `${STAGE_LABEL[e.from_status]} to ${STAGE_LABEL[e.to_status]}` : 'Order created'}</div>
                  <div className="meta">{s.nameOf(e.user_id)} · {fmtDateTime(e.at)}</div></div>
              </div>
            ))}
          </div>
          {s.isAdmin && (
            <div className="row">
              <div className="field" style={{ maxWidth: 260 }}><label htmlFor="override">Admin: move to any stage</label>
                <select id="override" value="" onChange={(e) => e.target.value && move(e.target.value)} disabled={!s.online}>
                  <option value="">Choose a stage</option>
                  {['picking', 'ready', 'collected', 'returned', 'checked', 'cancelled'].filter((x) => x !== order.status).map((x) => <option key={x} value={x}>{STAGE_LABEL[x]}</option>)}
                </select></div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
