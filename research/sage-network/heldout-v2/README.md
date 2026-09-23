# Twelve passages nobody has read yet

These twelve passages are for testing the next passage reader. Six come from the
Babylonian Talmud and six from the Jerusalem Talmud. They were drawn and saved on
23 September 2026, before anyone read them.

`draw.py` sorts every saved passage version by a seeded SHA256 of its ID and takes
the first six per Talmud. It skips a passage if it, or the two passages on either
side, was used by the pilot or the follow-up research. It never looks at names,
earlier labels, length or subject. `manifest.json` records the seed, the lake
snapshot, the 150 excluded references and a hash of every file they came from.
Running `draw.py` again with the same inputs gives the same files. It refuses to
change a saved file.

## Rules for using them

- Do not tune the reading rules on these passages. Read them once with the next
  reader recipe, then have the results reviewed.
- The ontology review also set aside some named cases for testing, such as
  original-02 and challenge-01. The follow-up research has since read several of
  them closely. Those readings can serve as answer keys. But a rule that came
  from one of them is no longer tested fairly on that case. The plan records
  which case each new rule came from, so the test can score it separately.
  These twelve passages stay clean.
- Twelve passages cannot measure accuracy across the Talmud. They show which
  kinds of mistake the new reader still makes.
