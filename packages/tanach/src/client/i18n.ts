const messages = {
  more: { en: 'More', he: 'עוד' },
  title: { en: 'Tanach', he: 'תנ״ך' },
  book: { en: 'Book', he: 'ספר' },
  navigation: { en: 'Chapter navigation', he: 'ניווט בפרקים' },
  previous: { en: 'Previous chapter', he: 'הפרק הקודם' },
  next: { en: 'Next chapter', he: 'הפרק הבא' },
  chapter: { en: 'Chapter', he: 'פרק' },
  usage: { en: 'Usage', he: 'שימוש' },
  connect: { en: 'Connect', he: 'חיבור' },
  align: { en: 'Alignment', he: 'התאמה' },
  inspect: { en: 'Inspect', he: 'בדיקה' },
  nikud: { en: 'Vowel marks', he: 'ניקוד' },
  weekly: { en: "This week's reading", he: 'קריאת השבוע' },
} as const;

export function t(key: keyof typeof messages, lang: 'en' | 'he'): string {
  return messages[key][lang];
}
