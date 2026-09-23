# challenge-30: Moed Katan 17a:13, Rabbi's maidservant bans a man who strikes his grown son

**Status:** researched. Scope: Sefaria texts of Moed Katan 16b–17a, the commentaries and codes listed in `dossier.json`, Yerushalmi Moed Katan 3:1, and Ein Yaakov. No manuscripts were checked. Translations are my own brief renderings unless another translator is named.

## The four roles, kept apart

| Role | Who | Basis |
|---|---|---|
| Speaker | The unnamed maidservant of Rabbi's household (אמתא דבי רבי) | Text: feminine אמרה |
| Target | "That man" (ההוא גברא), the unnamed father striking his grown son | Text: the same phrase names the man she saw |
| Addressee | **Not stated in the base text** | Text: אמרה, with no ליה |
| Legal force | The Sages did not treat her ban lightly for three years | Stated by R. Shmuel bar Nachmani at **17a:9**, not in 17a:13 |

## What changes

1. **c4 `addresses(servant, father)` is not supported by the base text.** Model it as a ban declaration instead: speaker = servant, target = father, addressee = unknown.
2. **Variant reading.** Ein Yaakov (Daat edition) reads *אָמְרָה לֵיהּ* ("she said *to him*"), and so does the Ran's quotation (Nedarim 7b). Teshuvot Rashi has *[ליה]* in editorial brackets. Record this as a source-variant branch in which the addressee is "him", most plausibly the father. It is not the base reading.
3. **The third person proves nothing either way.** In the very next story (17a:14) Reish Lakish says "let that man be banned", and the man answers him at once. In 17a:7 a banned scholar calls himself "that man". The formula fits a face-to-face declaration but does not require one.
4. **Where the legal force comes from.** "מאי היא" answers R. Shmuel bar Nachmani's precedent at 17a:9. He cites it while R. Ami is reviewing the case of the scholar Rav Yehuda banned. This resolves the pilot's `needs_context`. The three years is R. Shmuel bar Nachmani's reported claim. The narrator of 17a:13 does not state it.
5. **c5: it is unclear whose words the reason is.** "דקעבר משום ולפני עור" may be the servant's own reason (the William Davidson English reads it so) or the Gemara's explanation. The following baraita is the Gemara's. c5 should have basis = interpretation.
6. **The baraita's attribution varies.** It is anonymous in the Vilna-based text. The Rosh has "ר' ישמעאל אומר". Ein Yaakov prints the same attribution in parentheses and corrects it to [דתניא]. Keep this as a variant attribution only. It does not identify which R. Yishmael.

## Commentary, kept separate from the text

- **Rashi:** because the son is grown, he may kick back at his father, so the father "trips" him.
- **Ritva:** "גדול" is not literal; it depends on the son's nature.
- **Rabbeinu Peretz, Beit Yosef, Shulchan Arukh:** give age limits (22 or 24).
- **Raavad (cited by the Rosh), echoed by Ritva and Tosafot Yom Tov:** the ban lasted three years because no one would weigh himself against so worthy a declarer, until "the great ones of the generation" released him. That release is their reconstruction. It is not a Talmudic event.
- **Codifiers:** Rambam (Rebels 6:9) and Shulchan Arukh (YD 240:20) rule that striking a grown son incurs a ban. Rambam's Torah Study 6:14 lists "המכשיל את העור" among the 24 grounds; the Raavad, as quoted by Kessef Mishneh, glosses it as "for example, one who strikes his grown son". Touger's translation note says "the entire Jewish people" observed the ban. That overstates the Talmud, which says "חכמים" (the Sages).

## Parallel, not the same people

Yerushalmi Moed Katan 3:1 tells a similar story: *a maidservant of Bar Pata's household* sees a *Scripture teacher* hitting a child too hard. There *אמרה ליה* is explicit, and the teacher goes to ask R. Acha. The household, target, victim and outcome all differ, so there is no coreference. The story only shows that the formula can be spoken to the target directly. (The Guggenheimer English there has "He said"; the Aramaic verb is feminine.)

## Graph (provisional)

- servant —(member of household of)→ Rabbi's household. Identifying Rabbi as Yehuda HaNasi comes from the translation and convention; no source puts Rabbi at the scene.
- son —child_of→ father (explicit from לבנו).
- father —strikes→ son.
- servant —sees→ the striking.
- servant —pronounces ban (target: father; addressee: unknown | variant: "him")→.
- R. Shmuel bar Nachmani —cites precedent (in R. Ami's review)→ "the Sages kept her ban three years" (reported).

Open questions: manuscript readings of אמרה/אמרה ליה; the Daat edition's markup conventions; one clause of the Ritva; whether this servant is the "Rabbi's maidservant" of other passages (not decided).
