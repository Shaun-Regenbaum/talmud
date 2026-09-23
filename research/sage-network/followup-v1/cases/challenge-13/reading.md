# Berakhot 5b:10: Rabbi Hiyya bar Abba falls ill (challenge-13)

Status: **researched**. Full evidence is in `dossier.json`; sources are in `sources/`.
All graph proposals are provisional.

## What the text itself says

> רבי חייא בר אבא חלש. על לגביה רבי יוחנן אמר ליה: חביבין עליך יסורין? אמר ליה: לא הן ולא שכרן. אמר ליה: הב לי ידך. יהב ליה ידיה, ואוקמיה.

*This dossier's translation:* Rabbi Hiyya bar Abba fell ill. Rabbi Yohanan went in
to him and said to him: "Are sufferings dear to you?" He said to him: "Neither
they nor their reward." He said to him: "Give me your hand." He gave him his hand,
and he raised him.

- **Explicit:** two people are named, Hiyya bar Abba (the sick man) and Yohanan (the visitor).
  The patronymic names a father, Abba. Keep the `child_of` relation and the placeholder for Abba.
- **By turn-taking:** after the first line, no one is named again. The question, the answer, the
  request for the hand, the giving of the hand and the raising are assigned by alternation.
  This is secure, and the first reading's roles (c1-c8) are right.
- **Not in the text:** a teacher-student relation. The William Davidson English
  ("Rabbi Yoḥanan’s student") and Steinsaltz ("שהיה תלמידו", "רבו") add it in their
  explanatory, non-bold words. Both come from one editorial project. Seder HaDorot also
  lists him as a student of Rabbi Yohanan, citing other passages. That belongs to the
  identity stage, not to this passage.

## What wider context changes

1. **The sugya depends on this scene.** In 5b:11 Rabbi Hanina raises the sick Rabbi Yohanan.
   5b:12 then asks, "Let Rabbi Yohanan raise himself!", and the answer is that a prisoner cannot
   free himself. That question assumes Rabbi Yohanan could raise a sick person, as he did in
   5b:10. Maharsha makes the link explicitly. The first reading listed no needed context; it
   should list 5b:11-13.
2. **Witnesses arrange the story differently.** In the Vilna-based and William Davidson text,
   it is a stand-alone scene. In Ein Yaakov (Glick 1916) it appears *inside* the question: "why
   did R. Yohanan not raise himself, **for** (דהא) R. Hiyya bar Abba fell ill…". My visual
   reading of Munich Cod. hebr. 95 (1342) seems to show the same arrangement. So the voice
   changes (narrator versus a precedent cited by the anonymous Talmud), but the people and
   roles stay the same. Add a reading group; do not choose between the branches.
3. **Possible small manuscript differences.** This is a low-confidence visual reading, not
   machine-checked. Munich's version seems to add "to ask after him" (לשיולי ביה) and to lack
   "Give me your hand". I could not securely read the patronymic there. Check a published
   transcription before changing c6.
4. **ואוקמיה = "raised him".** "Healed him" is the translators' reading (William Davidson and
   Steinsaltz plain words; Cohen's footnote; Glick), supported by the 5b:12 question. Keep the
   literal claim. Store healing, if at all, as an interpretation.

## Parallels and commentary, kept separate

- **Shir HaShirim Rabbah 2:16** has a related tradition with a different cast. There the sick
  *Rabbi Hanina* says "I want neither them nor their reward" to the visiting Rabbi Yohanan. It
  is a separate episode. Do not merge it, and do not use it to reassign any speaker in 5b:10.
  The same formula recurs in 5b:11 and 5b:16.
- **Commentators on the motive.** Maharsha and Etz Yosef say the illness was so severe that it
  stopped Torah study, hence the refusal. This is interpretation, not a claim.
- **Ben Yehoyada** names "Rabbi Hiyya" in his comment on the dark-room scene (5b:14), where the
  text has Rabbi Elazar. It may be a slip or a conflation. Do not build a scene on it.
- **Seder HaDorot** uses this passage to doubt a report that Hiyya bar Abba died before
  Yohanan. That is historical inference. Add no death-order claim.

## About the earlier review

Its one finding is **wrong**: m4-m10 *are* linked (hiyya: m4, m5, m7, m9, m10; yohanan: m6, m8).
The four occurrences of ליה match Hiyya, Yohanan, Hiyya, Yohanan. The real gaps are smaller:
עליך, ידך and לי are not inventoried, and Yohanan is the unexpressed subject of ואוקמיה (m10).

## Still open

- A checked transcription of Munich 95 (patronymic, the word introducing the story, the hand request).
- Other manuscripts (Florence, Paris, Oxford) and Dikdukei Soferim.
- Which Ein Yaakov print the Glick edition follows.
- The Rif link, whose saved text breaks off without the story.
- The Goldschmidt German, which returned no text.
