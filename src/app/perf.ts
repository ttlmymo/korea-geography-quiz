// 성능 재기(계획서 N35): 화면 확인 도구가 window.__cmPerf 를 배열로 만들어 두었을 때만 기록한다(운영 화면에서는 아무것도 하지 않는다).
// 기록 = [종류, ms, 지역·단원 키]. 종류: fetch(경계 받기) · build(칸 만들기 buildShapes) · commit(지도 다시 그리기) · question(문제 넘김: 보이기 시작 → 지도 준비)
export function perf(kind: string, ms: number, key = '') {
  const sink = (globalThis as { __cmPerf?: unknown[] }).__cmPerf;
  if (Array.isArray(sink)) sink.push([kind, Math.round(ms * 100) / 100, key]);
}
