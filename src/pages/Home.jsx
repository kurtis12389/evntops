import { useStore, stockOf, isOverdue, STAGES, STAGE_LABEL } from '../lib/store.jsx';
import { Hero, Explore, Ring, Squiggle, CurlArrow, fmtDate } from '../components/ui.jsx';

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
  const byStage = Object.fromEntries(STAGES.map((st) => [st, orders.filter((o) => o.status === st)]));

  return (
    <>
      <section className="band">
        <div className="wrap">
          <Hero eyebrow={site.code} title={site.name}
            lede={s.lastSync ? `Last updated ${new Date(s.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}${s.online ? '' : ' · showing saved data while offline'}` : 'Loading kit…'}>
            {s.isStaff && (
              <div className="row">
                <a className="btn solid" href="#/orders/new">New order</a>
                <a className="btn" href="#/item/new">Add kit</a>
              </div>
            )}
          </Hero>
          <div className="stats">
            <a className="stat" href="#/stock"><span className="stat-pill">{freeNow}</span><span className="small muted">Items available now</span></a>
            <a className="stat" href="#/stock?out"><span className="stat-pill">{outNow}</span><span className="small muted">Items out on orders</span></a>
            <a className={'stat' + (overdue.length ? ' alert' : '')} href="#/orders"><span className="stat-pill">{overdue.length}</span><span className="small muted">Orders overdue</span></a>
            <a className={'stat' + (missingLines.length ? ' alert' : '')} href="#missing"><span className="stat-pill">{missingLines.length}</span><span className="small muted">Missing after check</span></a>
          </div>
        </div>
      </section>

      <section className="band green" style={{ position: 'relative' }}>
        <Squiggle style={{ position: 'absolute', top: -28, left: 12 }} />
        <div className="wrap">
          <div className="hero">
            <h2>Orders by stage</h2>
            <div className="hero-side"><hr className="rule" /><p className="lede small muted" style={{ margin: 0 }}>Every order moves Picking, Ready, Collected, Returned, Checked. Each move is logged with who and when.</p></div>
          </div>
          <CurlArrow />
          <div className="cols five">
            {STAGES.map((st, i) => (
              <div className="col" key={st}>
                <span className="num">0{i + 1}.</span>
                <span className="count tabular">{byStage[st].length}</span>
                <h3>{STAGE_LABEL[st]}</h3>
                <div className="field" style={{ gap: 4 }}>
                  {byStage[st].slice(0, 4).map((o) => (
                    <a key={o.id} href={`#/order/${o.id}`} className="small" style={{ textDecoration: 'none' }}>{o.ref} · {o.title}</a>
                  ))}
                  {byStage[st].length > 4 && <span className="small muted">+{byStage[st].length - 4} more</span>}
                </div>
                <Explore href={`#/orders?${st}`}>View</Explore>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band" id="missing">
        <div className="wrap">
          <div className="hero">
            <h2>Needs chasing</h2>
            <div className="hero-side"><hr className="rule" /><p className="lede small muted" style={{ margin: 0 }}>Overdue orders, kit not returned at check, and kit in repair.</p></div>
          </div>
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
            {!overdue.length && !missingLines.length && !repair.length && <p className="empty">Nothing to chase. Everything is back or on time.</p>}
          </div>
        </div>
      </section>

      {items.length === 0 && s.isStaff && (
        <section className="band green">
          <div className="wrap">
            <div className="row" style={{ gap: 32 }}>
              <Ring words="ADD YOUR KIT · LABEL IT · " />
              <div className="field" style={{ gap: 14, flex: '1 1 260px' }}>
                <h2>Start by adding your kit</h2>
                <p className="lede">Walk the container, add each item with a photo, then print its label from Labels.</p>
                <Explore href="#/item/new">Add the first item</Explore>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
