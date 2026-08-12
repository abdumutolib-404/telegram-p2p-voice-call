import React, { useEffect, useRef } from 'react';

export interface AudioVisualizerProps {
  analyserNode?: AnalyserNode | null;
  isMuted?: boolean;
  barCount?: number;
  height?: number;
  className?: string;
  barColor?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  analyserNode,
  isMuted = false,
  barCount = 24,
  height = 80,
  className = '',
  barColor = '#6366f1',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const dimensionsRef = useRef<{ width: number; height: number }>({ width: 300, height });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateDimensions = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width || 300;
      const h = height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      dimensionsRef.current = { width: w, height: h };
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

    const dataArray = analyserNode
      ? new Uint8Array(analyserNode.frequencyBinCount)
      : null;

    let phase = 0;

    const renderFrame = () => {
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
          const gap = 3;
          const barWidth = Math.max(2, (displayWidth - gap * (barCount - 1)) / barCount);

          for (let i = 0; i < barCount; i++) {
            const binIndex = Math.min(i * step, totalBins - 1);
            const value = dataArray[binIndex] || 0;
            const percent = value / 255;
            const minHeight = 4;
            const barHeight = Math.max(minHeight, percent * (displayHeight - 12));

            const x = i * (barWidth + gap);
            const y = (displayHeight - barHeight) / 2;

            ctx.fillStyle = barColor;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
            } else {
              ctx.rect(x, y, barWidth, barHeight);
            }
            ctx.fill();
          }
        } else {
          phase += 0.05;
          const gap = 3;
          const barWidth = Math.max(2, (displayWidth - gap * (barCount - 1)) / barCount);

          for (let i = 0; i < barCount; i++) {
            const sineVal = Math.sin(phase + i * 0.3);
            const normalized = (sineVal + 1) / 2;
            const barHeight = 4 + normalized * 16;

            const x = i * (barWidth + gap);
            const y = (displayHeight - barHeight) / 2;

            ctx.fillStyle = isMuted ? '#64748b' : '#818cf8';
            ctx.globalAlpha = isMuted ? 0.3 : 0.5;

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

      animFrameIdRef.current = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
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
  }, [analyserNode, isMuted, barCount, height, barColor]);

  return (
    <div className={`w-full flex items-center justify-center ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full max-w-md h-[80px]"
        style={{ height: `${height}px` }}
      />
    </div>
  );
};
