import { createSignal, Match, Show, Switch } from 'solid-js';
import { AboutPage } from './AboutPage';
import { AiPausedBanner } from './AiPausedBanner';
import { AlignPage } from './AlignPage';
import { ArgumentGraphPage } from './ArgumentGraphPage';
import Compare from './Compare';
import DafViewer from './DafViewer';
import { HowItWorksPage } from './HowItWorksPage';
import { McpPage } from './McpPage';
import { NotFoundPage } from './NotFoundPage';
import PretextSpike from './PretextSpike';
import { SagesPage } from './SagesPage';
import SettingsPage from './SettingsPage';
import { SourcePersonPage } from './SourcePerson';
import { SpineCoveragePage } from './SpineCoveragePage';
import { StoryReadingsPage } from './StoryReadingsPage';
import { TopBar } from './TopBar';
import { TutorialPage } from './TutorialPage';
import { UsagePage } from './UsagePage';

const KNOWN_ROUTES = new Set([
  'daf',
  'tutorial',
  'align',
  'usage',
  'compare',
  'spike',
  'sages',
  'stories',
  'settings',
  'about',
  'mcp',
  'spine',
  'howitworks',
  'argument',
]);

function currentRoute() {
  // #sages/<slug> deep-links into SagesPage; treat the prefix as the route.
  // #admin-rabbis is a legacy alias — SagesPage absorbed the operator UI, so
  // old bookmarks redirect there. #experiment / #enrichment fold into the
  // daf view since the EnrichmentPage debug surface was removed alongside
  // the legacy enrichment routes. #help is now the interactive #tutorial.
  const raw = window.location.hash.replace(/^#/, '') || 'daf';
  if (raw === 'experiment' || raw === 'enrichment') {
    window.location.hash = 'daf';
    return 'daf';
  }
  if (raw === 'admin-rabbis') {
    window.location.hash = 'sages';
    return 'sages';
  }
  if (raw === 'help') {
    window.location.hash = 'tutorial';
    return 'tutorial';
  }
  if (raw === 'network' || raw.startsWith('network/')) {
    // The ego network moved into the sage page; old links land on #sages.
    const slug = raw.startsWith('network/') ? raw.slice('network/'.length) : '';
    window.location.hash = slug ? `sages/${slug}` : 'sages';
    return 'sages';
  }
  if (raw === 'voices' || raw.startsWith('voices/')) {
    // The voice graph grew into the argument graph; old links land there.
    window.location.hash = 'argument';
    return 'argument';
  }
  if (raw === 'stories' || raw.startsWith('stories/')) return 'stories';
  if (raw.startsWith('source-person/')) return 'source-person';
  if (raw === 'sages' || raw.startsWith('sages/')) return 'sages';
  // #about/<section> deep-links into a section of the About page.
  if (raw === 'about' || raw.startsWith('about/')) return 'about';
  if (raw === 'spine' || raw.startsWith('spine/')) return 'spine';
  if (raw === 'argument' || raw.startsWith('argument/')) return 'argument';
  // Only a named page renders. Anything else is a page that does not exist, not
  // the reader with a second toolbar on top.
  return KNOWN_ROUTES.has(raw) ? raw : 'notfound';
}

export default function App() {
  const [route, setRoute] = createSignal(currentRoute());
  window.addEventListener('hashchange', () => setRoute(currentRoute()));

  return (
    <>
      {/* AI-paused notice (out of credits / cost cap) — shared across both apps;
        shows above every route, including the daf reader. */}
      <AiPausedBanner />
      {/* The daf page folds the EN/HE toggle into its own header; the floating
        bar covers the other routes. #tutorial is fully self-contained (and its
        Help button would be a no-op there), so it owns the whole viewport. */}
      <Show when={route() !== 'daf' && route() !== 'tutorial'}>
        <TopBar />
      </Show>
      <Switch fallback={<NotFoundPage />}>
        <Match when={route() === 'daf'}>
          <DafViewer />
        </Match>
        <Match when={route() === 'tutorial'}>
          <TutorialPage />
        </Match>
        <Match when={route() === 'align'}>
          <AlignPage />
        </Match>
        <Match when={route() === 'usage'}>
          <UsagePage />
        </Match>
        <Match when={route() === 'compare'}>
          <Compare />
        </Match>
        <Match when={route() === 'spike'}>
          <PretextSpike />
        </Match>
        <Match when={route() === 'stories'}>
          <StoryReadingsPage />
        </Match>
        <Match when={route() === 'source-person'}>
          <SourcePersonPage />
        </Match>
        <Match when={route() === 'sages'}>
          <SagesPage />
        </Match>
        <Match when={route() === 'settings'}>
          <SettingsPage />
        </Match>
        <Match when={route() === 'about'}>
          <AboutPage />
        </Match>
        <Match when={route() === 'mcp'}>
          <McpPage />
        </Match>
        <Match when={route() === 'spine'}>
          <SpineCoveragePage />
        </Match>
        <Match when={route() === 'howitworks'}>
          <HowItWorksPage />
        </Match>
        <Match when={route() === 'argument'}>
          <ArgumentGraphPage />
        </Match>
      </Switch>
    </>
  );
}
