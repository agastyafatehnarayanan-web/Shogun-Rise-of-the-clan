/* =====================================================================
 * Espionage: the hidden layer. Recruit Shinobi, embed them, and run ops.
 * Op strength = embedded agents + koban committed + Spymaster.
 * Target defence = counter-intel + security + alertness.
 * ===================================================================== */

SR.absSeason = (S) => S.year * 4 + S.seasonIdx;

SR.AGENT_COST = 3;
SR.SPYMASTER_COST = 5;

SR.ops = {
  recon:      { name: "Reconnaissance", koban: 1, sec: 0, risk: false,
    desc: "Reveal the true strength & composition of an enemy province's army." },
  sabotage:   { name: "Sabotage", koban: 2, sec: 2, risk: false,
    desc: "Wreck a building or slight a castle wall in a target province." },
  incite:     { name: "Incite Revolt", koban: 2, sec: 2, risk: false,
    desc: "Stir unrest in an enemy's occupied province, risking open revolt." },
  assassinate:{ name: "Assassination", koban: 3, sec: 5, risk: true,
    desc: "Attempt to kill a rival's daimyō. High reward, high blowback." },
};

SR.recruitAgent = function (S, cid) {
  const c = S.clans[cid];
  if (c.koban < SR.AGENT_COST) return { ok: false, reason: `Need ${SR.AGENT_COST} koban.` };
  c.koban -= SR.AGENT_COST;
  c.agents.push({ uid: SR.uid(), target: null, embedAbs: null });
  SR.log(S, `${c.name} recruits a Shinobi.`, "spy");
  return { ok: true };
};

SR.hireSpymaster = function (S, cid) {
  const c = S.clans[cid];
  if (c.spymaster) return { ok: false, reason: "You already keep a Spymaster." };
  if (c.koban < SR.SPYMASTER_COST) return { ok: false, reason: `Need ${SR.SPYMASTER_COST} koban.` };
  c.koban -= SR.SPYMASTER_COST; c.spymaster = true;
  SR.log(S, `${c.name} retains a Spymaster (boosts all ops & counter-intel).`, "spy");
  return { ok: true };
};

/* Deploy a free agent onto a target (province id). Embeds after 1 season. */
SR.deployAgent = function (S, cid, agentUid, targetProv) {
  const a = S.clans[cid].agents.find(x => x.uid === agentUid);
  if (!a) return { ok: false, reason: "No such agent." };
  a.target = targetProv; a.embedAbs = SR.absSeason(S) + 1;
  SR.log(S, `${S.clans[cid].name} inserts an agent into ${SR.stat(targetProv).name}.`, "spy");
  return { ok: true };
};

SR.embeddedOn = function (S, cid, targetProv) {
  const now = SR.absSeason(S);
  return S.clans[cid].agents.filter(a => a.target === targetProv && a.embedAbs !== null && a.embedAbs <= now).length;
};
SR.agentsOn = function (S, cid, targetProv) {
  return S.clans[cid].agents.filter(a => a.target === targetProv);
};

/* Run an operation. targetProv is a province id; op-specific effects. */
SR.runOp = function (S, cid, opKey, targetProv, kobanCommit) {
  const c = S.clans[cid]; const op = SR.ops[opKey];
  if (!op) return { ok: false, reason: "Unknown op." };
  const embedded = SR.embeddedOn(S, cid, targetProv);
  if (embedded === 0 && SR.agentsOn(S, cid, targetProv).length === 0)
    return { ok: false, reason: "Place an agent on the target first (it embeds after a season)." };
  kobanCommit = SR.clamp(kobanCommit || 0, 0, c.koban);
  const need = op.koban + kobanCommit;
  if (c.koban < need) return { ok: false, reason: `Need ${need} koban.` };
  c.koban -= need;

  const targetClan = S.provinces[targetProv].owner;
  const targetIsClan = targetClan && !S.clans[targetClan].isNeutral;

  const opStrength = embedded * 3 + kobanCommit + (c.spymaster ? 3 : 0) + SR.rint(0, 3) + 1;
  const security = op.sec + S.provinces[targetProv].castle
    + (targetIsClan && S.clans[targetClan].spymaster ? 3 : 0)
    + (S.provinces[targetProv].units.length > 4 ? 1 : 0) + SR.rint(0, 3);

  const success = opStrength >= security;
  const exposed = !success ? SR.chance(0.5) : (op.risk ? SR.chance(0.35) : SR.chance(0.1));

  const report = { ok: true, opKey, targetProv, success, exposed, opStrength, security, lines: [] };

  if (success) {
    switch (opKey) {
      case "recon":
        S.provinces[targetProv]._revealed = SR.absSeason(S) + 4;
        report.lines.push(`Your agents map ${SR.stat(targetProv).name}: its garrison is laid bare.`);
        break;
      case "sabotage": {
        const ps = S.provinces[targetProv];
        const bks = Object.keys(ps.buildings);
        if (bks.length && SR.chance(0.6)) { const k = SR.pick(bks); delete ps.buildings[k];
          report.lines.push(`Saboteurs burn the ${DATA.buildings[k] ? DATA.buildings[k].name : k} at ${SR.stat(targetProv).name}.`); }
        else if (ps.castle > 0) { ps.castle -= 1;
          report.lines.push(`Agents slight a wall of ${SR.stat(targetProv).name} — castle now level ${ps.castle}.`); }
        else report.lines.push(`Stores are put to the torch at ${SR.stat(targetProv).name}.`);
        SR.applyMineFlags(S);
        c.prestige += 1;
        break;
      }
      case "incite":
        S.provinces[targetProv].unrest += 3;
        if (["occupied", "pacifying"].includes(S.provinces[targetProv].status) && SR.chance(0.4)) SR.revolt(S, targetProv);
        report.lines.push(`Agitators inflame ${SR.stat(targetProv).name} — unrest surges.`);
        c.prestige += 1;
        break;
      case "assassinate":
        if (targetIsClan && S.clans[targetClan].daimyoAlive && S.clans[targetClan].daimyoLoc === targetProv) {
          S.clans[targetClan].daimyoAlive = false; c.prestige += 3;
          report.lines.push(`${S.clans[targetClan].daimyo} is assassinated! (+3 Prestige)`);
        } else {
          report.lines.push(`The blade finds a lesser general; the daimyō was elsewhere.`);
          c.prestige += 1;
        }
        break;
    }
    SR.log(S, `${c.name}'s ${op.name} on ${SR.stat(targetProv).name} succeeds.`, "spy");
  } else {
    // burn an agent on failure
    const a = S.clans[cid].agents.find(x => x.target === targetProv);
    if (a) S.clans[cid].agents.splice(S.clans[cid].agents.indexOf(a), 1);
    report.lines.push(`The operation fails; an agent is lost.`);
    SR.log(S, `${c.name}'s ${op.name} on ${SR.stat(targetProv).name} fails.`, "spy");
  }

  if (exposed && targetIsClan) {
    const cost = op.risk ? 4 : 2;
    c.honour = SR.clamp(c.honour - cost, 0, 20);
    S.clans[targetClan].relations[cid].attitude -= 40;
    c.relations[targetClan] && (c.relations[targetClan].pact = "none");
    S.clans[targetClan].relations[cid] && (S.clans[targetClan].relations[cid].pact = "none");
    if (targetClan === S.humanClan) c.prestige -= 1;
    report.lines.push(`Your hand is exposed! −${cost} Honour, and ${S.clans[targetClan].name} now has a casus belli.`);
    SR.log(S, `${c.name}'s spy is exposed by ${S.clans[targetClan].name} (−${cost} Honour).`, "bad");
    S.clans[targetClan].prestige += 1;   // exposing an agent
  }
  return report;
};

/* Counter-intel op strength for a defender (used by AI evaluations). */
SR.counterIntel = (S, cid) => (S.clans[cid].spymaster ? 3 : 0) + 1;

if (typeof module !== "undefined") module.exports = SR;
