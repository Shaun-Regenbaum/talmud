import { type Accessor, createContext, type JSX, useContext } from 'solid-js';
import type { IdentifiedRabbi } from './dafContext';

export interface RabbiLinkContextValue {
  rabbis: Accessor<IdentifiedRabbi[]>;
  extraNames: Accessor<string[]>;
  onPushRabbi: (name: string) => void;
  /** The page on screen, so prose can use that page's glossary (names and
   *  terms whose Hebrew another paragraph on the page gives). */
  page?: Accessor<{ tractate: string; page: string }>;
}

const RabbiLinkContext = createContext<RabbiLinkContextValue | null>(null);

export function RabbiLinkProvider(props: {
  value: RabbiLinkContextValue;
  children: JSX.Element;
}): JSX.Element {
  return (
    <RabbiLinkContext.Provider value={props.value}>{props.children}</RabbiLinkContext.Provider>
  );
}

export function useRabbiLinks(): RabbiLinkContextValue | null {
  return useContext(RabbiLinkContext);
}
