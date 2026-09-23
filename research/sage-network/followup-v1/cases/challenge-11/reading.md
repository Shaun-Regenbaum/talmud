# Berakhot 27b:3: the question that was not asked

**Status:** researched. All graph proposals are provisional.

## The passage

> שאני רבי ירמיה בר אבא דתלמיד חבר הוה והיינו דקאמר ליה רבי ירמיה בר אבא לרב מי בדלת אמר ליה אין בדילנא ולא אמר מי בדיל מר

Our translation: "Rabbi Yirmiya bar Abba is different, for he was a student-colleague. And this is why Rabbi Yirmiya bar Abba said to Rav: *Have you separated?* He said to him: *Yes, I have separated.* And he did not say: *Has the Master separated?*"

## Three speech items, only two of them spoken

1. **Question.** Yirmiya asks Rav, in the second person, "have you separated?" (from work, after praying the Sabbath prayer early; so Rashi).
2. **Answer.** The speaker is not named. Context makes it Rav: "yes, I have separated."
3. **The unsaid wording.** The anonymous Talmud remarks that Yirmiya did *not* use the formal "has the Master separated?". This is a negative report, and its content is counterfactual. It must never become an "addressed as Master" edge.

Every witness checked has this shape: the printed Aramaic, the Davidson English, Cohen (1921), Soncino and the Geonic Halakhot Gedolot quotation. The Halakhot Gedolot quotation reads "ולא קאמר ליה מי בדיל מר".

One later quotation says the opposite. Midrash Sekhel Tov quotes the question as "מי בדיל מר ממלאכה", with the formal wording. It also places the exchange at the Geniva visit and drops the student-colleague point. That is a quotation variant, possibly a paraphrase. It is recorded but does not change the reading.

## The student-colleague claim and its limits

- **Who says it.** The anonymous Talmud says it, answering the difficulty from Rav's own rule, taught through Rav Yehuda: no one prays behind his teacher. The exchange is its proof. Rashi: "שמע מינה תלמיד חבר הוי ליה". So the relation is argued, not narrated.
- **Object.** The printed text leaves the other party implicit: Rav, from context. Halakhot Gedolot names him: "לגבי רב".
- **Scope in the Talmud.** It explains only why Yirmiya could pray behind Rav.
- **Wider scope in later voices, kept under each author:**
  - Tosafot: every item in Rabbi Eliezer's list is permitted.
  - Maimonides: a student-colleague is one who did not learn most of his wisdom from the teacher. He is exempt from those honours, but still stands for the teacher and tears his garment when he dies.
  - Shulchan Arukh: only the prayer permission.
  - Taz and Bach: he need not say "Master".
  - Tziyyun LeNefesh Chayyah: the short wording was partly haste. The proof still holds, because a full student may not speak so.
- **The earlier inference is narrowed.** 27a:15 said "a student may pray behind his teacher". The answer here limits that to a student-colleague, and the codes agree.

## Identity: kept open

- **Title.** Rabbi or Rav? The Eruvin 40b parallel and Halakhot Gedolot read "רב ירמיה בר אבא". Tosafot reports that most copies of Berakhot read "רב ירמיה".
- **Kiddushin.** In Kiddushin 46a a Rav Yirmiya bar Abba is called Rav Huna's "student". Tosafot suggests there were two sages called Rav Yirmiya, and the Ritva also separates them.
- **Pesachim 106b.** Rashi takes "his teacher" as Rav, while Tosafot considers Rav Huna.
- **Rivash.** He makes him a student of Rabbi Yochanan.

These are later hypotheses. No merge is proposed on the name.

## Proposed graph changes

- **c14 (student-colleague).** Keep the relation and subtype with fixed roles: Yirmiya is the student-colleague, Rav the teacher. Change its voice to the anonymous Talmud's resolution and its basis to "proof from the form of address". Mark the object as supplied by context.
- **New negative speech record.** Add a record for "ולא אמר מי בדיל מר", with a new statement node holding the counterfactual wording. It supports c14.
- **c15 and c16.** Keep both. Note that the answering speaker is known from context only, and that the occasion is not dated. Rashi says "that day", and on Eruvin he says a cloudy day, which the Rashash disputes. Keep the exchange as its own event, apart from the Geniva visit.
- **The "behind" inference.** Tie it to the scene and mark it as qualified by c14.
- **Yirmiya entity.** Add the name form "רב ירמיה בר אבא". Keep the Abba patronymic placeholder unchanged.

## Not checked

No manuscripts were seen directly. Cohen's footnotes give no Munich variant for this line, but that does not show there is none.

The Ramban's quotation at Pesachim 54b ("Rav said to Rabbi Chanina") and Cohen's "Rab said" for רבא at 27b:4 are left unresolved. The scope of this reading is the Sefaria texts, links and searches saved in `sources/`, plus the Soncino page.
