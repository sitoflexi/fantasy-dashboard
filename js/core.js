// Reglas de pago y cálculos. Compartido por el dashboard y el panel admin.
// Cada jornada: el 1º paga 0 € y cada posición siguiente 0,50 € más (con 7 jugadores, el último paga 3 €).
// En la J19 la escala va ×4 (0–12 €) y en la J38 ×8 (0–24 €).
// Además: +1 € por cada tarjeta roja y +1 € por cada jugador no alineado de la plantilla.
// Empates: comparten la mejor posición (dos segundos pagan 0,50 € cada uno y el siguiente es 4º).
window.FANTASY = (() => {
  const eur = (v) => `${(v || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

  function mult(data, n) {
    const m = data.reglas && data.reglas.multiplicador;
    return (m && Number(m[n])) || 1;
  }

  function compute(data) {
    const names = data.players.map((p) => p.name);
    const R = data.reglas || {};
    const paso = R.paso ?? 0.5, porRoja = R.porRoja ?? 1, porNA = R.porNoAlineado ?? 1;

    const js = data.jornadas.map((j) => {
      const pts = j.puntos || {};
      const has = names.some((p) => num(pts[p]) != null);
      const k = mult(data, j.n);
      const rows = {};
      for (const p of names) {
        const v = num(pts[p]);
        const pos = v == null ? null : 1 + names.filter((q) => num(pts[q]) != null && pts[q] > v).length;
        const rojas = (j.rojas && j.rojas[p]) || 0;
        const noAl = (j.noAlineados && j.noAlineados[p]) || 0;
        const extras = (j.extras && j.extras[p]) || 0;
        const ajuste = (j.ajuste && j.ajuste[p]) || 0;
        const posFee = pos == null ? 0 : (pos - 1) * paso * k;
        const sanc = rojas * porRoja + noAl * porNA + extras;
        rows[p] = { pts: v, pos, rojas, noAl, extras, ajuste, posFee, sanc, pago: has ? posFee + sanc + ajuste : 0 };
      }
      const vals = names.map((p) => rows[p].pts).filter((v) => v != null);
      const max = vals.length ? Math.max(...vals) : null, min = vals.length ? Math.min(...vals) : null;
      return {
        n: j.n, j, has, k, rows,
        provisional: j.estado === "provisional",
        winners: has ? names.filter((p) => rows[p].pts === max) : [],
        losers: has ? names.filter((p) => rows[p].pts === min) : [],
        bote: names.reduce((s, p) => s + rows[p].pago, 0),
        avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
        max, min,
      };
    });

    const active = js.filter((x) => x.has);
    const table = data.players.map((pl) => {
      const p = pl.name;
      let total = 0, pago = 0, posFee = 0, sanc = 0, ajuste = 0, won = 0, lost = 0, rojas = 0, noAl = 0, extras = 0, posSum = 0;
      let best = null, worst = null;
      const cum = [], pays = [], cumPay = [];
      for (const x of active) {
        const r = x.rows[p];
        total += r.pts || 0; pago += r.pago; posFee += r.posFee; sanc += r.sanc; ajuste += r.ajuste;
        rojas += r.rojas; noAl += r.noAl; extras += r.extras; posSum += r.pos || 0;
        if (x.winners.includes(p)) won++;
        if (x.losers.includes(p)) lost++;
        if (r.pts != null) {
          if (!best || r.pts > best.pts) best = { pts: r.pts, n: x.n };
          if (!worst || r.pts < worst.pts) worst = { pts: r.pts, n: x.n };
        }
        cum.push(total); pays.push(r.pago); cumPay.push(pago);
      }
      return { name: p, team: pl.team, total, pago, posFee, sanc, ajuste, won, lost, rojas, noAl, extras,
        avgPos: active.length ? posSum / active.length : 0, avg: active.length ? total / active.length : 0,
        best, worst, cum, pays, cumPay };
    });
    table.sort((a, b) => b.total - a.total || a.pago - b.pago || a.name.localeCompare(b.name));
    table.forEach((t, i) => { t.pos = i > 0 && table[i - 1].total === t.total ? table[i - 1].pos : i + 1; });

    // posición en la general tras cada jornada
    active.forEach((x, k) => {
      const sorted = [...table].sort((a, b) => b.cum[k] - a.cum[k]);
      sorted.forEach((t, i) => {
        t.rank = t.rank || [];
        t.rank[k] = i > 0 && sorted[i - 1].cum[k] === t.cum[k] ? sorted[i - 1].rank[k] : i + 1;
      });
    });

    const bote = table.reduce((s, t) => s + t.pago, 0);
    const boteProv = active.filter((x) => x.provisional).reduce((s, x) => s + x.bote, 0);
    return { jornadas: js, active, table, bote, boteProv };
  }

  return { compute, eur, mult };
})();
