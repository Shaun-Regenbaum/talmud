# Jerusalem Talmud Megillah 1:10:4–6: which "high priest" is which

Job `random-yerushalmi-02`. Status: **researched**. All graph proposals below are provisional.
Evidence, offsets and sources are in [dossier.json](dossier.json). Saved sources are in `sources/`.

## The anchor error, fixed

In 1:10:5 the string לְכֹהֵן גָּדוֹל appears twice:

| occurrence | offsets | context | what it is |
|---|---|---|---|
| 1 | 99–114 | הַשֵּׁינִי אֵינוֹ כָשֵׁר לֹא **לְכֹהֵן גָּדוֹל** וְלֹא לְכֹהֵן הֶדְיוֹט | a role category in a rule about the hypothetical *second* priest |
| 2 | 304–319 | שֶׁאִירַע קֶרִי **לְכֹהֵן גָּדוֹל** בְּיוֹם הַכִּיפּוּרִים | the incumbent high priest in the Ben Illem story |

The earlier `first_priest` (m9) used occurrence 1. It should use occurrence 2. There are two more mentions of the incumbent:
- תַּחְתָּיו at 378–388, "in his stead".
- Ben Illem's words מִשֵׁלְּכֹהֵן גָּדוֹל at 525–538, "from the high priest's [property]".

Occurrence 1 should not be linked to any person.

## Priest eligibility rules to keep

All of these are about generic legal roles, not about the story's people.
- **Mishnah (1:10:1):** a priest anointed with oil and a priest installed by wearing the garments differ only in the bull brought for any commandment. A serving high priest and a former one (כהן שעבר) differ only in the Yom Kippur bull and the tenth of an ephah.
- **1:10:2:** an anonymous tannaitic teaching says the anointed priest brings the bull and the garment-installed one does not. Rabbi Meir disagrees.
- **1:10:3:** Rabbi Yohanan says that if the *former* high priest brought the tenth of an ephah anyway, it is valid. The subject comes from the Mishnah and is confirmed by Penei Moshe, Korban HaEdah, Ohr LaYesharim and Guggenheimer. This answers the earlier open question.
- **1:10:4:** a backup priest is prepared. Should the two be secluded together? Rabbi Haggai swears "by Moses" that one would kill the other. This is a hypothetical, not an event. From the word "אותו", one high priest is anointed, not two. Rabbi Yohanan says this is "because of enmity". Most commentators read that as the reason; Guggenheimer reads it as a disagreement.
- **1:10:5:** when one priest leaves service and the other serves, the first still bears all the priestly commandments. The second is fit neither as high priest nor as ordinary priest. Rabbi Yohanan says that if the second served anyway, his service is valid. The Horayot parallel as saved reads "invalid"; Guggenheimer rejects that reading.
- **The earlier output was missing** the claims about the first priest's duties and the second priest's disqualification. They should be added.

## Story participants

**Ben Illem (1:10:5)**
- Ben Illem of Tzipporin, named.
- The incumbent high priest, unnamed.
- The king, unnamed.
- The earlier output left out one step: the king understood what Ben Illem was asking.
- Ben Illem's removal is passive (הוּסַּע), so no agent is stated.
- The story answers the question "his service is from whose property?". Commentators disagree on the answer: Penei Moshe says the incumbent's, Ohr LaYesharim says the replacement's.
- Tosefta and the Bavli call him *Yosef* ben Ilim/Elem and put the story in Rabbi Yose's mouth. In the Bavli, the Sages, not the king, make the ruling.
- Treat these as parallel traditions, not as a merge.
- "Ben Illem" is a name, so the earlier `child_of Illem` claim should be downgraded.

**Kimhit (1:10:6)**
- Shimon ben Kimhit.
- A king. Some witnesses make him an "Arab king" and others put the scene on "the eve of Yom Kippur". This is left as a reading branch.
- His brother Yehuda.
- Their mother, first called אִימָּן and then Kimhit. She is **the only woman participant** in the segments checked.
- Seven sons, five of them unnamed.
- The Sages, who send her a question.
- An unmarked "they" who praise her. These are probably the Sages.
- The "king's daughter" in Psalm 45 is part of a quoted verse, not a person.
- Korban HaEdah and Ohr LaYesharim say the spittle came from the king. The Hebrew only has a pronoun.
- The Bavli tells this story about *Yishmael* ben Kimhit and his brothers Yeshevav and Yosef. They should not be merged with the Yerushalmi's people.

**Mishnah Yoma 1:1:** Rabbi Yehuda's "second wife" is in the Mishnah that 1:10:4 quotes. The Megillah passage does not quote that part, so she stays out of this graph.

## Scope and limits

What I checked:
- The five input segments.
- All of 1:10 on Sefaria: Guggenheimer's Hebrew and English with notes, Venice, and Mechon-Mamre.
- The commentaries linked on Sefaria: Penei Moshe, Korban HaEdah, Mareh HaPanim, Ohr LaYesharim and Ridbaz.
- Parallels in Yerushalmi Yoma 1:1 and Horayot 3:2, Tosefta Yoma 1:4 and 3:20, Bavli Yoma 12b–13a and 47a, and Megillah 9b.
- Mishnah Megillah 1:9 and Yoma 1:1.
- Two halakhot of the Mishneh Torah.

What I did not read directly: manuscripts, Sheyarei Korban, Tosafot Yoma 12b, Josephus, and Lieberman's *Tosefta ki-Fshutah*. The Josephus identification of the replaced high priest as Matthias son of Theophilus is known here only through Ohr LaYesharim.

## Files

- `dossier.json`: 26 findings, alternative readings, unresolved points, 17 proposed corrections and ontology lessons.
- `sources/`: 5 input segments and 17 fetched files, with `_fetch_log.json` recording URLs, times and hashes.
- `fetch.py`, `quotes.py`, `build_dossier.py`: fetching, exact-quote resolution and dossier build. The build fails if any quote is not found in the saved bytes.
