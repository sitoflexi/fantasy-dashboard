(() => {
  const { compute, eur } = window.FANTASY;
  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "style") e.style.cssText = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  };
  const SVGNS = "http://www.w3.org/2000/svg";
  const svg = (tag, attrs = {}) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const txt = (attrs, s) => { const t = svg("text", attrs); t.textContent = s; return t; };
  const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];
  const e0 = (v) => (v ? eur(v) : "0 €");

  let S, D;
  const sel = [];
  let evoMode = "pos";
  let curJ = null;

  const colorOf = (name) => { const i = sel.indexOf(name); return i >= 0 ? SERIES[i] : null; };
  function toggle(name) {
    const i = sel.indexOf(name);
    if (i >= 0) sel.splice(i, 1);
    else { if (sel.length >= 4) sel.shift(); sel.push(name); }
    renderTable(); renderEvo();
  }
  const nameCell = (t, extra = {}) => el("td", { class: "name", ...extra }, t.name, el("span", { class: "team" }, t.team));
  const teamOf = (p) => (D.players.find((x) => x.name === p) || {}).team || "";

  // ---------- Tiles ----------
  const tile = (k, v, d) => el("div", { class: "tile" }, el("div", { class: "k" }, k), el("div", { class: "v" }, v), el("div", { class: "d" }, d || ""));
  function renderTiles() {
    const t = S.table, lead = t[0], second = t.find((x) => x.total < lead.total);
    const last = S.active[S.active.length - 1];
    let best = null;
    for (const x of S.active) for (const p of D.players) {
      const v = x.rows[p.name].pts;
      if (v != null && (!best || v > best.pts)) best = { pts: v, who: p.name, n: x.n };
    }
    $("#tiles").replaceChildren(
      tile("Líder", t.filter((x) => x.total === lead.total).map((x) => x.name).join(" · "),
        `${lead.total} pts` + (second ? ` · +${lead.total - second.total} sobre el siguiente` : "")),
      last ? tile(`Última jornada · J${last.n}`, last.winners.join(" · "), `ganó con ${last.max} pts` + (last.provisional ? " (provisional)" : "")) : tile("Última jornada", "—"),
      best ? tile("Mejor jornada", `${best.pts} pts`, `${best.who} en la J${best.n}`) : tile("Mejor jornada", "—"),
      tile("Bote acumulado", eur(S.bote), S.boteProv ? `incluye ${eur(S.boteProv)} provisionales` : `${S.active.length} jornadas`),
    );
  }

  // ---------- Clasificación ----------
  const heat = (p) => (p == null ? 0 : p < 35 ? 1 : p < 50 ? 2 : p < 65 ? 3 : p < 80 ? 4 : 5);
  function renderTable() {
    const head = el("tr", {},
      el("th", {}, "#"), el("th", { class: "name" }, "Jugador"),
      S.active.map((x) => el("th", { title: x.provisional ? "Provisional" : "" }, `J${x.n}`)),
      el("th", {}, "Total"), el("th", { title: "Media de puntos por jornada" }, "Media"),
      el("th", { title: "Jornadas ganadas" }, "👑"), el("th", { title: "Veces último" }, "💸"),
      el("th", { title: "Total pagado al bote" }, "Pagado"));
    const rows = S.table.map((t) => {
      const c = colorOf(t.name);
      const tr = el("tr", { class: "clickable" + (c ? " sel" : ""), onclick: () => toggle(t.name) },
        el("td", { class: "pos" }, t.pos), nameCell(t),
        S.active.map((x) => {
          const r = x.rows[t.name];
          const won = x.winners.includes(t.name), lost = x.losers.includes(t.name);
          return el("td", { class: `heat h${heat(r.pts)}` + (x.provisional ? " live" : ""), title: `J${x.n}: ${r.pts ?? "–"} pts · ${r.pos}º` },
            r.pts ?? "–", won ? el("span", { class: "crown" }, " 👑") : null, lost ? el("span", { class: "crown" }, " 💸") : null);
        }),
        el("td", { class: "total" }, t.total),
        el("td", {}, t.avg.toFixed(1)),
        el("td", {}, t.won || ""), el("td", {}, t.lost || ""),
        el("td", {}, eur(t.pago)));
      if (c) tr.style.setProperty("--selc", c);
      return tr;
    });
    $("#tabla").replaceChildren(el("thead", {}, head), el("tbody", {}, rows));
    refit();
  }

  // ---------- Evolución ----------
  const tip = el("div", { class: "tip" });
  function renderEvo() {
    const box = $("#evoChart");
    if (!box.offsetParent) return;
    $("#evoChips").replaceChildren(...S.table.map((t) => {
      const c = colorOf(t.name);
      return el("button", { class: "chip" + (c ? " on" : ""), onclick: () => toggle(t.name) },
        el("span", { class: "sw", style: `background:${c || "var(--line-off)"}` }), t.name);
    }));
    const W = Math.max(300, box.clientWidth), H = Math.round(Math.min(380, Math.max(240, W * 0.42)));
    const n = S.active.length, nP = S.table.length;
    const isPos = evoMode === "pos", isPay = evoMode === "pay";
    const val = (t, i) => (isPos ? t.rank[i] : isPay ? t.cumPay[i] : t.cum[i]);
    const fmt = (v) => (isPos ? `${v}º` : isPay ? eur(v) : `${v} pts`);
    const maxV = isPos ? nP : Math.max(1, ...S.table.map((t) => val(t, n - 1)));
    const step = isPos ? 1 : isPay ? (maxV > 20 ? 5 : 2) : maxV > 400 ? 100 : 50;
    const niceMax = isPos ? nP : Math.ceil(maxV / step) * step;
    const ticks = isPos ? Array.from({ length: nP }, (_, i) => i + 1) : Array.from({ length: niceMax / step + 1 }, (_, i) => i * step);
    const tickLbl = (v) => (isPos ? `${v}º` : isPay ? `${v} €` : String(v));
    // margen izquierdo según la etiqueta más ancha
    const m = { l: 12 + Math.max(...ticks.map((v) => tickLbl(v).length)) * 7, r: 92, t: 12, b: 26 };
    const xs = (i) => m.l + (n <= 1 ? 0 : (i * (W - m.l - m.r)) / (n - 1));
    const ys = isPos ? (v) => m.t + ((v - 1) * (H - m.t - m.b)) / (nP - 1) : (v) => H - m.b - (v * (H - m.t - m.b)) / niceMax;

    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Evolución por jornada" });
    for (const v of ticks) {
      s.append(svg("line", { class: "gridline", x1: m.l, x2: W - m.r, y1: ys(v), y2: ys(v) }));
      s.append(txt({ class: "axis-text", x: m.l - 6, y: ys(v) + 4, "text-anchor": "end" }, tickLbl(v)));
    }
    S.active.forEach((x, i) => s.append(txt({ class: "axis-text", x: xs(i), y: H - 8, "text-anchor": "middle" }, `J${x.n}`)));
    const path = (t) => S.active.map((_, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${ys(val(t, i)).toFixed(1)}`).join("");
    const on = sel.map((nm) => S.table.find((t) => t.name === nm)).filter(Boolean);
    for (const t of S.table.filter((t) => !colorOf(t.name)))
      s.append(svg("path", { d: path(t), fill: "none", stroke: "var(--line-off)", "stroke-width": 1.5, "stroke-linejoin": "round" }));
    const labels = [];
    for (const t of on) {
      const c = colorOf(t.name);
      s.append(svg("path", { d: path(t), fill: "none", stroke: c, "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      S.active.forEach((_, i) => s.append(svg("circle", { cx: xs(i), cy: ys(val(t, i)), r: i === n - 1 ? 4 : 2.5, fill: c, stroke: "var(--panel)", "stroke-width": i === n - 1 ? 2 : 1 })));
      labels.push({ y: ys(val(t, n - 1)), name: t.name });
    }
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 14) labels[i].y = labels[i - 1].y + 14;
    for (const l of labels) s.append(txt({ class: "lbl", x: xs(n - 1) + 8, y: l.y + 4 }, l.name));

    const cross = svg("line", { x1: 0, x2: 0, y1: m.t, y2: H - m.b, stroke: "var(--axis)", "stroke-width": 1, visibility: "hidden" });
    s.append(cross);
    const hit = svg("rect", { x: m.l - 10, y: 0, width: W - m.l - m.r + 20, height: H, fill: "transparent" });
    s.append(hit);
    const move = (ev) => {
      const r = s.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      let i = n <= 1 ? 0 : Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      cross.setAttribute("x1", xs(i)); cross.setAttribute("x2", xs(i)); cross.setAttribute("visibility", "visible");
      const list = (on.length ? on : S.table).map((t) => [t, val(t, i)]).sort((a, b) => (isPos ? a[1] - b[1] : b[1] - a[1]));
      tip.replaceChildren(el("div", { class: "t" }, `Tras la jornada ${S.active[i].n}`),
        ...list.map(([t, v]) => el("div", { class: "r" },
          el("span", {}, el("span", { class: "sw", style: `background:${colorOf(t.name) || "var(--muted)"}` }), t.name),
          el("b", {}, fmt(v)))));
      tip.style.display = "block";
      const bx = box.getBoundingClientRect();
      let left = (xs(i) / W) * bx.width + 12;
      if (left + tip.offsetWidth > bx.width) left = (xs(i) / W) * bx.width - tip.offsetWidth - 12;
      tip.style.left = Math.max(0, left) + "px";
      tip.style.top = Math.max(0, ev.clientY - bx.top - 20) + "px";
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerleave", () => { tip.style.display = "none"; cross.setAttribute("visibility", "hidden"); });
    box.replaceChildren(s, tip);
  }

  // ---------- Pagos ----------
  const payHeat = (v) => (!v ? 0 : v <= 0.5 ? 1 : v <= 1.5 ? 2 : v <= 2.5 ? 3 : v <= 4 ? 4 : 5);
  function renderPagos() {
    const byPay = [...S.table].sort((a, b) => b.pago - a.pago || a.name.localeCompare(b.name));
    const most = byPay[0], least = byPay[byPay.length - 1];
    const sanc = S.table.reduce((s, t) => s + t.sanc, 0);
    $("#payTiles").replaceChildren(
      tile("Bote acumulado", eur(S.bote), S.boteProv ? `incluye ${eur(S.boteProv)} provisionales` : ""),
      tile("Quien más ha pagado", most.name, eur(most.pago)),
      tile("Quien menos ha pagado", least.name, eur(least.pago)),
      tile("Por rojas y no alineados", eur(sanc), `${Math.round((sanc / (S.bote || 1)) * 100)}% del bote`),
    );
    const head = el("tr", {}, el("th", { class: "name" }, "Jugador"),
      S.active.map((x) => el("th", { title: x.provisional ? "Provisional" : "" }, `J${x.n}`)),
      el("th", {}, "Total"), el("th", { class: "small", title: "Pagado por posición" }, "Posición"),
      el("th", { class: "small", title: "Rojas y no alineados" }, "Sanciones"));
    const rows = byPay.map((t) => el("tr", {}, nameCell(t),
      S.active.map((x) => {
        const r = x.rows[t.name];
        const parts = [`${r.pos}º: ${eur(r.posFee)}`];
        if (r.rojas) parts.push(`${r.rojas} roja${r.rojas > 1 ? "s" : ""}`);
        if (r.noAl) parts.push(`${r.noAl} no alineado${r.noAl > 1 ? "s" : ""}`);
        if (r.extras) parts.push(`${eur(r.extras)} por rojas / no alineados`);
        if (r.ajuste) parts.push(`ajuste ${eur(r.ajuste)}`);
        return el("td", { class: `pay p${payHeat(r.pago)}` + (x.provisional ? " live" : ""), title: `J${x.n} · ` + parts.join(" · ") },
          r.pago ? r.pago.toLocaleString("es-ES", { minimumFractionDigits: 2 }) : "0", r.sanc ? el("span", { class: "dot" }) : null);
      }),
      el("td", { class: "total" }, eur(t.pago)),
      el("td", { class: "small" }, eur(t.posFee + t.ajuste)),
      el("td", { class: "small" }, t.sanc ? eur(t.sanc) : "–")));
    const sum = el("tr", { class: "sum" }, el("td", { class: "name" }, "Bote"),
      S.active.map((x) => el("td", {}, x.bote.toLocaleString("es-ES", { minimumFractionDigits: 2 }))),
      el("td", { class: "total" }, eur(S.bote)), el("td", {}, ""), el("td", {}, ""));
    $("#payTable").replaceChildren(el("thead", {}, head), el("tbody", {}, rows, sum));
    renderBote();
    refit();
  }

  function renderBote() {
    const box = $("#boteChart");
    if (!box.offsetParent) return;
    const W = Math.max(280, box.clientWidth), H = 230, m = { l: 34, r: 8, t: 18, b: 24 };
    const data = S.active.map((x) => {
      let pos = 0, san = 0;
      for (const p of D.players) { const r = x.rows[p.name]; pos += r.posFee + r.ajuste; san += r.sanc; }
      return { x, pos, san };
    });
    const max = Math.max(4, ...data.map((d) => d.pos + d.san));
    const top = Math.ceil(max / 4) * 4;
    const ys = (v) => H - m.b - (v * (H - m.t - m.b)) / top;
    const bw = Math.min(32, ((W - m.l - m.r) / data.length) * 0.62);
    const xs = (i) => m.l + ((i + 0.5) * (W - m.l - m.r)) / data.length;
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Bote por jornada" });
    for (let v = 0; v <= top; v += top / 4) {
      s.append(svg("line", { class: "gridline", x1: m.l, x2: W - m.r, y1: ys(v), y2: ys(v) }));
      s.append(txt({ class: "axis-text", x: m.l - 6, y: ys(v) + 4, "text-anchor": "end" }, `${v} €`));
    }
    data.forEach((d, i) => {
      const x0 = xs(i) - bw / 2;
      const g = svg("g", { opacity: d.x.provisional ? 0.55 : 1 });
      g.append(svg("rect", { x: x0, y: ys(d.pos), width: bw, height: ys(0) - ys(d.pos), fill: "var(--s1)", rx: 3 }));
      if (d.san) g.append(svg("rect", { x: x0, y: ys(d.pos + d.san), width: bw, height: ys(0) - ys(d.san) - 1, fill: "var(--miss)", rx: 3 }));
      const t = svg("title"); t.textContent = `J${d.x.n}: ${eur(d.pos + d.san)} (posición ${eur(d.pos)}, sanciones ${eur(d.san)})${d.x.provisional ? " · provisional" : ""}`;
      g.append(t);
      s.append(g);
      s.append(txt({ class: "axis-text", x: xs(i), y: ys(d.pos + d.san) - 5, "text-anchor": "middle" }, (d.pos + d.san).toLocaleString("es-ES")));
      s.append(txt({ class: "axis-text", x: xs(i), y: H - 6, "text-anchor": "middle" }, `J${d.x.n}`));
    });
    box.replaceChildren(s);
  }

  // ---------- Jornada ----------
  function renderJornada() {
    const x = S.jornadas.find((j) => j.n === curJ);
    $("#jSel").replaceChildren(...S.active.map((j) =>
      el("button", { "aria-pressed": String(j.n === curJ), onclick: () => { curJ = j.n; renderJornada(); } }, `J${j.n}`)));
    $("#jTitle").replaceChildren(...[`Jornada ${x.n} `, x.provisional ? el("span", { class: "badge st-suspendido" }, "provisional") : null,
      x.k > 1 ? el("span", { class: "badge st-aplazado" }, ` pagos ×${x.k}`) : null].filter(Boolean));
    const note = $("#jNote");
    note.hidden = !x.j.nota;
    note.textContent = x.j.nota || "";
    const order = D.players.map((p) => p.name).sort((a, b) => (x.rows[a].pos ?? 99) - (x.rows[b].pos ?? 99) || a.localeCompare(b));
    const maxPts = Math.max(1, ...order.map((p) => x.rows[p].pts || 0));
    const head = el("tr", {}, el("th", {}, "Pos."), el("th", { class: "name" }, "Jugador"), el("th", { class: "left" }, "Puntos"),
      el("th", {}, "Paga"), el("th", { class: "left" }, "Desglose"));
    const rows = order.map((p) => {
      const r = x.rows[p];
      const parts = [`${r.pos}º → ${e0(r.posFee)}`];
      if (r.rojas) parts.push(`${r.rojas} roja${r.rojas > 1 ? "s" : ""} → ${eur(r.rojas)}`);
      if (r.noAl) parts.push(`${r.noAl} no alineado${r.noAl > 1 ? "s" : ""} → ${eur(r.noAl)}`);
      if (r.extras) parts.push(`rojas / no alineados → ${eur(r.extras)}`);
      if (r.ajuste) parts.push(`ajuste → ${eur(r.ajuste)}`);
      return el("tr", {},
        el("td", { class: "pos" }, r.pos ? `${r.pos}º` : "–"),
        el("td", { class: "name" }, p, x.winners.includes(p) ? " 👑" : "", x.losers.includes(p) ? " 💸" : "", el("span", { class: "team" }, teamOf(p))),
        el("td", { class: "ptsc left" }, r.pts ?? "–", r.pts ? el("span", { class: "ptsbar", style: `width:${Math.round((r.pts / maxPts) * 100)}%` }) : null),
        el("td", { class: "payc", title: parts.join(" · ") }, eur(r.pago), r.sanc || r.ajuste ? el("span", { class: "team" }, `+${e0(r.sanc + r.ajuste)} ${r.sanc ? "sanción" : "ajuste"}`) : null),
        el("td", { class: "brk" }, parts.join(" · ")));
    });
    const sum = el("tr", { class: "sum" }, el("td", {}, ""), el("td", { class: "name" }, "Bote de la jornada"),
      el("td", { class: "left" }, `media ${x.avg.toFixed(1)} pts`), el("td", { class: "payc" }, eur(x.bote)), el("td", {}, ""));
    $("#jTable").replaceChildren(el("thead", {}, head), el("tbody", {}, rows, sum));
    refit();
  }

  // ---------- Estadísticas ----------
  function renderStats() {
    const T = S.table, A = S.active;
    const bars = (box, items, maxV, fmt) => $(box).replaceChildren(...items.map((it) =>
      el("div", { class: "stackrow", title: it.title || "" },
        el("span", { class: "n" }, it.name, el("small", {}, it.team)),
        el("span", { class: "bar" }, el("span", { style: `width:${Math.max(2, (it.v / maxV) * 100)}%;background:${it.color || "var(--accent)"};border-radius:0 4px 4px 0` })),
        el("span", { class: "v" }, fmt(it)))));
    const nP = D.players.length;
    bars("#avgPos", [...T].sort((a, b) => a.avgPos - b.avgPos).map((t) => ({ ...t, v: t.avgPos })), nP,
      (t) => `${t.avgPos.toFixed(1)}º · ${t.won}👑 ${t.lost}💸`);
    bars("#avgPts", [...T].sort((a, b) => b.avg - a.avg).map((t) => ({ ...t, v: t.avg, color: "var(--s3)", title: t.best ? `Mejor: ${t.best.pts} pts en la J${t.best.n}` : "" })),
      Math.max(...T.map((t) => t.avg)), (t) => `${t.avg.toFixed(1)} · máx ${t.best ? t.best.pts : "–"}`);

    // reparto de posiciones
    const head = el("tr", {}, el("th", { class: "name" }, "Jugador"), Array.from({ length: nP }, (_, i) => el("th", {}, `${i + 1}º`)));
    const cnt = (t, k) => A.filter((x) => x.rows[t.name].pos === k).length;
    const maxC = Math.max(1, ...T.flatMap((t) => Array.from({ length: nP }, (_, i) => cnt(t, i + 1))));
    const rows = [...T].sort((a, b) => a.avgPos - b.avgPos).map((t) => el("tr", {}, nameCell(t),
      Array.from({ length: nP }, (_, i) => {
        const c = cnt(t, i + 1);
        const lvl = c ? Math.min(5, 1 + Math.round(((c - 1) / Math.max(1, maxC - 1)) * 4)) : 0;
        return el("td", { class: `d heat h${lvl}` }, c || "");
      })));
    $("#posDist").replaceChildren(el("thead", {}, head), el("tbody", {}, rows));

    // curiosidades
    const facts = [];
    let best = null, worst = null, gap = null;
    for (const x of A) for (const p of D.players) {
      const v = x.rows[p.name].pts; if (v == null) continue;
      if (!best || v > best.v) best = { v, p: p.name, n: x.n };
      if (!worst || v < worst.v) worst = { v, p: p.name, n: x.n };
    }
    for (const x of A) {
      const sorted = D.players.map((p) => x.rows[p.name].pts).filter((v) => v != null).sort((a, b) => b - a);
      if (sorted.length > 1 && (!gap || sorted[0] - sorted[1] > gap.d)) gap = { d: sorted[0] - sorted[1], x };
    }
    if (best) facts.push(["Récord de puntos en una jornada", `${best.v} pts`, `${best.p} en la J${best.n}`]);
    if (worst) facts.push(["Peor jornada", `${worst.v} pts`, `${worst.p} en la J${worst.n}`]);
    const kings = [...T].sort((a, b) => b.won - a.won);
    facts.push(["Más jornadas ganadas", kings.filter((t) => t.won === kings[0].won).map((t) => t.name).join(" · "), `${kings[0].won} 👑`]);
    const losers = [...T].sort((a, b) => b.lost - a.lost);
    facts.push(["Más veces último", losers.filter((t) => t.lost === losers[0].lost).map((t) => t.name).join(" · "), `${losers[0].lost} 💸`]);
    const sancT = [...T].sort((a, b) => b.sanc - a.sanc)[0];
    if (sancT && sancT.sanc) facts.push(["Más sanciones (rojas / no alineados)", sancT.name, `${eur(sancT.sanc)} pagados por sanciones`]);
    const pay = [...T].sort((a, b) => b.pago - a.pago)[0];
    facts.push(["Mayor contribuyente al bote", pay.name, `${eur(pay.pago)} (${Math.round((pay.pago / (S.bote || 1)) * 100)}% del bote)`]);
    if (gap) facts.push(["Victoria más holgada", `+${gap.d} pts`, `${gap.x.winners.join(" · ")} en la J${gap.x.n}`]);
    const byAvg = [...A].sort((a, b) => b.avg - a.avg);
    if (byAvg.length) {
      facts.push(["Jornada más productiva", `J${byAvg[0].n}`, `media de ${byAvg[0].avg.toFixed(1)} pts por plantilla`]);
      facts.push(["Jornada más floja", `J${byAvg[byAvg.length - 1].n}`, `media de ${byAvg[byAvg.length - 1].avg.toFixed(1)} pts por plantilla`]);
    }
    const reg = [...T].map((t) => {
      const ps = A.map((x) => x.rows[t.name].pts).filter((v) => v != null);
      const sd = Math.sqrt(ps.reduce((s, v) => s + (v - t.avg) ** 2, 0) / (ps.length || 1));
      return { t, sd };
    }).sort((a, b) => a.sd - b.sd);
    if (reg.length) facts.push(["El más regular", reg[0].t.name, `sus jornadas se mueven ±${reg[0].sd.toFixed(0)} pts de su media`]);
    let streak = null;
    for (const t of T) {
      let cur = 0, bestS = 0, end = 0;
      A.forEach((x, i) => { const r = x.rows[t.name]; if (r.pos && r.pos <= 3) { cur++; if (cur > bestS) { bestS = cur; end = i; } } else cur = 0; });
      if (!streak || bestS > streak.n) streak = { n: bestS, t, from: A[end - bestS + 1], to: A[end] };
    }
    if (streak && streak.n > 1) facts.push(["Mejor racha en el podio", `${streak.n} jornadas`, `${streak.t.name}, de la J${streak.from.n} a la J${streak.to.n}`]);
    $("#facts").replaceChildren(...facts.map(([k, v, d]) => el("div", { class: "fact" }, el("div", { class: "k" }, k), el("div", { class: "v" }, v), el("div", { class: "d" }, d))));
  }

  // ---------- Carga ----------
  let lastUpdated = null;
  async function load(auto = false) {
    try {
      const res = await fetch(`data.json?v=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (auto && data.updated === lastUpdated) return;
      const first = lastUpdated === null;
      lastUpdated = data.updated;
      D = data; S = compute(data);
      $("#season").textContent = `${data.liga} · Temporada ${data.temporada}`;
      const d = new Date(data.updated);
      $("#updated").textContent = `Actualizado ${d.toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}`;
      if (first) sel.splice(0, sel.length, ...S.table.slice(0, 3).map((t) => t.name));
      const lastN = S.active.length ? S.active[S.active.length - 1].n : 1;
      if (first || !S.active.some((j) => j.n === curJ)) curJ = lastN;
      renderTiles(); renderTable(); renderEvo(); renderPagos(); renderJornada(); renderStats();
    } catch (e) {
      if (!auto) $("#updated").replaceChildren(el("span", { class: "err" }, `No se pudieron cargar los datos (${e.message}).`));
      console.error(e);
    }
  }
  setInterval(() => { if (!document.hidden) load(true); }, 120000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S) load(true); });

  // ---------- Pantalla completa ----------
  function setFull(card, on) {
    document.querySelectorAll(".fs-able.is-full").forEach((c) => { if (c !== card) c.classList.remove("is-full"); });
    card.classList.toggle("is-full", on);
    document.body.classList.toggle("has-full", on);
    const b = card.querySelector(".fs-btn");
    b.setAttribute("aria-pressed", String(on));
    b.textContent = on ? "✕ Salir" : "⛶ Pantalla completa";
    const root = document.documentElement;
    if (on && root.requestFullscreen && !document.fullscreenElement) root.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    fit(card);
  }
  function fit(card) {
    const box = card.querySelector(".scroll-x"), t = box.querySelector("table");
    t.style.transform = ""; box.style.width = ""; box.style.height = "";
    if (!card.classList.contains("is-full")) return;
    const w = t.offsetWidth, h = t.offsetHeight;
    const cs = getComputedStyle(card);
    const availW = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = window.innerHeight - box.getBoundingClientRect().top - parseFloat(cs.paddingBottom);
    const k = Math.min(availW / w, availH / h, 1.6);
    t.style.transform = `scale(${k})`;
    box.style.width = `${w * k}px`; box.style.height = `${h * k}px`;
  }
  function refit() { document.querySelectorAll(".fs-able.is-full").forEach(fit); }
  document.querySelectorAll(".fs-able").forEach((card) =>
    card.querySelector(".fs-btn").addEventListener("click", () => setFull(card, !card.classList.contains("is-full"))));
  const closeFull = () => document.querySelectorAll(".fs-able.is-full").forEach((c) => setFull(c, false));
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) closeFull(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeFull(); });

  document.querySelectorAll("#evoMode button").forEach((b) => b.addEventListener("click", () => {
    evoMode = b.dataset.m;
    document.querySelectorAll("#evoMode button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderEvo();
  }));

  // ---------- Pestañas ----------
  const TABS = ["clasificacion", "pagos", "jornadas", "estadisticas"];
  function showTab() {
    const t = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : TABS[0];
    document.querySelectorAll(".tabs a").forEach((a) => a.setAttribute("aria-selected", String(a.dataset.tab === t)));
    document.querySelectorAll(".tabpanel").forEach((p) => { p.hidden = p.dataset.panel !== t; });
    if (S) { if (t === "clasificacion") renderEvo(); if (t === "pagos") renderBote(); }
  }
  window.addEventListener("hashchange", () => { closeFull(); showTab(); window.scrollTo(0, 0); });
  showTab();

  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (S) { renderEvo(); renderBote(); } refit(); }, 120); });
  load();
})();
