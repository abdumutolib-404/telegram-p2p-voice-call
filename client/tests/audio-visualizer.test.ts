import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AudioVisualizer } from '../src/components/AudioVisualizer';

let root: Root, container: HTMLDivElement;
let frame: FrameRequestCallback;
let colors: string[];
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  colors = [];
  const context = {
    fillStyle: '', globalAlpha: 1,
    setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(),
    fill: vi.fn(() => colors.push(context.fillStyle)),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('draws a static paired waveform when audio is unavailable and redraws it on resize', async () => {
  await act(async () => root.render(createElement(AudioVisualizer)));
  await act(async () => frame(100));
  expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  expect(colors.filter(color => color === '#8DE6C3')).toHaveLength(12);
  expect(colors.filter(color => color === '#FFDDCE')).toHaveLength(12);
  expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  await act(async () => window.dispatchEvent(new Event('resize')));
  expect(colors).toHaveLength(48);
  expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
});

it('samples actual levels once when reduced motion is requested', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const getByteFrequencyData = vi.fn((data: Uint8Array) => data.fill(128));
  const analyser = { frequencyBinCount: 24, getByteFrequencyData } as unknown as AnalyserNode;
  await act(async () => root.render(createElement(AudioVisualizer, { analyserNode: analyser })));
  await act(async () => frame(100));
  expect(getByteFrequencyData).toHaveBeenCalledTimes(1);
  expect(colors).toHaveLength(24);
  expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
});
