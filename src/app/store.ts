// 브라우저 저장소. 기록은 로그인 없이 '이 브라우저에만' 둔다(설계서 3.8).
// 키는 모두 kgq_ 로 시작한다(ttlmymo.github.io 를 저장소 여러 개가 함께 쓴다). 숙달·진행은 처음부터 프로필 단위
import { restoreDeck, type Deck } from './core/deck.ts';
import { EMPTY, MAX_BOX, type Mastery, type Rec } from './core/mastery.ts';
import type { Daily } from './core/next.ts';

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const keys = (profile = 'p1') => ({
  mastery: `kgq_mastery_v1:${profile}`,
  deck: `kgq_deck_v1:${profile}`,     // 진행 중인 과·바로 찾기(문제마다 저장)
  deck2: `kgq_deck2_v1:${profile}`,   // 진행 중인 오늘 복습·전체 연습(시험은 시간을 재므로 저장 안 함)
  daily: `kgq_daily_v1:${profile}`,   // 오늘 푼 곳 수
  last: `kgq_last_v1:${profile}`,     // 마지막으로 공부한 지역
  best: `kgq_best_v1:${profile}`,     // 지역별 시험 최고 기록(랭킹은 출시 뒤 — 결정 5)
  settings: 'kgq_settings_v1',
});

export interface Settings { autoNext: boolean }  // 정답 뒤 0.9초에 저절로 넘김
export const DEFAULT_SETTINGS: Settings = { autoNext: true };

/** localStorage 를 꺼내는 것 자체가 막힌 창(쿠키 차단 등)이 있어 감싼다 */
export function browserKV(): KV | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export interface Store {
  /** 저장소에 쓸 수 있나. false 면 이 창을 닫을 때까지 메모리에만 둔다('이 창에서는 기록이 저장되지 않아요') */
  ok: boolean;
  read<T>(key: string, check: (v: unknown) => T | null): T | null;
  write(key: string, value: unknown): boolean;
  remove(key: string): void;
}

export function openStore(kv: KV | null): Store {
  let ok = false;
  try {
    if (kv) {
      kv.setItem('kgq_probe', '1');
      kv.removeItem('kgq_probe');
      ok = true;
    }
  } catch { /* 저장 막힘 */ }
  const mem = new Map<string, string>();
  const back: KV = ok && kv ? kv : {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => { mem.set(k, v); },
    removeItem: (k) => { mem.delete(k); },
  };
  return {
    ok,
    read(key, check) {
      try {
        const s = back.getItem(key);
        return s === null ? null : check(JSON.parse(s));
      } catch { return null; }
    },
    write(key, value) {
      try { back.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
    },
    remove(key) {
      try { back.removeItem(key); } catch { /* 무시 */ }
    },
  };
}

/* ---------- 읽은 값 검사: 모양이 틀린 것은 버리고 앱은 계속 돈다 ---------- */

const isInt = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

function checkRec(v: unknown): Rec | null {
  const r = v as Rec;
  if (!r || typeof r !== 'object' || !isInt(r.box, 0, MAX_BOX)) return null;
  return {
    ...EMPTY,
    box: r.box,
    due: Number.isInteger(r.due) ? r.due : null,
    hi: isInt(r.hi, 0, 3) ? r.hi : 0,
    streak: isInt(r.streak, 0, 9) ? r.streak : 0,
    grad: r.grad === true,
    front: r.front === true,
  };
}

export function checkMastery(v: unknown): Mastery | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Mastery = {};
  for (const [id, raw] of Object.entries(v)) {
    const rec = checkRec(raw);
    if (rec && /^kr:/.test(id)) out[id] = rec;
  }
  return out;
}

export function checkDaily(v: unknown): Daily | null {
  const d = v as Daily;
  return d && Number.isInteger(d.day) && isInt(d.n, 0, 100000) ? { day: d.day, n: d.n } : null;
}

export const checkDeck = (v: unknown): Deck | null => restoreDeck(v);

export const checkLast = (v: unknown): string | null => (typeof v === 'string' && /^[a-z-]{2,20}$/.test(v) ? v : null);

/** 시험 한 번의 기록 */
export interface Best { score: number; total: number; seconds: number; day: number }
export type Bests = Record<string, Best>;

export function checkBests(v: unknown): Bests | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Bests = {};
  for (const [k, b] of Object.entries(v as Record<string, Best>)) {
    if (/^[a-z-]{2,20}$/.test(k) && b && isInt(b.score, 0, 9999) && isInt(b.total, 1, 9999) && isInt(b.seconds, 0, 864000) && Number.isInteger(b.day)) out[k] = { score: b.score, total: b.total, seconds: b.seconds, day: b.day };
  }
  return out;
}

/** 더 나은 기록인가: 정답 수가 많을수록, 같으면 빠를수록 */
export const better = (a: Best, b: Best | undefined) => !b || a.score > b.score || (a.score === b.score && a.seconds < b.seconds);

export function checkSettings(v: unknown): Settings | null {
  const s = v as Settings;
  return s && typeof s === 'object' ? { ...DEFAULT_SETTINGS, autoNext: s.autoNext !== false } : null;
}
