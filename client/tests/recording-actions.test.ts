import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ActiveCallScreen } from '../src/components/ActiveCallScreen';

const fixture = vi.hoisted(() => ({ events: new Map<string, (...args: any[]) => void>(), toggle: vi.fn(), snapshot: vi.fn() }));
vi.mock('../src/services/socket', () => ({ socketService: {
  getSocket: () => ({ on: (event: string, fn: (...args: any[]) => void) => fixture.events.set(event, fn), off: (event: string) => fixture.events.delete(event) }),
  getRecordingStatus: fixture.snapshot, toggleRecord: fixture.toggle, peerReady: vi.fn(),
} }));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); fixture.events.clear();
  fixture.toggle.mockReset();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
const render = () => act(async () => root.render(createElement(ActiveCallScreen, {
  roomName: 'fixture-room', userId: 'fixture-user', partnerAlias: 'Fixture partner', partnerBand: 7,
  callDurationLimit: 900, isMicMuted: false, onToggleMic: vi.fn(), onFinishCall: vi.fn(),
})));
const record = () => container.querySelector<HTMLButtonElement>('button[aria-label="Start recording"], button[aria-label="Stop recording"]')!;

it('keeps recording pending until the matching server acknowledgement and prevents duplicate requests', async () => {
  await render();
  await act(async () => { record().click(); record().click(); });
  expect(fixture.toggle).toHaveBeenCalledExactlyOnceWith('fixture-room', true);
  expect(record().getAttribute('aria-busy')).toBe('true'); expect(record().getAttribute('aria-pressed')).toBe('false');
  await act(async () => fixture.events.get('record_status')!({ roomName: 'other-room', record: true }));
  expect(record().disabled).toBe(true);
  await act(async () => fixture.events.get('record_status')!({ roomName: 'fixture-room', record: true }));
  expect(record().getAttribute('aria-pressed')).toBe('true'); expect(record().disabled).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it('preserves recording state when stopping fails and leaves the error beside the control', async () => {
  await render(); await act(async () => fixture.events.get('record_status')!({ roomName: 'fixture-room', record: true }));
  await act(async () => record().click());
  await act(async () => fixture.events.get('recording_error')!({ message: 'Could not stop recording. Retry.' }));
  expect(record().getAttribute('aria-pressed')).toBe('true'); expect(record().disabled).toBe(false);
  expect(container.querySelector('.call-controls-panel [role="alert"]')?.textContent).toContain('Could not stop');
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not stop');
});

it('does not invent a successful recording when no response arrives', async () => {
  await render(); await act(async () => record().click());
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(record().getAttribute('aria-pressed')).toBe('false'); expect(record().disabled).toBe(false);
  expect(container.querySelector('.call-controls-panel [role="alert"]')?.textContent).toContain('unconfirmed');
  expect(fixture.snapshot).toHaveBeenCalledTimes(2);
});

it('clears a synchronous acknowledgement deadline before it can create a false error', async () => {
  fixture.toggle.mockImplementation((roomName, record) => fixture.events.get('record_status')!({ roomName, record }));
  await render(); await act(async () => record().click());
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(container.querySelector('[role="alert"]')).toBeNull(); expect(record().getAttribute('aria-pressed')).toBe('true');
});

it('prevents duplicate microphone retries and recovers from a rejected request', async () => {
  let reject!: (error: Error) => void;
  const retry = vi.fn(() => new Promise<boolean>((_, fail) => { reject = fail; }));
  await act(async () => root.render(createElement(ActiveCallScreen, {
    roomName: 'fixture-room', userId: 'fixture-user', partnerAlias: 'Fixture partner', partnerBand: 7,
    callDurationLimit: 900, isMicMuted: true, micError: 'Permission denied', micDeniedCount: 1,
    onRetryMic: retry, onToggleMic: vi.fn(), onFinishCall: vi.fn(),
  })));
  const button = container.querySelector<HTMLButtonElement>('.call-dialog .primary-button')!;
  await act(async () => { button.click(); button.click(); });
  expect(retry).toHaveBeenCalledOnce(); expect(button.getAttribute('aria-busy')).toBe('true');
  await act(async () => reject(new Error('Fixture permission failure')));
  expect(button.disabled).toBe(false); expect(button.getAttribute('aria-busy')).toBe('false');
  expect(container.querySelector('.call-dialog [role="alert"]')?.textContent).toContain('Please retry');
});
