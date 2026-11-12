// 기준 경로(site.config.mjs 의 BASE, 도메인 바로 아래라 지금은 '')를 붙인 사이트 안 주소를 만든다
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** href('/seoul/') → '/seoul/', href('/#/kr') → '/#/kr' */
export function href(path: string): string {
  return BASE + '/' + path.replace(/^\//, '');
}
