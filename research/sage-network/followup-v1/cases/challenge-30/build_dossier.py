"""Build dossier.json for challenge-30 (Moed Katan 17a:13) from the saved sources.

Every evidence quote is checked as an exact substring of the saved file's text
(HTML tags stripped) before the dossier is written.
"""
import hashlib
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = {os.path.basename(e["saved_file"]): e for e in json.load(open(os.path.join(HERE, "sources/fetch_log.json")))}

SRC = [
    # source_id, saved file (relative to sources/ unless path given), edition, url override
    ("S0", "../../../pilot/inputs/challenge-30.json", "Pilot input: Moed Katan 17a:13, William Davidson Edition - Vocalized Aramaic via Sefaria (read-only)", "research/sage-network/pilot/inputs/challenge-30.json"),
    ("S0b", "../../../pilot/outputs/challenge-30.json", "Pilot first reading under review (read-only)", "research/sage-network/pilot/outputs/challenge-30.json"),
    ("S0c", "previous-review.json", "Earlier independent review of the pilot reading (read-only)", "research/sage-network/followup-v1/cases/challenge-30/previous-review.json"),
    ("S1", "sefaria_v3_moed_katan_17a_all.json", "Sefaria v3 Moed Katan 17a: William Davidson Edition (Vocalized Aramaic, Aramaic, English), Wikisource Talmud Bavli", None),
    ("S2", "sefaria_v3_moed_katan_16b_all.json", "Sefaria v3 Moed Katan 16b: same versions", None),
    ("S3", "sefaria_links_mk_17a_13.json", "Sefaria links API for Moed Katan 17a:13", None),
    ("S3b", "sefaria_links_mk_17a_9.json", "Sefaria links API for Moed Katan 17a:9", None),
    ("S3c", "sefaria_links_mk_17a_12.json", "Sefaria links API for Moed Katan 17a:12", None),
    ("S4", "rashi_mk_17a.json", "Rashi on Moed Katan 17a, Vilna Edition (Sefaria)", None),
    ("S5", "steinsaltz_mk_17a.json", "Steinsaltz on Moed Katan 17a, William Davidson Edition - Hebrew (Sefaria)", None),
    ("S6", "ritva_mk_17a.json", "Chidushei HaRitva on Moed Katan 17a, Amsterdam 1729 (Sefaria)", None),
    ("S7", "tosafot_mk_17a.json", "Tosafot on Moed Katan 17a, Vilna Edition (Sefaria)", None),
    ("S8", "rif_mk_9a.json", "Rif Moed Katan 9a, Vilna Edition (Sefaria)", None),
    ("S9", "rosh_mk_3_11.json", "Rosh on Moed Katan 3:11, Vilna Edition (Sefaria)", None),
    ("S10", "ein_yaakov_mk_3_10.json", "Ein Yaakov, Moed Katan 3:10, Daat edition (Sefaria)", None),
    ("S11", "ran_nedarim_7b_5.json", "Ran on Nedarim 7b:5, Vilna Edition (Sefaria)", None),
    ("S12", "teshuvot_rashi_70.json", "Teshuvot Rashi 70, vol. I, New York 1943 (Sefaria)", None),
    ("S13", "yerushalmi_mk_3_1.json", "Jerusalem Talmud Moed Katan 3:1: Venice Edition, Mechon-Mamre, Guggenheimer edition and translation (Sefaria)", None),
    ("S14", "mt_rebels_6.json", "Mishneh Torah, Rebels 6: Torat Emet 363, Wikisource; Touger and Birnbaum translations (Sefaria)", None),
    ("S15", "mt_torah_study_6.json", "Mishneh Torah, Torah Study 6: Torat Emet 363, Wikisource; Touger, Glazer, Hyamson translations (Sefaria)", None),
    ("S16", "kessef_mishneh_torah_study_6_14.json", "Kessef Mishneh on Mishneh Torah, Torah Study 6:14, Torat Emet 363 (Sefaria)", None),
    ("S17", "kessef_mishneh_rebels_6_9.json", "Kessef Mishneh on Mishneh Torah, Rebels 6:9, Torat Emet 363 (Sefaria)", None),
    ("S18", "beit_yosef_yd_334_96.json", "Beit Yosef, Yoreh De'ah 334:96, Vilna 1923 (Sefaria)", None),
    ("S19", "beit_yosef_yd_240_34.json", "Beit Yosef, Yoreh De'ah 240:34, Vilna 1923 (Sefaria)", None),
    ("S20", "sa_yd_240_20.json", "Shulchan Arukh, Yoreh De'ah 240:20 (Sefaria, several editions)", None),
    ("S21", "sa_yd_334_43.json", "Shulchan Arukh, Yoreh De'ah 334:43 (Sefaria, several editions)", None),
    ("S22", "tyt_eduyot_1_5_5.json", "Tosafot Yom Tov on Mishnah Eduyot 1:5:5, Romm Vilna 1913 (Sefaria)", None),
    ("S23", "petach_einayim_mk_17a.json", "Petach Einayim on Moed Katan 17a, Jerusalem 1959 (Sefaria)", None),
    ("S24", "lechem_mishneh_torah_study_7_2.json", "Lechem Mishneh on Mishneh Torah, Torah Study 7:2 (Sefaria)", None),
    ("S25", "seder_hadorot_1652.json", "Seder HaDorot, Tanaim and Amoraim 1652, Warsaw 1878-1882 (Sefaria)", None),
    ("S26", "tashbetz_1_33.json", "Sefer HaTashbetz, Part I 33, Lemberg 1891 (Sefaria)", None),
    ("S27", "mishpetei_uziel_9_oc_3.json", "Mishpetei Uziel, Vol. IX, Orach Chayim 3, Jerusalem 1995-2005 (Sefaria)", None),
    ("S28", "ohr_layesharim_ymk_3_1_11.json", "Ohr LaYesharim on Jerusalem Talmud Moed Katan 3:1:11, Machon HaYerushalmi 2005 (Sefaria)", None),
    ("S29", "sefaria_search_59edc7d2.json", "Sefaria search-wrapper, exact phrase 'שפחה של בית רבי'", None),
    ("S30", "sefaria_search_6a2398bd.json", "Sefaria search-wrapper, exact phrase 'במכה לבנו גדול'", None),
    ("S31", "sefaria_search_a1266f01.json", "Sefaria search-wrapper, exact phrase 'אמתא דבי רבי'", None),
    ("S32", "sefaria_search_8a0aae61.json", "Sefaria search-wrapper, exact phrase 'לבנו גדול'", None),
    ("S33", "haamek_sheilah_60_14.json", "Haamek Sheilah on Sheiltot 60:14, Vilna 1861 (Sefaria)", None),
]


def path_of(fname):
    if fname.startswith("..") or fname == "previous-review.json":
        return os.path.normpath(os.path.join(HERE, fname))
    return os.path.join(HERE, "sources", fname)


def texts_of(fname):
    raw = open(path_of(fname), "rb").read()
    out = [raw.decode("utf-8")]
    try:
        d = json.loads(raw)
    except Exception:
        return out

    def walk(x):
        if isinstance(x, str):
            out.append(x)
            out.append(re.sub("<[^>]+>", "", x))
        elif isinstance(x, list):
            for y in x:
                walk(y)
        elif isinstance(x, dict):
            for y in x.values():
                walk(y)
    walk(d)
    return out


sources = []
files = {}
for sid, fname, edition, url in SRC:
    p = path_of(fname)
    data = open(p, "rb").read()
    e = LOG.get(fname)
    files[sid] = fname
    sources.append({
        "source_id": sid,
        "url_or_path": url or e["url"],
        "edition": edition,
        "fetched_at": e["fetched_at"] if e else None,
        "saved_file": fname if fname.startswith("..") or fname == "previous-review.json" else "sources/" + fname,
        "sha256": hashlib.sha256(data).hexdigest(),
    })
sources[0]["note"] = "Input captured 2026-09-22T10:13:07Z per its provenance; file read, not modified. Its Hebrew hash matches the unvocalized form of S1 segment 13."


def ev(sid, quote):
    return {"source_id": sid, "exact_quote": quote}


findings = [
    {
        "finding_id": "F1",
        "claim": "In the base text, the servant is the speaker and 'that man' (the father) is the target of her ban formula. The base text names no addressee: it has 'אמרה' ('she said'), with no 'ליה' ('to him'), and it refers to the man in the third person.",
        "kind": "textual",
        "evidence": [
            ev("S1", "שפחה של בית רבי מאי היא דאמתא דבי רבי חזיתיה לההוא גברא דהוה מחי לבנו גדול אמרה ליהוי ההוא גברא בשמתא"),
            ev("S1", "שפחה של בית רבי מאי היא דאמתא דבי רבי חזיתיה לההוא גברא דהוה מחי לבנו גדול אמרה ליהוי ההוא גברא בשמתא דקעבר משום (ויקרא יט, יד) ולפני עור לא תתן מכשול"),
            ev("S8", "אמתיה דבי רבי חזיתיה לההוא גברא דמחי לבנו גדול אמרה ליהוי ההוא גברא בשמתא"),
            ev("S9", "אמתא דבי רבי חזיתיה לההוא גברא דהוה קמחי לבנו הגדול אמרה להוי ההוא גברא בשמתא"),
        ],
        "translation_by_this_dossier": "'The maidservant of Rabbi's house saw a certain man who was striking his grown son. She said: Let that man be under a ban.'",
        "reasoning": "Speaker: the feminine verb אמרה goes back to אמתא דבי רבי. Target: ההוא גברא in the ban formula is the same phrase used for the man she saw striking his son. Addressee: none is stated in the William Davidson or Wikisource text on Sefaria, the Rif, or the Rosh. Using the third person for the target does not rule out that he heard it; see F3.",
        "confidence": "high",
        "graph_effect": "Record a ban-declaration event: speaker = servant, target = father, addressee = unknown in the base text. Do not record addresses(servant, father) as asserted.",
    },
    {
        "finding_id": "F2",
        "claim": "Some later witnesses read 'אמרה ליה' ('she said to him'). This gives an explicit masculine-singular addressee, most naturally the man himself. These are citation or anthology witnesses, not the base text.",
        "kind": "textual",
        "evidence": [
            ev("S10", "אָמְרָה לֵיהּ: לֶיהֱוֵי הַהוּא גַּבְרָא בְּשַׁמְתָּא"),
            ev("S11", "ואמרה ליה ליהוי ההוא גברא בשמתא"),
            ev("S12", "דקאמרה [ליה] ליהוי האי גברא בשמתא"),
        ],
        "translation_by_this_dossier": "Ein Yaakov: 'she said to him: let that man be under a ban'. Ran: 'and she said to him ...'. Teshuvot Rashi (1943 edition): 'that she said [to him]', where the brackets are that edition's.",
        "reasoning": "Three witnesses of different kinds. Ein Yaakov is an anthology of the Talmud's stories with its own wording: it also has 'לבריה רבה' and a baraita attribution. The Ran cites the story inside another discussion. In the Teshuvot Rashi edition, 'ליה' is in square brackets. That marks it as an editor's supplement, so it is weaker evidence than an unbracketed reading. No manuscript of Bavli Moed Katan was checked. So this dossier cannot say which reading is older. With 'ליה', the addressee is grammatically 'him'. The father is the only male participant present who could be meant (the son is the other male in the scene). That reading is still an interpretation of the pronoun.",
        "confidence": "medium",
        "graph_effect": "Add a variant branch. In the Ein Yaakov / Ran reading, addressee = 'him' (most plausibly the father). Keep this as a source-variant branch, separate from the base-text claim. The Teshuvot Rashi bracket is an editorial supplement, not an independent reading.",
    },
    {
        "finding_id": "F3",
        "claim": "The third-person ban formula 'ליהוי ההוא גברא בשמתא' is used in the next story about someone present who replies, and 'ההוא גברא' can refer to the addressee or the speaker. So in this sugya the formula does not tell you whether the target was present or addressed.",
        "kind": "textual",
        "evidence": [
            ev("S1", "אמר ליהוי ההוא גברא בשמתא אמר ליה אדרבה ליהוי ההוא גברא בשמתא אם ממון נתחייבתי לך נידוי מי נתחייבתי לך"),
            ev("S1", "אמר ליה לא מסתייך דשמתיה לההוא גברא אלא אחוכי נמי חייך בי"),
        ],
        "translation_by_this_dossier": "17a:14: 'He [Reish Lakish] said: Let that man be under a ban. He said to him: On the contrary, let that man be under a ban ...' 17a:7: 'Was it not enough for you that you banned that man [= me] ...'",
        "reasoning": "In 17a:14 the fig-eater answers at once, so he heard a formula that referred to him as 'that man'. His reply turns the same words back on Reish Lakish, who is its target and its addressee. In 17a:7 the banned scholar calls himself 'that man'. So the formula is idiomatic and fits a declaration made to the target's face, but it does not require one.",
        "confidence": "high",
        "graph_effect": "Do not treat the third person as evidence against presence, or as evidence for an addressee. Keep the addressee unknown in the base text.",
    },
    {
        "finding_id": "F4",
        "claim": "The narrated legal force comes from the wider sugya, not from 17a:13. At 17a:9, R. Shmuel bar Nachmani cites the servant's ban as a precedent: the Sages did not treat her ban lightly for three years. 17a:13 then tells the story as the answer to 'what is it?'.",
        "kind": "textual",
        "evidence": [
            ev("S1", "עמד רבי שמואל בר נחמני על רגליו ואמר ומה שפחה של בית רבי לא נהגו חכמים קלות ראש בנידויה שלש שנים יהודה חבירינו על אחת כמה וכמה"),
            ev("S1", "עיין רבי אמי בדיניה סבר למישרא ליה"),
            ev("S8", "ולא נהגו חכמים קלות ראש בנדויה שלש שנים"),
        ],
        "translation_by_this_dossier": "'R. Shmuel bar Nachmani stood up and said: If the Sages did not treat lightly the ban of the maidservant of Rabbi's house for three years, how much more so [the ban of] Yehuda our colleague.'",
        "reasoning": "This settles the 'needed_context' that the pilot flagged: 'מאי היא' ('what is it?') points back to 17a:9. The three-year respect for the ban is R. Shmuel bar Nachmani's statement, given as an argument in the case of the scholar banned by Rav Yehuda (17a:4-10). The narrator of 17a:13 does not state it. The Rif (and the Rosh, S9) place the three-year line straight after the story. That is a codifier's arrangement, not a separate event.",
        "confidence": "high",
        "graph_effect": "Add: R. Shmuel bar Nachmani cites the precedent (voice = R. Shmuel bar Nachmani, reported, in the setting of R. Ami's review). Add: the Sages treated her ban as binding for three years (discourse_status = reported by R. Shmuel bar Nachmani). This does not make Rabbi a participant or show that he approved.",
    },
    {
        "finding_id": "F5",
        "claim": "It is unclear where the servant's words end. The reason 'דקעבר משום ולפני עור' may be part of her speech or a gloss by the Gemara. The following 'דתניא' baraita is the Gemara's supporting source, not the servant's words.",
        "kind": "uncertainty",
        "evidence": [
            ev("S1", "אֲמַרָה: לֶיהֱוֵי הָהוּא גַּבְרָא בְּשַׁמְתָּא, דְּקָעָבֵר מִשּׁוּם ״וְלִפְנֵי עִוֵּר לֹא תִתֵּן מִכְשׁוֹל״. דְּתַנְיָא"),
            ev("S1", "She said: Let that man be excommunicated, due to the fact that he has transgressed the injunction"),
            ev("S5", "אמרה: ליהוי ההוא גברא בשמתא [שיהא אדם זה המכה בנידוי], דקעבר [שהרי הוא עובר] משום"),
        ],
        "translation_by_this_dossier": "'... because he transgresses “Do not put a stumbling block before the blind”. As it is taught: ... the verse speaks of one who strikes his grown son.'",
        "reasoning": "Unpunctuated Aramaic does not mark where a quotation ends. The William Davidson English reads the reason as her words. The vocalized edition's punctuation and Steinsaltz both leave it inside the same sentence. Neither settles who is speaking. The pilot's c5 (holds_view servant → reason, basis explicit) takes one reading as explicit.",
        "confidence": "medium",
        "graph_effect": "Lower c5 to basis = interpretation. Give it two readings: (a) the servant's stated reason, (b) the Gemara's explanation. Attach the baraita to the narrator or Gemara voice.",
    },
    {
        "finding_id": "F6",
        "claim": "The baraita is anonymous in the Vilna-based text. The Rosh attributes it to R. Yishmael. Ein Yaakov (Daat edition) prints 'דתנא דברי רבי ישמעאל' in parentheses and replaces it with '[דְּתַנְיָא]'.",
        "kind": "textual",
        "evidence": [
            ev("S9", "דתניא ר' ישמעאל אומר לפני עור לא תתן מכשול במכה לבנו גדול הכתוב מדבר"),
            ev("S10", "(דתנא דברי רבי ישמעאל) [דְּתַנְיָא]"),
            ev("S1", "דתניא ולפני עור לא תתן מכשול במכה לבנו גדול הכתוב מדבר"),
        ],
        "translation_by_this_dossier": "Rosh: 'As it is taught: R. Yishmael says: “Do not put a stumbling block before the blind” — the verse speaks of one who strikes his grown son.'",
        "reasoning": "This is a variant attribution in secondary witnesses. It shows that some text tradition named a tanna for the baraita. It does not show that R. Yishmael historically taught it, and it does not identify which R. Yishmael. The parenthesis-and-bracket markup in the Daat edition reflects that edition's corrections. This dossier did not check the edition's apparatus to confirm what the markup means.",
        "confidence": "medium",
        "graph_effect": "Optional variant branch: baraita attributed to 'R. Yishmael' in the Rosh (and in the uncorrected Ein Yaakov wording). Keep it separate from the base text. No identity resolution.",
    },
    {
        "finding_id": "F7",
        "claim": "The kinship is explicit: the man is striking 'his son' (לבנו). 'גדול' describes the son's stage of life. Commentators disagree on what 'גדול' means.",
        "kind": "interpretation",
        "evidence": [
            ev("S4", "דכיון דגדול הוא שמא מבעט באביו והוה ליה איהו מכשילו"),
            ev("S6", "ונראי' דברים דלא גדול גדול ממש אלא הכל לפי טבעו שיש לחוש שיתריס כנגדו בדבור או במעשיו"),
            ev("S23", "פירש רבינו פרץ עד כ\"ב שנה"),
            ev("S20", "וְלא מִקְרֵי גָּדוֹל לְדָבָר זֶה, רַק אַחַר כ\"ב שָׁנָה אוֹ כ\"ד שָׁנָה"),
        ],
        "translation_by_this_dossier": "Rashi: 'since he is grown, he may kick back at his father, and so [the father] makes him stumble.' Ritva: 'not literally grown, but according to his nature, if there is reason to fear he will rebel against him in word or deed.' Shulchan Arukh: 'for this matter he is called grown only after 22 or 24 years.'",
        "reasoning": "The father–son relation stands on the possessive suffix in the text. Its age scope is commentary: Rashi gives the mechanism, Ritva reads it by the son's nature, and Rabbeinu Peretz and the Shulchan Arukh give age limits. These interpretations do not affect who the people are.",
        "confidence": "high",
        "graph_effect": "Keep c1 child_of(son, father), basis explicit. Put 'גדול' in a note or subtype, with the interpretations attributed to their authors.",
    },
    {
        "finding_id": "F8",
        "claim": "Later authorities explain why the ban lasted three years. The Raavad (cited by the Rosh) says no one would weigh himself against a known and worthy declarer. The Ritva says something similar. These are commentary inferences. The Talmud does not say how the ban ended.",
        "kind": "interpretation",
        "evidence": [
            ev("S9", "תמה הראב\"ד ז\"ל למה שהה זה בנידויה ג' שנים אם היתה היא קיימת למה לא התירה לו ואם מתה למה לא התיר לו רבי"),
            ev("S9", "והשפחה היה בה חכמה יתירה ויראת חטא ולא רצו לשקול עצמם כנגדה עד שנזקקו לו גדולי הדור והתירו לו"),
            ev("S6", "שפחה של בית ר' לא נהגו קלות בנדוייה ג' שנים שלא היה א' שירצה לשקול עצמו כמותה"),
        ],
        "translation_by_this_dossier": "Rosh citing Raavad: 'Why did this man remain in her ban three years? If she was alive, why did she not release him; if she died, why did Rabbi not release him? ... The maidservant had great wisdom and fear of sin, and they did not want to weigh themselves against her, until the great ones of the generation took it up and released him.' Ritva: '... for there was no one who wished to weigh himself as her equal.'",
        "reasoning": "The statement that the man stayed banned and that 'the great ones of the generation' eventually released him is the Raavad's reconstruction, reported by the Rosh. Tosafot Yom Tov (S22) repeats it. The rest of the Ritva's sentence (about Rabbi not being alive and the Nasi) is hard to construe; this dossier does not translate it with confidence.",
        "confidence": "medium",
        "graph_effect": "Do not add a release event, or 'the great ones of the generation' as participants. At most, attach these as commentary-voice notes to the ban event.",
    },
    {
        "finding_id": "F9",
        "claim": "The codifiers turn the story into law. Rambam and the Shulchan Arukh rule that one who strikes a grown son is banned. Rambam's list of 24 offences includes 'one who trips the blind'. The Raavad's gloss, as reported by the Kessef Mishneh, gives this case as its example. Rashi's responsum uses the story to show that a spoken declaration was enough, with no shofar.",
        "kind": "interpretation",
        "evidence": [
            ev("S14", "וְהַמַּכֶּה בְּנוֹ גָּדוֹל מְנַדִּין אוֹתוֹ שֶׁהֲרֵי הוּא עוֹבֵר עַל וְלִפְנֵי עִוֵּר לֹא תִתֵּן מִכְשׁל"),
            ev("S16", "המכשיל את העור. כתב הראב\"ד כגון המכה את בנו הגדול"),
            ev("S15", "אֲפִלּוּ נִדָּהוּ קָטָן שֶׁבְּיִשְׂרָאֵל חַיָּב הַנָּשִׂיא וְכָל יִשְׂרָאֵל לִנְהֹג בּוֹ נִדּוּי"),
            ev("S12", "שפחה של בית רבי לא התריעה, דקאמרה [ליה] ליהוי האי גברא בשמתא. ולא נהגו קלות ראש בנידויו ג' שנים"),
        ],
        "translation_by_this_dossier": "Rambam Rebels 6:9: 'One who strikes his grown son is banned, for he transgresses “Do not put a stumbling block before the blind”.' Torah Study 6:14: 'even if the least in Israel banned him, the Nasi and all Israel must observe the ban.' Teshuvot Rashi: 'the maidservant of Rabbi's house did not sound [shofars]; she [only] said ...'",
        "reasoning": "These sources describe the legal force the tradition gave the declaration. They do not add people to the episode. The Touger translation note on Torah Study 6:14 says 'the entire Jewish people observed that ban for three years'. That is a translator's gloss, and it overstates the Talmud's 'חכמים' ('Sages').",
        "confidence": "high",
        "graph_effect": "None for people. Legal-force metadata on the ban event: declarative ban by a non-sage household servant, later treated as binding by the Sages (per R. Shmuel bar Nachmani), and codified as a ground for a ban.",
    },
    {
        "finding_id": "F10",
        "claim": "The Yerushalmi has a structurally similar story with different people. In it the addressee is explicit ('אמרה ליה'), and the target is shown to have heard, because he goes to consult R. Acha. This is a parallel, not the same event.",
        "kind": "textual",
        "evidence": [
            ev("S13", "חדא אמהא מן דבר פטא הוות עברה קומי חדא כנישא חמת חד ספר מחי לחד מיינוק יתיר מן צורכיה אמרה ליה יהוי ההוא גוברא מחרם אתא שאל לרבי אחא אמר ליה צריך את חשש על נפשך"),
        ],
        "translation_by_this_dossier": "'A maidservant of Bar Pata's household was passing in front of a synagogue. She saw a Scripture teacher striking a child more than necessary. She said to him: Let that man be banned. He came and asked R. Acha, who told him: You must be concerned for yourself.' (The Guggenheimer English on Sefaria has 'He said to him'. The Aramaic verb is feminine.)",
        "reasoning": "The household (Bar Pata's, not Rabbi's), the target (a teacher, not a father), the victim (a child, not a grown son) and the legal outcome all differ. So the Yerushalmi does not identify the Bavli's servant or man. It shows that the same formula can be spoken directly to its target. That supports F3, not a merge.",
        "confidence": "high",
        "graph_effect": "No coreference between the Bavli and Yerushalmi servants or targets. At most, link the two episodes as a thematic or literary parallel.",
    },
    {
        "finding_id": "F11",
        "claim": "'רבי' appears only as the head of the household. The William Davidson English names him Rabbi Yehuda HaNasi. The Aramaic does not, and no source checked puts him at the scene.",
        "kind": "interpretation",
        "evidence": [
            ev("S1", "the maidservant in Rabbi Yehuda HaNasi’s house saw a certain man"),
            ev("S1", "דאמתא דבי רבי חזיתיה"),
        ],
        "translation_by_this_dossier": None,
        "reasoning": "Reading the bare 'רבי' as Rabbi Yehuda HaNasi is the usual convention, and the translation makes it. That is an identification step, kept separate from the text. The Raavad's question (S9) about why 'Rabbi' did not release the man assumes Rabbi was a possible releaser. It does not place Rabbi in the event.",
        "confidence": "medium",
        "graph_effect": "Keep the household-affiliation link servant → Rabbi's household (the contract has no predicate for it). Identifying Rabbi as Yehuda HaNasi is a separate, provisional step. No participation claim for Rabbi.",
    },
]

alternative_readings = [
    {
        "reading_id": "AR1",
        "about": "addressee of the servant's declaration",
        "readings": [
            {"label": "base text", "text": "Addressee unstated (אמרה with no ליה). Target = father.", "sources": ["S1", "S8", "S9"]},
            {"label": "variant 'אמרה ליה'", "text": "She said it to 'him', most naturally the father, who would then be target and addressee.", "sources": ["S10", "S11"], "note": "S12 (Teshuvot Rashi) has [ליה] in editorial brackets."},
        ],
    },
    {
        "reading_id": "AR2",
        "about": "who voices 'דקעבר משום ולפני עור'",
        "readings": [
            {"label": "servant", "text": "Part of her declaration, as the William Davidson English renders it.", "sources": ["S1"]},
            {"label": "Gemara", "text": "The Gemara's explanation, with the baraita as its source.", "sources": ["S1", "S5"]},
        ],
    },
    {
        "reading_id": "AR3",
        "about": "attribution of the baraita",
        "readings": [
            {"label": "anonymous", "text": "דתניא", "sources": ["S1", "S8"]},
            {"label": "R. Yishmael", "text": "דתניא ר' ישמעאל אומר", "sources": ["S9", "S10"]},
        ],
    },
]

unresolved = [
    "No manuscript of Bavli Moed Katan 17a was checked (no manuscript database was accessed), so this dossier cannot say whether 'אמרה ליה' is an old reading or an addition made during citation.",
    "The meaning of the Daat edition's parenthesis-and-bracket markup in Ein Yaakov was not checked against that edition's introduction.",
    "The second half of the Ritva's comment (S6, item 10) about Rabbi and the Nasi is not construed with confidence.",
    "Neither the Talmud nor the commentaries checked say whether the father was present, repented, or was released. The release is the Raavad's reconstruction only.",
    "Whether the servant here is the same person as 'Rabbi's maidservant' elsewhere (e.g. Ketubot 104a, Yerushalmi Sheviit 9:1) was not decided. A shared description does not establish identity.",
]

proposed_corrections = [
    {
        "existing_claim_id": "c4",
        "change": "Replace addresses(servant, father) with a ban-declaration claim or event: speaker = servant, target = father, addressee = unknown, basis = explicit for speaker and target. Add a variant branch (Ein Yaakov, Ran) with addressee = 'him', plausibly the father.",
        "why": "The base text has no 'ליה' and refers to the target in the third person (F1). The explicit addressee appears only in secondary witnesses (F2).",
    },
    {
        "existing_claim_id": "c5",
        "change": "Change basis from explicit to interpretation. Add a reading group: servant's stated reason vs the Gemara's explanation.",
        "why": "The text does not mark where her quotation ends (F5).",
    },
    {
        "existing_claim_id": "c6",
        "change": "Keep, with voice = narrator/Gemara. Optionally add a variant attribution of the baraita to R. Yishmael (the Rosh; Ein Yaakov's uncorrected wording) as a source-variant branch.",
        "why": "F6.",
    },
    {
        "existing_claim_id": None,
        "change": "Add a reported claim: the Sages did not treat her ban lightly for three years (voice = R. Shmuel bar Nachmani, 17a:9). Also add R. Shmuel bar Nachmani citing the precedent during R. Ami's review. Change episode coverage from needs_context to resolved, because 17a:9 is what prompts מאי היא.",
        "why": "F4. The legal force is stated in the wider sugya, not in 17a:13.",
    },
    {
        "existing_claim_id": None,
        "change": "Relabel mentions m6-m10 from kind 'name' to event or statement anchors.",
        "why": "They anchor actions and statements, not names.",
    },
]

ontology_lessons = [
    "The target of a sanction and the addressee of speech are separate roles. A ban formula in the third person ('let that man be banned') gives a target. It gives an addressee only if the text says 'to him' or the target responds.",
    "Legal force belongs to a different voice and segment from the act: the act is narrated (17a:13), its binding force is asserted by a named sage (17a:9), and later codifiers generalise it. Model these as separate claims with their own voices.",
    "A reading such as 'אמרה ליה' that is found only in anthologies or citations (Ein Yaakov, Ran) is a source variant. It is not a correction of the base text, and a bracketed editorial supplement (Teshuvot Rashi) is weaker still.",
    "Structurally similar stories in the Yerushalmi (Bar Pata's maidservant) are literary parallels. Different households and targets mean no coreference.",
]

dossier = {
    "job_id": "challenge-30",
    "focal_ref": "Moed Katan 17a:13",
    "status": "researched",
    "question": "A sanction target was encoded as a speech recipient although the addressee is unknown. Identify the target, speaker, addressee, and narrated/legal force separately using wider context.",
    "scope_note": "Checked: Sefaria texts of Moed Katan 16b-17a (William Davidson and Wikisource editions); Rashi, Tosafot, Ritva, Rif, Rosh, Steinsaltz, Petach Einayim; Ein Yaakov (Daat); Yerushalmi Moed Katan 3:1 (Venice, Mechon-Mamre, Guggenheimer); Mishneh Torah with Kessef Mishneh; Beit Yosef; Shulchan Arukh; later citations (Ran, Teshuvot Rashi, Tosafot Yom Tov, Tashbetz, Seder HaDorot, Mishpetei Uziel); Sefaria exact-phrase searches. No manuscripts. Translations marked 'translation_by_this_dossier' are this dossier's own brief renderings.",
    "answer": {
        "speaker": "The maidservant of Rabbi's household (אמתא דבי רבי), unnamed.",
        "target": "'That man' (ההוא גברא), the unnamed father who was striking his grown son.",
        "addressee": "Unstated in the base text. The variant 'אמרה ליה' (Ein Yaakov, the Ran's citation) makes it 'him', most plausibly the father.",
        "narrated_force": "17a:13 narrates only the declaration and its reason. The reason may be her words or the Gemara's (unresolved).",
        "legal_force": "At 17a:9, R. Shmuel bar Nachmani reports that the Sages did not treat her ban lightly for three years. Later codifiers make striking a grown son a ground for a ban. Commentators (Raavad via the Rosh, Ritva) explain the three years. How the ban ended is not in the Talmud.",
    },
    "sources": sources,
    "findings": findings,
    "alternative_readings": alternative_readings,
    "unresolved": unresolved,
    "proposed_corrections": proposed_corrections,
    "ontology_lessons": ontology_lessons,
}

# verify every quote
bad = []
cache = {}
for f in findings:
    for e in f["evidence"]:
        sid = e["source_id"]
        if sid not in cache:
            cache[sid] = texts_of(files[sid])
        if not any(e["exact_quote"] in t for t in cache[sid]):
            bad.append((f["finding_id"], sid, e["exact_quote"][:60]))
if bad:
    for b in bad:
        print("QUOTE NOT FOUND", b)
    raise SystemExit(1)

json.dump(dossier, open(os.path.join(HERE, "dossier.json"), "w"), ensure_ascii=False, indent=2)
print("wrote dossier.json;", sum(len(f["evidence"]) for f in findings), "quotes verified")
