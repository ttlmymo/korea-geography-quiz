// 사이트 주소 한 곳: astro.config.mjs(빌드)와 tools/check.mjs(점검)가 함께 쓴다.
// 맞춤 도메인을 사면 아래 두 값만 바꾼다(설계서 결정 7). 도메인 바로 아래에 두면 BASE 는 ''.
// 시험용으로 환경 변수 CHAEUM_SITE·CHAEUM_BASE 로 덮어쓸 수 있다(배포 워크플로는 쓰지 않는다)
export const SITE = process.env.CHAEUM_SITE ?? 'https://ttlmymo.github.io';
export const BASE = process.env.CHAEUM_BASE ?? '/korea-geography-quiz';
