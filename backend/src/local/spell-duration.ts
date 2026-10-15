/**
 * Combat time: each player-character turn = 6 seconds of narrative time.
 */

const SECONDS_PER_PC_TURN = 6;

/** Convert SRD duration text to remaining PC-turn ticks (global table clock). */
export function durationToPcTurns(duration: string | undefined): number | undefined {
  if (!duration) return undefined;
  const d = duration.trim().toLowerCase();
  if (d.includes("concentration")) {
    const upTo = d.match(/up to (\d+)\s*(minute|hour|round)/);
    if (upTo) return durationToPcTurns(upTo[0].replace("up to ", ""));
    return undefined;
  }
  if (d.includes("instant")) return 0;
  const round = d.match(/^(\d+)\s*round/);
  if (round) return Math.max(1, Math.ceil(Number(round[1]) * 1));
  const minute = d.match(/^(\d+)\s*minute/);
  if (minute) return Math.max(1, Math.ceil((Number(minute[1]) * 60) / SECONDS_PER_PC_TURN));
  const hour = d.match(/^(\d+)\s*hour/);
  if (hour) return Math.max(1, Math.ceil((Number(hour[1]) * 3600) / SECONDS_PER_PC_TURN));
  const day = d.match(/^(\d+)\s*day/);
  if (day) return Math.max(1, Math.ceil((Number(day[1]) * 86400) / SECONDS_PER_PC_TURN));
  return undefined;
}

export { SECONDS_PER_PC_TURN };
