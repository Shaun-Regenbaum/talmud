# Bava Batra 170b:4: who challenges Rav Huna, and whose baraita is it?

Status: researched. The details are in `dossier.json` (findings F01–F15). Each
source is saved in `sources/` with its URL and hash.

## The passage

Rav Huna reports Rav's ruling (170b:3). The halakha follows neither Rabbi Yehuda
nor Rabbi Yosi. Instead, a court tears up the note and writes a new one from the
first date.

At 170b:4 someone tells Rav Huna that Rav would have retracted had he heard a
baraita saying that *witnesses* tear up the note and write a new one. The text
gives this challenger two ways: Rav Nahman, "and some say" Rav Yirmiyah bar Abba.
At 170b:5 the reply comes: "He heard it and did not retract."

## What is explicit

- Rav Huna transmits Rav's ruling (c1, c2). Rav does not rule like Rabbi Yehuda
  or Rabbi Yosi (c3, c4).
- There are two challengers as reported alternatives, both speaking to Rav Huna
  (F01). The first reading's two branches are right.
- The baraita is Rabbi Yehuda's, and Rabbi Yosi disputes it within it. The
  Gemara quotes it in full at 171a:5 ("מאי ברייתא ... דברי רבי יהודה"). **The
  first reading and the earlier review both missed this** (F03).
- The Mishnah on the same amud (170b:2) gives both rules. It also has a speech
  pair: Rabbi Yehuda objects, and Rabbi Yosi answers him. This fills the gap the
  first reading marked as "needs context" (F04).
- "Bar Abba" supports a child-of relation. It holds only in the Rav Yirmiyah
  branch. Keep the Abba placeholder (F14).

## What rests on interpretation

- **Who replies at 170b:5.** The Aramaic says only "he said to him". Rav Huna is
  the natural reading. The name "Rav Huna" appears only as the editors' plain text
  in the William Davidson English and the Steinsaltz Hebrew, which are one project.
  Soncino leaves the speaker unnamed (F02).
- **What Rav rejected in Rabbi Yehuda's view.** Rashbam says Rav requires a court
  where Rabbi Yehuda allowed witnesses, and that "Rav is a Tanna and disputes".
  Tosafot (the Ri) and Tosfot HaRosh say Rav took Rabbi Yehuda to mean the second
  date (F05). This does not change who speaks.
- **Who speaks the reason at 171a:1** ("a court can reassign property; witnesses
  who have done their task cannot"). This is unclear. It is safer to treat it as
  the anonymous Gemara (F10).

## Alternatives that must stay open

- Rav Nahman or Rav Yirmiyah bar Abba. Tosafot and Tosfot HaRosh name only Rav
  Nahman, but only as a label, not as a choice between the two (F06).
- **The Yerushalmi parallel** (Bava Batra 10:6:2) names only "Rabbi Yirmiyah". He
  says that had Rav heard the teaching (taught there by Rabbi Hiyya), he would not
  have said this. There is no Rav Nahman, no Rav Huna, and no reply (F07).
  - Sha'arei Torat Eretz Yisrael identifies him as Rabbi Yirmiyah bar Abba, and
    Guggenheimer calls him "Rav Jeremiah". These are commentators'
    identifications, not proof (F08).
  - Commentators also disagree on how close the parallel is. Penei Moshe and Mareh
    HaPanim make it close. Noam Yerushalmi and a Guggenheimer note tie it to the
    blotted-note case (F09).
  - Store it as a parallel tradition. It is not a variant and not corroboration.

## Proposed corrections (provisional)

1. Fill `y_rule` and `yosi_rule` from the Mishnah, and close `needed_context`.
2. Add the Mishnah's Rabbi Yehuda / Rabbi Yosi speech pair, labelled as a
   literary dispute.
3. Add attributed_to(baraita → Rabbi Yehuda) and Rabbi Yosi's opposing baraita
   view, from 171a:5.
4. Add a note to c7 and c10 that the replier is unnamed in the Aramaic.
5. Record the counterfactual in a structured field.
6. Add a parallel-tradition note on the challenger group.

## Limits

I checked no manuscripts or variant apparatus for the challenger names, and did
not locate the Rosh's ruling on this passage. The wider-context people at 171a:2-4
(Rav Yehuda citing Rav; Rav Yosef; Rabba) are recorded as out of scope (F11).
