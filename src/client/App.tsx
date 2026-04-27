import { createSignal, Show } from 'solid-js';
import PretextSpike from './PretextSpike';
import Compare from './Compare';
import DafViewer from './DafViewer';
import { UsagePage } from './UsagePage';
import { AlignPage } from './AlignPage';
import EnrichmentPage from './EnrichmentPage';
import { SagesPage } from './SagesPage';

function currentRoute() {
  // /experiment redirects to /enrichment (entity-contract playground retired
  // 2026-04-27 in favor of the consolidated EnrichmentPage). Update the hash
  // so the URL reflects the canonical route.
  // #sages/<slug> deep-links into SagesPage; treat the prefix as the route.
  // #admin-rabbis is a legacy alias — SagesPage absorbed the operator UI on
  // 2026-04-27, so old bookmarks redirect there.
  const raw = window.location.hash.replace(/^#/, '') || 'daf';
  if (raw === 'experiment') {
    window.location.hash = 'enrichment';
    return 'enrichment';
  }
  if (raw === 'admin-rabbis') {
    window.location.hash = 'sages';
    return 'sages';
  }
  if (raw === 'sages' || raw.startsWith('sages/')) return 'sages';
  return raw;
}

export default function App() {
  const [route, setRoute] = createSignal(currentRoute());
  window.addEventListener('hashchange', () => setRoute(currentRoute()));

  return (
    <Show when={route() === 'align'} fallback={
      <Show when={route() === 'usage'} fallback={
        <Show when={route() === 'compare'} fallback={
          <Show when={route() === 'spike'} fallback={
            <Show when={route() === 'sages'} fallback={
              <Show when={route() === 'enrichment'} fallback={<DafViewer />}>
                <EnrichmentPage />
              </Show>
            }>
              <SagesPage />
            </Show>
          }>
            <PretextSpike />
          </Show>
        }>
          <Compare />
        </Show>
      }>
        <UsagePage />
      </Show>
    }>
      <AlignPage />
    </Show>
  );
}
