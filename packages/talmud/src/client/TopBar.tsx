import { Button } from '@corpus/ui/Button';
import { LangToggle } from '@corpus/ui/LangToggle';
import type { JSX } from 'solid-js';
import { lang, setLang, t } from './i18n';

export function TopBar(): JSX.Element {
  return (
    <div class="ui-page-tools">
      <Button
        title={t('tutorial.help.title')}
        onClick={() => {
          window.location.hash = 'tutorial';
        }}
      >
        {t('tutorial.help')}
      </Button>
      <LangToggle lang={lang()} onChange={setLang} />
    </div>
  );
}
