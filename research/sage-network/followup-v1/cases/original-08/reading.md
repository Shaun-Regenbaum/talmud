# Jerusalem Talmud Berakhot 1:5:14: the packed teaching list

This passage is about what the congregation says, and when it bows, while the
prayer leader recites the thanksgiving blessing (*modim*). The full evidence is
in `dossier.json` (findings F1-F16) and the saved files in `sources/`.

## The passage in plain English

- Rabbi Halafta ben Shaul taught that everyone bows with the prayer leader at
  the thanksgiving blessing. Rabbi Zeira added "but only at *modim*". That is a
  limit on the rule, not a dispute with it (F10).
- Rabbi Yose (spelled יֹסֵא or יסא) came up to the Land of Israel. He saw people
  bowing and whispering, and asked "what is this whispering?" The Talmud then
  remarks, in its own voice: "had he not heard what … said?" It follows with the
  list of names and a prayer text (F2). The list is the narrator's. Yose never
  met or heard these men. The text says so in the negative.

## The list, word by word

The printed Hebrew (Guggenheimer edition):

> רִבִּי חֶלְבּוֹ · רִבִּי שִׁמְעוֹן **בְּשֵׁם** רִבִּי יוֹחָנָן **בְּשֵׁם** רִבִּי יִרְמְיָה · רִבִּי חֲנִינָא **בְשֵׁם** רִבִּי מְיָישָׁא · רִבִּי חִיָּיא **בְשֵׁם** רִבִּי סִימַאי

My word-for-word translation: "R. Helbo, R. Shimon, in the name of R.
Yohanan, in the name of R. Yirmeya, R. Hanina, in the name of R. Miasha, R.
Hiyya, in the name of R. Simai."

The Hebrew links four pairs with בשם ("in the name of"). Three places (marked ·)
have no linking word at all: Helbo-Shimon, Yirmeya-Hanina and Miasha-Hiyya. No
"and" or new "said" marks where one chain ends (F1). **Where each chain ends is
therefore an editor's decision.**

## How the two commentaries read it

| Join | Printed Hebrew | Guggenheimer (translation) | Ohr LaYesharim |
|---|---|---|---|
| Helbo - Shimon | nothing | "Ḥelbo, Simeon": unclear | supplies בשם: Helbo in Shimon's name |
| Shimon - Yohanan | בשם | in the name of | in the name of |
| Yohanan - Yirmeya | בשם | Yohanan **in the name of** Jeremiah | puts this בשם in parentheses, apparently to remove it: **new chain**, "and likewise R. Yirmeya said" |
| Yirmeya - Hanina | nothing | separate | Yirmeya in Hanina's name, a word added by the editor abbreviated רז"פ |
| Hanina - Miasha | בשם | in the name of | **break**: a corrector added this בשם, matching the Rome MS, and רז"פ deleted it |
| Miasha - Hiyya | nothing | separate | supplies בשם: Meisha in Hiyya's name |
| Hiyya - Simai | בשם | in the name of | in the name of |

The notes on the table's evidence types:

- Ohr LaYesharim's manuscript reports are of three kinds: a Rome manuscript
  reading, a later corrector in the base manuscript, and a modern emendation by
  רז"פ. They are kept apart in F6. No manuscript was examined here.
- In the saved Ohr LaYesharim, words of the Talmud are in bold and the
  commentator's words are in plain type. The added בשם at Helbo-Shimon and at
  Meisha-Hiyya are in plain type (F5).
- The input's Meisha-to-Hiyya "cites" row (0.93) therefore rests on the
  commentator's reading only.

## The Yirmeya problem: Tanna or later Amora?

The two readings of the chain depend on which men are meant.

- **Guggenheimer** (footnote 256) says Jeremiah is "A Tanna of the last
  generation, student of R. Yehudah ben Batyra". Footnote 257 makes Miasha an
  early Tanna of the late Second Temple. On these identities, "Yohanan in the
  name of Jeremiah" and "Hanina in the name of Miasha" cite older authorities.
  That fits the printed בשם words (F4).
- **Ohr LaYesharim** makes Yirmeya and Meisha Palestinian Amoraim of the third
  and fourth generations, later than Yohanan. On that dating, "Yohanan in the
  name of Yirmeya" would run backwards in time. That fits its decision to start
  a new chain at Yirmeya (F5).

Each reading's chain and its dating depend on each other, so neither confirms
the other. Both names occur elsewhere for men of different periods: an Amora
Meisha, grandson of R. Yehoshua ben Levi, and a Tanna R. Miasha in Nahum the
scribe's chain of tradition. A Rabbi Yirmeya also teaches in the very next
segment (F7). **A shared name does not identify anyone, and this dossier does
not decide between the two readings.** Footnote 256 gives no source in the
fetched text. No support for it was found here.

## Other points

- "And some say it: the colleagues, in the name of R. Simai" swaps the
  **reporter** (Hiyya becomes the colleagues, a group) and keeps Simai as the
  source. This is an alternative-reporter relation, not a same-man link (F8).
  The Bavli (Sotah 40a) has a similar "the Nehardeans say in the name of R.
  Simai". That is a parallel only (F9).
- Names that contain a family link get parent placeholders: Halafta ben
  **Shaul**, Abba bar **Zavda**, and Samuel bar **[Inia]**. Samuel's father's
  name varies by witness: Inia in the Rome MS, and Mina, Ina, Idi, Bina and
  others elsewhere. Keep all the variants. The input mention "רבי שמואל" cut the
  patronymic out of the name. For **Bar Qappara**, it is unclear whether this is
  literal kinship or a fixed name (F13).
- The footnotes say Samuel was "a student of Aha" and that Abba bar Zavda was
  trained under Rav. These are commentary claims. The text says only "in the
  name of" (F14).
- Ohr LaYesharim identifies the observer Yose/Yisa as R. Asi. That is a
  proposal (F12). Haggahot RaDO reads R. Yudan's closing words as answering
  Yisa's question. That is also a proposal (F15).
- Penei Moshe, Mareh HaPanim, Sirilio and Haggahot RaDO say nothing about how
  the chain divides, at least in these fetched segments.

## Proposed changes (provisional)

1. Meisha-Hiyya: change "cites" to "juxtaposed", with "cites" kept only on the
   Ohr LaYesharim branch.
2. Keep Yohanan-Yirmeya and Hanina-Miasha as printed-text "cites", but mark
   both as contested, and attach both identity proposals. Do not call the chain
   "chronologically backwards" without saying which Yirmeya is meant.
3. Halafta-Zeira: "explains", not "disputes".
4. Add the alternative-reporter relation (Hiyya or the colleagues, in Simai's
   name), the observer, and the parent placeholders.

## Limits

No manuscript images, critical apparatus or biographical reference works were
checked. The phrase searches found no parallel chain, but they miss
abbreviations and spelling variants. See `unresolved` in the dossier.
