// 사이트 주소 한 곳: astro.config.mjs(빌드)와 tools/check.mjs(점검)가 함께 쓴다.
// 도메인 바로 아래에 두므로 BASE 는 ''(11-13 chaeumjido.co.kr 구입, 설계서 결정 7). 옛 주소는 ttlmymo.github.io/korea-geography-quiz
// 시험용으로 환경 변수 CHAEUM_SITE·CHAEUM_BASE 로 덮어쓸 수 있다(배포 워크플로는 쓰지 않는다)
export const SITE = process.env.CHAEUM_SITE ?? 'https://chaeumjido.co.kr';
export const BASE = process.env.CHAEUM_BASE ?? '';
