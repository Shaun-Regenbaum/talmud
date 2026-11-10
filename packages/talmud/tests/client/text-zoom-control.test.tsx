// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLang } from '../../src/client/i18n';
import { TextZoomControl } from '../../src/client/TextZoomControl';
import {
  resetTextZoom,
  setTextZoom,
  TEXT_ZOOM_KEY,
  textZoom,
  zoomIn,
  zoomOut,
} from '../../src/client/textZoom';

describe('TextZoomControl', () => {
  beforeEach(() => {
    localStorage.removeItem(TEXT_ZOOM_KEY);
    resetTextZoom();
    setLang('en');
  });

  afterEach(() => {
    cleanup();
    setLang('en');
  });

  it('grows, shrinks, and resets the text size from the buttons', () => {
    const { getByRole } = render(() => <TextZoomControl />);
    const larger = getByRole('button', { name: 'Larger text' });
    const smaller = getByRole('button', { name: 'Smaller text' });
    expect(getByRole('group', { name: 'Text size' })).toBeTruthy();
    expect(getByRole('button', { name: 'Text size 100%' })).toBeTruthy();
    const reset = getByRole('button', { name: 'Reset text size' });
    expect(reset.hasAttribute('disabled')).toBe(true);

    fireEvent.click(larger);
    expect(localStorage.getItem(TEXT_ZOOM_KEY)).toBe('1.1');
    expect(textZoom()).toBe(1.1);
    expect(getByRole('button', { name: 'Text size 110%' })).toBeTruthy();
    expect(getByRole('button', { name: 'Reset text size' }).hasAttribute('disabled')).toBe(false);

    fireEvent.click(smaller);
    fireEvent.click(smaller);
    expect(textZoom()).toBe(0.9);

    fireEvent.click(getByRole('button', { name: 'Reset text size' }));
    expect(textZoom()).toBe(1);
    expect(localStorage.getItem(TEXT_ZOOM_KEY)).toBe('1');
  });

  it('remembers a level and will not step past either end', () => {
    for (let i = 0; i < 30; i++) zoomIn();
    expect(textZoom()).toBe(2);
    expect(localStorage.getItem(TEXT_ZOOM_KEY)).toBe('2');
    zoomIn();
    expect(textZoom()).toBe(2);
    for (let i = 0; i < 30; i++) zoomOut();
    expect(textZoom()).toBe(0.8);
    zoomOut();
    expect(textZoom()).toBe(0.8);
    expect(localStorage.getItem(TEXT_ZOOM_KEY)).toBe('0.8');
  });

  it('disables the ends of the range', () => {
    setTextZoom(2);
    const { getByRole } = render(() => <TextZoomControl />);
    const larger = getByRole('button', { name: 'Larger text' });
    expect(larger.hasAttribute('disabled')).toBe(true);
    fireEvent.click(larger);
    expect(textZoom()).toBe(2);

    cleanup();
    setTextZoom(0.8);
    const again = render(() => <TextZoomControl />);
    const smaller = again.getByRole('button', { name: 'Smaller text' });
    expect(smaller.hasAttribute('disabled')).toBe(true);
    fireEvent.click(smaller);
    expect(textZoom()).toBe(0.8);
  });

  it('labels the controls in Hebrew', () => {
    setLang('he');
    const { getByRole } = render(() => <TextZoomControl />);
    expect(getByRole('group', { name: 'גודל הטקסט' })).toBeTruthy();
    expect(getByRole('button', { name: 'הגדלת הטקסט' })).toBeTruthy();
    expect(getByRole('button', { name: 'הקטנת הטקסט' })).toBeTruthy();
  });
});
