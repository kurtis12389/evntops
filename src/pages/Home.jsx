import { useStore, stockOf, isOverdue, STAGES, STAGE_LABEL } from '../lib/store.jsx';
import { Hero, Explore, PanelHead, fmtDate } from '../components/ui.jsx';

export default function Home() {
  const s = useStore();
  const site = s.currentSite;
  if (!site) return <section className="band"><div className="wrap"><p className="empty">Loading…</p></div></section>;

  const items = s.items.filter((i) => i.site_id === site.id && i.status !== 'retired');
  const stock = items.map((i) => ({ item: i, ...stockOf(i, s.availById[i.id]) }));
  const freeNow = stock.filter((x) => x.free > 0).length;
  const outNow = stock.filter((x) => x.out > 0).length;
  const orders = s.orders.filter((o) => o.site_id === site.id);
  const overdue = orders.filter((o) => isOverdue(o, s.today));
  const missingLines = s.lines.filter((l) => {
    const o = orders.find((x) => x.id === l.order_id);
    return o && o.status === 'checked' && l.returned_qty < l.qty && !l.resolved;
  });
  const repair = items.filter((i) => i.status === 'repair');
  const chaseCount = overdue.length + missingLines.length + repair.length;
  const byStage = Object.fromEntries(STAGES.map((st) => [st, orders.filter((o) => o.status === st)]));
  const updated = s.lastSync ? `Last updated ${new Date(s.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}${s.online ? '' : ', showing saved data while offline'}` : 'Loading kit…';

  return (
    <section className="band">
      <div className="wrap">
        <Hero eyebrow={site.code} title={site.name} lede={updated}>
          {s.isStaff && <><a className="btn solid" href="#/orders/new">New order</a><a className="btn" href="#/item/new">Add kit</a></>}
        </Hero>

        <div className="stats">
          <a className="stat" href="#/stock"><span className="stat-pill">{freeNow}</span><span className="stat-label">Items available now</span></a>
          <a className="stat" href="#/stock?out"><span className="stat-pill">{outNow}</span><span className="stat-label">Items out on orders</span></a>
          <a className={'stat' + (chaseCount ? ' alert' : '')} href="#chase"><span className="stat-pill">{chaseCount}</span>
            <span className="stat-label">{chaseCount ? `Need chasing: ${overdue.length} overdue, ${missingLines.length} missing, ${repair.length} in repair` : 'Nothing to chase'}</span></a>
        </div>

        <div className="split">
          <div className="panel" id="chase">
            <PanelHead title="Needs chasing" note="Overdue orders, kit not returned at check, and kit in repair." />
            <div className="list">
              {overdue.map((o) => (
                <a className="list-row" key={o.id} href={`#/order/${o.id}`}>
                  <div><div className="title">{o.ref} · {o.title}</div><div className="meta">Due back {fmtDate(o.due_date)} · collected by {o.collected_by || 'not recorded'}</div></div>
                  <span className="tag missing">Overdue</span>
                </a>
              ))}
              {missingLines.map((l) => {
                const it = s.itemById[l.item_id]; const o = s.orders.find((x) => x.id === l.order_id);
                return (
                  <a className="list-row" key={l.id} href={`#/order/${o.id}`}>
                    <div><div className="title">{it?.name}</div><div className="meta">{l.qty - l.returned_qty} missing from {o.ref} · {o.title} · collected by {o.collected_by || 'not recorded'}</div></div>
                    <span className="tag missing">Missing</span>
                  </a>
                );
              })}
              {repair.map((i) => (
                <a className="list-row" key={i.id} href={`#/item/${i.id}`}>
                  <div><div className="title">{i.name}</div><div className="meta">{i.label_code}</div></div>
                  <span className="tag repair">In repair</span>
                </a>
              ))}
              {!chaseCount && <p className="empty">Nothing to chase. Everything is back or on time.</p>}
            </div>
          </div>

          <div className="panel">
            <PanelHead title="Orders by stage" link="#/orders" linkText="All orders" />
            <ol className="pipeline">
              {STAGES.map((st, i) => (
                <li key={st}>
                  <a className="pipe-head" href={`#/orders?${st}`}>
                    <span className="num">0{i + 1}</span><span className="pipe-name">{STAGE_LABEL[st]}</span><span className="pipe-count tabular">{byStage[st].length}</span>
                  </a>
                  {byStage[st].slice(0, 3).map((o) => (
                    <a key={o.id} href={`#/order/${o.id}`} className="pipe-order">{o.ref} · {o.title}</a>
                  ))}
                  {byStage[st].length > 3 && <span className="pipe-order muted">+{byStage[st].length - 3} more</span>}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {items.length === 0 && s.isStaff && (
          <div className="panel">
            <PanelHead title="Start by adding your kit" note="Walk the container, add each item with a photo, then print its label from Labels." />
            <Explore href="#/item/new">Add the first item</Explore>
          </div>
        )}
      </div>
    </section>
  );
}
