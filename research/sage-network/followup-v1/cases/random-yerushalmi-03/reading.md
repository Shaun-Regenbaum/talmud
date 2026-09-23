# Jerusalem Talmud Sheviit 10:4:6: a promised gift, and Rav's own practice

Status: **researched**. Every claim below is linked to exact source words in
`dossier.json` (findings F1–F22). All graph proposals are provisional. No
historical identity is decided.

## What the passage says (own translation, abridged)

> R. Yaakov bar Zavdi, R. Abbahu in the name of R. Yohanan: one who said he
> would give a gift to another and wants to go back on it may go back on it.
> R. Yose stood with R. Yaakov bar Zavdi and said to him: "Is that a 'just no
> and just yes'?" He said: "At the time he said it, it was a just yes."
> Rav disagrees, for Rav said: "When I tell my household to give someone a
> gift, I do not go back on it." A baraita disagrees with Rav: [four
> acquisition rules]. What does Rav do with it? Here, when he stood him with
> him; there, when he did not. Rav disagrees, for Rav said [the same saying].
> Know that: a certain person deposited earnest-money for salt, and it became
> dear. He came to Rav, who said: either he gives him [goods for] all his
> earnest, or he hands him over to "He who exacted payment". Rav's view is
> reversed! There he says [the household saying], and here he says this.
> There it is the measure of law; what Rav practised is the measure of piety.

This is the last segment of the tractate. It comments on the Mishnah's clause
"whoever keeps his word, the Sages are pleased with him" (F19).

## Repeated mentions (F1, F2)

- **Rav is named 9 times** in 10:4:6. His household saying is quoted **3
  times**. It is one statement used three times in the argument, not three
  events.
- Rabbi Yaakov bar Zavdi is named twice, so the patronymic *bar Zavdi* also
  appears twice. Keep one father placeholder.
- In 10:4:5, Rabbi Zeira and Rabbi Abbahu are each named twice.

## Legal conditions the first reading lacked (F4, F5, F9, F10)

The baraita sets conditions by location:

1. In a public domain, or a courtyard belonging to neither party: the buyer acquires by drawing the goods.
2. In the buyer's domain: once the seller agreed to the sale.
3. In the seller's domain: only by lifting the goods, or drawing them out of the owner's domain.
4. At a depositary's: only when the depositary grants title, or rents the buyer the place.

The Tosefta reads clause 4 as "until he accepts upon himself" (Lieberman notes
the difference). In the salt case, Rav's options are delivery "for all his
deposit" or the מי שפרע curse. Penei Moshe and Sirilio read the first option
as goods to the value of the deposit, not the whole order. The salt case
implies a seller who is never mentioned. Add a placeholder for that seller.

## The disputed chain and dialogue (F13–F15)

The same gift teaching appears in four other Yerushalmi passages, with
differences:

| Passage | Chain | Who asks | Answer introduced by |
|---|---|---|---|
| Sheviit 10:4 | Yaakov b. Zavdi, Abbahu ← Yohanan | Yose, to Yaakov b. Zavdi | "he said" |
| Maaser Sheni 4:4 | **Yose**, Yaakov b. Zavdi, Abbahu ← Yohanan | Yose, to Yaakov b. Zavdi | "**they** said" |
| Gittin 6:1 (Venice) | Yose **and** Yaakov b. Zavdi, Abbahu ← Yohanan | Yose, to Yaakov b. Zavdi | "he said to him" |
| Shevuot 4:7 | Yose, Yaakov b. Zavdi, Abbahu ← Yohanan | **Yaakov b. Zavdi, before Abbahu** | "he said" |
| Bava Metzia 4:2 | Yaakov b. Zavdi, Abbahu ← Yohanan | none in the Venice print; Guggenheimer adds a question from the Escorial manuscript: Yaakov b. Zavdi before Abbahu | "he said" |

Only the link Abbahu → Yohanan says "in the name of" explicitly. Schwab's
French translates the juxtaposed names as "or".

For Sheviit itself, the most likely answerer is Rabbi Yaakov bar Zavdi, who
is the addressee of the objection. That is medium confidence, with an
alternative that the answer is anonymous. Nothing from Shevuot or Bava Metzia
should be imported into Sheviit.

Two later proposals are saved separately from textual variants:
- Sha'arei Torat Eretz Yisrael emends the question.
- The Beur HaGra gives Rabbi Yaakov bar Zavdi the "just yes" teaching itself.

## The final qualification of Rav (F7, F8, F11, F12, F17, F18)

- "Rav disagrees" means disagreeing with Rabbi Yohanan's gift rule (Penei Moshe).
- The "stood him with him" reply is the **anonymous Talmud answering on Rav's
  behalf**, not something Rav said. Commentators differ on who stood with whom.
- The final answer is also anonymous. The salt ruling is *law*, and Rav's
  household practice is *piety*. "There" (תמן) changes referent between the
  question (the household saying) and the answer (the salt case).
- So a Rav–Yohanan disagreement is proposed, then narrowed so that it no
  longer concerns the law.
- Elsewhere, Rav's practice is told differently:
  - In JT Bava Metzia 4:2, Rav instructs his *attendant*: give at once to a
    poor recipient, but consult him again for a rich one.
  - The Bavli (BM 49a) reverses the positions: Rav holds that verbal promises
    carry no breach of faith.
- Keep all three as separate attributed versions.

## What was not checked

- No manuscripts were read directly.
- Korban HaEdah requests returned 404. That is a failed request, not evidence
  that no commentary exists.
- Several items in the link index were not fetched (see `unresolved`).

## Files

- `dossier.json`: sources with hashes, 22 findings, 5 alternative readings,
  11 proposed corrections and ontology lessons.
- `sources/`: every fetched file, plus `fetch_log.json`.
- `fetch.py`: the fetcher. `build_dossier.py`: builds the dossier and checks
  every quote against the saved bytes.
