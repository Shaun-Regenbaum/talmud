"""Which texts this study reads, and which witness of each.

Everything downstream reads Hebrew and Aramaic only. No translation is used at
any point, because a translator has already resolved the ambiguities this study
is trying to measure.

A WITNESS is one edition of a text. Where Sefaria carries more than one Hebrew
witness we take them all: the same passage in two editions is the strongest
evidence there is that two spellings of a name are one name, because the
variation sits at a single location rather than across the corpus.
"""

# Sefaria version titles, per corpus. Confirmed present on 2026-09-20 via
# GET /api/texts/versions/<work>.
BAVLI_WITNESSES = [
    'William Davidson Edition - Aramaic',   # Vilna, unvocalized
    'Wikisource Talmud Bavli',              # independently keyed; different
                                            # abbreviation habits, and the
                                            # uncensored/censored readings differ
]

YERUSHALMI_WITNESSES = [
    'Venice Edition',                       # the editio princeps
    'Mechon-Mamre',
]

MIDRASH_WITNESSES = [
    'Wikisource Bereshit Rabbah',
    'Midrash Rabbah -- TE',
]

BAVLI = [
    'Berakhot', 'Shabbat', 'Eruvin', 'Pesachim', 'Rosh Hashanah', 'Yoma',
    'Sukkah', 'Beitzah', 'Taanit', 'Megillah', 'Moed Katan', 'Chagigah',
    'Yevamot', 'Ketubot', 'Nedarim', 'Nazir', 'Sotah', 'Gittin', 'Kiddushin',
    'Bava Kamma', 'Bava Metzia', 'Bava Batra', 'Sanhedrin', 'Makkot',
    'Shevuot', 'Avodah Zarah', 'Horayot', 'Zevachim', 'Menachot', 'Chullin',
    'Bekhorot', 'Arakhin', 'Temurah', 'Keritot', 'Meilah', 'Niddah',
]

# Sefaria titles them "Jerusalem Talmud <tractate>".
YERUSHALMI = [
    'Berakhot', 'Peah', 'Demai', 'Kilayim', 'Sheviit', 'Terumot', 'Maasrot',
    'Maaser Sheni', 'Challah', 'Orlah', 'Bikkurim', 'Shabbat', 'Eruvin',
    'Pesachim', 'Yoma', 'Shekalim', 'Sukkah', 'Rosh Hashanah', 'Beitzah',
    'Taanit', 'Megillah', 'Chagigah', 'Moed Katan', 'Yevamot', 'Ketubot',
    'Nedarim', 'Nazir', 'Sotah', 'Gittin', 'Kiddushin', 'Bava Kamma',
    'Bava Metzia', 'Bava Batra', 'Sanhedrin', 'Makkot', 'Shevuot',
    'Avodah Zarah', 'Horayot', 'Niddah',
]

# Aggadic midrashim name many of the same sages, and some who never appear in
# either Talmud. Halakhic midrashim are tannaitic and anchor the early end.
MIDRASH = [
    'Bereshit Rabbah', 'Shemot Rabbah', 'Vayikra Rabbah', 'Bamidbar Rabbah',
    'Devarim Rabbah', 'Eichah Rabbah', 'Esther Rabbah', 'Kohelet Rabbah',
    'Shir HaShirim Rabbah', 'Ruth Rabbah', 'Midrash Tanchuma',
    'Pesikta DeRav Kahana', 'Pirkei DeRabbi Eliezer', 'Avot DeRabbi Natan',
    'Mekhilta DeRabbi Yishmael', 'Sifra', 'Sifrei Bamidbar', 'Sifrei Devarim',
]

TOSEFTA_PREFIX = 'Tosefta '   # Lieberman edition where present, else Vilna


def bavli_refs():
    """Every amud of the Bavli, as Sefaria refs."""
    # Page extents are not uniform; the fetcher walks until Sefaria 404s
    # rather than hard-coding an end, so a wrong constant cannot silently
    # truncate a tractate.
    for t in BAVLI:
        yield t


def yerushalmi_titles():
    for t in YERUSHALMI:
        yield f'Jerusalem Talmud {t}'
