/**
 * Standard taxonomy of Talmudic sages by era and generation. Used by the
 * /api/generations endpoint (server-side schema) and the client-side underline
 * injection + legend. Keep this file plain TS (no DOM), safe to import in
 * both the worker and the client.
 */

export type GenerationId =
  | 'zugim'
  | 'tanna-1' | 'tanna-2' | 'tanna-3' | 'tanna-4' | 'tanna-5' | 'tanna-6'
  | 'amora-ey-1' | 'amora-ey-2' | 'amora-ey-3' | 'amora-ey-4' | 'amora-ey-5'
  | 'amora-bavel-1' | 'amora-bavel-2' | 'amora-bavel-3'
  | 'amora-bavel-4' | 'amora-bavel-5' | 'amora-bavel-6'
  | 'amora-bavel-7' | 'amora-bavel-8'
  | 'savora'
  | 'unknown';

export type GenerationGroup = 'zugim' | 'tanna' | 'amora-ey' | 'amora-bavel' | 'savora' | 'unknown';

export interface GenerationInfo {
  id: GenerationId;
  group: GenerationGroup;
  label: string;        // Short display label
  era: string;          // Rough date range
  color: string;        // Hex color for underline + legend swatch
}

export const GENERATIONS: GenerationInfo[] = [
  { id: 'zugim',          group: 'zugim',        label: 'Zugim',          era: 'c. 170 BCE – 10 CE', color: '#4338ca' },

  // Tannaim — hue 210 (blue), lightness increasing over generations
  { id: 'tanna-1',        group: 'tanna',        label: 'Tanna (1)',      era: 'c. 10 – 80 CE',      color: '#1e3a8a' },
  { id: 'tanna-2',        group: 'tanna',        label: 'Tanna (2)',      era: 'c. 80 – 120 CE',     color: '#1e40af' },
  { id: 'tanna-3',        group: 'tanna',        label: 'Tanna (3)',      era: 'c. 120 – 140 CE',    color: '#2563eb' },
  { id: 'tanna-4',        group: 'tanna',        label: 'Tanna (4)',      era: 'c. 140 – 165 CE',    color: '#3b82f6' },
  { id: 'tanna-5',        group: 'tanna',        label: 'Tanna (5)',      era: 'c. 165 – 200 CE',    color: '#60a5fa' },
  { id: 'tanna-6',        group: 'tanna',        label: 'Tanna (6)',      era: 'c. 200 – 220 CE',    color: '#93c5fd' },

  // Amoraim Eretz Yisrael — same palette as Bavel per chronological gen
  // (we no longer distinguish EY vs Bavel in the timeline or underline colors)
  { id: 'amora-ey-1',     group: 'amora-ey',     label: 'Amora E.Y. (1)', era: 'c. 220 – 250 CE',    color: '#7c2d12' },
  { id: 'amora-ey-2',     group: 'amora-ey',     label: 'Amora E.Y. (2)', era: 'c. 250 – 290 CE',    color: '#9a3412' },
  { id: 'amora-ey-3',     group: 'amora-ey',     label: 'Amora E.Y. (3)', era: 'c. 290 – 320 CE',    color: '#c2410c' },
  { id: 'amora-ey-4',     group: 'amora-ey',     label: 'Amora E.Y. (4)', era: 'c. 320 – 360 CE',    color: '#ea580c' },
  { id: 'amora-ey-5',     group: 'amora-ey',     label: 'Amora E.Y. (5)', era: 'c. 360 – 400 CE',    color: '#f97316' },

  // Amoraim Bavel — hue 25 (amber → red)
  { id: 'amora-bavel-1',  group: 'amora-bavel',  label: 'Amora Bavel (1)', era: 'c. 220 – 250 CE',   color: '#7c2d12' },
  { id: 'amora-bavel-2',  group: 'amora-bavel',  label: 'Amora Bavel (2)', era: 'c. 250 – 290 CE',   color: '#9a3412' },
  { id: 'amora-bavel-3',  group: 'amora-bavel',  label: 'Amora Bavel (3)', era: 'c. 290 – 320 CE',   color: '#c2410c' },
  { id: 'amora-bavel-4',  group: 'amora-bavel',  label: 'Amora Bavel (4)', era: 'c. 320 – 350 CE',   color: '#ea580c' },
  { id: 'amora-bavel-5',  group: 'amora-bavel',  label: 'Amora Bavel (5)', era: 'c. 350 – 375 CE',   color: '#f97316' },
  { id: 'amora-bavel-6',  group: 'amora-bavel',  label: 'Amora Bavel (6)', era: 'c. 375 – 427 CE',   color: '#fb923c' },
  { id: 'amora-bavel-7',  group: 'amora-bavel',  label: 'Amora Bavel (7)', era: 'c. 427 – 460 CE',   color: '#fdba74' },
  { id: 'amora-bavel-8',  group: 'amora-bavel',  label: 'Amora Bavel (8)', era: 'c. 460 – 500 CE',   color: '#fed7aa' },

  { id: 'savora',         group: 'savora',       label: 'Savora',          era: 'c. 500 – 600 CE',   color: '#475569' },
  { id: 'unknown',        group: 'unknown',      label: 'Unknown',         era: '',                    color: '#d1d5db' },
];

export const GENERATION_BY_ID: Record<GenerationId, GenerationInfo> =
  Object.fromEntries(GENERATIONS.map((g) => [g.id, g])) as Record<GenerationId, GenerationInfo>;

export const GENERATION_IDS: GenerationId[] = GENERATIONS.map((g) => g.id);

/**
 * Compact taxonomy prompt text for the AI model — lists generation IDs with
 * their era and representative sages so the model can assign an ID to each
 * rabbi it identifies in the daf. Kept concise to fit in system prompts.
 */
export const GENERATIONS_PROMPT_REFERENCE = `
Generation IDs (use exact strings):
- zugim: c. 170 BCE – 10 CE. Pairs like Hillel & Shammai.
- tanna-1: c. 10–80 CE. Rabban Yochanan ben Zakkai, Rabban Gamliel the Elder.
- tanna-2: c. 80–120 CE. Rabban Gamliel II (of Yavneh), Rabbi Eliezer, Rabbi Yehoshua, Rabbi Akiva.
- tanna-3: c. 120–140 CE. Rabbi Akiva's major students early career. Transitional.
- tanna-4: c. 140–165 CE. Rabbi Meir, Rabbi Yehuda, Rabbi Yose, Rabbi Shimon (bar Yochai), Rabbi Elazar (ben Shammua).
- tanna-5: c. 165–200 CE. Rabbi Yehuda HaNasi (Rebbi), Rabbi Nathan, Rabbi Shimon ben Gamliel.
- tanna-6: c. 200–220 CE. Transitional to Amoraim. Rabbi Chiya, Bar Kappara, Levi, Rabbi Oshaya.
- amora-ey-1: c. 220–250 CE. Rabbi Yochanan (bar Nafcha), Reish Lakish, Rabbi Hoshaya.
- amora-ey-2: c. 250–290 CE. Rabbi Elazar ben Pedat, Rabbi Ammi, Rabbi Assi, Rabbi Abbahu.
- amora-ey-3: c. 290–320 CE. Rabbi Yonah, Rabbi Yose (II), Rabbi Yirmiyah.
- amora-ey-4: c. 320–360 CE. Rabbi Yonah, Rabbi Yose bar Zavida.
- amora-ey-5: c. 360–400 CE. Final Eretz Yisrael generation before Yerushalmi redacted.
- amora-bavel-1: c. 220–250 CE. Rav (Abba Aricha), Shmuel, Karna, Mar Ukva.
- amora-bavel-2: c. 250–290 CE. Rav Huna, Rav Yehuda (bar Yechezkel), Rav Chisda, Rav Nachman, Rav Sheshet, Rabbah bar Bar Chana.
- amora-bavel-3: c. 290–320 CE. Rabbah (bar Nachmani), Rav Yosef, Rav Zeira (after aliyah = ey).
- amora-bavel-4: c. 320–350 CE. Abaye, Rava.
- amora-bavel-5: c. 350–375 CE. Rav Papa, Rav Huna brei d'Rav Yehoshua, Rav Nachman bar Yitzchak.
- amora-bavel-6: c. 375–427 CE. Rav Ashi, Ravina I.
- amora-bavel-7: c. 427–460 CE. Mar bar Rav Ashi (Tavyomi), Rav Acha.
- amora-bavel-8: c. 460–500 CE. Ravina II (final redactor).
- savora: c. 500–600 CE. Post-Talmudic editors.
- unknown: use ONLY if you cannot identify the rabbi or the name matches no known sage.
`.trim();
