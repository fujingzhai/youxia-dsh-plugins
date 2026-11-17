// 时间换算：会话时间戳 → 本地时刻与归属日期。日界默认凌晨 4 点（4 点前算前一天）。

const pad = n => String(n).padStart(2, '0');

/** ISO 字符串或毫秒数 → 毫秒；解析不了返回 NaN。 */
export function toMs(ts) {
  if (typeof ts === 'number') return ts;
  if (typeof ts !== 'string' || !ts) return NaN;
  return Date.parse(ts);
}

function fixedOffset(zone) {
  const m = /^(?:UTC|GMT)?([+-])(\d{1,2})(?::?(\d\d))?$/.exec(zone);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : null;
}

/**
 * timezone：留空跟随系统；也可写 "+08:00" 或 IANA 名（Asia/Shanghai）。
 * dayStartHour：日界，0–23。
 */
export function createClock({ timezone = '', dayStartHour = 4 } = {}) {
  const zone = String(timezone ?? '').trim();
  const fixed = zone ? fixedOffset(zone) : null;
  let format = null;
  if (zone && fixed === null) {
    format = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  const cache = new Map();
  function offset(ms) {
    if (fixed !== null) return fixed;
    if (!format) return -new Date(ms).getTimezoneOffset();
    const bucket = Math.floor(ms / 900000);
    let value = cache.get(bucket);
    if (value === undefined) {
      const p = Object.fromEntries(format.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
      const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
      value = Math.round((wall - Math.floor(ms / 1000) * 1000) / 60000);
      if (cache.size > 4096) cache.clear();
      cache.set(bucket, value);
    }
    return value;
  }
  const wall = ms => new Date(ms + offset(ms) * 60000);
  const ymd = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return {
    dayStartHour,
    /** HH:MM */
    hm(ts) { const d = wall(toMs(ts)); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; },
    /** MM-DD HH:MM */
    stamp(ts) {
      const ms = toMs(ts);
      if (Number.isNaN(ms)) return '';
      const d = wall(ms);
      return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    },
    /** 归属日期 YYYY-MM-DD（减去日界小时后的本地日期）。 */
    day(ts) { return ymd(new Date(wall(toMs(ts)).getTime() - dayStartHour * 3600000)); },
    /** 本地日历日期（不减日界），供“今天”“7d”与时间衰减用。 */
    today(now = Date.now()) { return ymd(wall(now)); },
    iso(now = Date.now()) {
      const d = wall(now), off = offset(now), sign = off < 0 ? '-' : '+', abs = Math.abs(off);
      return `${ymd(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
    },
  };
}
