import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { cache, getQueue, onQueueChange, flushQueue } from './offline.js';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

export const STAGES = ['picking', 'ready', 'collected', 'returned', 'checked'];
export const STAGE_LABEL = {
  picking: 'Picking', ready: 'Ready', collected: 'Collected', returned: 'Returned', checked: 'Checked', cancelled: 'Cancelled'
};

const today = () => new Date().toISOString().slice(0, 10);

export function StoreProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(cache.get('profile'));
  const [data, setData] = useState(() => cache.get('data', { sites: [], items: [], avail: [], orders: [], lines: [], profiles: [], events: [] }));
  const [siteId, setSiteIdState] = useState(() => cache.get('siteId'));
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueueState] = useState(getQueue());
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState(cache.get('lastSync'));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    const unq = onQueueChange(setQueueState);
    return () => { sub.subscription.unsubscribe(); window.removeEventListener('online', on); window.removeEventListener('offline', off); unq(); };
  }, []);

  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(me); cache.set('profile', me);
      if (!me || me.role === 'pending') return;

      const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
      const [sites, items, avail, orders, profiles] = await Promise.all([
        supabase.from('sites').select('*').order('created_at'),
        supabase.from('items').select('*').order('name'),
        supabase.from('item_availability').select('*'),
        supabase.from('orders').select('*').or(`status.in.(picking,ready,collected,returned),due_date.gte.${since}`).order('out_date', { ascending: false }),
        supabase.from('profiles').select('id, full_name, role')
      ]);
      const orderIds = (orders.data || []).map((o) => o.id);
      const [lines, events] = orderIds.length
        ? await Promise.all([
            supabase.from('order_lines').select('*').in('order_id', orderIds),
            supabase.from('order_events').select('*').in('order_id', orderIds).order('at', { ascending: false })
          ])
        : [{ data: [] }, { data: [] }];
      const next = {
        sites: sites.data || [], items: items.data || [], avail: avail.data || [], orders: orders.data || [],
        lines: lines.data || [], profiles: profiles.data || [], events: events.data || []
      };
      setData(next); cache.set('data', next);
      const t = new Date().toISOString(); setLastSync(t); cache.set('lastSync', t);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (session) { flushQueue().then(refresh); } }, [session, refresh]);
  useEffect(() => { if (online && session) flushQueue().then(refresh); }, [online]); // eslint-disable-line
  // Once the queue empties after a sync, pull fresh numbers.
  useEffect(() => { if (queue.length === 0 && session && online) refresh(); }, [queue.length === 0]); // eslint-disable-line

  const sites = data.sites;
  const activeSites = sites.filter((s) => s.active);
  const currentSite = sites.find((s) => s.id === siteId) || activeSites[0] || sites[0] || null;
  const setSiteId = (id) => { setSiteIdState(id); cache.set('siteId', id); };

  // Lines with queued (not yet synced) scans applied, so offline scanning shows progress straight away.
  const lines = useMemo(() => {
    const byLabel = Object.fromEntries(data.items.map((i) => [i.label_code.toUpperCase(), i]));
    const out = data.lines.map((l) => ({ ...l, pending: 0 }));
    for (const s of queue) {
      if (s.error) continue;
      const it = byLabel[s.label.toUpperCase()];
      if (!it) continue;
      let l = out.find((x) => x.order_id === s.order_id && x.item_id === it.id);
      if (!l && s.kind === 'pick') { l = { id: 'pending-' + s.client_id, order_id: s.order_id, item_id: it.id, qty: s.qty, picked_qty: 0, returned_qty: 0, damaged: false, resolved: false, pending: 0 }; out.push(l); }
      if (!l) continue;
      if (s.kind === 'pick') l.picked_qty = Math.min(l.picked_qty + s.qty, l.qty);
      else l.returned_qty = Math.min(l.returned_qty + s.qty, Math.max(l.picked_qty, l.qty));
      l.pending += 1;
    }
    return out;
  }, [data.lines, data.items, queue]);

  const itemById = useMemo(() => Object.fromEntries(data.items.map((i) => [i.id, i])), [data.items]);
  const availById = useMemo(() => Object.fromEntries(data.avail.map((a) => [a.item_id, a])), [data.avail]);
  const nameOf = (id) => data.profiles.find((p) => p.id === id)?.full_name || 'Someone';

  const role = profile?.role;
  const value = {
    session, profile, role, isStaff: role === 'admin' || role === 'staff', isAdmin: role === 'admin',
    ...data, lines, itemById, availById, nameOf,
    currentSite, activeSites, setSiteId, online, queue, loading, lastSync, refresh, today: today()
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Stock numbers for one item: how many exist, are booked, out, missing and free right now. */
export function stockOf(item, avail) {
  const a = avail || { booked_qty: 0, out_qty: 0, missing_qty: 0 };
  const total = item.is_bulk ? item.quantity : 1;
  if (!item.is_bulk && item.status !== 'available') {
    return { total, booked: a.booked_qty, out: a.out_qty, missing: a.missing_qty, free: 0, state: item.status };
  }
  const free = Math.max(total - a.booked_qty - a.out_qty - (item.is_bulk ? a.missing_qty : 0), 0);
  let state = 'available';
  if (a.out_qty >= total) state = 'out';
  else if (free === 0 && a.booked_qty > 0) state = 'booked';
  else if (a.out_qty > 0 || a.booked_qty > 0) state = 'partly';
  return { total, booked: a.booked_qty, out: a.out_qty, missing: a.missing_qty, free, state };
}

export function isOverdue(order, todayStr) {
  return ['collected', 'returned'].includes(order.status) && order.due_date < todayStr;
}
