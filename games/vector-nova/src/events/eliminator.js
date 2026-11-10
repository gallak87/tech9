export const ELIMINATOR_RULES_VERSION = 1;
const EPSILON = 1e-8;
const copy = (value) => structuredClone(value);

// Sprint completion owns its exact crossing duration. Continuous field races
// may not maintain a cumulative circuit clock for this one-shot finish.
export function qualifiedEliminatorFinishTime(progress) {
  return progress?.course?.format === 'sprint' &&
    progress.complete &&
    progress.valid &&
    Number.isFinite(progress.lastLap) &&
    progress.lastLap > 0
    ? progress.lastLap
    : null;
}

// The contest clock is simulation time. This owner never moves ships, modifies
// their inputs, or substitutes authored progress for the physical route state.
export function createEliminatorEvent({
  ids,
  gridOrder = ids,
  firstCut = 22,
  interval = 10,
  playerId = 'player',
  finishDistance,
} = {}) {
  if (
    !Array.isArray(ids) ||
    ids.length < 2 ||
    ids.length > 128 ||
    new Set(ids).size !== ids.length ||
    !ids.every(
      (id) => typeof id === 'string' && id.length > 0 && id.length <= 64,
    ) ||
    !ids.includes(playerId) ||
    !Array.isArray(gridOrder) ||
    gridOrder.length !== ids.length ||
    new Set(gridOrder).size !== ids.length ||
    !gridOrder.every((id) => ids.includes(id)) ||
    !Number.isFinite(firstCut) ||
    firstCut <= 0 ||
    !Number.isFinite(interval) ||
    interval <= 0 ||
    (finishDistance !== undefined &&
      (!Number.isFinite(finishDistance) || finishDistance <= 0)) ||
    !Number.isFinite(firstCut + (ids.length - 2) * interval)
  )
    throw new Error('Invalid Eliminator field or cut schedule');
  const field = [...ids],
    grid = new Map(gridOrder.map((id, i) => [id, i]));
  const rulesId = JSON.stringify({
    version: ELIMINATOR_RULES_VERSION,
    ids: field,
    gridOrder,
    firstCut,
    interval,
    playerId,
    ...(finishDistance === undefined ? {} : { finishDistance }),
  });
  let state;
  const activeIds = () =>
    field.filter((id) => !state.eliminated.some((entry) => entry.id === id));
  const nextCut = () => firstCut + state.eliminated.length * interval;
  const rank = () =>
    activeIds()
      .map((id) => state.rows[id])
      .sort(
        (a, b) =>
          b.distance - a.distance ||
          grid.get(a.id) - grid.get(b.id) ||
          a.id.localeCompare(b.id),
      );
  function reset() {
    state = {
      elapsed: 0,
      rows: Object.fromEntries(
        field.map((id) => [
          id,
          {
            id,
            name: id,
            distance: 0,
            valid: true,
            ...(finishDistance === undefined ? {} : { finishTime: null }),
          },
        ]),
      ),
      eliminated: [],
      terminal: null,
      result: null,
    };
  }
  function standings() {
    const remaining = activeIds().length;
    const ended =
      state.terminal ||
      remaining === 1 ||
      state.eliminated.some((entry) => entry.id === playerId);
    const ordered = rank();
    if (state.terminal)
      ordered.sort(
        (a, b) =>
          Number(b.id === state.terminal.id) -
          Number(a.id === state.terminal.id),
      );
    const active = ordered.map((row, i) => ({
      ...row,
      position: i + 1,
      status:
        remaining === 1 || state.terminal?.id === row.id
          ? 'winner'
          : ended
            ? 'survived'
            : 'active',
      eliminated: false,
      finished: remaining === 1 || !!state.terminal,
      eliminatedAt: null,
      eliminationOrder: null,
      totalTime: remaining === 1 || state.terminal ? state.elapsed : null,
    }));
    const removed = state.eliminated.map((entry, i) => ({
      ...state.rows[entry.id],
      position: entry.position,
      status: 'eliminated',
      eliminated: true,
      finished: true,
      eliminatedAt: entry.at,
      eliminationOrder: i + 1,
      totalTime: entry.at,
    }));
    return [...active, ...removed].sort((a, b) => a.position - b.position);
  }
  function finish() {
    const playerCut = state.eliminated.find((entry) => entry.id === playerId);
    if (!playerCut && activeIds().length > 1 && !state.terminal) return null;
    const classification = standings();
    state.result = {
      mode: 'eliminator',
      playerPosition: classification.find((row) => row.id === playerId)
        .position,
      won: !playerCut && (!state.terminal || state.terminal.id === playerId),
      playerValid: state.rows[playerId].valid,
      standings: classification,
      elapsed: state.elapsed,
      time: state.elapsed,
      reason: playerCut
        ? 'eliminated'
        : state.terminal
          ? 'finish-line'
          : 'last-survivor',
      ...(state.terminal ? { winnerId: state.terminal.id } : {}),
    };
    return state.result;
  }
  function parseRows(rows, retainValidity = true) {
    if (!Array.isArray(rows))
      throw new Error('Eliminator needs physical standings');
    const parsed = new Map();
    for (const row of rows) {
      if (
        !field.includes(row?.id) ||
        parsed.has(row.id) ||
        !Number.isFinite(row.distance) ||
        (row.name !== undefined &&
          (typeof row.name !== 'string' || row.name.length > 160)) ||
        (row.valid !== undefined && typeof row.valid !== 'boolean') ||
        (finishDistance !== undefined &&
          row.finishTime != null &&
          (!Number.isFinite(row.finishTime) ||
            row.finishTime <= 0 ||
            row.distance < finishDistance - EPSILON))
      )
        throw new Error('Invalid Eliminator standings');
      parsed.set(row.id, {
        id: row.id,
        name: row.name ?? state.rows[row.id].name,
        distance: row.distance,
        valid:
          (!retainValidity || state.rows[row.id].valid) && row.valid !== false,
        ...(finishDistance === undefined
          ? {}
          : { finishTime: row.finishTime ?? null }),
      });
    }
    if (activeIds().some((id) => !parsed.has(id)))
      throw new Error('Eliminator standings omit an active racer');
    return parsed;
  }
  reset();
  return {
    rulesId,
    reset,
    isActive: (id) => activeIds().includes(id),
    invalidate(id = playerId) {
      if (!field.includes(id)) throw new Error('Unknown Eliminator racer');
      if (state.result) return false;
      state.rows[id].valid = false;
      return true;
    },
    step(dt, rows) {
      if (!Number.isFinite(dt) || dt < 0)
        throw new Error('Invalid Eliminator timestep');
      if (dt === 0 || state.result) return [];
      const targetRows = parseRows(rows),
        before = copy(state.rows);
      const start = state.elapsed,
        end = start + dt;
      if (!Number.isFinite(end)) throw new Error('Eliminator clock overflow');
      // Only the checkpoint owner can qualify an arrival. Its exact sprint
      // crossing time already includes grounded/checkpoint validation and
      // interpolation within this tick; display distance alone cannot finish.
      const arrivals = [...targetRows.values()]
        .filter(
          (row) =>
            row.valid && row.finishTime != null && activeIds().includes(row.id),
        )
        .sort(
          (a, b) =>
            a.finishTime - b.finishTime || grid.get(a.id) - grid.get(b.id),
        );
      if (
        arrivals.some(
          (row) =>
            row.finishTime < start - EPSILON || row.finishTime > end + EPSILON,
        )
      )
        throw new Error(
          'Sprint arrival must belong to the current Eliminator step',
        );
      const sample = (fraction) => {
        for (const id of activeIds()) {
          const target = targetRows.get(id),
            previous = before[id];
          state.rows[id] = {
            ...target,
            distance: Math.max(
              target.finishTime != null &&
                target.finishTime <= state.elapsed + EPSILON
                ? finishDistance
                : -Infinity,
              previous.distance * (1 - fraction) + target.distance * fraction,
            ),
            ...(finishDistance === undefined
              ? {}
              : {
                  finishTime:
                    target.finishTime !== null &&
                    target.finishTime <= state.elapsed + EPSILON
                      ? target.finishTime
                      : null,
                }),
          };
        }
      };
      const events = [];
      while (activeIds().length > 1) {
        const arrival = arrivals.find((row) => activeIds().includes(row.id));
        // A deadline wins an exact tie. The cut may remove this arrival, or
        // leave a last survivor, before a still-active ship claims the terminus.
        if (arrival && arrival.finishTime < nextCut() - EPSILON) {
          state.elapsed = Math.max(state.elapsed, arrival.finishTime);
          sample(Math.max(0, Math.min(1, (state.elapsed - start) / dt)));
          state.terminal = { id: arrival.id, at: state.elapsed };
          const result = finish();
          events.push({ type: 'eliminator-complete', payload: copy(result) });
          return events;
        }
        if (nextCut() > end + EPSILON) break;
        state.elapsed = nextCut();
        sample(Math.max(0, Math.min(1, (state.elapsed - start) / dt)));
        const last = rank().at(-1),
          position = activeIds().length;
        state.eliminated.push({
          id: last.id,
          name: last.name,
          distance: last.distance,
          position,
          at: state.elapsed,
        });
        events.push({
          type: 'eliminator-cut',
          payload: {
            id: last.id,
            name: last.name,
            position,
            remaining: activeIds().length,
            elapsed: state.elapsed,
            time: state.elapsed,
          },
        });
        const result = finish();
        if (result) {
          events.push({ type: 'eliminator-complete', payload: copy(result) });
          return events;
        }
      }
      state.elapsed = end;
      sample(1);
      return events;
    },
    snapshot() {
      const ranking = standings(),
        active = activeIds();
      return {
        version: ELIMINATOR_RULES_VERSION,
        rulesId,
        elapsed: state.elapsed,
        nextCut: state.result ? null : nextCut(),
        remaining: active.length,
        activeIds: active,
        eliminated: copy(state.eliminated),
        standings: ranking,
        playerPosition: ranking.find((row) => row.id === playerId).position,
        atRiskId: state.result ? null : rank().at(-1).id,
        result: copy(state.result),
        ...(finishDistance === undefined
          ? {}
          : { terminal: copy(state.terminal) }),
      };
    },
    restore(saved) {
      if (
        saved?.version !== ELIMINATOR_RULES_VERSION ||
        saved.rulesId !== rulesId ||
        !Number.isFinite(saved.elapsed) ||
        saved.elapsed < 0 ||
        !Array.isArray(saved.eliminated) ||
        saved.eliminated.length >= field.length ||
        new Set(saved.eliminated.map((entry) => entry.id)).size !==
          saved.eliminated.length
      )
        throw new Error('Incompatible Eliminator snapshot');
      const rows = parseRows(saved.standings, false);
      if (
        rows.size !== field.length ||
        saved.eliminated.some(
          (entry, i) =>
            !field.includes(entry.id) ||
            entry.position !== field.length - i ||
            !Number.isFinite(entry.at) ||
            Math.abs(entry.at - (firstCut + i * interval)) > EPSILON ||
            !Number.isFinite(entry.distance) ||
            entry.at > saved.elapsed + EPSILON ||
            (entry.id === playerId && i !== saved.eliminated.length - 1),
        )
      )
        throw new Error('Invalid Eliminator snapshot');
      const elapsed = saved.elapsed,
        eliminated = copy(saved.eliminated),
        terminal = finishDistance === undefined ? null : saved.terminal;
      if (finishDistance !== undefined) {
        const qualifiers = [...rows.values()]
          .filter(
            (row) =>
              row.valid &&
              row.finishTime !== null &&
              !eliminated.some((entry) => entry.id === row.id),
          )
          .sort(
            (a, b) =>
              a.finishTime - b.finishTime || grid.get(a.id) - grid.get(b.id),
          );
        if (
          (terminal !== null &&
            (!terminal ||
              typeof terminal !== 'object' ||
              Array.isArray(terminal) ||
              Object.keys(terminal).some(
                (key) => !['id', 'at'].includes(key),
              ) ||
              !Number.isFinite(terminal.at) ||
              terminal.at <= 0 ||
              Math.abs(terminal.at - elapsed) > EPSILON ||
              qualifiers[0]?.id !== terminal.id ||
              Math.abs(qualifiers[0].finishTime - elapsed) > EPSILON ||
              eliminated.length >= field.length - 1 ||
              eliminated.some((entry) => entry.id === playerId))) ||
          [...rows.values()].some(
            (row) =>
              row.finishTime !== null && row.finishTime > elapsed + EPSILON,
          ) ||
          [...rows.values()].some((row) => {
            if (!row.valid || row.finishTime === null) return false;
            const cut = eliminated.find((entry) => entry.id === row.id);
            return cut && Math.abs(row.finishTime - cut.at) > EPSILON;
          }) ||
          (terminal === null &&
            qualifiers.length > 0 &&
            eliminated.length !== field.length - 1 &&
            !eliminated.some((entry) => entry.id === playerId))
        )
          throw new Error('Invalid Eliminator sprint finish');
      }
      const ended =
        terminal ||
        eliminated.some((entry) => entry.id === playerId) ||
        eliminated.length === field.length - 1;
      const expected = firstCut + eliminated.length * interval;
      if (
        (!ended && elapsed >= expected + EPSILON) ||
        (terminal && elapsed >= expected - EPSILON) ||
        (ended &&
          !terminal &&
          Math.abs(elapsed - eliminated.at(-1).at) > EPSILON)
      )
        throw new Error('Invalid Eliminator clock');
      state = {
        elapsed,
        rows: Object.fromEntries(rows),
        eliminated,
        terminal: copy(terminal),
        result: null,
      };
      finish();
    },
  };
}
