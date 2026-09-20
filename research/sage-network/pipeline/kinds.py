"""The question asked about one marked mention, in one place.

The same wording goes to the frontier markers and to the cheap model, so a
difference between them is a difference in judgement and not in the question.
"""
KINDS = {
    'sage': 'A rabbinic figure: a tanna, an amora, or a sage named with or without a title.',
    'biblical': 'A figure from the Bible (Jacob, Samuel the prophet, the tribe or person Levi in a verse).',
    'person': 'Some other named individual who is neither a sage nor a Bible figure.',
    'group': 'A named group or school (the Sages, the House of Shammai).',
    'divine': 'A name or title of God (including short forms such as רבש"ע).',
    'term': 'Not a person: a legal term, a festival, a book, a place, or a short form of one (ר"ה as Rosh Hashanah, רה"ר as the public domain).',
    'word': 'Not a name at all here: an ordinary word (רב meaning "much" or "great", רבי meaning "my teacher", רבה meaning "many").',
}
CONVENTIONS = (
    'The texts are classical rabbinic Hebrew and Aramaic. In each passage ONE stretch is wrapped in ⟦ ⟧. '
    'Judge only that stretch, as it is used in that passage. '
    'Bare רב is usually the sage Rav, but it is also the ordinary word for "much" or "great". '
    'Bare רבי is usually Rabbi Yehuda the Prince, but can be "my teacher" addressed to someone. '
    'שמואל is usually the amora Shmuel, but in a verse or a discussion of the Bible it is the prophet. '
    'A short form beginning with ר or אר is usually a sage, but ר"ה can be Rosh Hashanah and רה"ר the public domain. '
    'A given name with no title, in a verse or a Bible story, is the Bible figure.'
)

# What the chat models are asked. The check-set markers and the second typing pass
# share it, so the second pass is the same question that was measured.
MARKER_PROMPT = (CONVENTIONS + '\n\nFor EACH item say what the wrapped stretch is. "kind" is one of:\n'
                 + '\n'.join(f'  "{k}": {v}' for k, v in KINDS.items())
                 + '\n\n"sure": false if a careful reader could reasonably disagree.'
                 + '\n"reading": ONLY for a short form, the name spelled out if you are confident, else null.'
                 + '\n\nReturn ONLY JSON: {"items":[{"id":"...","kind":"...","sure":true,"reading":null}]}')
