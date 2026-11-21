// 공부 카드의 '이름 이야기' 한 줄(/data/story.json, src/pages/data/story.json.ts 가 빌드 때 만든다).
// 공부·둘러보기 화면을 처음 열 때 한 번 받고(부팅 때는 받지 않음), 받기 전·받기 실패면 빈 글 — 카드는 전과 똑같다
import { loadJSON } from './data.ts';

export interface StoryItem { ko: string; en: string; page?: string }
export interface StoryFile { v: number; items: Record<string, StoryItem> }

let items: Record<string, StoryItem> | null = null;
let pending: Promise<void> | null = null;

/** 받기 시작(이미 받았거나 받는 중이면 그대로). 받은 뒤 onReady 를 부른다 — 열려 있는 카드를 다시 그리게 */
export function loadStories(base: string, onReady?: () => void): void {
  if (items) return;
  pending ??= loadJSON<StoryFile>(`${base.replace(/\/$/, '')}/data/story.json`).then((f) => { items = f.items ?? {}; }).catch(() => { pending = null; });
  void pending.then(() => { if (items) onReady?.(); });
}

/** 그곳의 이야기 한 줄(없으면 '') */
export const storyOf = (id: string, lang: 'ko' | 'en'): string => items?.[id]?.[lang] ?? '';
/** 그곳 소개 쪽 주소(기준 경로 뒤, 한국어). 없으면 null */
export const storyPage = (id: string): string | null => items?.[id]?.page ?? null;
/** 시험용: 받은 글을 직접 넣는다 */
export function setStoriesForTest(x: Record<string, StoryItem> | null): void { items = x; pending = null; }
