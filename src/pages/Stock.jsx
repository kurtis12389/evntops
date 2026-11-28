import { useMemo, useState } from 'react';
import { useStore, stockOf } from '../lib/store.jsx';
import { Hero, StockTag } from '../components/ui.jsx';

const FILTERS = [['all', 'All'], ['free', 'Available'], ['out', 'Out'], ['repair', 'Repair or missing']];

export default function Stock() {
  const s = useStore();
  const site = s.currentSite;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(location.hash.includes('?out') ? 'out' : 'all');
  const [cat, setCat] = useState('');

  const rows = useMemo(() => {
    if (!site) return [];
    return s.items
      .filter((i) => i.site_id === site.id && i.status !== 'retired')
      .map((i) => ({ item: i, ...stockOf(i, s.availById[i.id]) }))
      .filter((r) => !cat || r.item.category === cat)
      .filter((r) => {
        const t = q.trim().toLowerCase();
        return !t || [r.item.name, r.item.label_code, r.item.category, r.item.serial, r.item.shelf].some((v) => v && v.toLowerCase().includes(t));
      })
      .filter((r) => filter === 'all' || (filter === 'free' && r.free > 0) || (filter === 'out' && r.out > 0) ||
        (filter === 'repair' && ['repair', 'missing'].includes(r.state)));
  }, [s.items, s.availById, site, q, filter, cat]);

  const cats = [...new Set(s.items.filter((i) => i.site_id === site?.id).map((i) => i.category))].sort();
  const orderFor = (itemId) => {
    const l = s.lines.find((x) => x.item_id === itemId && ['collected', 'returned', 'picking', 'ready'].includes(s.orders.find((o) => o.id === x.order_id)?.status));
    return l ? s.orders.find((o) => o.id === l.order_id) : null;
  };

  return (
    <section className="band">
      <div className="wrap">
        <Hero eyebrow={site?.code} title="What's in stock" lede="Live view of every item at this site. Bulk items show how many of the total are free.">
          {s.isStaff && <div className="row"><a className="btn solid" href="#/item/new">Add kit</a></div>}
        </Hero>
        <div className="form-grid">
          <div className="field"><label htmlFor="q">Search</label>
            <input id="q" type="search" placeholder="Name, label, serial, shelf" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="field"><label htmlFor="cat">Category</label>
            <select id="cat" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">All categories</option>
              {cats.map((c) => <option key={c}>{c}</option>)}
            </select></div>
        </div>
        <div className="chips" role="group" aria-label="Filter">
          {FILTERS.map(([k, label]) => <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
        </div>
        <div className="list">
          {rows.map(({ item, total, free, out, booked, state }) => {
            const o = out > 0 || booked > 0 ? orderFor(item.id) : null;
            return (
              <a className="list-row" key={item.id} href={`#/item/${item.id}`}>
                <div style={{ minWidth: 0 }}>
                  <div className="title">{item.name}</div>
                  <div className="meta">
                    <span className="tag code">{item.label_code}</span> {item.category}{item.shelf ? ` · shelf ${item.shelf}` : ''}
                    {item.is_bulk && <> · <span className="tabular">{free} of {total} free</span></>}
                    {o && <> · on {o.ref} {o.title}</>}
                  </div>
                </div>
                <StockTag state={state} />
              </a>
            );
          })}
          {rows.length === 0 && <p className="empty">No kit matches. {s.isStaff ? 'Add kit to get started.' : ''}</p>}
        </div>
      </div>
    </section>
  );
}
