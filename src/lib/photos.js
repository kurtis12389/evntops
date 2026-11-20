import { supabase } from './supabase.js';

/** Shrink a phone photo to at most 1280px and JPEG quality 0.7 so the free 1GB lasts. */
export async function shrinkPhoto(file, max = 1280) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.7));
}

export async function uploadPhoto(file, folder) {
  const blob = await shrinkPhoto(file);
  const path = `${folder}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}

const urlCache = new Map();
export async function photoUrl(path) {
  if (!path) return null;
  if (urlCache.has(path)) return urlCache.get(path);
  const { data } = await supabase.storage.from('photos').createSignedUrl(path, 3600);
  const url = data?.signedUrl || null;
  if (url) urlCache.set(path, url);
  return url;
}
