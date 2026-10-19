/* Облако «Hockey IQ»: вход по почте и паролю (Firebase Auth) и Firestore с офлайн-кэшем.
   Отдельный проект Firebase и отдельный экземпляр приложения ('hockeyiq'): аккаунты и данные
   не пересекаются с языковыми приложениями, даже на одном телефоне и одном домене.

   Данные игрока (схема одна для этапа 1 и командной версии):
     users/{uid}                     roles, nick
     players/{uid}                   profile, parent, guardians[], teamId, summary
     players/{uid}/progress/{key}    запись интервального повторения
     players/{uid}/sessions/{id}     журнал сессий (ответы)
   Модуль ничего не делает, пока в config.js firebase = null. */
const cfg = window.HK_CONFIG && window.HK_CONFIG.firebase;

export let cloud = null;

if (cfg) {
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import('./vendor/firebase-app.js'),
      import('./vendor/firebase-auth.js'),
      import('./vendor/firebase-firestore.js'),
    ]);
    const app = appMod.initializeApp(cfg, 'hockeyiq');
    const auth = authMod.getAuth(app);
    let fs;
    try {
      fs = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }) });
    } catch (e) { fs = fsMod.getFirestore(app); }
    const plain = d => JSON.parse(JSON.stringify(d));
    const { doc, collection, setDoc, getDoc, getDocs, writeBatch } = fsMod;

    cloud = {
      user: null,
      onAuth: null,
      signIn: (e, p) => authMod.signInWithEmailAndPassword(auth, e, p),
      signUp: (e, p) => authMod.createUserWithEmailAndPassword(auth, e, p),
      reset: e => authMod.sendPasswordResetEmail(auth, e),
      signOut: () => authMod.signOut(auth),

      async load(uid) {
        const base = `players/${uid}`;
        const [p, prog, sess, cardsSnap] = await Promise.all([
          getDoc(doc(fs, base)),
          getDocs(collection(fs, base + '/progress')),
          getDocs(collection(fs, base + '/sessions')),
          getDocs(collection(fs, base + '/cards')),
        ]);
        const cards = {};
        cardsSnap.forEach(d => { cards[d.id] = d.data(); });
        const progress = {};
        prog.forEach(d => { progress[d.id] = d.data(); });
        const sessions = [];
        sess.forEach(d => sessions.push(d.data()));
        const data = p.exists() ? p.data() : {};
        return { profile: data.profile, parent: data.parent, progress, sessions, cards };
      },

      /* Пачка изменений одним batch (до 450 записей за раз). */
      async push(uid, { profile, parent, summary, progress, sessions, cards, removed }) {
        const base = `players/${uid}`;
        const ops = [];
        if (profile || parent || summary) {
          const d = { updatedAt: Date.now() };
          if (profile) d.profile = profile;
          if (parent) d.parent = parent;
          if (summary) d.summary = summary;
          ops.push([doc(fs, base), d]);
        }
        for (const [k, r] of Object.entries(progress || {})) ops.push([doc(fs, `${base}/progress/${k}`), r]);
        for (const s of sessions || []) ops.push([doc(fs, `${base}/sessions/${s.id}`), s]);
        for (const [id, c] of Object.entries(cards || {})) ops.push([doc(fs, `${base}/cards/${id}`), c]);
        for (let i = 0; i < ops.length; i += 450) {
          const b = writeBatch(fs);
          for (const [ref, data] of ops.slice(i, i + 450)) b.set(ref, plain(data), { merge: true });
          await b.commit();
        }
        if (removed && removed.length) {
          const b = writeBatch(fs);
          for (const id of removed) b.delete(doc(fs, `${base}/cards/${id}`));
          await b.commit();
        }
      },

      async ensureUser(uid, nick) {
        const ref = doc(fs, `users/${uid}`);
        const s = await getDoc(ref);
        if (!s.exists()) {
          await setDoc(ref, { roles: { player: true }, nick: nick || '', createdAt: Date.now() });
          await setDoc(doc(fs, `players/${uid}`), { guardians: [], teamId: null, createdAt: Date.now() }, { merge: true });
        }
      },
    };

    authMod.onAuthStateChanged(auth, user => {
      cloud.user = user ? { uid: user.uid, email: user.email } : null;
      if (cloud.onAuth) cloud.onAuth(cloud.user);
    });
  } catch (e) {
    console.error('Облако не запустилось, работаем на устройстве', e);
    cloud = null;
  }
}
