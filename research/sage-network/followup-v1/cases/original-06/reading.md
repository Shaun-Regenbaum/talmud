# Arakhin 13b:4: one teaching, two routes, and a proposed third wording

**Status:** researched. All graph proposals are provisional. `historical_graph_eligible = false`.

## The text

The Mishnah says trumpets may be added "without limit" (Mishnah Arakhin 2:5). The Gemara asks, "Up to how many?" The printed text answers:

> אמר רב הונא ואמרי לה אמר רב זבדי אמר רב הונא עד מאה ועשרים

Researcher translation: "Rav Huna said, and some say: Rav Zavdi said Rav Huna said: up to 120." The verse cited is II Chronicles 5:12.

The Koren vocalized and unvocalized texts, the Wikisource text, and the Venice 1523 print (read from its page image) all have this wording. They are not independent witnesses. The two Koren texts are one editorial work, and the others belong to one printed tradition.

## What each route lets a graph say

| Route | Wording | May infer | May not infer |
|---|---|---|---|
| **A** (text) | Rav Huna said | Rav Huna is credited with the teaching | That nobody passed it on |
| **B** (text, ואמרי לה) | Rav Zavdi said Rav Huna said | Rav Zavdi *reports in the name of* Rav Huna; Rav Huna is still the source | Teacher or student; that they met or that Zavdi heard him directly; which man was older; dates; that route A is false |
| **C** (later proposed wording) | Rav Huna **bar Zavdi** said; and some say Rav Zavdi said | Two different alternative speakers; a father named Zavdi (from the name) | That the father is the second Rav Zavdi; that he is the plain Rav Huna of A/B; any transmission edge; that C is the original |

Both A and B name Rav Huna as the source. They differ only in whether a transmitter is named. Only one wording can be read at a time, but historically both can be true: Huna may have taught it and Zavdi may also have passed it on. **Do not** record a Huna/Zavdi "alternative" pair. Zavdi is never offered as another author.

## Findings from the sources

1. **A proposed variant in the Vilna margin (new).** On the Vilna page, the column headed שיטה מקובצת has a note keyed to this line. Researcher's reading of the print: `ב] רב הונא בר זבדי ואמרי לה אמר רב זבדי עד ותיבות אמר רב הונא נמחק:` This proposes "Rav Huna bar Zavdi" as the first speaker and deletes the second "said Rav Huna." This is a later proposed reading, which is a separate type of evidence. It changes which people are in the passage. It adds a patronymic, so a parent placeholder "Zavdi" must be kept. The note does not say what it is based on.
2. **Munich 95 (1342), low confidence.** Read from a zoomed page image, it seems to have the printed two-route form. No "בר זבדי" appears after the first Rav Huna. Some letters between זבדי and עד could not be read, so this needs a proper collation.
3. **Commentators do not choose a route.** Tosafot quote only "אמר רב הונא ואמרי לה כו'" and then explain the rule in two ways. Kessef Mishneh writes "אמר רב הונא וכו'". The Rambam, Bartenura, Tosafot Yom Tov, Melekhet Shelomoh and Sefer HaChinukh give the 120 limit without naming anyone. In the Sefaria Vilna texts, Rashi and Rabbeinu Gershom have no comment on this line. The Steinsaltz Hebrew (from the same Koren project) and Goldschmidt's 1929 German keep both routes.
4. **A modern reading of the content.** Mishnat Eretz Yisrael quotes both routes. It calls the teaching a derivation from a one-time biblical event, "not a tradition, nor even a halakha." Nothing here says either sage saw Temple practice.
5. **A later dating built on route B.** Seder HaDorot (Warsaw 1878–82) dates Rav Zavdi from "אמר רב זבדי אמר רב הונא." It also suggests that Yuchasin's "in the time of Rav" is a copying error for "Rav Huna." This depends on route B of this same line, so it is not extra evidence for it.
6. **Name scope.** In Sefaria's search index, "רב זבדי" with the title Rav appears in the Bavli only here. There are 3 hits, all Arakhin 13b:4 in three versions. Other Bavli hits for זבדי are patronymics of other men (Kiddushin 33b, 73b; Zevachim 28b; Yevamot 83b). "הונא בר זבדי" has 0 hits anywhere in the index. This covers one index and certain query forms only.

## Corrections proposed

- The pair `…|40|61` (kind "alternative", Huna/Zavdi) should become an attribution-branch record on the teaching: short form versus chain form. Mark it exclusive as report forms only; historical exclusivity is not established.
- The pair `…|61|73` ("cites", AB) should be kept as `reports_in_name_of`, scoped to branch B, with `direct_hearing = not_stated`.
- The earlier crosscheck is right about A and B. It should add branch C as a separate evidence type. The printed text's branches are clear, but a proposed variant exists.

## Still open

- A manuscript collation for this line.
- What the Shitah Mekubetzet note is based on. The book is not on Sefaria; only the printed margin was read.
- Yuchasin itself.
- Whether the two "Rav Huna" mentions are one local person. This is plausible but not stated.
- Whether B's Rav Zavdi and C's father Zavdi are the same person.

Files: `dossier.json` (full record), `sources/` (saved sources with hashes), `work/` (image crops and the build script), `notes_progress.md` (interim notes).
