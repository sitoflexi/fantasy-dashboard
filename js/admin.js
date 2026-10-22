(() => {
  const C = window.FANTASY_CONFIG;
  const { compute, eur } = window.FANTASY;
  const API = `https://api.github.com/repos/${C.owner}/${C.repo}/contents`;
  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "value") e.value = v;
      else if (k === "checked") e.checked = v;
      else e.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  };
  const views = ["vLogin", "vSetup", "vEdit"];
  const showView = (id) => views.forEach((v) => $("#" + v).classList.toggle("hidden", v !== id));
  const msg = (sel, text, cls = "") => { const e = $(sel); e.className = cls; e.textContent = text; };

  // ---------- Cifrado del token (PBKDF2 + AES-GCM) ----------
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (buf) => { let s = ""; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s.replace(/\s/g, "")), (c) => c.charCodeAt(0));
  const ITER = 600000;
  async function deriveKey(pw, salt, iter) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function encryptToken(token, pw) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pw, salt, ITER);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(token));
    return { v: 1, kdf: "PBKDF2-SHA256", iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }
  async function decryptToken(k, pw) {
    const key = await deriveKey(pw, unb64(k.salt), k.iter);
    return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(k.iv) }, key, unb64(k.ct)));
  }

  // ---------- GitHub ----------
  let TOKEN = null;
  const gh = async (path, opts = {}, token = TOKEN) => {
    const res = await fetch(`${API}/${path}${opts.method ? "" : `?ref=${C.branch}&t=${Date.now()}`}`, {
      ...opts,
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...(opts.headers || {}) },
      cache: "no-store",
    });
    if (!res.ok) { const e = new Error(`GitHub ${res.status}`); e.status = res.status; try { e.detail = (await res.json()).message; } catch {} throw e; }
    return res.json();
  };
  const getFile = async (path) => { const r = await gh(path); return { sha: r.sha, text: dec.decode(unb64(r.content)) }; };
  const putFile = (path, text, message, sha, token) => gh(path, {
    method: "PUT", body: JSON.stringify({ message, content: b64(enc.encode(text)), branch: C.branch, ...(sha ? { sha } : {}) }),
  }, token);

  // ---------- Arranque ----------
  let KEY = null;
  async function start() {
    try {
      const r = await fetch(`key.json?v=${Date.now()}`, { cache: "no-store" });
      KEY = r.ok ? await r.json() : null;
    } catch { KEY = null; }
    let saved = null;
    try { saved = sessionStorage.getItem("fantasy-token"); } catch {}
    if (saved) { TOKEN = saved; return openEditor(); }
    showView(KEY ? "vLogin" : "vSetup");
  }

  $("#toSetup").addEventListener("click", (e) => { e.preventDefault(); showView("vSetup"); });

  $("#fLogin").addEventListener("submit", async (e) => {
    e.preventDefault();
    msg("#loginMsg", "Comprobando…");
    try {
      TOKEN = await decryptToken(KEY, $("#pw").value);
    } catch { return msg("#loginMsg", "Contraseña incorrecta.", "err"); }
    try { sessionStorage.setItem("fantasy-token", TOKEN); } catch {}
    $("#pw").value = "";
    openEditor();
  });

  $("#fSetup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = $("#sToken").value.trim(), pw = $("#sPw").value;
    if (pw !== $("#sPw2").value) return msg("#setupMsg", "Las contraseñas no coinciden.", "err");
    msg("#setupMsg", "Comprobando el token…");
    try {
      let sha;
      try { sha = (await gh("key.json", {}, token)).sha; } catch (err) { if (err.status !== 404) throw err; }
      const k = await encryptToken(token, pw);
      await putFile("key.json", JSON.stringify(k, null, 1) + "\n", "Admin: configurar token", sha, token);
      KEY = k; TOKEN = token;
      try { sessionStorage.setItem("fantasy-token", TOKEN); } catch {}
      $("#sToken").value = $("#sPw").value = $("#sPw2").value = "";
      msg("#setupMsg", "");
      openEditor();
    } catch (err) {
      msg("#setupMsg", err.status === 401 || err.status === 403 || err.status === 404
        ? "El token no puede escribir en el repo. Revisa que tenga acceso a fantasy-dashboard con Contents: Read and write."
        : `Error: ${err.message} ${err.detail || ""}`, "err");
    }
  });


  // ---------- Editor ----------
  let D = null, SHA = null, cur = null, dirty = false;
  const setDirty = (v = true) => { dirty = v; msg("#status", v ? "Cambios sin guardar" : "", v ? "err" : ""); };
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  async function openEditor() {
    showView("vEdit");
    msg("#status", "Cargando datos…");
    try {
      const f = await getFile("data.json");
      D = JSON.parse(f.text); SHA = f.sha;
    } catch (err) {
      if (err.status === 401) { try { sessionStorage.removeItem("fantasy-token"); } catch {} TOKEN = null; showView(KEY ? "vLogin" : "vSetup"); return msg(KEY ? "#loginMsg" : "#setupMsg", "El token ha caducado o no es válido. Configura uno nuevo.", "err"); }
      return msg("#status", `No se pudo leer data.json: ${err.message}`, "err");
    }
    cur = D.jornadas.length ? D.jornadas[D.jornadas.length - 1].n : null;
    if (cur == null) newJornada();
    renderAll(); setDirty(false);
  }

  const J = () => D.jornadas.find((j) => j.n === cur);
  const names = () => D.players.map((p) => p.name);

  function renderAll() {
    $("#jSel").replaceChildren(...D.jornadas.map((j) => el("option", { value: j.n }, `Jornada ${j.n}` + (j.estado === "provisional" ? " (provisional)" : ""))));
    $("#jSel").value = cur;
    renderJornada(); renderPlayers();
  }

  // un campo numérico guardado en j[field][player]; vacío o 0 = se borra
  function numInput(obj, field, p, opts = {}) {
    const val = obj[field] && obj[field][p];
    const i = el("input", { type: "number", step: opts.step || "1", min: opts.min ?? "0", value: val ?? "", placeholder: opts.ph || "0", class: opts.cls || "" });
    i.addEventListener("input", () => {
      const v = i.value === "" ? null : Number(i.value);
      obj[field] = obj[field] || {};
      if (v == null || isNaN(v) || (!opts.keepZero && v === 0)) delete obj[field][p]; else obj[field][p] = v;
      setDirty(); renderCalc();
    });
    return i;
  }

  function renderJornada() {
    const j = J();
    const k = window.FANTASY.mult(D, j.n);
    $("#eTitle").textContent = `Jornada ${j.n}` + (k > 1 ? ` · pagos ×${k}` : "");
    $("#prov").checked = j.estado === "provisional";
    $("#nota").value = j.nota || "";
    const head = el("tr", {}, el("th", { class: "name" }, "Jugador"), el("th", {}, "Puntos"), el("th", {}, "Rojas"),
      el("th", {}, "No alineados"), el("th", { title: "Rojas / no alineados sin desglosar, en €" }, "Otros €"),
      el("th", { title: "Suma o resta a mano, en €" }, "Ajuste €"), el("th", {}, "Pos."), el("th", {}, "Paga"), el("th", { class: "left" }, "Desglose"));
    const rows = D.players.map((pl) => {
      const p = pl.name;
      return el("tr", { "data-p": p },
        el("td", { class: "name" }, p, pl.team && pl.team !== p ? el("span", { class: "team" }, pl.team) : null),
        el("td", {}, numInput(j, "puntos", p, { min: "-50", ph: "–", cls: "pts", keepZero: true })),
        el("td", {}, numInput(j, "rojas", p)),
        el("td", {}, numInput(j, "noAlineados", p)),
        el("td", {}, numInput(j, "extras", p, { step: "0.5" })),
        el("td", {}, numInput(j, "ajuste", p, { step: "0.5", min: "-50" })),
        el("td", { class: "pos" }), el("td", { class: "calc" }), el("td", { class: "brk" }));
    });
    $("#eTable").replaceChildren(el("thead", {}, head), el("tbody", {}, rows));
    renderCalc();
  }

  function renderCalc() {
    const S = compute(D);
    const x = S.jornadas.find((y) => y.n === cur);
    document.querySelectorAll("#eTable tbody tr").forEach((tr) => {
      const r = x.rows[tr.dataset.p];
      const [pos, pay, brk] = tr.querySelectorAll("td.pos, td.calc, td.brk");
      pos.textContent = r.pos ? `${r.pos}º` : "–";
      pay.textContent = x.has ? eur(r.pago) : "–";
      const parts = [];
      if (r.pos) parts.push(`posición ${eur(r.posFee)}`);
      if (r.sanc) parts.push(`sanciones ${eur(r.sanc)}`);
      if (r.ajuste) parts.push(`ajuste ${eur(r.ajuste)}`);
      brk.textContent = parts.join(" + ");
    });
    const missing = names().filter((p) => !(J().puntos && typeof J().puntos[p] === "number"));
    msg("#status", (dirty ? "Cambios sin guardar · " : "") + `Bote J${cur}: ${eur(x.bote)}` + (missing.length && missing.length < names().length ? ` · faltan puntos de ${missing.join(", ")}` : ""), dirty ? "err" : "");
  }

  function renderPlayers() {
    const rows = D.players.map((pl) => {
      const t = el("input", { type: "text", value: pl.team || "" });
      t.addEventListener("input", () => { pl.team = t.value.trim(); setDirty(); });
      return el("tr", {}, el("td", {}, el("b", {}, pl.name)), el("td", {}, "Plantilla: ", t));
    });
    $("#plTable").replaceChildren(el("tbody", {}, rows));
  }

  function newJornada() {
    const n = Math.max(0, ...D.jornadas.map((j) => j.n)) + 1;
    D.jornadas.push({ n, estado: "cerrada", puntos: {}, rojas: {}, noAlineados: {}, extras: {} });
    cur = n;
  }

  $("#jSel").addEventListener("change", () => { cur = Number($("#jSel").value); renderAll(); });
  $("#newJ").addEventListener("click", () => { newJornada(); setDirty(); renderAll(); });
  $("#prov").addEventListener("change", () => { J().estado = $("#prov").checked ? "provisional" : "cerrada"; setDirty(); renderAll(); });
  $("#nota").addEventListener("input", () => { const v = $("#nota").value.trim(); if (v) J().nota = v; else delete J().nota; setDirty(); });

  function validate() {
    for (const j of D.jornadas) {
      const pts = j.puntos || {};
      const filled = names().filter((p) => typeof pts[p] === "number").length;
      if (filled && filled < names().length) return `J${j.n}: faltan los puntos de algún jugador.`;
    }
    return null;
  }

  $("#save").addEventListener("click", async () => {
    const problem = validate();
    if (problem) return msg("#status", problem, "err");
    // jornadas vacías al final no se guardan
    while (D.jornadas.length && !Object.keys(D.jornadas[D.jornadas.length - 1].puntos || {}).length) D.jornadas.pop();
    $("#save").disabled = true;
    msg("#status", "Guardando…");
    try {
      D.updated = new Date().toISOString().replace(/\.\d+Z$/, "Z");
      D.updatedBy = "Admin";
      const r = await putFile("data.json", JSON.stringify(D, null, 1) + "\n", `J${cur}: actualizar puntos y pagos`, SHA);
      SHA = r.content.sha;
      setDirty(false);
      if (!D.jornadas.some((j) => j.n === cur)) cur = D.jornadas.length ? D.jornadas[D.jornadas.length - 1].n : cur;
      renderAll();
      msg("#status", "Guardado ✓ La web se actualiza en 1–2 minutos.", "ok");
    } catch (err) {
      msg("#status", err.status === 409
        ? "Otro admin ha guardado cambios mientras editabas. Copia lo tuyo, recarga la página y vuelve a introducirlo."
        : `No se pudo guardar: ${err.message} ${err.detail || ""}`, "err");
    } finally { $("#save").disabled = false; }
  });

  $("#fPw").addEventListener("submit", async (e) => {
    e.preventDefault();
    msg("#pwMsg", "Guardando…");
    try {
      let sha; try { sha = (await gh("key.json")).sha; } catch {}
      const k = await encryptToken(TOKEN, $("#nPw").value);
      await putFile("key.json", JSON.stringify(k, null, 1) + "\n", "Admin: cambiar contraseña", sha);
      KEY = k; $("#nPw").value = "";
      msg("#pwMsg", "Contraseña cambiada ✓", "ok");
    } catch (err) { msg("#pwMsg", `Error: ${err.message}`, "err"); }
  });
  $("#logout").addEventListener("click", () => { try { sessionStorage.removeItem("fantasy-token"); } catch {} TOKEN = null; location.reload(); });

  start();
})();
