// 기준 경로(site.config.mjs 의 BASE, 지금 /korea-geography-quiz)를 붙인 사이트 안 주소를 만든다
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** href('/seoul/') → '/korea-geography-quiz/seoul/', href('/#/kr') → '/korea-geography-quiz/#/kr' */
export function href(path: string): string {
  return BASE + '/' + path.replace(/^\//, '');
}
