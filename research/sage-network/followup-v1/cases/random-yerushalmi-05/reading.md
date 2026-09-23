# random-yerushalmi-05 — JT Ketubot 11:7:4 (with 11:7:3–6)

**Status:** researched. I checked the Sefaria texts: Guggenheimer Hebrew and English, the Venice print and Mechon-Mamre, for Ketubot 11:7. I also checked the full parallel in JT Yevamot 9:4, JT Gittin 9:9, and the commentaries and later sources listed in `dossier.json`. I did not check any manuscripts. Renderings marked "my translation" are my own.

## 1. Shmuel's coercion rule is restrictive (11:7:6)

The text says: *שְׁמוּאֵל אָמַר. אֵין מְעַשִּׂין אֶלָּא כְגוֹן אַלְמָנָה לְכֹהֵן גָּדוֹל. גְּרוּשָׁה וַחֲלוּצָה לְכֹהֵן הֶדְיוֹט.*
My translation: "Shmuel said: one does **not** coerce [a divorce] **except**, for example, a widow to a High Priest, a divorcee or halutzah to an ordinary priest."

The argument then runs in four steps, and the pilot reading dropped them:

1. **Objection** (anonymous voice): *וְהָא תַנִּינָן. שְׁנִיּוֹת.* This points to Mishnah Yevamot 9:3, where the husband of a secondary prohibited wife is coerced to divorce (*וְכוֹפִין אוֹתוֹ לְהוֹצִיא*).
2. **Reply**: *לָא בְגִין דָּא אָמַר שְׁמוּאֵל*. All the commentators have it defend Shmuel, but they read the words differently:
   - Korban HaEdah emends it, with a different wording in each of the two Korban HaEdah commentaries. The sense: Shmuel's "such as" (כגון) also covers rabbinic prohibitions.
   - Penei Moshe keeps the printed text. Shmuel did not mean to exclude שניות; he meant to exclude the cases where the Mishnah says only "he shall divorce".
   - Guggenheimer's English ("Did he not say 'for example'?") follows the sense of an emendation, although the Guggenheimer Hebrew prints בגין.
3. **Second objection**: the Mishnah on a man who vows to deny his wife any benefit (Ketubot 7:1): "he shall divorce and pay the ketubah".
4. **Rhetorical reply**: *שָׁמַעְנוּ שֶׁהוּא מוֹצִיא. שָׁמַעְנוּ שֶׁכּוֹפִין* — "we heard he must divorce; did we hear that he is coerced?" This keeps Shmuel's restriction. Tosafot (Ketubot 70a) report that Rabbenu Hananel ruled from this passage that coercion applies only where a source says so outright.

The Yevamot and Gittin parallels add a Shmuel line that Ketubot lacks: "one coerces only for disqualified [unions]" (פוסלין / לפסולין). Treat it as a variant, not a separate teaching.

## 2. Yose calls Hila "my teacher" (11:7:4)

In Guggenheimer's Hebrew and the Venice print of Ketubot: *בְּכָל שָׁעָה הַוָה רִבִּי הִילָא רִבִּי אָמַר לִי. תְּנִי מַתְנִיתָךְ. יוֹרְשָׁהּ וּמִיטַמֵּא לָהּ.*
My translation: "At all times Rabbi Hila, my teacher, would tell me: recite in your teaching, 'he inherits her and becomes impure for her'."

- This is a first-person teacher title, repeated habitually. Guggenheimer translates "my teacher", and Korban HaEdah writes "ר' אילא רבו".
- The same formula appears in JT Shabbat 9:3:4: "R. Zeira רבי", again glossed "my teacher".
- **Variant:** the teacher word is missing in Mechon-Mamre's Ketubot and in all three Yevamot 9:4 versions ("רבי הילא/אילה אמר לי").
- **Graph:** keep `student_of(Yose → Hila)` as explicit, but flag it as depending on the reading. The heard-from edge is secure in every version.

The next line, "ותני רבי חייא כן", can be read as support (Korban HaEdah's second reading, Mareh HaPanim, Guggenheimer) or as a rhetorical objection (Penei Moshe, Korban HaEdah's first reading). R. Hiyya's name appears only in Ketubot.

## 3. Yose Tsaydaniya vs. unqualified Yose

- **The formula:** Yose Tsaydaniya "recites before R. Yirmeya, and it disagrees with R. Yirmeya". The same formula appears in Nazir 7:3–4. Korban HaEdah reads it as the *baraita* contradicting Yirmeya, not as Yose's own opinion.
- **The epithet:** Korban HaEdah gives two meanings, "from Sidon" or "trap-maker".
- **Guggenheimer's identification:** the edition identifies this man with the Bavli's Rav Yosef Tsidoni, and Ketubot 46a does name such a reciter. This is a historical proposal by one editor, not a merge.
- **The unqualified Yose of 11:7:4:** no checked source identifies him with Tsaydaniya.
  - Against: the Yevamot parallel spells the name יוסה, and in Shabbat 9:3:4 an unqualified R. Yose(h) gets the same "recite your Mishnah" instruction from R. Zeira.
  - Keep two nodes, with an open coreference candidate.

## 4. Mana's answer about slaves (11:7:5)

The text: *שְׁתוֹק וְיָפֶה לָךְ. הִיא אוֹכֶלֶת וַעֲבָדֶיהָ אֵינָן אוֹכְלִין.* The commentators disagree on how to read it:

- **Rhetorical** (Korban HaEdah, Penei Moshe, Sha'arei Torat Eretz Yisrael, and in effect Noam Yerushalmi): "Be quiet… she eats, and her slaves would not eat?!" So the slaves eat.
- **Declarative:** "She eats but her (melog) slaves do not." This is Maimonides' ruling (Heave Offerings 7:20). Sheyarei Korban, Maaseh Rokeach and Yad Eitan tie it to this passage, and Guggenheimer's translation follows it. Sha'arei Torat Eretz Yisrael states that the rhetorical reading is "not like Rambam".

Either way, the people edges don't change: someone asks, Mana answers. The asker's name is itself a variant: **R. Reuven** in Ketubot (Venice, Guggenheimer) against **R. Abun/Avin** in Mechon-Mamre and Yevamot. Record one asks-edge with alternative subjects.

## Caution about the translation

Guggenheimer's English for Ketubot 11:7:3–8 partly reuses the same edition's Yevamot rendering. For example, it omits R. Hiyya's name and adds the Yevamot-only Shmuel line. So it cannot corroborate or deny readings in the Ketubot Hebrew.

## Files

- `dossier.json`: 19 findings, 7 alternative readings, 11 proposed corrections, and ontology lessons. Every quote is checked against the saved bytes.
- `sources/`: all fetched texts, plus `fetch_log.json`, which holds the URLs, times and sha256 hashes.
- `build_dossier.py`, `fetch.py`, `search.py`, `show.py`: the scripts used.
