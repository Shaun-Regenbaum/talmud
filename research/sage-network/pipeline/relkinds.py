"""What a joining pattern between two names says.

The label is about the TEXT. The Talmud is an edited work: "A said to B" means
the editors set A and B in one scene, not that the two men met. So every kind
below is worded as what the passage states, and what may be inferred from it is
left to a later stage that weighs many passages together.

`earlier` is the only inference recorded here, and only where the wording forces
it: a man cannot pass on a teaching in the name of someone not yet heard of.
"""
RELATION_KINDS = {
    'cites': 'A passes on a teaching in the name of B (A בשם B, אמר A אמר B, A משום B, A משמיה דB). B is the source.',
    'alternative': 'One teaching is credited to A, or else to B (A ואיתימא B, A ואמרי לה B). It is about who the teaching belongs to, not about the two men.',
    'addresses': 'The passage has A speak to B, or object to B (אמר ליה A לB, איתיביה A לB, אמר לו).',
    'asks': 'The passage has A put a question to B (בעא מיניה A מB, A שאל את B, A בעא קומי B).',
    'before': 'The passage has A sit, say or teach in front of B (A קמיה דB, אמר A קומי B, יתיב A קמיה דB).',
    'disputes': 'Two opinions are set against each other (דברי A, B אומר; A אמר ... B אמר).',
    'together': 'A and B are named together on one side, or as a plain list (A וB אומרים, דברי A וB).',
    'follows': 'A rules like B, or holds like B (אמר A הלכה כB, A כB, A סבר לה כB).',
    'explains': "A explains or places B's teaching (אמר A מאי טעמא דB, זו דברי B, הא מני B היא, מודה B).",
    'kin': 'A is stated to be a relative of B (A בנו של B, A אחי B, A חתנו של B, B בריה).',
    'teacher': 'The passage states that one of them is the teacher or the student of the other (רבו של, תלמידו של, רביה ד).',
    'juxtaposed': "A and B stand side by side with NO word joining them, as the Yerushalmi does: ר' יונה ר' בא בשם ר' יוחנן. It may be a chain of tradents or a plain list. The wording does not say which.",
    'same-man': 'A and B are the SAME man named twice in one breath (דרבי אלעזר דאמר ר"א, רבא לטעמיה דאמר רבא). One of the two may be a short form of the other.',
    'one-name': 'A and B are two halves of ONE name that was cut in two by mistake (ר"ש בן | יוחי).',
    'none': 'The two names only stand near each other. The passage states nothing between them.',
}
# What a kind is used for later. Two markers can disagree on the kind and still
# agree on this, and this is what the graph is built from.
USE = {
    'cites': 'order', 'follows': 'order', 'explains': 'order',            # B is not later than A
    'addresses': 'scene', 'asks': 'scene', 'before': 'scene',             # the text puts both in one scene
    'disputes': 'side-by-side', 'together': 'side-by-side',               # named as peers in one discussion
    'kin': 'identity', 'same-man': 'identity', 'one-name': 'identity',    # says who someone is
    'teacher': 'order',                                                   # a teacher is not later than his student
    'juxtaposed': 'side-by-side',                                         # weak: chain or list, the text does not say
    'alternative': 'nothing', 'none': 'nothing',                          # no link between the two men
}
# Where the wording fixes the order: B cannot be later than A.
B_NOT_LATER = {'cites', 'follows', 'explains'}
CONVENTIONS = (
    'The texts are classical rabbinic Hebrew and Aramaic. Each item is a PATTERN: the words that stand between '
    'two names, with [A] for the first name and [B] for the second, plus real passages where it occurs. '
    'Say what the pattern states about A and B. Judge the wording, not history: "A said to B" is a scene in an '
    'edited text. A single letter glued to [A] or [B] is a prefix: ל to, מ from, ד of or that, כ like, ו and, ב in. '
    'If the passages show the pattern meaning different things, choose the commonest and answer that it is not sure.'
)

# The same question asked about one pair in its passage instead of about a pattern.
# Marking 150 patterns with two frontier models showed why this is needed: they
# agreed on only 77% of patterns, and where they split the pattern itself was
# ambiguous. ד[A] אמר [B] is the same man twice in one passage and a citation in
# the next. Only the names and the words that follow settle it.
PAIR_CONVENTIONS = (
    'The texts are classical rabbinic Hebrew and Aramaic. In each passage the first name is wrapped in ⟦ ⟧ and '
    'is called A, and the second is wrapped in ⟪ ⟫ and is called B. Say what THIS passage states about A and B. '
    'Judge the wording, not history: "A said to B" is a scene in an edited text. A letter glued in front of a '
    'name is a prefix: ל to, מ from, ד of or that, כ like, ו and, ב in. '
    '"X אמר Y" with nothing else is usually X passing on a teaching of Y. '
    'If A and B are the same man (one may be a short form of the other), answer same-man. '
    'If a sentence ends between A and B, or each of them heads his own separate statement, answer none, '
    'unless the two statements are set against each other, which is disputes. '
    '"A does not hold like B" (לא סבר לה כ) is disputes, not follows. '
    'When a passage states two things at once (A teaches his son B), the one that says who the men are wins: '
    'same-man, kin and teacher come before everything else.'
)
