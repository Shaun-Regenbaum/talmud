import { createSignal, Show } from 'solid-js';
import PretextSpike from './PretextSpike';
import Compare from './Compare';
import DafViewer from './DafViewer';
import { UsagePage } from './UsagePage';
import { AlignPage } from './AlignPage';
import EnrichmentPage from './EnrichmentPage';

function currentRoute() {
  return window.location.hash.replace(/^#/, '') || 'daf';
}

export default function App() {
  const [route, setRoute] = createSignal(currentRoute());
  window.addEventListener('hashchange', () => setRoute(currentRoute()));

  return (
    <Show when={route() === 'align'} fallback={
      <Show when={route() === 'usage'} fallback={
        <Show when={route() === 'compare'} fallback={
          <Show when={route() === 'spike'} fallback={
            <Show when={route() === 'enrichment'} fallback={<DafViewer />}>
              <EnrichmentPage />
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
