import { useEffect, useState } from 'react';
import { useStore, stockOf, STAGE_LABEL } from '../lib/store.jsx';
import { supabase, friendlyError } from '../lib/supabase.js';
import { uploadPhoto, photoUrl } from '../lib/photos.js';
import { Hero, StockTag, Explore, fmtDate, fmtDateTime } from '../components/ui.jsx';

function Photo({ path, alt }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let live = true; photoUrl(path).then((u) => live && setUrl(u)); return () => { live = false; }; }, [path]);
  return url ? <img className="photo" src={url} alt={alt} /> : null;
}

function ItemForm({ item, onDone }) {
  const s = useStore();
  const [f, setF] = useState(() => item ? { ...item } : {
    site_id: s.currentSite?.id, name: '', category: '', serial: '', value_gbp: '', is_bulk: false, quantity: 1, shelf: '', notes: ''
  });
  const [file, setFile] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const cats = [...new Set(s.items.map((i) => i.category))].sort();

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const row = {
        site_id: f.site_id, name: f.name.trim(), category: f.category.trim() || 'General', serial: f.serial || null,
        value_gbp: f.value_gbp === '' || f.value_gbp == null ? null : Number(f.value_gbp), is_bulk: !!f.is_bulk,
        quantity: f.is_bulk ? Math.max(0, parseInt(f.quantity, 10) || 0) : 1, shelf: f.shelf || null, notes: f.notes || null
      };
      let saved;
      if (item) {
        const { data, error } = await supabase.from('items').update(row).eq('id', item.id).select().single();
        if (error) throw error; saved = data;
      } else {
        const { data, error } = await supabase.from('items').insert(row).select().single();
        if (error) throw error; saved = data;
      }
      if (file) {
        const path = await uploadPhoto(file, `items/${saved.id}`);
        await supabase.from('items').update({ photo_path: path }).eq('id', saved.id);
      }
      await s.refresh();
      onDone(saved);
    } catch (e2) { setErr(friendlyError(e2)); } finally { setBusy(false); }
  };

  return (
    <form className="field" style={{ gap: 22 }} onSubmit={save}>
      <div className="form-grid">
        <div className="field"><label htmlFor="i-name">Name</label>
          <input id="i-name" type="text" required value={f.name} onChange={set('name')} placeholder="Pioneer CDJ-3000 #2" /></div>
        <div className="field"><label htmlFor="i-cat">Category</label>
          <input id="i-cat" type="text" list="cats" value={f.category} onChange={set('category')} placeholder="Decks, Lighting, Cables…" />
          <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></div>
        <div className="field"><label htmlFor="i-site">Site</label>
          <select id="i-site" value={f.site_id || ''} onChange={set('site_id')}>
            {s.sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></div>
        <div className="field"><label htmlFor="i-shelf">Shelf or location</label>
          <input id="i-shelf" type="text" value={f.shelf || ''} onChange={set('shelf')} placeholder="Rack B2" /></div>
        <div className="field"><label htmlFor="i-serial">Serial number</label>
          <input id="i-serial" type="text" value={f.serial || ''} onChange={set('serial')} /></div>
        <div className="field"><label htmlFor="i-value">Value (£)</label>
          <input id="i-value" type="number" min="0" step="0.01" value={f.value_gbp ?? ''} onChange={set('value_gbp')} /></div>
      </div>
      <label className="check"><input type="checkbox" checked={!!f.is_bulk} onChange={set('is_bulk')} /> Counted by quantity (cables, pegs, weights)</label>
      {f.is_bulk && (
        <div className="field" style={{ maxWidth: 220 }}><label htmlFor="i-qty">How many in total</label>
          <input id="i-qty" type="number" min="0" value={f.quantity} onChange={set('quantity')} /></div>
      )}
      <div className="field"><label htmlFor="i-notes">Notes</label>
        <textarea id="i-notes" value={f.notes || ''} onChange={set('notes')} /></div>
      <div className="field"><label htmlFor="i-photo">Photo</label>
        <input id="i-photo" type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files[0] || null)} /></div>
      {err && <p className="error">{err}</p>}
      {!s.online && <p className="notice warn">You're offline. Adding and editing kit needs signal; scanning works without it.</p>}
      <div className="row">
        <button className="btn solid" disabled={busy || !s.online} type="submit">{item ? 'Save changes' : 'Add item'}</button>
        <button className="btn ghost" type="button" onClick={() => onDone(item)}>Cancel</button>
      </div>
    </form>
  );
}

export default function ItemPage({ id }) {
  const s = useStore();
  const [editing, setEditing] = useState(id === 'new');
  const [notes, setNotes] = useState([]);
  const [note, setNote] = useState('');
  const [noteFile, setNoteFile] = useState(null);
  const [err, setErr] = useState('');
  const item = s.itemById[id];

  useEffect(() => {
    if (!item || !s.online) return;
    supabase.from('item_notes').select('*').eq('item_id', item.id).order('created_at', { ascending: false }).then(({ data }) => setNotes(data || []));
  }, [item?.id, s.online]); // eslint-disable-line

  if (id === 'new' || editing) {
    return (
      <section className="band green">
        <div className="wrap">
          <h1>{item ? 'Edit item' : 'Add kit'}</h1>
          <ItemForm item={item} onDone={(saved) => { setEditing(false); location.hash = saved ? `#/item/${saved.id}` : '#/stock'; }} />
        </div>
      </section>
    );
  }
  if (!item) return <section className="band"><div className="wrap"><p className="empty">Item not found.</p></div></section>;

  const st = stockOf(item, s.availById[item.id]);
  const history = s.lines.filter((l) => l.item_id === item.id).map((l) => ({ l, o: s.orders.find((o) => o.id === l.order_id) })).filter((x) => x.o);

  const setStatus = async (status) => {
    setErr('');
    const { error } = await supabase.from('items').update({ status }).eq('id', item.id);
    if (error) setErr(friendlyError(error)); else s.refresh();
  };
  const addNote = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const photo_path = noteFile ? await uploadPhoto(noteFile, `notes/${item.id}`) : null;
      const { data, error } = await supabase.from('item_notes').insert({ item_id: item.id, body: note.trim(), photo_path }).select().single();
      if (error) throw error;
      setNotes([data, ...notes]); setNote(''); setNoteFile(null);
    } catch (e2) { setErr(friendlyError(e2)); }
  };

  return (
    <>
      <section className="band">
        <div className="wrap">
          <Hero eyebrow={item.label_code} title={item.name}
            lede={`${item.category}${item.shelf ? ` · shelf ${item.shelf}` : ''}${item.serial ? ` · serial ${item.serial}` : ''}${item.value_gbp ? ` · £${item.value_gbp}` : ''}`}>
            <div className="row"><StockTag state={st.state} />{item.is_bulk && <span className="small tabular">{st.free} of {st.total} free · {st.out} out · {st.booked} booked</span>}</div>
            {s.isStaff && <div className="row"><button className="btn" onClick={() => setEditing(true)}>Edit</button><a className="btn ghost" href={`#/labels?${item.id}`}>Print label</a></div>}
          </Hero>
          {item.photo_path && <Photo path={item.photo_path} alt={item.name} />}
          {item.notes && <p className="muted" style={{ maxWidth: '65ch' }}>{item.notes}</p>}
          {s.isAdmin && (
            <div className="field" style={{ gap: 10 }}>
              <span className="eyebrow">Set status</span>
              <div className="chips">
                {['available', 'repair', 'missing', 'retired'].map((x) => (
                  <button key={x} className="chip" aria-pressed={item.status === x} onClick={() => setStatus(x)}>{x === 'available' ? 'Available' : x[0].toUpperCase() + x.slice(1)}</button>
                ))}
              </div>
            </div>
          )}
          {err && <p className="error">{err}</p>}
        </div>
      </section>
      <section className="band green">
        <div className="wrap">
          <h2>History</h2>
          <div className="list">
            {history.map(({ l, o }) => (
              <a className="list-row" key={l.id} href={`#/order/${o.id}`}>
                <div><div className="title">{o.ref} · {o.title}</div>
                  <div className="meta">{fmtDate(o.out_date)} to {fmtDate(o.due_date)} · {l.qty} booked, {l.picked_qty} out, {l.returned_qty} back{l.damaged ? ' · damaged' : ''}{o.collected_by ? ` · collected by ${o.collected_by}` : ''}</div></div>
                <span className="tag">{STAGE_LABEL[o.status]}</span>
              </a>
            ))}
            {!history.length && <p className="empty">Not on any recent orders.</p>}
          </div>
        </div>
      </section>
      <section className="band">
        <div className="wrap">
          <h2>Condition notes</h2>
          {s.isStaff && (
            <form className="field" style={{ gap: 14 }} onSubmit={addNote}>
              <div className="field"><label htmlFor="n-body">Add a note</label>
                <textarea id="n-body" required value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cable frayed near the plug" /></div>
              <div className="field"><label htmlFor="n-photo">Photo (optional)</label>
                <input id="n-photo" type="file" accept="image/*" capture="environment" onChange={(e) => setNoteFile(e.target.files[0] || null)} /></div>
              <div><button className="btn" type="submit" disabled={!s.online}>Save note</button></div>
            </form>
          )}
          <div className="list">
            {notes.map((n) => (
              <div className="list-row" key={n.id} style={{ gridTemplateColumns: '1fr' }}>
                <div>{n.body}</div>
                {n.photo_path && <Photo path={n.photo_path} alt="Condition photo" />}
                <div className="meta">{s.nameOf(n.user_id)} · {fmtDateTime(n.created_at)}</div>
              </div>
            ))}
            {!notes.length && <p className="empty">{s.online ? 'No notes yet.' : 'Notes load when you have signal.'}</p>}
          </div>
          <Explore href="#/stock">Back to stock</Explore>
        </div>
      </section>
    </>
  );
}
