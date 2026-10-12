import React, { useEffect, useRef } from 'react';

export interface AudioVisualizerProps {
  analyserNode?: AnalyserNode | null;
  isMuted?: boolean;
  barCount?: number;
  height?: number;
  className?: string;
  barColor?: string;
  secondaryBarColor?: string;
  fitContainer?: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  analyserNode,
  isMuted = false,
  barCount = 24,
  height = 80,
  className = '',
  barColor = '#8DE6C3',
  secondaryBarColor = '#FFDDCE',
  fitContainer = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const dimensionsRef = useRef<{ width: number; height: number }>({ width: 300, height });
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const animateLevels = Boolean(analyserNode && !isMuted && !prefersReducedMotion);
    let refreshStatic: (() => void) | undefined;

    const updateDimensions = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width || 300;
      const h = rect.height || height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      dimensionsRef.current = { width: w, height: h };
      if (!animateLevels) refreshStatic?.();
    };

    updateDimensions();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateDimensions();
      });
      if (canvas.parentElement) {
        resizeObserver.observe(canvas.parentElement);
      }
      resizeObserver.observe(canvas);
    } else {
      window.addEventListener('resize', updateDimensions);
    }

    let dataArray: Uint8Array<ArrayBuffer> | null = null;
    if (analyserNode) {
      const binCount = analyserNode.frequencyBinCount;
      if (!dataArrayRef.current || dataArrayRef.current.length !== binCount) {
        dataArrayRef.current = new Uint8Array(binCount) as Uint8Array<ArrayBuffer>;
      }
      dataArray = dataArrayRef.current;
    }

    const TARGET_FPS = 30;
    const FRAME_INTERVAL = 1000 / TARGET_FPS; // ~33.33ms
    let lastFrameTime = 0;

    const renderFrame = (timestamp: number) => {
      // Pause requestAnimationFrame entirely when document is hidden to save CPU and battery
      if (document.visibilityState === 'hidden') {
        animFrameIdRef.current = null;
        return;
      }

      animFrameIdRef.current = animateLevels ? requestAnimationFrame(renderFrame) : null;

      const now = typeof timestamp === 'number' ? timestamp : performance.now();
      const delta = now - lastFrameTime;

      // Throttle canvas rendering using timestamp delta to cap at 30 FPS instead of unthrottled 60-120 FPS
      if (animateLevels && delta < FRAME_INTERVAL) {
        return;
      }

      if (lastFrameTime === 0 || delta > 1000) {
        lastFrameTime = now;
      } else {
        lastFrameTime = now - (delta % FRAME_INTERVAL);
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        const { width: displayWidth, height: displayHeight } = dimensionsRef.current;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, displayWidth, displayHeight);

        if (analyserNode && dataArray && !isMuted) {
          analyserNode.getByteFrequencyData(dataArray);

          const totalBins = dataArray.length;
          const step = Math.max(1, Math.floor(totalBins / barCount));
          const gap = 2;
          const barWidth = Math.min(3, Math.max(1, (displayWidth - gap * (barCount - 1)) / barCount));
          const offset = (displayWidth - barWidth * barCount - gap * (barCount - 1)) / 2;

          for (let i = 0; i < barCount; i++) {
            const binIndex = Math.min(i * step, totalBins - 1);
            const value = dataArray[binIndex] || 0;
            const percent = value / 255;
            const minHeight = 4;
            const barHeight = Math.max(minHeight, percent * (displayHeight - 12));

            const x = offset + i * (barWidth + gap);
            const y = (displayHeight - barHeight) / 2;

            ctx.fillStyle = i < barCount / 2 ? barColor : secondaryBarColor;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
            } else {
              ctx.rect(x, y, barWidth, barHeight);
            }
            ctx.fill();
          }
        } else {
          // Silence and unavailable audio stay still rather than simulating speech.
          const gap = 2;
          const barWidth = Math.min(3, Math.max(1, (displayWidth - gap * (barCount - 1)) / barCount));
          const offset = (displayWidth - barWidth * barCount - gap * (barCount - 1)) / 2;

          for (let i = 0; i < barCount; i++) {
            const barHeight = Math.max(4, displayHeight * .3);

            const x = offset + i * (barWidth + gap);
            const y = (displayHeight - barHeight) / 2;

            ctx.fillStyle = isMuted ? '#AAB7BC' : i < barCount / 2 ? barColor : secondaryBarColor;
            ctx.globalAlpha = isMuted ? 0.25 : 0.45;

            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
            } else {
              ctx.rect(x, y, barWidth, barHeight);
            }
            ctx.fill();
          }
          ctx.globalAlpha = 1.0;
        }
      }
    };
    refreshStatic = () => renderFrame(performance.now());

    // Pause requestAnimationFrame entirely when hidden, resume when visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (animFrameIdRef.current !== null) {
          cancelAnimationFrame(animFrameIdRef.current);
          animFrameIdRef.current = null;
        }
      } else if (document.visibilityState === 'visible') {
        if (animFrameIdRef.current === null) {
          lastFrameTime = 0;
          animFrameIdRef.current = requestAnimationFrame(renderFrame);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial start if visible
    if (document.visibilityState !== 'hidden') {
      animFrameIdRef.current = requestAnimationFrame(renderFrame);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', updateDimensions);
      }
    };
  }, [analyserNode, isMuted, barCount, height, barColor, secondaryBarColor]);

  return (
    <div className={`w-full flex items-center justify-center ${className}`} aria-hidden="true" style={{ height: fitContainer ? '100%' : `${height}px` }}>
      <canvas
        ref={canvasRef}
        className="w-full max-w-md h-full"
      />
    </div>
  );
};
