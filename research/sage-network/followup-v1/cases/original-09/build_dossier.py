"""Build dossier.json from the saved sources and check every quotation before writing."""
import hashlib, json, sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parents[1]))
from validate import quote_matches, leaves, unpointed  # noqa: E402
import re

MARK = re.compile(r"[\u0591-\u05bd\u05bf-\u05c2\u05c4-\u05c5\u05c7]")


def exactify(data, quote):
    """Swap a quote typed with different vowel marks for the source's own exact characters."""
    if quote_matches(data, quote)["mode"] == "exact":
        return quote
    needle = unpointed(quote)
    for _, text in leaves(json.loads(data)):
        if text != " ".join(text.split()) or "<" in text:
            continue
        kept = [i for i, ch in enumerate(text) if not MARK.match(ch)]
        bare = "".join(text[i] for i in kept)
        start = bare.find(needle)
        if start >= 0:
            end = kept[start + len(needle) - 1] + 1
            while end < len(text) and MARK.match(text[end]):
                end += 1
            return text[kept[start]:end]
    return quote

LOG = {e["file"]: e for e in json.loads((HERE / "sources/fetch-log.json").read_text())}
DV = "William Davidson Edition - Vocalized Aramaic (Hebrew/Aramaic) with William Davidson Edition - English, Sefaria v3 API"

SOURCES = [
    ("S0", "input.json", "research/sage-network/followup-v1/cases/original-09/input.json",
     "Case input: lake snapshot 2 segment text plus earlier cross-check (read only, not modified)"),
    ("S1", "sources/bb12b-v3-he.json", None, DV),
    ("S2", "sources/bb12b-wikisource.json", None, "Wikisource Talmud Bavli (unvocalized Hebrew/Aramaic), Sefaria v3 API"),
    ("S3", "sources/bb12b-goldschmidt.json", None, "Talmud Bavli. German trans. by Lazarus Goldschmidt, 1929, Sefaria v3 API"),
    ("S4", "sources/bb12b-links.json", None,
     "Sefaria links API with_text for Bava Batra 12b:6. Records used: Steinsaltz (William Davidson Edition - Hebrew); "
     "Chidushei Agadot [Maharsha] (Vilna Edition); Rabbeinu Gershom (Vilna Edition); Ben Yehoyada (Senlake edition 2019, based on Jerusalem 1897); "
     "Benayahu on Berakhot 47b (Senlake edition 2019, based on Jerusalem 1905); Sha'arei Torat Bavel on Berakhot 47b (Jerusalem, 1961); "
     "Korban Netanel on Beitzah (Vilna Edition); Seder HaDorot (Warsaw, 1878-1882); Chakham Tzvi 135 (Debrecen, 1942)"),
    ("S5", "sources/rashi-bb12b.json", None, "Rashi on Bava Batra 12b, Vilna Edition, Sefaria v3 API"),
    ("S6", "sources/tosafot-bb12b.json", None, "Tosafot on Bava Batra 12b, Vilna Edition, Sefaria v3 API"),
    ("S7", "sources/yevamot-34b-v3.json", None, DV),
    ("S8", "sources/rashi-yevamot-34b.json", None, "Rashi on Yevamot 34b, Vilna Edition, Sefaria v3 API"),
    ("S9", "sources/tosafot-yevamot34b.json", None, "Tosafot on Yevamot 34b, Vilna Edition, Sefaria v3 API"),
    ("S10", "sources/berakhot-47b-v3.json", None, DV),
    ("S11", "sources/berakhot-56a-v3.json", None, DV),
    ("S12", "sources/rashi-berakhot-56a.json", None, "Rashi on Berakhot 56a, Vilna Edition, Sefaria v3 API"),
    ("S13", "sources/shabbat-129a-v3.json", None, DV),
    ("S14", "sources/rashi-shabbat-129a.json", None, "Rashi on Shabbat 129a, Vilna Edition, Sefaria v3 API"),
    ("S15", "sources/ketubot-85a-v3.json", None, DV),
    ("S16", "sources/berakhot-62a-v3.json", None, DV),
    ("S17", "sources/ketubot-39b-v3.json", None, DV),
    ("S18", "sources/ketubot-65a-v3.json", None, DV),
    ("S19", "sources/chagigah-5a-v3.json", None, DV),
    ("S20", "sources/chullin-44b-v3.json", None, DV),
    ("S21", "sources/chullin-44b-wikisource.json", None, "Wikisource Talmud Bavli, Sefaria v3 API"),
    ("S22", "sources/rashi-chullin-44b.json", None, "Rashi on Chullin 44b, Vilna Edition, Sefaria v3 API"),
    ("S23", "sources/eruvin-65a-v3.json", None, DV),
    ("S24", "sources/shabbat-140b-v3.json", None, DV),
    ("S25", "sources/beitzah-29b-v3.json", None, DV),
    ("S26", "sources/search-bat-rav-hisda-exact.json", None,
     "Sefaria search-wrapper, exact field, filter Talmud/Bavli, query 'בת רב חסדא' (search index result, not a text edition)"),
    ("S27", "sources/search-berateh-derav-hisda-exact.json", None,
     "Sefaria search-wrapper, exact field, filter Talmud/Bavli, query 'ברתיה דרב חסדא' (search index result)"),
    ("S28", "sources/bb12b-community.json", None, "Sefaria v3 API request for 'Sefaria Community Translation' of Bava Batra 12b (returned a no-version warning)"),
    ("S29", "sources/bb12b-versions-index.json", None, "Sefaria versions list for Bava Batra"),
]
SEARCH_ONLY_FILES = ["sources/search-bat-rav-hisda.json", "sources/search-benateh-derav-hisda-exact.json",
                     "sources/search-hatneh-derav-hisda-exact.json", "sources/search-devitehu-derava-exact.json",
                     "sources/search-devitehu-derami-bar-hama-exact.json"]

def ev(sid, quote, **extra):
    return {"source_id": sid, "exact_quote": quote, **extra}

T = "translation_by_this_dossier"

FINDINGS = [
 {"finding_id": "F1",
  "claim": "The segment names four people and implies a fifth. Named: Rav Hisda; his daughter, called only 'the daughter of Rav Hisda' and 'her father's' child; Rava; Rami bar Hama. Implied by the patronymic: Hama, Rami's father, who does not speak or act.",
  "kind": "textual",
  "evidence": [
   ev("S1", "כִּי הָא דְּבַת רַב חִסְדָּא – הֲוָה יָתְבָה בְּכַנְפֵיהּ דַּאֲבוּהָ", **{T: "Translation by this dossier: 'like that [case] of the daughter of Rav Hisda: she was sitting in the lap of her father.'"}),
   ev("S1", "הֲווֹ יָתְבִי קַמֵּיהּ רָבָא וְרָמֵי בַּר חָמָא", **{T: "Translation by this dossier: 'Rava and Rami bar Hama were sitting before him.'"}),
   ev("S2", "דבת רב חסדא הוה יתבה בכנפיה דאבוה הוו יתבי קמיה רבא ורמי בר חמא", note="Same wording in the unvocalized Wikisource text."),
  ],
  "reasoning": "The daughter has no personal name, but she sits, is addressed and answers. That makes her a person in the story. 'Her father' (דאבוה) right after 'daughter of Rav Hisda' shows literal kinship, not a title. 'bar Hama' is a patronymic, so it supports a father placeholder. It is not a speaking role.",
  "confidence": "high",
  "graph_effect": "Create local persons for this passage only: P1 Rav Hisda, P2 the daughter of Rav Hisda (unnamed, no global identity), P3 Rava, P4 Rami bar Hama, P5 Hama (placeholder parent). Edges: P2 child_of P1 (explicit, literal); P4 child_of P5 (from the name, literal reading; the parent is kept even though he plays no role)."},
 {"finding_id": "F2",
  "claim": "Seating: the daughter sits in her father's lap. Rava and Rami bar Hama sit 'before him'. The nearest masculine referent for 'him' is her father, Rav Hisda. The text states only the seating. Steinsaltz adds that he was sitting and teaching, and Rabbeinu Gershom glosses בכנפיה as 'in his bosom'.",
  "kind": "textual",
  "evidence": [
   ev("S1", "הֲווֹ יָתְבִי קַמֵּיהּ"),
   ev("S4", "בכנפיה. בחיקו:", commentary="Rabbeinu Gershom on Bava Batra 12b:14 (linked to 12b:6)", **{T: "Translation by this dossier: 'In his kanaf: in his bosom.'"}),
   ev("S4", "כאשר היה יושב ומלמד", commentary="Steinsaltz on Bava Batra 12b:6", **{T: "Translation by this dossier: 'while he was sitting and teaching.'"}),
   ev("S4", "שהיה תלמיד רב חסדא כדמוכח פ\"ק דב\"ב י\"ב ב'", commentary="Seder HaDorot 3232:1, citing Yuhasin", **{T: "Translation by this dossier: 'that he [Rami bar Hama] was a student of Rav Hisda, as is shown in the first chapter of Bava Batra 12b.'"}),
  ],
  "reasoning": "Sitting before a sage often means attending him as a student. Here, however, the text gives only the seating. The teaching setting is Steinsaltz's explanation. Seder HaDorot's article on Rami bar Hama cites this page as showing that Rami was Rav Hisda's student. That is a later inference.",
  "confidence": "high",
  "graph_effect": "P3 sits_before P1; P4 sits_before P1; P2 sits_in_lap_of P1 (reported scene). Record P3 and P4 as co-present once, as a symmetric fact of the scene. Do not add an edge where Rava sits before Rami bar Hama. Any student-of edge should be a separate interpretive branch, supported by Steinsaltz and Seder HaDorot, not the text."},
 {"finding_id": "F3",
  "claim": "The asker and the person who answers are identified only by pronouns: 'he said to her ... she said to him'. The question is 'Which of them do you want?' The word 'husband' does not appear. Davidson English and Steinsaltz name the asker as Rav Hisda and say he spoke in jest. Steinsaltz adds 'as a groom'. Goldschmidt keeps the pronoun: 'Da fragte er sie'.",
  "kind": "textual",
  "evidence": [
   ev("S1", "אֲמַר לַהּ: מַאן מִינַּיְיהוּ בָּעֵית? אֲמַרָה לֵיהּ: תַּרְוַיְיהוּ.", **{T: "Translation by this dossier: 'He said to her: Which of them do you want? She said to him: Both of them.'"}),
   ev("S4", "אמר לה רב חסדא בצחוק לבתו", commentary="Steinsaltz on Bava Batra 12b:6", **{T: "Translation by this dossier: 'Rav Hisda said to his daughter jokingly.'"}),
   ev("S4", "כחתן", commentary="Steinsaltz on Bava Batra 12b:6", **{T: "Translation by this dossier: 'as a groom.'"}),
   ev("S3", "Da fragte er sie: Wen von ihnen willst du haben? Sie erwiderte: Beide."),
  ],
  "reasoning": "'Which of them' excludes Rava and Rami bar Hama as the asker. The daughter sits in her father's lap, so reading the speaker as Rav Hisda is strong. It is still a pronoun reading. The marriage sense of 'want' comes from Rava's reply and the frame, not from a marriage word. Davidson English and Steinsaltz Hebrew come from related editorial work. They are not independent witnesses.",
  "confidence": "high",
  "graph_effect": "P1 asks P2 (pronoun resolution, strong). P2 answers P1 (pronoun resolution, strong). The answer's content is P2 choosing both P3 and P4 as prospective spouses. Its modality is 'wish or forecast within a prophecy frame', not a completed marriage. The marriage sense should be recorded as a contextual reading."},
 {"finding_id": "F4",
  "claim": "Rava's reply is 'And I [will be] last/after.' In both Hebrew/Aramaic texts checked, the segment ends there. The Davidson English and Steinsaltz Hebrew add that it happened: she married Rami bar Hama first, and Rava after Rami died. Goldschmidt's German ends with Rava's words and has no such sentence.",
  "kind": "textual",
  "evidence": [
   ev("S1", "אָמַר רָבָא: וַאֲנָא בָּתְרָא.", **{T: "Translation by this dossier: 'Rava said: And I [will be] after / last.'"}),
   ev("S2", "אמר רבא ואנא בתרא"),
   ev("S1", "And this is what happened; first she married Rami bar Ḥama, and when he died she married Rava."),
   ev("S4", "ואכן כך אירע, שנישאה קודם לרמי בר חמא, ואחרי מותו נישאה לרבא", commentary="Steinsaltz on Bava Batra 12b:6"),
   ev("S3", "Da sprach Raba: mich nachher."),
  ],
  "reasoning": "The fulfilment sentence is an editorial explanation, not a sentence of the Talmud text. The segment itself contains only a forecast or wish. It has no verb of marrying and no report of an outcome.",
  "confidence": "high",
  "graph_effect": "Do NOT create married_to edges from this segment. Record Rava's statement as a forecast by P3 about P3, P4 and P2. Its content is that P3 comes after P4. Save the Davidson/Steinsaltz fulfilment sentence as an editorial claim with its own source type."},
 {"finding_id": "F5",
  "claim": "The Gemara frames the episode as an example of Rabbi Yohanan's teaching. According to that teaching, after the Temple's destruction prophecy was given to fools and to children. 'Children – what is it?' introduces this story as the children example. So the passage presents the girl's answer as prophecy. Rava's own reply carries no genre label.",
  "kind": "interpretation",
  "evidence": [
   ev("S1", "נִיטְּלָה נְבוּאָה מִן הַנְּבִיאִים וְנִיתְּנָה לַשּׁוֹטִים וְלַתִּינוֹקוֹת", **{T: "Translation by this dossier: 'prophecy was taken from the prophets and given to fools and to children.'"}),
   ev("S1", "תִּנוֹקֹת – מַאי הִיא?"),
   ev("S9", "והיתה מצפה שתתקיים נבואתה", commentary="Tosafot on Yevamot 34b, citing Rabbeinu Tam", **{T: "Translation by this dossier: 'and she was waiting for her prophecy to be fulfilled.'"}),
  ],
  "reasoning": "The opening line ties the story to the 12b:3 statement, so the frame is explicit. Whether the frame makes the girl's answer a real forecast is a reading of the genre. Rabbeinu Tam calls her answer 'her prophecy'. Rava's line could be a forecast, a wish or a request. Commentators differ on how his words work (F9).",
  "confidence": "high",
  "graph_effect": "Tag the episode as aggadic: a story used to illustrate a teaching. Link it to Rabbi Yohanan's statement in 12b:3 as the frame. Set modality to 'prophecy frame' on P2's answer and 'forecast/wish' on P3's reply. The genre neither proves nor disproves that the meeting happened."},
 {"finding_id": "F6",
  "claim": "Yevamot 34b sets a ten-year rule beside a short exchange. First, Rabbi Yohanan's rule: a woman who waits ten years after her husband and then remarries no longer bears children. Rav Nahman limits it to a woman who did not intend to remarry. Then Rava tells 'the daughter of Rav Hisda' that the Rabbis are gossiping about her. She answers, 'My mind was on you.' The Talmud text here does not name a first husband or call her Rava's wife. Rashi supplies both: she is Rava's wife, and her first husband was Rami bar Hama, after whom she waited ten years.",
  "kind": "textual",
  "evidence": [
   ev("S7", "כׇּל שֶׁשָּׁהֲתָה אַחַר בַּעֲלָהּ עֶשֶׂר שָׁנִים וְנִשֵּׂאת — שׁוּב אֵינָהּ יוֹלֶדֶת"),
   ev("S7", "אֲמַר לֵיהּ רָבָא לְבַת רַב חִסְדָּא: קָא מְרַנְּנִי רַבָּנַן אַבָּתְרִיךָ! אֲמַרָה לֵיהּ: אֲנָא דַּעְתַּאי עֲלָךְ הֲוַאי.", **{T: "Translation by this dossier: 'Rava said to the daughter of Rav Hisda: The Rabbis are murmuring about you! She said to him: My mind was on you.'"}),
   ev("S8", "לבת רב חסדא - אשתו דרבא:", commentary="Rashi on Yevamot 34b"),
   ev("S8", "ששהית עשר שנים אחר בעליך הראשון ורמי בר חמא הוה", commentary="Rashi on Yevamot 34b", **{T: "Translation by this dossier: 'that you waited ten years after your first husband, and it was Rami bar Hama.'"}),
   ev("S7", "Indeed, it is told that already as a young girl she prophesized that she would marry Rava."),
  ],
  "reasoning": "In the Talmud text, the rule and Rav Nahman's qualifier suggest that she remarried after a long gap, and her answer points to Rava. That is a strong contextual reading of a completed marriage to Rava. The first husband's identity as Rami bar Hama comes from Rashi, not from this Talmud text. The Davidson English ties the story back to Bava Batra 12b. That is the same editorial project's cross-reference, not new evidence.",
  "confidence": "medium",
  "graph_effect": "Local person Y1 'daughter of Rav Hisda (Yevamot 34b)'. Y1 married_to Rava: a strong contextual reading of this passage. Y1 formerly married to Rami bar Hama: Rashi's reading only, with the evidence type 'commentary identification'. Y1 = P2: a provisional identity decision, supported by commentary (F7, F8), not by text."},
 {"finding_id": "F7",
  "claim": "Tosafot on Yevamot 34b, citing Rabbeinu Tam, connects the two passages. The woman there is the girl who said 'I want both' in Bava Batra 12b. She hoped her prophecy would be fulfilled. Because Rava had another wife, she was late in marrying him but still waited for him. Chakham Tzvi repeats this, saying she waited ten years for Rava although he had another wife.",
  "kind": "interpretation",
  "evidence": [
   ev("S9", "דאמרה בת רב חסדא תרווייהו קבעינא", commentary="Tosafot on Yevamot 34b"),
   ev("S9", "לפי שהיה לרבא אשה אחרת איחרה לינשא לו ואפ\"ה היתה מצפה לו", commentary="Tosafot on Yevamot 34b", **{T: "Translation by this dossier: 'because Rava had another wife, she was late in marrying him, and even so she was waiting for him.'"}),
   ev("S4", "אף שהיתה לרבא אשה אחרת", commentary="Chakham Tzvi 135:3"),
  ],
  "reasoning": "This is the explicit medieval link between the child in Bava Batra 12b and Rava's wife in Yevamot 34b. It is interpretation. Tosafot quotes her answer as 'תרווייהו קבעינא' ('I want both'), a fuller wording than the printed 'תרוייהו'. That is a later work's quotation form, not a manuscript witness. Chakham Tzvi cites Tosafot, so it is not independent.",
  "confidence": "high",
  "graph_effect": "Supports the provisional identity P2 = Y1 = Rava's wife, with evidence type 'commentary link' (Rabbeinu Tam via Tosafot). Adds a commentary claim that Rava had another wife while she waited. Save the quotation form 'תרווייהו קבעינא' as a separate evidence type (quotation in a later work), not as a text variant."},
 {"finding_id": "F8",
  "claim": "Several other Bavli passages show Rava with 'the daughter of Rav Hisda' in a marital or household setting. Ketubot 65a is the most explicit: Rava goes home and asks the daughter of Rav Hisda for intercourse, and she then drives Homa out of Mehoza. Shabbat 129a is part of Rava's own statement: the daughter of Rav Hisda immersed away from her husband, caught cold, and her bier was carried after Rava to Pumbedita. Berakhot 56a: bar Hadaya tells Rava his wife will die, and Rava forgives him for everything except the daughter of Rav Hisda. Rashi there says Rava's wife was the daughter of Rav Hisda. Ketubot 39b, Berakhot 62a, Ketubot 85a and Chagigah 5a show the same pairing in household or court settings.",
  "kind": "textual",
  "evidence": [
   ev("S18", "קָם רָבָא, עָל לְבֵיתֵיהּ תַּבְעַהּ לְבַת רַב חִסְדָּא", **{T: "Translation by this dossier: 'Rava arose, went into his house, and asked the daughter of Rav Hisda [for intercourse].'"}),
   ev("S18", "קְטַלְתְּ לִיךְ תְּלָתָא, וְאָתֵת לְמִיקְטַל אַחֲרִינָא"),
   ev("S13", "כִּי הָא דִּבְרַתֵּיה דְּרַב חִסְדָּא טְבַלָה בְּגוֹ תְּלָתִין יוֹמִין שֶׁלֹּא בִּפְנֵי בַּעְלָהּ וְאִצְטְנִיאַת, וְאַמְטְיוּהָא לְעַרְסַהּ בָּתְרֵיהּ דְּרָבָא לְפוּמְבְּדִיתָא", **{T: "Translation by this dossier: 'as with the daughter of Rav Hisda, who immersed within thirty days not in her husband's presence and caught cold, and they carried her bier after Rava to Pumbedita.'"}),
   ev("S11", "אֲמַר לֵיהּ: אִשְׁתְּךָ שָׁכְבָא"),
   ev("S11", "כּוּלְּהוּ מָחֵילְנָא לָךְ, בַּר מִבְּרַתֵּיה דְּרַב חִסְדָּא"),
   ev("S12", "בת רב חסדא היתה", commentary="Rashi on Berakhot 56a"),
   ev("S17", "רָבָא אָמַר: אֲמַרָה לִי בַּת רַב חִסְדָּא: כִּי רִיבְדָּא דְכוּסִילְתָּא"),
   ev("S16", "רָבָא, מִקַּמֵּי דַּהֲוָה רֵישָׁא, מְקַרְקְשָׁא לֵיהּ בַּת רַב חִסְדָּא אַמְגּוּזָא בְּלָקָנָא"),
   ev("S15", "אֲמַרָה לֵיהּ בַּת רַב חִסְדָּא: יָדְעָנָא בָּהּ דַּחֲשׁוּדָה אַשְּׁבוּעָה"),
   ev("S19", "שָׁאנֵי בַּת רַב חִסְדָּא, דְּקִים לֵיהּ בְּגַוַּוהּ דִּבְקִיאָה"),
  ],
  "reasoning": "Most of these passages say 'the daughter of Rav Hisda' and leave 'his wife' to context. The Davidson English adds 'his wife' in each. Ketubot 65a's conjugal act, and Shabbat 129a's 'her husband' within Rava's teaching, are the clearest text-level signs of a completed marriage. Each passage is a separate narrative occurrence. They count as later evidence about Rava's marriage, not as proof that the child of Bava Batra 12b is the same woman.",
  "confidence": "high",
  "graph_effect": "Create a local person for each passage (daughter of Rav Hisda @ Ketubot 65a, Shabbat 129a, Berakhot 56a, etc.). Each is married_to Rava locally: explicit in Ketubot 65a, strong context in the others. Offer them as a candidate cluster, 'Rava's wife, daughter of Rav Hisda'. Merging the cluster, and linking it to P2, are separate identity decisions."},
 {"finding_id": "F9",
  "claim": "In the Talmud passages checked, no text states that Rami bar Hama married a daughter of Rav Hisda. That marriage appears in commentary and reference works. Rashi on Yevamot 34b names him as the first husband. Korban Netanel says Rami was Rav Hisda's son-in-law and that his wife married Rava after he died, 'as in Bava Batra 12'. Seder HaDorot calls Rav Hisda his father-in-law and teacher. Berakhot 47b does record, as text, that Rami bar Hama died while Rava was alive: Rava explains his death.",
  "kind": "textual",
  "evidence": [
   ev("S4", "רמי בר חמא חתנותא דרב חסדא הוי ובתר דשכיב רמי בר חמא נסיבא איתתיה לרבא כדאיתא בב\"ב דף י\"ב", commentary="Korban Netanel on Beitzah 66:1"),
   ev("S4", "רב חסדא חותנו ורבו", commentary="Seder HaDorot, Tanaim and Amoraim 3232:1 (Rami bar Hama)"),
   ev("S4", "ואיתא ביבמות (ל\"ד ב') רבא נשא בת רב חסדא אחר מות בעלה רמי ב\"ח י' שנים", commentary="Seder HaDorot 650:6"),
   ev("S10", "כִּי נָח נַפְשֵׁיהּ דְּרָמֵי בַּר חָמָא, אָמַר רָבָא: לָא נָח נַפְשֵׁיהּ דְּרָמֵי בַּר חָמָא אֶלָּא דְּלָא אַזְמֵין אַרַב מְנַשְּׁיָא בַּר תַּחְלִיפָא"),
  ],
  "reasoning": "Korban Netanel gives Bava Batra 12b as its source, but that page has only a forecast (F4). Seder HaDorot reads Yevamot 34b through Rashi's gloss. So the Rami bar Hama marriage rests on one commentary tradition: the forecast, read as fulfilled, plus Rashi. Later works repeating it are not independent. Berakhot 47b supports only the fact that Rami died before Rava, which fits the tradition without stating it.",
  "confidence": "medium",
  "graph_effect": "If a Rami bar Hama married_to (daughter of Rav Hisda) edge is kept, mark its evidence type as commentary identification (Rashi on Yevamot 34b), not Talmud text. Its modality is completed. Its status is provisional. Add a separate text-level fact: Rami bar Hama died during Rava's lifetime (Berakhot 47b). Do not count Korban Netanel or Seder HaDorot as extra independent observations."},
 {"finding_id": "F10",
  "claim": "Commentators disagree about how Rava's 'I will be last' works. Maharsha says it was not a curse that Rami would die, but that Rami would divorce her and Rava would then marry her. He explains why Rava, not Rami, said 'last': Rami would avoid marrying a divorcee. Ben Yehoyada objects to that reasoning and offers alternatives, including that Rami may have been a priest. Benayahu and Sha'arei Torat Bavel read Rava's remark in Berakhot 47b as clearing himself of blame for Rami's death, a blame that arose from 'ואנא בתרא'.",
  "kind": "interpretation",
  "evidence": [
   ev("S4", "לא קללו שימות רמי בר חמא לפניו אלא שיגרשה רמי בר חמא ואח\"כ ישא אותה רבא", commentary="Chidushei Agadot (Maharsha) on Bava Batra 12b"),
   ev("S4", "וקשיא לי בדבריו", commentary="Ben Yehoyada on Bava Batra 12b"),
   ev("S4", "מפני דאפשר רמי בר חמא היה כהן", commentary="Ben Yehoyada on Bava Batra 12b"),
   ev("S4", "כדי שלא יאמרו על רבא שהוא גרם שיפטר רמי בר חמא", commentary="Benayahu on Berakhot 47b"),
   ev("S4", "נראה דרבא אמר כן לצאת ידי הבריות שהיו מרננים עליו", commentary="Sha'arei Torat Bavel on Berakhot 47b"),
   ev("S4", "וכן הוה להו שנשאה רמי בר חמא תחלה ונפטר, ואחר כך נשאה רבא", commentary="Benayahu on Berakhot 47b"),
  ],
  "reasoning": "These are later interpretations. They assume the marriages took place and debate the mechanism: death or divorce. Maharsha's divorce option shows that even commentary did not take 'last' to mean 'after Rami's death'. Ben Yehoyada's 'perhaps a priest' is a conjecture ('אפשר').",
  "confidence": "high",
  "graph_effect": "Record interpretive branches on Rava's forecast: (a) Rava after Rami's death [Steinsaltz, Davidson English, Benayahu]; (b) Rava after a divorce [Maharsha, followed by Sha'arei Torat Bavel]. Do not make Rami a priest (Ben Yehoyada's conjecture). Link Berakhot 47b to this episode only as a commentary connection."},
 {"finding_id": "F11",
  "claim": "The Talmud shows that Rav Hisda had more than one daughter. It also shows a 'daughter of Rav Hisda' married to Rabba, not Rava, in Chullin 44b. There, both Hebrew texts checked read רבה, and the Davidson English calls her 'His wife'. Eruvin 65a has an unnamed daughter speaking to her father, Rav Hisda.",
  "kind": "uncertainty",
  "evidence": [
   ev("S24", "אֲמַר לְהוּ רַב חִסְדָּא לִבְנָתֵיהּ", **{T: "Translation by this dossier: 'Rav Hisda said to his daughters.'"}),
   ev("S20", "כִּי הָא דְּרַבָּה שְׁרָא טְרֵפְתָּא וּזְבַן מִינַּהּ בִּישְׂרָא, אֲמַרָה לֵיהּ בַּת רַב חִסְדָּא: אַבָּא שָׁרֵי בּוּכְרָא"),
   ev("S21", "כי הא דרבה שרא טרפתא וזבן מינה בישרא אמרה ליה בת רב חסדא"),
   ev("S20", "His wife, the daughter of Rav Ḥisda, said to him"),
   ev("S23", "אֲמַרָה לֵיהּ בַּרְתֵּיהּ דְּרַב חִסְדָּא לְרַב חִסְדָּא"),
   ev("S4", "רב עוקבא אחיו לקח ג\"כ בת רב חסדא", commentary="Seder HaDorot 3232:1 (Rami bar Hama)", **{T: "Translation by this dossier: 'Rav Ukva his brother also took a daughter of Rav Hisda.'"}),
  ],
  "reasoning": "'Daughter of Rav Hisda' is a descriptor, not a unique name. Chullin 44b could mean a different daughter married to Rabba, or a Rabba/Rava name confusion. I did not check manuscripts, so neither reading is established. Either way, the descriptor cannot be merged across passages automatically. Seder HaDorot also claims that Rami's brother, Rav Ukva, married a daughter of Rav Hisda; I did not verify that in the Talmud.",
  "confidence": "high",
  "graph_effect": "Keep every 'daughter of Rav Hisda' mention as its own local person. Put the Chullin 44b woman in a separate candidate group (spouse: Rabba as printed), with an open Rabba/Rava variant question. Do not add her to Rava's wife cluster without variant evidence."},
 {"finding_id": "F12",
  "claim": "Seder HaDorot and Tosafot quote the Bava Batra line in their own words. Seder HaDorot also infers that Rava and Rami bar Hama were peers of similar age. Benayahu says both were young children when they sat before Rav Hisda. The Talmud text states neither age nor peer status.",
  "kind": "uncertainty",
  "evidence": [
   ev("S4", "הרי רבא ורמי ב\"ח הוו בני גילי", commentary="Seder HaDorot 650:6"),
   ev("S4", "דרבא ורמי בר חמא בעודם ילדים קטנים, הוו יתבי קמיה דרב חסדא", commentary="Benayahu on Berakhot 47b"),
   ev("S1", "הֲווֹ יָתְבִי קַמֵּיהּ רָבָא וְרָמֵי בַּר חָמָא"),
  ],
  "reasoning": "The text says only that the two men sat before Rav Hisda. Their ages are later inferences, and the two commentaries do not even agree that they were children.",
  "confidence": "high",
  "graph_effect": "No age or peer edge from the text. If kept, a 'contemporaries' relation between Rava and Rami bar Hama is a Seder HaDorot inference with its own evidence type."},
 {"finding_id": "F13",
  "claim": "A second Rami bar Hama marriage thread concerns his daughter, and it carries a reading variant. In Beitzah 29b, Rav Ashi says his wife is the daughter of Rami bar Hama. Korban Netanel finds this chronologically difficult and reports that Halakhot Gedolot reads 'Rami bar Abba' in a related line. Seder HaDorot also questions it.",
  "kind": "uncertainty",
  "evidence": [
   ev("S25", "אָמַר רַב אָשֵׁי: הָא דִּידַן, בְּרַתֵּיה דְּרָמֵי בַּר חָמָא"),
   ev("S4", "ומצאתי נוסחא אמתית בהלכות גדולות רמי בר אבא דהוי שכיח קמי' דרב פפי", commentary="Korban Netanel on Beitzah 66:1"),
  ],
  "reasoning": "This does not bear directly on Rav Hisda's daughter. The printed text does not say who the mother of Rami's daughter was. It is recorded because Korban Netanel's chronology assumes that Rami's widow married Rava, and because it shows a name variant that bears on Rami bar Hama's marriages.",
  "confidence": "medium",
  "graph_effect": "Out of scope for this passage's graph. If added elsewhere: Rav Ashi married_to (daughter of Rami bar Hama) is explicit in the printed Beitzah 29b. The Halakhot Gedolot 'Rami bar Abba' reading should be saved as a variant reported in a later work, not verified here. Do not infer who her mother was."},
 {"finding_id": "F14",
  "claim": "The lake pair for this segment joins 'רבא' to a bare 'חמא', which cuts 'רמי בר חמא' short. Its first-pass kind was 'before', meaning Rava sits before Hama. The text instead places Rava and Rami bar Hama side by side, both before Rav Hisda.",
  "kind": "textual",
  "evidence": [
   ev("S0", "קמיה [A] ורמי בר [B]"),
   ev("S1", "הֲווֹ יָתְבִי קַמֵּיהּ רָבָא וְרָמֵי בַּר חָמָא"),
  ],
  "reasoning": "The pattern shows B filled by the patronymic's last word. 'קמיה' governs both men and refers back to her father.",
  "confidence": "high",
  "graph_effect": "Change the pair from (Rava, Hama) to (Rava, Rami bar Hama), kind together (co-present, symmetric, saved once). Add Rava sits_before Rav Hisda and Rami bar Hama sits_before Rav Hisda. Hama stays only as Rami's placeholder father."},
]

ALTERNATIVES = [
 {"id": "A1", "about": "Who asks 'Which of them do you want?'",
  "readings": ["Rav Hisda, her father (Davidson English, Steinsaltz; strong from the lap scene and 'of them')",
               "Unspecified 'he' (Goldschmidt keeps the pronoun). No other candidate fits, because Rava and Rami are 'them'."],
  "status": "Keep the pronoun resolution labeled as such; treat it as strong."},
 {"id": "A2", "about": "What 'ואנא בתרא' is",
  "readings": ["A forecast that comes true: Rava after Rami's death (Steinsaltz, Davidson English, Benayahu)",
               "A forecast of a divorce, not a death (Maharsha, followed by Sha'arei Torat Bavel)",
               "Taken alone in the text: a wish, request or jest, whose outcome the segment does not report"],
  "status": "Unresolved in the text; commentary branches preserved separately."},
 {"id": "A3", "about": "Meaning of בתרא",
  "readings": ["'last' (Davidson English: 'And I will be last')", "'after(wards)' (Goldschmidt: 'mich nachher'; Steinsaltz: 'האחרון')"],
  "status": "Both give the same order; neither implies a completed event."},
 {"id": "A4", "about": "Whose words are the prophecy",
  "readings": ["The girl's answer 'both' (the Gemara's frame; Rabbeinu Tam calls it 'her prophecy')",
               "The girl's answer together with Rava's completion of the order (commentary reads them together)"],
  "status": "The frame applies to children, so the girl's answer is the direct example."},
 {"id": "A5", "about": "Is the child of Bava Batra 12b the same woman as Rava's wife elsewhere?",
  "readings": ["Same woman (Rabbeinu Tam in Tosafot on Yevamot 34b; Rashi on Yevamot 34b implicitly; Seder HaDorot; Davidson English cross-reference)",
               "Not established: Rav Hisda had several daughters (Shabbat 140b), and one is married to 'Rabba' in the printed Chullin 44b"],
  "status": "Provisional identity. Commentary supports the link; the text does not state it."},
 {"id": "A6", "about": "First husband",
  "readings": ["Rami bar Hama (Rashi on Yevamot 34b; Korban Netanel; Seder HaDorot; Davidson/Steinsaltz on Bava Batra 12b)",
               "Unnamed in the Talmud text of Yevamot 34b; the only Talmud-text support is the forecast in Bava Batra 12b"],
  "status": "A commentary-only completed marriage."},
]

UNRESOLVED = [
 "No manuscript or print variants were checked for Bava Batra 12b:6 or Chullin 44b:8 (Rabba/Rava). The two Hebrew/Aramaic texts checked (Davidson vocalized, Wikisource) agree for 12b:6, but they are not independent manuscript witnesses.",
 "Rashi on Bava Batra 12b (Vilna, via Sefaria) returned an empty list for segment 6, as did Tosafot on Bava Batra 12b. This shows only that the digitized data has no gloss at that segment. It does not show that no commentary exists. Rashbam's commentary on Bava Batra, which begins later in the tractate, was not checked for this page.",
 "The corpus search used exact phrases, and it misses forms with prefixes such as דבת, לבת, מברתיה and דברתיה. Yevamot 34b, Berakhot 56a and Shabbat 129a were found through commentary links and remembered cross-references, not the search. Other passages about Rava's wife, or about Rami bar Hama as Rav Hisda's son-in-law, may exist. Searches for בנתיה דרב חסדא, חתניה דרב חסדא, דביתהו דרבא and דביתהו דרמי בר חמא returned no hits in the exact field. That does not mean the phrases are absent.",
 "The Jerusalem Talmud and midrashic parallels were not checked.",
 "The order and number of Rava's marriages were not settled. Berakhot 56a has 'you will divorce two women' and 'your wife will die'. Tosafot says Rava had another wife while she waited. Shabbat 129a and Berakhot 56a both concern the death of 'the daughter of Rav Hisda'. Whether they describe one death was not assessed.",
 "Seder HaDorot's claim that Rav Ukva, Rami bar Hama's brother, also married a daughter of Rav Hisda was not traced to a Talmud source.",
 "The request for a Sefaria Community Translation of Bava Batra 12b returned a no-version warning, although that title appears in the tractate's versions list. That translation was therefore not read for 12b.",
 "No historical identity, date or chronology is accepted here.",
]

CORRECTIONS = [
 {"existing_claim_id": "bavli|Bava Batra|12b|6|68|80",
  "change": "Replace participant B 'חמא' with 'רמי בר חמא'. Keep kind 'together' as symmetric co-presence and reject the first-pass 'before' between them. Add Rava sits_before Rav Hisda and Rami bar Hama sits_before Rav Hisda.",
  "why": "The pattern cut the patronymic short. קמיה refers to 'her father', Rav Hisda (F2, F14)."},
 {"existing_claim_id": "bava_batra (earlier cross-check): 'The daughter mention child_of Rav Hisda'",
  "change": "Keep it and make it a local person P2 with no global identity. Add P4 Rami bar Hama child_of P5 Hama as a placeholder parent from the patronymic.",
  "why": "She acts and speaks, and 'דאבוה' confirms literal kinship. The project rule keeps parents named in patronymics (F1)."},
 {"existing_claim_id": "bava_batra (earlier cross-check): Rava states_future_order",
  "change": "Keep it, and store the Davidson English/Steinsaltz fulfilment sentence as an editorial claim with source type 'modern explanation'. Add commentary branches (death vs divorce) as separate interpretation claims.",
  "why": "The Hebrew ends at 'ואנא בתרא'. Goldschmidt adds no fulfilment sentence. Maharsha reads divorce, not death (F4, F10)."},
 {"existing_claim_id": None,
  "change": "Add cross-passage local persons for 'daughter of Rav Hisda' in Yevamot 34b, Ketubot 65a, Shabbat 129a, Berakhot 56a, Ketubot 39b, Berakhot 62a, Ketubot 85a and Chagigah 5a, each married_to Rava locally. Offer them as one candidate cluster. Keep Chullin 44b (Rabba) and Eruvin 65a apart. Record a Rami bar Hama marriage only as a commentary identification (Rashi on Yevamot 34b).",
  "why": "These are later, separate passages. The identity link to the child is supported by commentary (Rabbeinu Tam), not by the text (F6-F9, F11)."},
]

LESSONS = [
 "Relations need modality. 'Chooses as a prospective spouse' and 'forecasts marrying after X' are different edges from married_to. A later completed marriage must be a separate edge with its own evidence.",
 "Explanatory sentences in translations, such as 'And this is what happened...', are editorial claims. They are not text. Davidson English and Steinsaltz Hebrew share an editorial lineage and count as one source family.",
 "'Daughter of X' is a role descriptor. Each mention should be its own local person. Joining them into one woman is an identity decision made on sourced evidence, especially when the text shows X had several daughters.",
 "Later works that cite a forecast passage as their source for a completed marriage are circular (Korban Netanel citing Bava Batra 12). They add no independent observation.",
 "A commentary's identification (Rashi: 'the first husband was Rami bar Hama') needs its own evidence type, distinct from Talmud text and from a modern translation.",
 "A later work's quotation form (Tosafot: 'תרווייהו קבעינא') is not a manuscript variant. A reported reading in another work (Halakhot Gedolot 'Rami bar Abba') is a variant claim that still needs checking.",
 "An aggadic frame (prophecy given to children) is episode metadata. It neither confirms nor denies the scene.",
]

def main():
    sources = []
    raw = {}
    for sid, rel, url, edition in SOURCES:
        data = (HERE / rel).read_bytes()
        raw[sid] = data
        name = Path(rel).name
        entry = LOG.get(name)
        src = {"source_id": sid, "edition": edition, "saved_file": rel, "sha256": hashlib.sha256(data).hexdigest()}
        if entry:
            assert entry["sha256"] == src["sha256"], rel
            src["url"] = entry["url"]
            src["fetched_at"] = entry["fetched_at"]
            if "post_body" in entry:
                src["post_body"] = entry["post_body"]
        else:
            src["url_or_input_path"] = url
            src["fetched_at"] = None
            src["note"] = "Not fetched; case input read from disk and left unchanged."
        sources.append(src)
    for f in FINDINGS:
        for n, e in enumerate(f["evidence"]):
            e["exact_quote"] = exactify(raw[e["source_id"]], e["exact_quote"])
            m = quote_matches(raw[e["source_id"]], e["exact_quote"])
            if m["mode"] == "not_found":
                raise SystemExit(f"quote not found {f['finding_id']}/{n}: {e['exact_quote']}")
    search_records = [{"saved_file": rel, "sha256": hashlib.sha256((HERE / rel).read_bytes()).hexdigest(),
                       "url": LOG[Path(rel).name]["url"], "post_body": LOG[Path(rel).name].get("post_body"),
                       "fetched_at": LOG[Path(rel).name]["fetched_at"]}
                      for rel in SEARCH_ONLY_FILES]
    dossier = {
        "job_id": "original-09",
        "focal_ref": "Bava Batra 12b:6",
        "status": "researched",
        "question": "Give Rav Hisda's unnamed daughter her own local person. Recover who sits where, who asks and answers, the prophecy or wish about marriages, and what wider passages say about actual marriages. Distinguish narrative forecasts from completed marriages; link biographies only as independent later evidence.",
        "scope_note": "Checked: Bava Batra 12b:3-7 in two Hebrew/Aramaic texts and two translations; commentary linked to 12b:6 by Sefaria; Rashi and Tosafot on the page; Yevamot 34b with Rashi and Tosafot; Berakhot 47b, 56a (with Rashi) and 62a; Shabbat 129a (with Rashi) and 140b; Ketubot 39b, 65a and 85a; Chagigah 5a; Chullin 44b (with Rashi and a second text); Eruvin 65a; Beitzah 29b. Exact-phrase searches only. No manuscripts.",
        "sources": sources,
        "search_only_records": search_records,
        "local_persons": [
            {"id": "P1", "label": "Rav Hisda", "basis": "named; 'her father'", "global_identity": "not decided here"},
            {"id": "P2", "label": "daughter of Rav Hisda (Bava Batra 12b:6)", "basis": "descriptor 'בת רב חסדא'; sits, is addressed, answers", "personal_name": None, "global_identity": "not decided; candidate link to Rava's wife is commentary-supported (F7)"},
            {"id": "P3", "label": "Rava", "basis": "named; speaks", "global_identity": "not decided here"},
            {"id": "P4", "label": "Rami bar Hama", "basis": "named; sits", "global_identity": "not decided here"},
            {"id": "P5", "label": "Hama, father of Rami", "basis": "patronymic 'בר חמא' only; placeholder parent", "global_identity": "not decided"},
        ],
        "proposed_local_edges": [
            {"s": "P2", "rel": "child_of", "o": "P1", "status": "explicit; literal (דאבוה)", "findings": ["F1"]},
            {"s": "P4", "rel": "child_of", "o": "P5", "status": "from patronymic; literal reading", "findings": ["F1"]},
            {"s": "P2", "rel": "sits_in_lap_of", "o": "P1", "status": "reported scene", "findings": ["F2"]},
            {"s": "P3", "rel": "sits_before", "o": "P1", "status": "reported scene", "findings": ["F2"]},
            {"s": "P4", "rel": "sits_before", "o": "P1", "status": "reported scene", "findings": ["F2"]},
            {"s": "P3", "rel": "together", "o": "P4", "status": "symmetric co-presence; saved once", "findings": ["F2", "F14"]},
            {"s": "P1", "rel": "asks", "o": "P2", "status": "pronoun resolution, strong", "findings": ["F3"]},
            {"s": "P2", "rel": "answers", "o": "P1", "status": "pronoun resolution, strong", "findings": ["F3"]},
            {"s": "P2", "rel": "wishes_or_foretells_marrying", "o": ["P3", "P4"], "modality": "prophecy frame; not completed", "findings": ["F3", "F5"]},
            {"s": "P3", "rel": "forecasts_order_as_later_spouse_after", "o": "P4", "about": "P2", "modality": "forecast/wish; not completed", "findings": ["F4", "F10"]},
        ],
        "later_evidence_not_merged": [
            {"claim": "Rava married_to a 'daughter of Rav Hisda'", "evidence_type": "Talmud text, separate passages", "strength": "explicit in Ketubot 65a; strong context in Yevamot 34b, Shabbat 129a, Berakhot 56a and others", "findings": ["F6", "F8"]},
            {"claim": "That woman = P2", "evidence_type": "commentary link (Rabbeinu Tam in Tosafot on Yevamot 34b)", "strength": "provisional", "findings": ["F7", "F11"]},
            {"claim": "Rami bar Hama married_to a 'daughter of Rav Hisda', before Rava", "evidence_type": "commentary identification (Rashi on Yevamot 34b); repeated by Korban Netanel and Seder HaDorot, which are not independent", "strength": "provisional", "findings": ["F9"]},
            {"claim": "Rami bar Hama died in Rava's lifetime", "evidence_type": "Talmud text (Berakhot 47b)", "strength": "explicit", "findings": ["F9"]},
        ],
        "findings": FINDINGS,
        "alternative_readings": ALTERNATIVES,
        "unresolved": UNRESOLVED,
        "proposed_corrections": CORRECTIONS,
        "ontology_lessons": LESSONS,
        "graph_status": "All proposals are provisional and local. None is eligible for a historical person merge without a separate reviewed identity decision.",
    }
    (HERE / "dossier.json").write_text(json.dumps(dossier, ensure_ascii=False, indent=1) + "\n")
    print("wrote dossier.json", len(sources), "sources", len(FINDINGS), "findings")

if __name__ == "__main__":
    main()
