/* =====================================================================
 * Diplomacy: pacts (NAP / trade / alliance / marriage / vassalage),
 * honour-gated trust, and AI acceptance. Anti-runaway is handled in
 * battle.js (half honour cost to break pacts against the leader).
 * ===================================================================== */

SR.PACTS = {
  nap:      { name: "Non-Aggression Pact", binding: false, gift: 0,  years: 3 },
  trade:    { name: "Trade Agreement",     binding: false, gift: 0,  years: 0 },
  alliance: { name: "Alliance",            binding: true,  gift: 1,  years: 0 },
  marriage: { name: "Marriage Alliance",   binding: true,  gift: 2,  years: 0 },
  vassal:   { name: "Vassalage",           binding: true,  gift: 0,  years: 0 },
};

/* Gift cost to propose `type`, after the Diplomacy & Court axis (Dp−3). */
SR.pactGift = function (S, cid, type) {
  const P = SR.PACTS[type]; if (!P) return 0;
  return Math.max(0, P.gift - (S.clans[cid].dp - 3));
};

SR.relPower = function (S, cid) {
  return SR.pacifiedProvinces(S, cid).length * 2 +
    SR.sum(SR.clanProvinces(S, cid), id => SR.armyPower(S.provinces[id].units)) / 3;
};

/* Can `a` legally offer `type` to `b`? (trust gate) */
SR.canOfferPact = function (S, a, b, type) {
  const P = SR.PACTS[type];
  if (!P) return { ok: false, reason: "Unknown pact." };
  const ra = S.clans[a].relations[b];
  if (ra && ["alliance", "marriage", "vassal"].includes(ra.pact))
    return { ok: false, reason: "You already share a binding pact." };
  if (P.binding) {
    // both must be at least "Low" honour to form binding pacts
    if (SR.honourBand(S.clans[a].honour).name === "Infamous")
      return { ok: false, reason: "Infamous clans can form no binding pacts — restore your name first." };
    if (SR.honourBand(S.clans[b].honour).name === "Infamous")
      return { ok: false, reason: `${S.clans[b].name} is Infamous — no one will bind to them.` };
  }
  const gift = SR.pactGift(S, a, type);
  if (S.clans[a].koban < gift) return { ok: false, reason: `Need ${gift} koban as a gift.` };
  return { ok: true };
};

/* AI decides whether to accept an offer from `from`. */
SR.aiAcceptPact = function (S, ai, from, type) {
  const rel = S.clans[ai].relations[from];
  const attitude = rel ? rel.attitude : 0;
  const powFrom = SR.relPower(S, from), powAi = SR.relPower(S, ai);
  const leader = SR.prestigeLeader(S);
  let score = attitude + SR.honourBand(S.clans[from].honour).endScore * 2;
  if (S.flags.peaceSeason) score += 15;
  if (from === leader) score -= 25;                 // wary of the front-runner
  switch (type) {
    case "nap": score += 20; break;
    case "trade": score += 25; break;
    case "alliance": score += 5 - Math.abs(powFrom - powAi); break;
    case "marriage": score += 10; break;
    case "vassal": score += (powFrom > powAi * 1.8 ? 25 : -40); break;   // submit only if far weaker
  }
  return score > 15;
};

/* Form the pact (mutually). Applies costs / prestige / honour. */
SR.formPact = function (S, a, b, type) {
  const P = SR.PACTS[type];
  S.clans[a].koban = Math.max(0, S.clans[a].koban - SR.pactGift(S, a, type));
  const setRel = (x, y) => { const r = S.clans[x].relations[y]; if (r) { r.pact = type; r.years = P.years; r.attitude += 30; } };
  if (type === "vassal") {
    // b becomes vassal of a
    S.clans[b].overlord = a; if (!S.clans[a].vassals.includes(b)) S.clans[a].vassals.push(b);
    setRel(a, b); setRel(b, a);
    SR.log(S, `${S.clans[b].name} submits as a vassal of ${S.clans[a].name}.`, "info");
  } else {
    setRel(a, b); setRel(b, a);
    if (type === "marriage") {
      if (!S.clans[a].marriages.includes(b)) S.clans[a].marriages.push(b);
      if (!S.clans[b].marriages.includes(a)) S.clans[b].marriages.push(a);
      S.clans[a].honour = SR.clamp(S.clans[a].honour + 1, 0, 20);
      S.clans[b].honour = SR.clamp(S.clans[b].honour + 1, 0, 20);
      S.clans[a].prestige += 2; S.clans[b].prestige += 2;
    }
    SR.log(S, `${S.clans[a].name} and ${S.clans[b].name} conclude a ${P.name}.`, "info");
  }
};

/* Player proposes; returns {ok, accepted, reason}. */
SR.proposePact = function (S, from, to, type) {
  const chk = SR.canOfferPact(S, from, to, type);
  if (!chk.ok) return { ok: false, reason: chk.reason };
  const accepted = SR.aiAcceptPact(S, to, from, type);
  if (accepted) { SR.formPact(S, from, to, type); return { ok: true, accepted: true }; }
  // failed offer still costs goodwill nudge
  const r = S.clans[to].relations[from]; if (r) r.attitude -= 5;
  SR.log(S, `${S.clans[to].name} rebuffs the ${SR.PACTS[type].name} offered by ${S.clans[from].name}.`, "info");
  return { ok: true, accepted: false, reason: `${S.clans[to].name} declines.` };
};

/* Per-season diplomacy income (trade agreements, vassal tribute). */
SR.diplomacyIncome = function (S) {
  for (const a of SR.livingClans(S)) {
    for (const b in S.clans[a].relations) {
      const r = S.clans[a].relations[b];
      if (r.pact === "trade") S.clans[a].koban += 1;
    }
  }
  // vassal tribute once per year (Autumn): 1 koban + 1 rice (Δ50)
  if (DATA.seasons[S.seasonIdx] === "Autumn") {
    for (const a of SR.livingClans(S)) {
      for (const v of S.clans[a].vassals) {
        if (S.clans[v] && S.clans[v].alive) {
          const k = Math.min(1, S.clans[v].koban), r = Math.min(1, S.clans[v].rice);
          S.clans[v].koban -= k; S.clans[a].koban += k;
          S.clans[v].rice -= r; S.clans[a].rice += r;
        }
      }
    }
  }
};

/* Light AI-to-AI diplomacy: gang up on the leader, seek useful pacts. */
SR.aiDiplomacyTurn = function (S, ai) {
  if (SR.chance(0.5)) return;
  const leader = SR.prestigeLeader(S);
  const others = SR.livingClans(S).filter(c => c !== ai);
  // ally against the leader
  if (leader && leader !== ai) {
    const cand = others.find(c => c !== leader && S.clans[ai].relations[c].pact === "none" &&
      SR.honourBand(S.clans[ai].honour).name !== "Infamous" && SR.honourBand(S.clans[c].honour).name !== "Infamous");
    if (cand && SR.chance(0.4)) {
      if (SR.aiAcceptPact(S, cand, ai, "alliance")) SR.formPact(S, ai, cand, "alliance");
      return;
    }
  }
  // otherwise seek a NAP with a strong neighbour
  const strong = others.filter(c => SR.relPower(S, c) > SR.relPower(S, ai))
    .find(c => S.clans[ai].relations[c].pact === "none");
  if (strong && SR.aiAcceptPact(S, strong, ai, "nap")) SR.formPact(S, ai, strong, "nap");
};

if (typeof module !== "undefined") module.exports = SR;
