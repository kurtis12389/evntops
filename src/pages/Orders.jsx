import { useState } from 'react';
import { useStore, isOverdue, STAGES, STAGE_LABEL } from '../lib/store.jsx';
import { Hero, fmtDate } from '../components/ui.jsx';

export default function Orders() {
  const s = useStore();
  const site = s.currentSite;
  const initial = location.hash.split('?')[1];
  const [stage, setStage] = useState(STAGES.includes(initial) ? initial : 'active');
  const orders = s.orders
    .filter((o) => o.site_id === site?.id)
    .filter((o) => stage === 'all' || (stage === 'active' ? !['checked', 'cancelled'].includes(o.status) : o.status === stage))
    .sort((a, b) => (a.out_date < b.out_date ? -1 : 1));
  const linesOf = (id) => s.lines.filter((l) => l.order_id === id);

  return (
    <section className="band">
      <div className="wrap">
        <Hero eyebrow={site?.code} title="Orders" lede="Each order makes a picking list and moves through the stages as kit is packed, collected, returned and checked.">
          {s.isStaff && <div className="row"><a className="btn solid" href="#/orders/new">New order</a></div>}
        </Hero>
        <div className="chips" role="group" aria-label="Stage">
          {[['active', 'Active'], ...STAGES.map((x) => [x, STAGE_LABEL[x]]), ['all', 'All']].map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={stage === k} onClick={() => setStage(k)}>{l}</button>
          ))}
        </div>
        <div className="list">
          {orders.map((o) => {
            const ls = linesOf(o.id);
            const qty = ls.reduce((n, l) => n + l.qty, 0);
            const picked = ls.reduce((n, l) => n + l.picked_qty, 0);
            const back = ls.reduce((n, l) => n + l.returned_qty, 0);
            const late = isOverdue(o, s.today);
            return (
              <a className="list-row" key={o.id} href={`#/order/${o.id}`}>
                <div style={{ minWidth: 0 }}>
                  <div className="title">{o.ref} · {o.title}</div>
                  <div className="meta tabular">
                    {fmtDate(o.out_date)} to {fmtDate(o.due_date)}{o.venue ? ` · ${o.venue}` : ''} ·{' '}
                    {['picking', 'ready'].includes(o.status) ? `${picked} of ${qty} picked` : `${back} of ${picked || qty} back`}
                  </div>
                </div>
                <span className={'tag ' + (late ? 'out' : o.status === 'checked' ? 'available' : '')}>{late ? 'Overdue' : STAGE_LABEL[o.status]}</span>
              </a>
            );
          })}
          {!orders.length && <p className="empty">No orders here yet.</p>}
        </div>
      </div>
    </section>
  );
}
