import { describe, expect, it } from 'vitest';
import {
  clampTextZoom,
  pageScaleFrame,
  parseTextZoom,
  readingScale,
  TEXT_ZOOM_DEFAULT,
  TEXT_ZOOM_MAX,
  TEXT_ZOOM_MIN,
  textZoomKeyAction,
} from '../../src/client/textZoom';

describe('text zoom levels', () => {
  it('clamps to the desktop range and snaps to tenths', () => {
    expect(clampTextZoom(Number.NaN)).toBe(TEXT_ZOOM_DEFAULT);
    expect(clampTextZoom(0.1)).toBe(TEXT_ZOOM_MIN);
    expect(clampTextZoom(4)).toBe(TEXT_ZOOM_MAX);
    expect(clampTextZoom(1.14)).toBe(1.1);
    expect(clampTextZoom(1.16)).toBe(1.2);
  });

  it('parses a stored level and ignores garbage', () => {
    expect(parseTextZoom(null)).toBe(1);
    expect(parseTextZoom('')).toBe(1);
    expect(parseTextZoom('nope')).toBe(1);
    expect(parseTextZoom('1.5')).toBe(1.5);
    expect(parseTextZoom('9')).toBe(TEXT_ZOOM_MAX);
  });
});

describe('text zoom keys', () => {
  const key = (
    k: string,
    mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {},
  ) => textZoomKeyAction({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

  it('maps plus, minus, and zero, including the unshifted plus key', () => {
    expect(key('+')).toBe('in');
    expect(key('=')).toBe('in');
    expect(key('Add')).toBe('in');
    expect(key('-')).toBe('out');
    expect(key('_')).toBe('out');
    expect(key('Subtract')).toBe('out');
    expect(key('0')).toBe('reset');
    expect(key('ArrowRight')).toBeNull();
    expect(key(')')).toBeNull();
  });

  it('leaves ctrl/cmd + plus to the browser', () => {
    expect(key('+', { ctrlKey: true })).toBeNull();
    expect(key('=', { metaKey: true })).toBeNull();
    expect(key('-', { altKey: true })).toBeNull();
    expect(key('0', { ctrlKey: true })).toBeNull();
  });
});

describe('reading scale', () => {
  it('keeps the mobile fit scale and ignores the saved text size', () => {
    expect(readingScale(true, 0.42, 1.6)).toBe(0.42);
  });

  it('uses the saved text size on desktop', () => {
    expect(readingScale(false, 1, 1.6)).toBe(1.6);
  });

  it('leaves the default desktop frame untransformed', () => {
    expect(pageScaleFrame(1, 520, 900)).toEqual({
      wrap: {},
      inner: { position: 'relative' },
    });
  });

  it('scales the finished page without changing its layout width', () => {
    expect(pageScaleFrame(1.5, 520, 800)).toEqual({
      wrap: { width: '780px', height: '1200px' },
      inner: {
        position: 'relative',
        width: '520px',
        transform: 'scale(1.5)',
        'transform-origin': 'top left',
      },
    });
  });

  it('matches the mobile fit-to-width frame, including an unknown height', () => {
    expect(pageScaleFrame(0.5, 520, 0)).toEqual({
      wrap: { width: '260px', height: undefined },
      inner: {
        position: 'relative',
        width: '520px',
        transform: 'scale(0.5)',
        'transform-origin': 'top left',
      },
    });
  });
});
