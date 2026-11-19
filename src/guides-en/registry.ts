// English study guides list. slug, no, updated and reviewed come from the Korean registry (src/guides/registry.ts);
// only the English title and description live in this table. Same visibility rule as Korean:
// a guide is built only if it has been reviewed (the dev server also builds drafts).
import { GUIDES, visibleGuides } from '../guides/registry';

export interface GuideEn {
  slug: string;
  no: string;
  title: string;
  description: string;
  updated: string;       // last updated, 'YYYY-MM-DD'
  reviewed: string | null;
}

const TEXT: Record<string, { title: string; description: string }> = {
  'korea-divisions-2026': {
    title: "South Korea's Administrative Divisions in 2026: Provinces, Cities, Counties, Districts and Neighborhoods",
    description: 'In July 2026 the Jeonnam-Gwangju Integrated Special City was created, so South Korea now has 16 si/do. This guide explains how they divide into si/gun/gu and eup/myeon/dong, using the Local Autonomy Act and the October 2026 boundary data.',
  },
  'incheon-reform-2026': {
    title: "Incheon's July 2026 Reorganization: 2 Counties and 9 Districts, and the 4 New Districts on the Map",
    description: "On July 1, 2026, Incheon's Jung-gu, Dong-gu and Seo-gu became Jemulpo-gu, Yeongjong-gu, Seohae-gu and Geomdan-gu. This guide shows maps before and after, a table of where the old neighborhoods moved, and the laws and dates.",
  },
  'legal-vs-administrative-dong': {
    title: 'Legal Dong vs. Administrative Dong: Why Fill the Map Uses Administrative Dong',
    description: "The dong in a lot-number address and the dong at your community center can differ. This guide explains why, using the Local Autonomy Act and the Spatial Information Management Act, and compares the 467 legal dong and 427 administrative dong of Seoul's 25 districts, district by district.",
  },
  'autonomous-vs-general-gu': {
    title: 'Autonomous Gu, General Gu and Special Cities: What Is the Difference?',
    description: 'Two districts can both be called gu and still differ, starting with how the head of the district is chosen. This guide compares autonomous gu, general gu and special cities using the Local Autonomy Act and the October 2026 boundary data, with a table of the 13 cities that have general gu.',
  },
  'seoul-25-gu': {
    title: "How to Memorize Seoul's 25 Districts: North and South of the Hangang River, and Five Regions",
    description: "Split Seoul's 25 districts first into 14 north and 11 south of the Hangang River, then group them by the city's five regional living areas and Fill the Map's five lessons. This guide shows the method with maps and tables.",
  },
  'recall-practice': {
    title: 'Memorizing Administrative Areas with Map Quizzes: Recall Beats Rereading',
    description: 'Research suggests that trying to recall a hidden name sticks longer than reading it again. This guide covers that research, what is still unsettled about review spacing, and how Fill the Map uses it to order your study.',
  },
};

const all = (): GuideEn[] => GUIDES.map((g) => ({
  slug: g.slug, no: g.no, updated: g.updated, reviewed: g.reviewed,
  title: TEXT[g.slug].title, description: TEXT[g.slug].description,
}));

/** Guides built in this build (same rule and order as the Korean list). */
export const visibleGuidesEn = (): GuideEn[] => {
  const ok = new Set(visibleGuides().map((g) => g.slug));
  return all().filter((g) => ok.has(g.slug));
};

/** Link target for another guide, or null if it is not in this build (avoids broken links). */
export const guideIfEn = (slug: string) => visibleGuidesEn().find((g) => g.slug === slug) ?? null;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** '2026-11-07' -> 'November 7, 2026' */
export const dateEn = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
