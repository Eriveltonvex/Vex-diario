/* VEX Controles: camada de dados compartilhada (Supabase) com modo demonstração (navegador).
   Cada tela mantém seu "state" como antes; este arquivo sincroniza as listas com o banco. */
(function () {
  'use strict';
  var cfg = window.VEX_CONFIG || {};
  var demo = !(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  var sb = demo ? null : window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  }
  function def(o, k, v) { Object.defineProperty(o, k, { value: v, writable: true, configurable: true, enumerable: false }); }

  /* ================= back-ends ================= */
  var B;
  if (!demo) {
    B = {
      session: function () { return sb.auth.getSession().then(function (r) { return r.data.session; }); },
      signIn: function (email, pw) { return sb.auth.signInWithPassword({ email: email, password: pw }); },
      signOut: function () { return sb.auth.signOut(); },
      setPassword: function (pw) { return sb.auth.updateUser({ password: pw }); },
      profile: function (uid) { return sb.from('profiles').select('id,email,nome,papel,ativo').eq('id', uid).maybeSingle().then(function (r) { if (r.error) throw r.error; return r.data; }); },
      profiles: function () { return sb.from('profiles').select('id,email,nome,papel,ativo').order('nome', { ascending: true }).then(function (r) { if (r.error) throw r.error; return r.data; }); },
      setProfile: function (id, patch) { return sb.from('profiles').update(patch).eq('id', id).then(function (r) { if (r.error) throw r.error; }); },
      list: function (modulo) {
        var out = [], step = 1000;
        function page(from) {
          return sb.from('registros').select('id,colecao,ordem,dados').eq('modulo', modulo).order('ordem', { ascending: true }).order('id', { ascending: true }).range(from, from + step - 1)
            .then(function (r) { if (r.error) throw r.error; out = out.concat(r.data); return r.data.length < step ? out : page(from + step); });
        }
        return page(0);
      },
      insert: function (rows) {
        var chunks = [], i; for (i = 0; i < rows.length; i += 300) chunks.push(rows.slice(i, i + 300));
        return chunks.reduce(function (p, c) { return p.then(function () { return sb.from('registros').insert(c).then(function (r) { if (r.error) throw r.error; }); }); }, Promise.resolve());
      },
      update: function (id, patch) { return sb.from('registros').update(patch).eq('id', id).select('id').then(function (r) { if (r.error) throw r.error; if (!r.data || !r.data.length) { var e = new Error('Sem permissão ou registro inexistente'); e.code = '42501'; throw e; } }); },
      remove: function (ids) { return sb.from('registros').delete().in('id', ids).select('id').then(function (r) { if (r.error) throw r.error; if (!r.data || r.data.length < ids.length) { var e = new Error('Sem permissão para excluir (o prazo para o lançamento é de 24 h)'); e.code = '42501'; throw e; } }); },
      next: function (chave, base) { return sb.rpc('proximo_numero', { p_chave: chave, p_base: base || 0 }).then(function (r) { if (r.error) throw r.error; return Number(r.data); }); },
      subscribe: function (cb) {
        sb.channel('vex-registros').on('postgres_changes', { event: '*', schema: 'public', table: 'registros' }, function () { cb(); }).subscribe();
      }
    };
  } else {
    var DK = 'vex-demo-v1';
    var dload = function () { try { return JSON.parse(localStorage.getItem(DK)) || { rows: [], cnt: {} }; } catch (e) { return { rows: [], cnt: {} }; } };
    var dsave = function (d) { try { localStorage.setItem(DK, JSON.stringify(d)); } catch (e) { } };
    B = {
      session: function () { return Promise.resolve({ user: { id: 'demo', email: 'demonstracao@local' } }); },
      signIn: function () { return Promise.resolve({ error: null }); },
      signOut: function () { return Promise.resolve(); },
      setPassword: function () { return Promise.resolve({ error: { message: 'Indisponível no modo demonstração.' } }); },
      profile: function () { return Promise.resolve({ id: 'demo', email: 'demonstracao@local', nome: 'Demonstração', papel: 'admin', ativo: true }); },
      profiles: function () { return Promise.resolve([{ id: 'demo', email: 'demonstracao@local', nome: 'Demonstração', papel: 'admin', ativo: true }]); },
      setProfile: function () { return Promise.resolve(); },
      list: function (m) { return Promise.resolve(dload().rows.filter(function (r) { return r.modulo === m; }).sort(function (a, b) { return a.ordem - b.ordem || (a.id < b.id ? -1 : 1); })); },
      insert: function (rows) { var d = dload(); rows.forEach(function (r) { if (d.rows.some(function (x) { return x.id === r.id; })) { var e = new Error('duplicado'); e.code = '23505'; throw e; } d.rows.push(JSON.parse(JSON.stringify(r))); }); dsave(d); return Promise.resolve(); },
      update: function (id, patch) { var d = dload(); d.rows.forEach(function (r) { if (r.id === id) { for (var k in patch) r[k] = JSON.parse(JSON.stringify(patch[k])); } }); dsave(d); return Promise.resolve(); },
      remove: function (ids) { var d = dload(); d.rows = d.rows.filter(function (r) { return ids.indexOf(r.id) < 0; }); dsave(d); return Promise.resolve(); },
      next: function (k, base) { var d = dload(); d.cnt[k] = Math.max(d.cnt[k] || 0, base || 0) + 1; dsave(d); return Promise.resolve(d.cnt[k]); },
      subscribe: function (cb) { window.addEventListener('storage', function (e) { if (e.key === DK) cb(); }); }
    };
  }

  /* ================= estado e sincronização ================= */
  var modulo = null, colls = {}, state = null, snap = {}, remoteCbs = [];
  var ME = { user: null, perfil: null };
  var ordLast = 0, uidLast = 0, dirtyTimer = null, pending = 0, writeVer = 0, resyncAgain = false, resyncTimer = null, queue = Promise.resolve();

  function nextOrd() { ordLast = Math.max(Date.now() * 1000, ordLast + 1); return ordLast; }
  function uid() { uidLast = Math.max(Date.now() * 1000, uidLast + 1); return uidLast; }
  function mk(r) { var o = (r.dados && typeof r.dados === 'object') ? r.dados : {}; def(o, '_id', r.id); def(o, '_o', Number(r.ordem)); ordLast = Math.max(ordLast, Number(r.ordem) || 0); return o; }
  function key(o, dir) { var v = o._o == null ? Infinity : o._o; return v; }
  function sortColl(arr, dir) {
    arr.sort(function (a, b) { var x = key(a), y = key(b); if (x === y) return 0; return (dir === 'desc' ? y - x : x - y) || 0; });
  }
  function setStatus(s) {
    if (OFF) { refreshStatus(s); return; }
    var el = document.getElementById('vb-st'); if (!el) return;
    el.textContent = { pend: 'Salvando…', ok: 'Salvo', err: 'Erro ao salvar' }[s] || '';
    el.className = 'vb-st ' + (s || '');
  }
  function toast(msg, kind) {
    var t = document.getElementById('vex-toast');
    if (!t) { t = document.createElement('div'); t.id = 'vex-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.className = kind || ''; t.textContent = msg; t.style.display = 'block';
    clearTimeout(t._h); t._h = setTimeout(function () { t.style.display = 'none'; }, kind === 'err' ? 9000 : 4000);
  }
  function fire() { remoteCbs.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }


  /* ===== fotos (odômetro): Supabase Storage + cópia local para uso offline ===== */
  var BUCKET = 'diario-fotos';
  var idbP = null;
  function idb() {
    if (idbP) return idbP;
    idbP = new Promise(function (ok, fail) {
      try {
        var rq = indexedDB.open('vex-fotos', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('f'); };
        rq.onsuccess = function () { ok(rq.result); };
        rq.onerror = function () { fail(rq.error); };
      } catch (e) { fail(e); }
    });
    return idbP;
  }
  function idbDo(mode, fn) {
    return idb().then(function (db) { return new Promise(function (ok, fail) { var tx = db.transaction('f', mode), st = tx.objectStore('f'), rq = fn(st); tx.oncomplete = function () { ok(rq && rq.result); }; tx.onerror = function () { fail(tx.error); }; tx.onabort = function () { fail(tx.error); }; }); });
  }
  function idbPut(k, blob) { return idbDo('readwrite', function (st) { return st.put(blob, k); }); }
  function idbGet(k) { return idbDo('readonly', function (st) { return st.get(k); }).catch(function () { return null; }); }
  function idbDel(k) { return idbDo('readwrite', function (st) { return st.delete(k); }).catch(function () { }); }
  function storUpload(path, blob) {
    return sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false }).then(function (r) {
      if (r.error) { if (/already exists|duplicate/i.test(String(r.error.message)) || String(r.error.statusCode) === '409') return; throw r.error; }
    });
  }
  var urlCache = {};
  var FOTO = {
    /* grava a foto: offline vai para a fila de envio; online sobe na hora */
    put: function (path, blob) {
      if (demo) return idbPut(path, blob);
      if (OFF) { return idbPut(path, blob).then(function () { var o = offLoad(); o.out.push({ t: 'foto', path: path }); offSave(); refreshStatus(); }); }
      return storUpload(path, blob);
    },
    /* devolve o arquivo (cópia local ou baixa do servidor) */
    get: function (path) {
      return idbGet(path).then(function (b) {
        if (b) return b;
        if (demo) throw new Error('Foto indisponível');
        return sb.storage.from(BUCKET).download(path).then(function (r) { if (r.error) throw r.error; return r.data; });
      });
    },
    /* endereço para exibir a foto */
    url: function (path) {
      return idbGet(path).then(function (b) {
        if (b) return URL.createObjectURL(b);
        if (demo) throw new Error('Foto indisponível');
        var c = urlCache[path]; if (c && c.t > Date.now()) return c.u;
        return sb.storage.from(BUCKET).createSignedUrl(path, 3600).then(function (r) { if (r.error) throw r.error; urlCache[path] = { u: r.data.signedUrl, t: Date.now() + 3000000 }; return r.data.signedUrl; });
      });
    },
    remove: function (paths) {
      if (demo) return Promise.all(paths.map(idbDel));
      var out = Promise.resolve();
      for (var i = 0; i < paths.length; i += 100) (function (ch) { out = out.then(function () { return sb.storage.from(BUCKET).remove(ch).then(function (r) { if (r.error) throw r.error; }); }); })(paths.slice(i, i + 100));
      return out.then(function () { return Promise.all(paths.map(idbDel)); });
    }
  };

  /* ===== modo offline (somente no app do condutor): guarda no celular e envia quando houver internet ===== */
  var OFF = !!window.VEX_SOLO && !demo, off = null, sending = false, netToast = 0;
  function isNet(e) { return !navigator.onLine || !!(e && (e.name === 'TypeError' || /fetch|network|load failed|timeout|abort|ECONN/i.test(String(e.message || e)))); }
  function isAuth(e) { return !!(e && (e.code === 'PGRST301' || e.status === 401 || /jwt|token/i.test(String(e.message || '')))); }
  function offKey() { return 'vex-off-' + (ME.user ? ME.user.id : 'x') + '-' + modulo; }
  function offLoad() {
    if (off) return off;
    try { off = JSON.parse(localStorage.getItem(offKey())); } catch (e) { off = null; }
    if (!off || typeof off !== 'object') off = {};
    if (!Array.isArray(off.rows)) off.rows = [];
    if (!Array.isArray(off.out)) off.out = [];
    off.has = !!off.has;
    return off;
  }
  function offSave() { try { localStorage.setItem(offKey(), JSON.stringify(off)); } catch (e) { toast('A memória do celular está cheia. Libere espaço para não perder lançamentos.', 'err'); } }
  function applyOp(rows, op) {
    if (op.t === 'ins') { if (!rows.some(function (r) { return r.id === op.row.id; })) rows.push(JSON.parse(JSON.stringify(op.row))); }
    else if (op.t === 'upd') { rows.forEach(function (r) { if (r.id === op.id) { for (var k in op.patch) r[k] = JSON.parse(JSON.stringify(op.patch[k])); } }); }
    else if (op.t === 'foto') { }
    else if (op.t === 'del') { var i = rows.length; while (i--) if (op.ids.indexOf(rows[i].id) >= 0) rows.splice(i, 1); }
    return rows;
  }
  function overlay(rows) { var c = JSON.parse(JSON.stringify(rows)); offLoad().out.forEach(function (op) { applyOp(c, op); }); return c; }
  function LIST(mod) {
    if (!OFF) return B.list(mod);
    return B.list(mod).then(function (rows) { offLoad().rows = rows; off.has = true; offSave(); return overlay(rows); }, function (e) {
      if (isNet(e) || isAuth(e)) {
        offLoad();
        if (off.has) return overlay(off.rows);
        throw new Error('Sem conexão. Abra o app com internet ao menos uma vez neste celular.');
      }
      throw e;
    });
  }
  function enqueue(ch) {
    var o = offLoad();
    ch.ins.forEach(function (r) { o.out.push({ t: 'ins', row: r }); });
    ch.upd.forEach(function (u) {
      var ins = o.out.filter(function (x) { return x.t === 'ins' && x.row.id === u.id; })[0];
      if (ins) { ins.row.dados = u.patch.dados; return; }
      var up = o.out.filter(function (x) { return x.t === 'upd' && x.id === u.id; })[0];
      if (up) { up.patch = u.patch; return; }
      o.out.push({ t: 'upd', id: u.id, patch: u.patch });
    });
    if (ch.del.length) {
      var ids = [];
      ch.del.forEach(function (id) {
        var k = -1; o.out.forEach(function (x, i) { if (x.t === 'ins' && x.row.id === id) k = i; });
        if (k >= 0) o.out.splice(k, 1);
        else { o.out = o.out.filter(function (x) { return !(x.t === 'upd' && x.id === id); }); ids.push(id); }
      });
      if (ids.length) o.out.push({ t: 'del', ids: ids });
    }
    offSave();
  }
  function refreshStatus(s) {
    var el = document.getElementById('vb-st'); if (!el) return;
    var n = off ? off.out.length : 0;
    if (n) { el.textContent = '⏳ ' + n + ' pendente' + (n > 1 ? 's' : '') + ' de envio'; el.className = 'vb-st off'; }
    else if (!navigator.onLine) { el.textContent = 'Sem conexão'; el.className = 'vb-st off'; }
    else if (s === 'pend') { el.textContent = 'Salvando…'; el.className = 'vb-st pend'; }
    else { el.textContent = 'Salvo'; el.className = 'vb-st ok'; }
  }
  function sendOutbox() {
    var o = offLoad();
    if (sending) return Promise.resolve(false);
    if (!o.out.length) { refreshStatus(); return Promise.resolve(true); }
    sending = true;
    function step() {
      if (!o.out.length) return Promise.resolve();
      var op = o.out[0], p;
      if (op.t === 'foto') p = idbGet(op.path).then(function (b) { if (!b) return; return storUpload(op.path, b).then(function () { return idbDel(op.path); }); });
      else if (op.t === 'ins') p = B.insert([op.row]).catch(function (e) { if (e && e.code === '23505') return; throw e; });
      else if (op.t === 'upd') p = B.update(op.id, op.patch);
      else p = B.remove(op.ids);
      return p.then(function () { applyOp(o.rows, op); o.out.shift(); offSave(); refreshStatus(); return step(); });
    }
    return step().then(function () { sending = false; netToast = 0; refreshStatus(); return true; }, function (e) {
      sending = false;
      if (isNet(e) || isAuth(e)) {
        refreshStatus();
        if (isAuth(e) && navigator.onLine) toast('Sua sessão expirou. Saia e entre de novo para enviar os lançamentos pendentes.', 'err');
        else if (!netToast) { netToast = 1; toast('Sem conexão: o lançamento ficou salvo neste celular e será enviado quando houver internet.'); }
        return false;
      }
      o.out.shift(); offSave();
      toast('O servidor recusou um lançamento (' + ((e && e.message) || 'erro') + '). Ele foi descartado.', 'err');
      return sendOutbox().then(function () { return resync(true).catch(function () { }); });
    });
  }

  function computeDiff() {
    var ins = [], upd = [], seen = {}, del = [];
    Object.keys(colls).forEach(function (c) {
      var arr = state[c] || [], dir = colls[c], idx = arr.map(function (_, i) { return i; });
      if (dir === 'desc') idx.reverse();
      idx.forEach(function (i) {
        var o = arr[i], js = canon(o);
        if (!o._id) {
          def(o, '_id', uuid()); def(o, '_o', nextOrd());
          snap[o._id] = { c: c, js: js };
          ins.push({ id: o._id, modulo: modulo, colecao: c, ordem: o._o, dados: JSON.parse(JSON.stringify(o)) });
        } else {
          seen[o._id] = 1;
          if (!snap[o._id] || snap[o._id].js !== js) {
            snap[o._id] = { c: c, js: js };
            upd.push({ id: o._id, patch: { dados: JSON.parse(JSON.stringify(o)) } });
          }
        }
      });
    });
    Object.keys(snap).forEach(function (id) {
      if (seen[id]) return;
      var inNew = ins.some(function (x) { return x.id === id; });
      if (!inNew) { del.push(id); delete snap[id]; }
    });
    return { ins: ins, upd: upd, del: del };
  }
  function retry(fn) {
    var n = 0;
    function go() { return fn().catch(function (e) { n++; if (n >= 3 || (e && (e.code === '42501' || e.code === '23505' || e.code === '23514'))) throw e; return new Promise(function (r) { setTimeout(r, n * 1500); }).then(go); }); }
    return go();
  }
  function doFlush() {
    if (OFF) { var c0 = computeDiff(); if (c0.ins.length || c0.upd.length || c0.del.length) enqueue(c0); return sendOutbox(); }
    var ch = computeDiff();
    if (!ch.ins.length && !ch.upd.length && !ch.del.length) return Promise.resolve();
    var p = ch.ins.length ? retry(function () { return B.insert(ch.ins); }) : Promise.resolve();
    return p.then(function () {
      var jobs = ch.upd.map(function (u) { return retry(function () { return B.update(u.id, u.patch); }); });
      if (ch.del.length) jobs.push(retry(function () { return B.remove(ch.del); }));
      return Promise.all(jobs);
    });
  }
  function onErr(e) {
    console.error(e); setStatus('err');
    var m = (e && e.code === '42501') ? 'Sem permissão para essa alteração. Os dados foram recarregados.' : 'Não foi possível salvar (' + ((e && e.message) || 'erro') + '). Os dados foram recarregados.';
    toast(m, 'err'); writeVer++;
    return resync(true).catch(function () { });
  }
  function flush() {
    clearTimeout(dirtyTimer); dirtyTimer = null; pending++;
    queue = queue.then(doFlush).then(function () { return null; }, onErr).then(function () {
      pending--;
      if (!pending && !dirtyTimer) { if (document.getElementById('vb-st') && document.getElementById('vb-st').className.indexOf('err') < 0) setStatus('ok'); if (resyncAgain) { resyncAgain = false; resync(); } }
    });
    return queue;
  }
  function save() { writeVer++; clearTimeout(dirtyTimer); dirtyTimer = setTimeout(flush, 250); setStatus('pend'); }

  function applyRows(rows) {
    var server = {}, changed = false;
    rows.forEach(function (r) {
      if (!colls[r.colecao]) return;
      server[r.id] = r;
      var js = canon(r.dados), cur = snap[r.id];
      if (cur && cur.js === js) return;
      changed = true;
      var arr = state[r.colecao], o = null, i;
      for (i = 0; i < arr.length; i++) if (arr[i]._id === r.id) { o = arr[i]; break; }
      if (o) { Object.keys(o).forEach(function (k) { delete o[k]; }); Object.assign(o, r.dados); def(o, '_o', Number(r.ordem)); }
      else { arr.push(mk(r)); }
      snap[r.id] = { c: r.colecao, js: js };
    });
    Object.keys(snap).forEach(function (id) {
      if (server[id]) return;
      var arr = state[snap[id].c], i;
      for (i = arr.length - 1; i >= 0; i--) if (arr[i]._id === id) arr.splice(i, 1);
      delete snap[id]; changed = true;
    });
    if (changed) Object.keys(colls).forEach(function (c) { sortColl(state[c], colls[c]); });
    return changed;
  }
  function resync(force) {
    if (!force && (pending || dirtyTimer)) { resyncAgain = true; return Promise.resolve(); }
    var wv = writeVer;
    return LIST(modulo).then(function (rows) {
      if (!force && (wv !== writeVer || pending || dirtyTimer)) { resyncAgain = true; return; }
      if (applyRows(rows)) fire();
    });
  }
  function scheduleResync() { clearTimeout(resyncTimer); resyncTimer = setTimeout(function () { resync().catch(function () { }); }, 250); }

  /* ================= interface comum (barra superior) ================= */
  var CSS = '#vexbar{background:#f1f2f4;border-bottom:1px solid #e3e4e7;font:500 13px Barlow,system-ui,sans-serif;color:#26282d}' +
    '#vexbar .vb-in{max-width:1100px;margin:0 auto;padding:8px 16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}' +
    '#vexbar a{color:#26282d;text-decoration:none}#vexbar a:hover{text-decoration:underline}#vexbar a.on{font-weight:700;box-shadow:inset 0 -2px 0 #d8392f}' +
    '#vexbar .vb-brand{font:700 14px "Chakra Petch",sans-serif;color:#858a8f;letter-spacing:.04em}#vexbar .vb-sp{flex:1}' +
    '#vexbar button{font:600 12px "Chakra Petch",sans-serif;padding:5px 10px;border:1px solid #cfd1d5;background:#fff;color:#26282d;border-radius:3px;cursor:pointer}' +
    '#vexbar .vb-st{font-size:12px;color:#6b6e75}#vexbar .vb-st.err{color:#d8392f;font-weight:700}#vexbar .vb-st.off{color:#b26a00;font-weight:700}' +
    '#vexdemo{background:#fff4e0;color:#7a4a00;font:500 13px Barlow,system-ui,sans-serif;padding:8px 16px;text-align:center;border-bottom:1px solid #f0d9ae}' +
    '#vex-toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);max-width:92vw;background:#26282d;color:#fff;padding:10px 16px;border-radius:4px;font:500 14px Barlow,system-ui,sans-serif;z-index:90;display:none}#vex-toast.err{background:#b3261e}' +
    '#vexload{position:fixed;inset:0;background:#fff;z-index:80;display:flex;align-items:center;justify-content:center;font:600 16px "Chakra Petch",sans-serif;color:#858a8f}' +
    'body.op #t-cad,body.op #cad{display:none!important}';
  var PAGES = [['index.html', 'Início'], ['uniformes-epi.html', 'Uniformes e EPI'], ['ferramentas.html', 'Ferramentas'], ['abastecimento.html', 'Abastecimento'], ['ponto.html', 'Ponto e absenteísmo'], ['diario.html', 'Diário de bordo']];
  function here() { var p = location.pathname.split('/').pop(); return p || 'index.html'; }
  function paintBar(withLinks) {
    if (!document.getElementById('vexcss')) { var s = document.createElement('style'); s.id = 'vexcss'; s.textContent = CSS; document.head.appendChild(s); }
    if (document.getElementById('vexbar')) return;
    var d = document.createElement('div'); d.id = 'vexbar';
    var solo = !!window.VEX_SOLO; var links = solo ? '<a href="index.html?senha=1">Trocar senha</a>' : withLinks ? PAGES.map(function (p) { return '<a href="' + p[0] + '"' + (p[0] === here() ? ' class="on"' : '') + '>' + p[1] + '</a>'; }).join('') : '';
    d.innerHTML = '<div class="vb-in"><span class="vb-brand">' + (solo ? 'VEX · Diário de bordo' : 'VEX · Controles') + '</span>' + links + '<span class="vb-sp"></span><span id="vb-st" class="vb-st"></span>' +
      (ME.user ? '<span>' + esc(ME.perfil && ME.perfil.nome ? ME.perfil.nome : ME.user.email) + ' · ' + (ME.perfil && ME.perfil.papel === 'admin' ? 'administrador' : ME.perfil && ME.perfil.papel === 'condutor' ? 'condutor' : 'operador') + '</span><button id="vb-out" type="button">Sair</button>' : '') + '</div>';
    document.body.insertBefore(d, document.body.firstChild);
    if (demo) { var b = document.createElement('div'); b.id = 'vexdemo'; b.textContent = 'Modo demonstração: os dados ficam só neste navegador. Para usar com a equipe, preencha o config.js com os dados do Supabase (veja o README).'; d.after(b); }
    var o = document.getElementById('vb-out'); if (o) o.addEventListener('click', function () { B.signOut().then(function () { location.href = 'index.html'; }); });
  }
  function loading(on) {
    var l = document.getElementById('vexload');
    if (on && !l) { l = document.createElement('div'); l.id = 'vexload'; l.textContent = 'Carregando…'; document.body.appendChild(l); }
    if (!on && l) l.remove();
  }
  function goLogin() { location.replace('index.html?next=' + encodeURIComponent(here())); return new Promise(function () { }); }

  /* identificação do usuário (usada por index.html e pelas telas) */
  function offUser() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) { var v = JSON.parse(localStorage.getItem(k)); var u = v && (v.user || (v.currentSession && v.currentSession.user)); if (u && u.id) return u; }
      }
    } catch (e) { }
    return null;
  }
  function who() {
    return B.session().catch(function () { return null; }).then(function (s) {
      var fb = false;
      if (!s && OFF) { var u = offUser(); if (u) { s = { user: u }; fb = true; } }
      if (!s) return null;
      ME.user = s.user;
      var pk = 'vex-prof-' + s.user.id;
      function cached() { try { return JSON.parse(localStorage.getItem(pk)); } catch (e) { return null; } }
      if (fb && cached()) { ME.perfil = cached(); return ME.perfil; }
      return B.profile(s.user.id).then(function (p) {
        if (OFF && p) { try { localStorage.setItem(pk, JSON.stringify(p)); } catch (e) { } }
        ME.perfil = p; return p;
      }, function (e) {
        if (OFF && (isNet(e) || isAuth(e)) && cached()) { ME.perfil = cached(); return ME.perfil; }
        throw e;
      });
    });
  }

  /* ================= boot de cada tela ================= */
  function boot(mod, spec) {
    modulo = mod; colls = spec.colls;
    if (!document.getElementById('vexcss')) { var s0 = document.createElement('style'); s0.id = 'vexcss'; s0.textContent = CSS; document.head.appendChild(s0); }
    loading(true);
    return who().then(function (p) {
      if (!ME.user) return goLogin();
      if (!p || !p.ativo) { loading(false); document.body.innerHTML = '<div style="padding:40px;font:16px Barlow,sans-serif;max-width:560px;margin:auto">Seu usuário ainda não tem acesso aos controles. Peça ao administrador para liberar e depois <a href="index.html">volte ao início</a>.</div>'; return new Promise(function () { }); }
      if (p.papel !== 'admin') document.body.classList.add('op');
      if (p.papel === 'condutor' && mod !== 'diario') { loading(false); document.body.innerHTML = '<div style="padding:40px;font:16px Barlow,sans-serif;max-width:560px;margin:auto">Seu usuário tem acesso apenas ao Diário de bordo.</div>'; return new Promise(function () { }); }
      paintBar(true);
      return LIST(mod);
    }).then(function (rows) {
      var hasInit = rows.some(function (r) { return r.colecao === '_init'; }), admin = ME.perfil.papel === 'admin';
      var initId = { epi: '00000000-0000-4000-8000-0000000000e1', ferr: '00000000-0000-4000-8000-0000000000e2', comb: '00000000-0000-4000-8000-0000000000e3', ponto: '00000000-0000-4000-8000-0000000000e4', diario: '00000000-0000-4000-8000-0000000000e5' }[mod];
      function fromRows(rs) {
        state = {}; snap = {};
        Object.keys(colls).forEach(function (c) { state[c] = []; });
        applyRows(rs);
        return state;
      }
      if (!hasInit && admin && spec.seed) {
        return B.insert([{ id: initId, modulo: mod, colecao: '_init', ordem: 0, dados: { v: 1 } }]).then(function () {
          state = spec.seed; snap = {};
          Object.keys(colls).forEach(function (c) { if (!state[c]) state[c] = []; });
          return flush().then(function () { return state; });
        }, function (e) {
          if (e && e.code === '23505') return B.list(mod).then(fromRows);
          throw e;
        });
      }
      if (!hasInit) toast('Os cadastros ainda não foram iniciados. Peça ao administrador para abrir esta tela primeiro.', 'err');
      return fromRows(rows);
    }).then(function (st) {
      loading(false); setStatus('ok');
      B.subscribe(scheduleResync);
      if (OFF) {
        offLoad(); refreshStatus();
        sendOutbox();
        window.addEventListener('online', function () { sendOutbox().then(function () { resync().catch(function () { }); }); });
        window.addEventListener('offline', function () { refreshStatus(); });
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sendOutbox(); });
        setInterval(function () { if (off && off.out.length) sendOutbox(); }, 20000);
      }
      setInterval(function () { if (document.visibilityState === 'visible') resync().catch(function () { }); }, 60000);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { if (dirtyTimer) flush(); } else resync().catch(function () { }); });
      window.addEventListener('pagehide', function () { if (dirtyTimer) flush(); });
      return st;
    }).catch(function (e) {
      loading(false); console.error(e);
      toast('Erro ao carregar os dados: ' + ((e && e.message) || e), 'err');
      throw e;
    });
  }

  window.VEX = {
    demo: demo, B: B, ME: ME, boot: boot, save: save, flush: flush, uid: uid, toast: toast, who: who, paintBar: paintBar,
    onRemote: function (f) { remoteCbs.push(f); },
    foto: FOTO,
    next: function (chave, base) { return B.next(chave, base); },
    download: function (filename, data, type) {
      var b = new Blob([data], { type: type || 'text/html' }), a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      return Promise.resolve({ status: 'saved' });
    }
  };
})();
