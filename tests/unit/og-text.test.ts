// 공유 그림(og:image) 글 맞춤(E17 검수): tools/og-image.mjs 는 빌드 때 돌지 않아, 지역 표가 바뀌면 그림에 박힌 개수 줄만 옛 글로 남는다
// (예: 전남광주 영문을 켜면 영어 설명은 '… and 11 more regions'가 되는데 og-image-en.jpg 는 '10 more'). 도구가 함께 쓰는 tools/og-image.text.json 을
// 홈 검색 설명과 같은 범위 말(src/lib/regions.ts — 도구와 같은 함수)과 견준다. 걸리면 node tools/og-image.mjs 를 다시 돌리고 그림·글 파일을 함께 커밋한다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scopeEn, studyKo } from '../../src/lib/regions.ts';

const root = path.join(import.meta.dirname, '../..');
const og = JSON.parse(fs.readFileSync(path.join(root, 'tools/og-image.text.json'), 'utf8'));
const AGAIN = '지역 표가 바뀌었다 — node tools/og-image.mjs 로 공유 그림을 다시 만든다';

test('공유 그림의 개수 줄(tools/og-image.text.json)이 지금 홈 검색 설명의 범위 말과 같다(한·영)', () => {
  assert.equal(og.ko.count, studyKo(true), `한국어 ${AGAIN}`);
  assert.equal(og.en.count, scopeEn(), `영어 ${AGAIN}`);
  for (const lang of ['ko', 'en']) assert.ok(fs.statSync(path.join(root, `public/social-image/og-image-${lang}.jpg`)).size > 0, `${lang} 그림 파일`);
});
