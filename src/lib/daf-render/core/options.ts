export interface DafOptions {
  contentWidth: number;
  mainWidth: number;
  padding: { vertical: number; horizontal: number };
  halfway: number;
  fontFamily: { main: string; inner: string; outer: string };
  direction: 'rtl' | 'ltr';
  fontSize: { main: number; side: number };
  lineHeight: { main: number; side: number };
}

export const defaultOptions: DafOptions = {
  contentWidth: 720,
  mainWidth: 0.48,
  padding: { vertical: 10, horizontal: 16 },
  halfway: 0.5,
  fontFamily: { main: 'Mekorot Vilna', inner: 'Mekorot Rashi', outer: 'Mekorot Rashi' },
  direction: 'rtl',
  fontSize: { main: 15, side: 10.5 },
  lineHeight: { main: 17, side: 14 },
};

export type PartialDafOptions = {
  [K in keyof DafOptions]?: DafOptions[K] extends object
    ? Partial<DafOptions[K]>
    : DafOptions[K];
};

export function resolveOptions(user?: PartialDafOptions): DafOptions {
  if (!user) return defaultOptions;
  return {
    contentWidth: user.contentWidth ?? defaultOptions.contentWidth,
    mainWidth: user.mainWidth ?? defaultOptions.mainWidth,
    padding: { ...defaultOptions.padding, ...user.padding },
    halfway: user.halfway ?? defaultOptions.halfway,
    fontFamily: { ...defaultOptions.fontFamily, ...user.fontFamily },
    direction: user.direction ?? defaultOptions.direction,
    fontSize: { ...defaultOptions.fontSize, ...user.fontSize },
    lineHeight: { ...defaultOptions.lineHeight, ...user.lineHeight },
  };
}
