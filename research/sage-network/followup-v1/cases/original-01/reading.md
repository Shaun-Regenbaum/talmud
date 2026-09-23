# Gittin 50a:5: Mar Zutra, son of Rav Nachman, in the name of Rav Nachman

Job `original-01`. Full evidence is in `dossier.json`, and every source is saved in `sources/`.
`build_dossier.py` checks every quote against the saved bytes. All graph proposals are provisional.

## What the text says

> אָמַר מָר זוּטְרָא בְּרֵיהּ דְּרַב נַחְמָן, מִשְּׁמֵיהּ דְּרַב נַחְמָן

(My translation: "Mar Zutra, son of Rav Nachman, said in the name of Rav Nachman.")

The name Rav Nachman appears twice in this sentence, in two different roles:

1. **Son of.** בריה means "his son". This is literal kinship built into the name, not "son-in-law". Keep the father as a placeholder person, even though he does not speak here.
2. **Reports in the name of.** משמיה means "in the name of". Mar Zutra passes on a ruling: a creditor collecting from orphans may take only their poorest land, even if the loan document promised the best land. This does not show that Mar Zutra heard Rav Nachman directly, met him, or studied with him.

Both texts I checked read the same way (the Davidson Aramaic and the Wikisource Bavli), but these are printed-edition texts, not manuscripts. Rif, Halakhot Gedolot, Rosh, Rashba and Meiri quote it the same way. Tosafot Rid writes "בר רב נחמן", which is an equivalent way of writing "son of". Yam shel Shelomoh's quotation leaves out "in the name of Rav Nachman", but in the same paragraph it names Rav Nachman as holding the view. It looks like a shortened quotation, not a textual variant.

## Which Mar Zutra

He is the Mar Zutra son of Rav Nachman who speaks at 49b:9. The bare "Mar Zutra" refuted at 50a:4 (תיובתא דמר זוטרא) is the same local person. Do **not** resolve that bare name to the later Mar Zutra who studied with Rav Pappa. Sefaria keeps those two as separate records.

## Is the father the same man as the quoted Rav Nachman?

This is plausible but not stated. I propose a separate same-person candidate link between the two mentions.

- **Text elsewhere.** At Sotah 10a and Sanhedrin 48b, a "Mar Zutra brei deRav Nachman" asks a "Rav Nachman" a question directly. Those two passages are one story told twice, so they count as one observation. At Bava Batra 151b the same chain, "Mar Zutra son of Rav Nachman, who said in the name of Rav Nachman", is reported before Rava. None of these passages says "his father".
- **Commentary.** Yam shel Shelomoh writes "רב נחמן ומר זוטרא בריה" ("Rav Nachman and Mar Zutra his son"), which treats the quoted Rav Nachman as the father. Ramban writes "דרביה דרבא הוא" ("he is Rava's teacher") about the quoted Rav Nachman.
- **No source I checked says there were two different men.** That reading stays logically open only because the text never says "his father".

## What needs outside biography

- **The father is Rav Nachman bar Yaakov:** this rests only on outside biography. Hebrew Wikipedia lists a Mar Zutra among his sons, without a cited source. Seder HaDorot groups passages by name but never names the father's own patronymic. Sefaria's person record has no parent link.
- **The quoted Rav Nachman is bar Yaakov:** this rests on Ramban's commentary ("Rava's teacher") plus outside biography.
- **Chronology:** Mar Zutra's appearances with Rav Yosef, Rava and Rav Safra fit this only if you first accept name-based identifications and external dates. It is a consistency check, not proof.
- **No outside biography is needed for** the son-of edge, the in-the-name-of edge, or the local merge of the Mar Zutra mentions.

## Proposed change to the old pair

Replace the single label `cites` (the first-pass model split 0.88 cites / 0.11 kin) with two edges and one candidate link:

- Mar Zutra `child_of` Rav Nachman (the father in the name, P2)
- Mar Zutra `reports_in_name_of` Rav Nachman (the quoted one, P3)
- P2 and P3: same-person candidate, not explicit in the text

## Not checked

Manuscripts and variant readings; Hyman and Albeck; the Tosafot passage said to report Rashi's view that an unqualified "Rav Nachman" means Rav Nachman bar Yitzchak; whether every "Mar Zutra brei deRav Nachman" passage is the same man.
