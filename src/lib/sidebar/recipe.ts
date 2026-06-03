/**
 * Sidebar card RECIPES — the declarative shape of each recipe-driven card,
 * shared between the worker (attached to its mark definition, exposed via
 * /api/marks) and the client (rendered by SidebarCardFromHint via CARD_DEFS).
 *
 * This module is PURE DATA + types — no client (Solid/i18n) or worker imports —
 * so it can live in src/lib and be the single source of a card's structure. The
 * non-serializable parts (special-block components, instance adapters) stay in
 * the client; the recipe references blocks by name and labels by catalog key
 * string. `kind` and `labelKey` are plain strings here (the client narrows them
 * to its SidebarKind / CatalogKey on use; a client test guards that labelKeys
 * resolve).
 */

/** One section of a card, top → bottom. */
export type SectionSpec =
  /** Small chips from instance fields (e.g. an aggadata theme). `drop` hides
   *  specific values (e.g. a retired 'biography' theme that may linger in old
   *  cached extractions). */
  | { type: 'tags'; fields: string[]; drop?: string[] }
  /** A paragraph of an instance field, rabbi-linked + Hebraized (e.g. a summary).
   *  `untilSynthesis` makes it a placeholder: shown only until the synthesis
   *  section resolves, then replaced by it (the instant field fills the slot
   *  while the richer paragraph computes). */
  | { type: 'prose'; field: string; untilSynthesis?: boolean }
  /** The synthesis card for the recipe's mark; feeds the shared `deps`. */
  | { type: 'synthesis' }
  /** A labeled prose box rendering one dependent enrichment's `textField`.
   *  Collapsed by default (the "dig deeper" layer under the synthesis); set
   *  `defaultOpen` to lead with it expanded. `labelKey` is a client catalog key. */
  | { type: 'explainer'; dep: string; textField: string; labelKey: string; defaultOpen?: boolean }
  /** The follow-up Q&A affordance. */
  | { type: 'qa' }
  /** A genuinely-custom block, looked up by name in the card's `specialBlocks`.
   *  `deps` declares the dependent leaf ids it reads from the shared deps bag —
   *  so even a custom block has *declared inputs* (shown in the Recipe panel,
   *  and the first is what its inspect 'i' opens). */
  | { type: 'special'; block: string; deps?: string[] };

export interface SidebarRecipe {
  /** The sidebar card kind (a client SidebarKind value as a string). */
  kind: string;
  markId: string;
  /** Instance field for the card heading. Omit to suppress the Panel heading
   *  entirely — a card whose header is genuinely custom (e.g. pasuk's fetched
   *  Hebrew verse ref) renders it from a `special` section instead. */
  titleField?: string;
  titleHeField?: string;
  titleLang?: 'en' | 'he';
  flip?: 'name' | 'rabbi';
  sections: SectionSpec[];
}

export const AGGADATA_RECIPE: SidebarRecipe = {
  kind: 'aggadata',
  markId: 'aggadata',
  titleField: 'title',
  titleHeField: 'titleHe',
  sections: [
    // Theme tag retired for now — the taxonomy isn't comprehensive enough to be
    // worth showing. `theme` is still extracted (latent); restore a
    // `{ type: 'tags', fields: ['theme'] }` section here to bring it back.
    { type: 'prose', field: 'summary', untilSynthesis: true },
    { type: 'synthesis' },
    { type: 'explainer', dep: 'aggadata.background', textField: 'background', labelKey: 'aggadata.background' },
    { type: 'explainer', dep: 'aggadata.interpretation', textField: 'interpretation', labelKey: 'aggadata.interpretation' },
    { type: 'special', block: 'aggadata-parallels', deps: ['aggadata.parallels'] },
    { type: 'qa' },
  ],
};

export const PASUK_RECIPE: SidebarRecipe = {
  kind: 'pesuk',
  markId: 'pesukim',
  // No titleField — the verse special block renders the fetched Hebrew ref.
  sections: [
    { type: 'special', block: 'pasuk-verse' },
    { type: 'synthesis' },
    { type: 'explainer', dep: 'pesukim.tanach-context', textField: 'context', labelKey: 'pasuk.tanachContext' },
    { type: 'explainer', dep: 'pesukim.why-here', textField: 'why_here', labelKey: 'pasuk.whyHere' },
    { type: 'explainer', dep: 'pesukim.mechanism', textField: 'mechanism', labelKey: 'pasuk.mechanism' },
    { type: 'explainer', dep: 'pesukim.landing', textField: 'landing', labelKey: 'pasuk.landing' },
    { type: 'qa' },
  ],
};

export const HALACHA_RECIPE: SidebarRecipe = {
  kind: 'halacha',
  markId: 'halacha',
  titleField: 'topic',
  titleHeField: 'topicHe',
  sections: [
    { type: 'synthesis' },
    // Codification renders as the CodificationMap (lineage + the Mechaber/Rema
    // disagree edge), so the standalone disputes block is retired — the common
    // codifier dispute now lives in the map; synthesis still weaves the rest.
    { type: 'special', block: 'halacha-codification', deps: ['halacha.codification'] },
    // One grounded dispute object (Mechaber/Rema, Sefarad/Ashkenaz, poskim),
    // shown only when present; the practical consequence + positions.
    { type: 'special', block: 'halacha-dispute', deps: ['halacha.dispute'] },
    { type: 'special', block: 'halacha-practical', deps: ['halacha.practical'] },
    // "Where it comes from": the gemara sources the codified law derives from
    // (deterministic reverse Sefaria, /api/derivation), reading the codifier
    // refs off the codification leaf — so it depends on halacha.codification.
    { type: 'special', block: 'halacha-derivation', deps: ['halacha.codification'] },
  ],
};

export const RISHONIM_RECIPE: SidebarRecipe = {
  kind: 'rishonim',
  markId: 'rishonim',
  // No titleField — the header block renders the computed "on segment N" title.
  sections: [
    { type: 'special', block: 'rishonim-header' },
    { type: 'synthesis' },
    { type: 'special', block: 'rishonim-sources' },
  ],
};

export const RABBI_RECIPE: SidebarRecipe = {
  kind: 'rabbi',
  markId: 'rabbi',
  titleField: 'name',
  titleHeField: 'nameHe',
  flip: 'rabbi',
  sections: [
    { type: 'special', block: 'rabbi-meta', deps: ['rabbi.identity'] },
    { type: 'synthesis' },
    { type: 'special', block: 'rabbi-lineage', deps: ['rabbi.relationships', 'rabbi.relationships.evidence'] },
    { type: 'special', block: 'rabbi-geography', deps: ['rabbi.geography', 'rabbi.geography.evidence', 'rabbi.location'] },
  ],
};
