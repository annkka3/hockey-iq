/* Видео на устройстве: IndexedDB, база 'hk_media', хранилище 'blobs'. Ничего никуда не загружается —
   файлы матчей остаются в браузере этого телефона (в облако уходят только метаданные эпизодов, без видео).
   Если IndexedDB недоступна (приватный режим, старый браузер) — видео живут в памяти до закрытия вкладки,
   и available() честно говорит об этом, чтобы интерфейс мог предупредить. */

const DB = 'hk_media', STORE = 'blobs', VERSION = 1;
const memory = new Map(); // запасной вариант без IndexedDB
let dbp = null, persistent = true;

function open() {
  if (dbp) return dbp;
  dbp = new Promise(resolve => {
    try {
      if (!('indexedDB' in window)) { persistent = false; return resolve(null); }
      const rq = indexedDB.open(DB, VERSION);
      rq.onupgradeneeded = () => { const db = rq.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }); };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => { persistent = false; resolve(null); };
      rq.onblocked = () => { persistent = false; resolve(null); };
    } catch (e) { persistent = false; resolve(null); }
  });
  return dbp;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode), st = t.objectStore(STORE);
    let out;
    const rq = fn(st);
    if (rq) rq.onsuccess = () => { out = rq.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const newId = () => 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* Сохранить видео. Возвращает id. */
export async function putMedia(blob, { name = '' } = {}) {
  const rec = { id: newId(), blob, name: name || blob.name || 'видео', type: blob.type || 'video/mp4', size: blob.size || 0, created: Date.now() };
  const db = await open();
  if (!db) { memory.set(rec.id, rec); return rec.id; }
  try { await tx(db, 'readwrite', st => st.put(rec)); }
  catch (e) {
    // нет места или запись запрещена — держим в памяти, чтобы эпизод хотя бы проигрался сейчас
    persistent = false; memory.set(rec.id, rec);
  }
  return rec.id;
}

/* Видео по id или null. */
export async function getMedia(id) {
  if (!id) return null;
  if (memory.has(id)) return memory.get(id).blob;
  const db = await open();
  if (!db) return null;
  try { const rec = await tx(db, 'readonly', st => st.get(id)); return rec ? rec.blob : null; }
  catch (e) { return null; }
}

export async function deleteMedia(id) {
  memory.delete(id);
  const db = await open();
  if (!db) return;
  try { await tx(db, 'readwrite', st => st.delete(id)); } catch (e) { /* уже нет */ }
}

/* Список без самих видео: id, имя, тип, размер, дата. */
export async function listMedia() {
  const out = [...memory.values()].map(({ blob, ...r }) => r);
  const db = await open();
  if (!db) return out;
  try {
    const all = await tx(db, 'readonly', st => st.getAll());
    for (const r of all || []) out.push({ id: r.id, name: r.name, type: r.type, size: r.size, created: r.created });
  } catch (e) { /* пусто */ }
  return out;
}

/* Сколько занято видео и сколько браузер разрешает. */
export async function usage() {
  const items = await listMedia();
  const bytes = items.reduce((s, r) => s + (r.size || 0), 0);
  let quota = null;
  try { if (navigator.storage && navigator.storage.estimate) quota = (await navigator.storage.estimate()).quota || null; } catch (e) { /* нет данных */ }
  return { count: items.length, bytes, quota, persistent: await available() };
}

/* true — видео переживут закрытие приложения. */
export async function available() { await open(); return persistent; }

/* Попросить браузер не вычищать хранилище при нехватке места (если поддерживается). */
export async function keep() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* нет */ }
  return false;
}

export const fmtBytes = b => b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} КБ` : b < 1024 ** 3 ? `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} МБ` : `${(b / 1024 ** 3).toFixed(1)} ГБ`;
