// 실기기 점검(설계서 12 S11)용 기록: 개발 서버(npm run dev)에서만 휴대폰의 이벤트·누르기·측정값을 PC 로 보낸다.
// 받는 쪽은 astro.config.mjs 의 chaeum-lab(.cache/device/reports.jsonl 에 한 줄씩), 요약은 tools/device-report.mjs.
// 배포 빌드에서는 import.meta.env.DEV 가 false 라 아무것도 하지 않고 코드째 빠진다
const sid = Math.random().toString(36).slice(2, 8);

export function devLog(kind: string, data: Record<string, unknown> = {}) {
  if (!import.meta.env?.DEV) return;  // node 단위 시험에는 env 가 없다
  try {
    const url = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/__report`;
    navigator.sendBeacon(url, JSON.stringify({ sid, t: Date.now(), path: location.pathname + location.hash, kind, ...data }));
  } catch { /* 기록 실패는 앱에 영향 없음 */ }
}
