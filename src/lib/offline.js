// Offline support: a local cache of the last data seen, and a queue of scans waiting to sync.
import { supabase } from './supabase.js';

const QUEUE_KEY = 'evnt.scanQueue';
const CACHE_PREFIX = 'evnt.cache.';
const listeners = new Set();

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

export const cache = {
  get: (name, fallback = null) => read(CACHE_PREFIX + name, fallback),
  set: (name, value) => write(CACHE_PREFIX + name, value)
};

export function getQueue() { return read(QUEUE_KEY, []); }
function setQueue(q) { write(QUEUE_KEY, q); listeners.forEach((fn) => fn(q)); }

export function onQueueChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Add a scan to the queue, then try to send it. */
export function queueScan({ orderId, label, kind, qty = 1 }) {
  const scan = { client_id: newId(), order_id: orderId, label, kind, qty, scanned_at: new Date().toISOString(), error: null };
  setQueue([...getQueue(), scan]);
  flushQueue();
  return scan;
}

let flushing = false;
/** Send queued scans in order. Network failures stay queued; rejected scans are kept with their error so a person can see them. */
export async function flushQueue() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    for (const scan of getQueue()) {
      if (scan.error) continue;
      const { error } = await supabase.rpc('record_scan', {
        p_client_id: scan.client_id, p_order: scan.order_id, p_label: scan.label,
        p_kind: scan.kind, p_qty: scan.qty, p_scanned_at: scan.scanned_at
      });
      if (error) {
        if (/Failed to fetch|NetworkError|Load failed|timeout/i.test(error.message)) break;
        setQueue(getQueue().map((s) => (s.client_id === scan.client_id ? { ...s, error: error.message } : s)));
      } else {
        setQueue(getQueue().filter((s) => s.client_id !== scan.client_id));
      }
    }
  } finally {
    flushing = false;
  }
}

export function dismissScan(clientId) { setQueue(getQueue().filter((s) => s.client_id !== clientId)); }

if (typeof window !== 'undefined') {
  window.addEventListener('online', flushQueue);
  setInterval(flushQueue, 30000);
}
