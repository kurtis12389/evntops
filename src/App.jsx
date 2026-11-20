import { useEffect, useState } from 'react';
import { useStore } from './lib/store.jsx';
import { supabase } from './lib/supabase.js';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Stock from './pages/Stock.jsx';
import ItemPage from './pages/ItemPage.jsx';
import Labels from './pages/Labels.jsx';
import Orders from './pages/Orders.jsx';
import OrderNew from './pages/OrderNew.jsx';
import OrderPage from './pages/OrderPage.jsx';
import Admin from './pages/Admin.jsx';
import { Ring } from './components/ui.jsx';

function useHash() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const fn = () => { setHash(location.hash || '#/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return hash.replace(/^#/, '') || '/';
}

function TopBar({ path }) {
  const { online, queue, isAdmin, isStaff, currentSite, activeSites, setSiteId } = useStore();
  const pending = queue.filter((q) => !q.error).length;
  const failed = queue.filter((q) => q.error).length;
  const on = (p) => (p === '/' ? path === '/' : path.startsWith(p)) ? 'on' : '';
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="#/"><span className="brand-star">✦</span> EVNT OPS</a>
        {activeSites.length > 1 && (
          <select aria-label="Site" value={currentSite?.id || ''} onChange={(e) => setSiteId(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
            {activeSites.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
          </select>
        )}
        <nav className="nav">
          <a className={on('/')} href="#/">Home</a>
          <a className={on('/stock')} href="#/stock">Stock</a>
          <a className={on('/order')} href="#/orders">Orders</a>
          {isStaff && <a className={on('/labels')} href="#/labels">Labels</a>}
          {isAdmin && <a className={on('/admin')} href="#/admin">Admin</a>}
        </nav>
        <span className="status-pill" title={online ? 'Online' : 'Offline: scans are saved on this phone'}>
          <span className={'dot' + (online ? '' : ' off')} />
          {online ? (pending ? `Syncing ${pending}` : 'Online') : `Offline${pending ? ` · ${pending} waiting` : ''}`}
          {failed > 0 && <span className="pink"> · {failed} failed</span>}
        </span>
      </div>
    </header>
  );
}

function Pending() {
  return (
    <section className="band">
      <div className="wrap">
        <div className="row" style={{ gap: 40 }}>
          <Ring />
          <div className="field" style={{ gap: 14, flex: '1 1 260px' }}>
            <h1>Waiting for approval</h1>
            <p className="muted lede">Your account is set up. An admin needs to give you access before you can see the kit. Ask Kurtis to approve you under Admin.</p>
            <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const { session, profile } = useStore();
  const path = useHash();
  if (session === undefined) return null;
  if (!session) return <Login />;
  if (profile?.role === 'pending') return <Pending />;

  let page;
  const [, a, b] = path.split('/');
  if (a === 'stock') page = <Stock />;
  else if (a === 'item') page = <ItemPage id={b} />;
  else if (a === 'labels') page = <Labels />;
  else if (a === 'orders' && b === 'new') page = <OrderNew />;
  else if (a === 'orders') page = <Orders />;
  else if (a === 'order') page = <OrderPage id={b} />;
  else if (a === 'admin') page = <Admin />;
  else page = <Home />;

  return (
    <>
      <TopBar path={path} />
      <main>{page}</main>
      <footer className="footer">
        <div className="wrap">
          <span>© {new Date().getFullYear()} Evnt Inspirations</span>
          <span>kit.evntops.co.uk</span>
          <button className="explore" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </footer>
    </>
  );
}
