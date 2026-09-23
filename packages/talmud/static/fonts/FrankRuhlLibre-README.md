# Frank Ruhl Libre

The Gemara uses Frank Ruhl Libre. Rashi and Tosafot use Mekorot Rashi.

Source: [Google Fonts, revision a60a77e14f28abd4ef243a1b5dfc48df0cec5205](https://github.com/google/fonts/tree/a60a77e14f28abd4ef243a1b5dfc48df0cec5205/ofl/frankruhllibre).
License: SIL Open Font License 1.1, included in `FrankRuhlLibre-OFL.txt`.

`FrankRuhlLibre.woff2` contains the full variable font, weights 300–900.
It was converted from `FrankRuhlLibre[wght].ttf` using fontTools with Brotli:

```python
from fontTools.ttLib import TTFont
font = TTFont('FrankRuhlLibre[wght].ttf')
font.flavor = 'woff2'
font.save('FrankRuhlLibre.woff2')
```

The glyph outlines and font names are unchanged.
