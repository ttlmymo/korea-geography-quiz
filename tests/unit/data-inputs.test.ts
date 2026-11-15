// 원고-산출물 맞춤(계획서 N33): manifest.inputs 의 sha256 이 지금 파일과 같아야 한다.
// 원고(units.json·place-lines.json 등)나 파이프라인을 고치고 다시 돌리지 않으면 여기서 막힌다(Actions 는 파이프라인을 돌리지 않음).
// core.autocrlf=true 라 작업 트리는 CRLF, Actions 는 LF 이므로 CRLF 를 LF 로 바꾼 바이트로 잰다(파이프라인과 같은 방식)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_VER } from '../../src/consts.ts';

const root = path.join(import.meta.dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/data/geo', DATA_VER, 'manifest.json'), 'utf8'));
const AGAIN = '원고(또는 파이프라인)를 고쳤으면 node pipeline/build-geo.mjs 를 다시 돌리세요';

const lfBytes = (buf: Buffer) => {
  const out = Buffer.alloc(buf.length);
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (!(buf[i] === 13 && buf[i + 1] === 10)) out[n++] = buf[i];
  return out.subarray(0, n);
};
const shaOf = (rel: string) => crypto.createHash('sha256').update(lfBytes(fs.readFileSync(path.join(root, rel)))).digest('hex');

test('manifest.inputs 가 손 원고·손 표·파이프라인을 모두 담는다', () => {
  const inputs: Record<string, string> = manifest.inputs ?? {};
  const want = ['src/data/units.json', 'src/data/place-lines.json', 'src/data/hard-words.json', 'src/data/sido.json', 'pipeline/build-geo.mjs', 'pipeline/emd-lib.mjs',
    ...fs.readdirSync(path.join(root, 'pipeline/data')).filter((n) => n.endsWith('.json')).map((n) => `pipeline/data/${n}`)];
  for (const rel of want) assert.ok(inputs[rel], `manifest.inputs 에 ${rel} 이 없음 — ${AGAIN}`);
});

test('manifest.inputs 의 sha256 이 지금 파일과 같다', () => {
  for (const [rel, sha] of Object.entries(manifest.inputs as Record<string, string>)) {
    assert.ok(fs.existsSync(path.join(root, rel)), `${rel} 이 없음 — ${AGAIN}`);
    assert.equal(shaOf(rel), sha, `${rel} 이 manifest 와 다름 — ${AGAIN}`);
  }
});

// 이 시험은 위 시험 도우미(lfBytes)만 본다. 파이프라인(build-geo.mjs)에도 같은 규칙의 사본이 있다. 두 사본이 갈라지면
// Windows 작업 트리(CRLF)에서 바로 위 시험이 해시 차이로 잡는다
test('시험 도우미의 줄 끝 규칙: CRLF 의 CR 만 지운다(파이프라인과 같은 규칙)', () => {
  const a = Buffer.from('{\r\n "a": 1\r\n}\r\n'), b = Buffer.from('{\n "a": 1\n}\n');
  assert.deepEqual(lfBytes(a), b);
  assert.deepEqual(lfBytes(Buffer.from('a\rb\r\n')), Buffer.from('a\rb\n'));   // 홀로 선 CR 은 그대로
});

// 판 이름(계획서 N18): 판을 올릴 때 바꿀 곳이 여럿이라(파이프라인 VER·src/consts.ts DATA_VER·시험), 앱이 읽는 판 폴더와
// 정적 쪽이 읽는 src/data(SVG·검색 이름)가 한 판에서 나왔는지 본다. 앱이 받지 않는 search.json 은 E2 부터 판 폴더에 없다(src/data/search-sgg.json 으로 옮김)
test('판 이름: 판 폴더의 units·manifest 와 src/data 의 SVG·검색 이름이 모두 DATA_VER', () => {
  const dir = path.join(root, 'public/data/geo', DATA_VER);
  const json = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(manifest.version, DATA_VER, `manifest.json 판 — ${AGAIN}`);
  assert.equal(json(path.join(dir, 'units.json')).version, DATA_VER, `units.json 판 — ${AGAIN}`);
  for (const n of fs.readdirSync(path.join(root, 'src/data/svg'))) assert.equal(json(path.join(root, 'src/data/svg', n)).version, DATA_VER, `src/data/svg/${n} 판 — ${AGAIN}`);
  assert.equal(json(path.join(root, 'src/data/search-sgg.json')).version, DATA_VER, `src/data/search-sgg.json 판 — ${AGAIN}`);
  assert.ok(!fs.existsSync(path.join(dir, 'search.json')), '판 폴더에 search.json 이 있음(빌드 전용 src/data/search-sgg.json 으로 옮겼다)');
});
