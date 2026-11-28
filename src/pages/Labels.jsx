import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useStore } from '../lib/store.jsx';
import { Hero } from '../components/ui.jsx';

export default function Labels() {
  const s = useStore();
  const site = s.currentSite;
  const only = location.hash.split('?')[1];
  const siteItems = useMemo(() => s.items.filter((i) => i.site_id === site?.id && i.status !== 'retired'), [s.items, site]);
  const [picked, setPicked] = useState(() => new Set(only ? [only] : []));
  const [codes, setCodes] = useState({});

  const chosen = picked.size ? siteItems.filter((i) => picked.has(i.id)) : siteItems;

  useEffect(() => {
    let live = true;
    Promise.all(chosen.map(async (i) => [i.id, await QRCode.toDataURL(i.label_code, { margin: 1, width: 240, errorCorrectionLevel: 'M' })]))
      .then((pairs) => live && setCodes(Object.fromEntries(pairs)));
    return () => { live = false; };
  }, [chosen.map((i) => i.id).join(',')]); // eslint-disable-line

  const toggle = (id) => { const n = new Set(picked); n.has(id) ? n.delete(id) : n.add(id); setPicked(n); };

  return (
    <section className="band">
      <div className="wrap">
        <div className="no-print">
          <Hero eyebrow={site?.code} title="Print labels"
            lede="Tick the items you want, or leave all unticked to print every label. Print on weatherproof vinyl sheets, then stick each on its item or case.">
            <div className="row">
              <button className="btn solid" onClick={() => window.print()}>Print {chosen.length} label{chosen.length === 1 ? '' : 's'}</button>
              {picked.size > 0 && <button className="btn ghost" onClick={() => setPicked(new Set())}>Clear selection</button>}
            </div>
          </Hero>
        </div>
        <div className="chips no-print">
          {siteItems.map((i) => <button key={i.id} className="chip" aria-pressed={picked.has(i.id)} onClick={() => toggle(i.id)}>{i.label_code} {i.name}</button>)}
        </div>
        <div className="labels">
          {chosen.map((i) => (
            <div className="label" key={i.id}>
              {codes[i.id] ? <img src={codes[i.id]} alt={`QR code for ${i.label_code}`} /> : <div style={{ width: 110, height: 110 }} />}
              <div className="code">{i.label_code}</div>
              <div className="lname">{i.name}</div>
              <div className="lname" style={{ opacity: 0.6 }}>EVNT OPS · {site?.code}</div>
            </div>
          ))}
        </div>
        {!chosen.length && <p className="empty">No kit at this site yet.</p>}
      </div>
    </section>
  );
}
