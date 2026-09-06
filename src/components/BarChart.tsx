import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export function BarChart({
  xLabels,
  values,
  goalValue,
  color = '#16a34a'
}: {
  xLabels: string[];
  values: (number | null)[];
  goalValue?: number | null;
  color?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const xs = xLabels.map((_, i) => i);
    const data: uPlot.AlignedData = [xs, values];

    const isDark = document.documentElement.dataset.theme === 'dark';
    const fg = isDark ? '#e2e8f0' : '#0f172a';
    const grid = isDark ? '#1f2c40' : '#e2e8f0';

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth,
      height: 180,
      padding: [12, 8, 0, 0],
      cursor: { show: true, drag: { x: false, y: false } },
      legend: { show: false },
      scales: { x: { time: false }, y: { range: (_u, min, max) => [0, Math.max(max, goalValue ?? 0) * 1.15 || 1] } },
      axes: [
        {
          stroke: fg,
          grid: { show: false },
          values: (_u, splits) => splits.map((s) => xLabels[s] ?? ''),
          font: '11px system-ui'
        },
        { stroke: fg, grid: { stroke: grid, width: 1 }, font: '11px system-ui' }
      ],
      series: [
        {},
        {
          paths: uPlot.paths.bars!({ size: [0.6, 100] }),
          fill: color,
          stroke: color,
          width: 0
        }
      ],
      hooks: {
        draw: [
          (u) => {
            if (goalValue == null) return;
            const ctx = u.ctx;
            const y = u.valToPos(goalValue, 'y', true);
            ctx.save();
            ctx.strokeStyle = isDark ? '#f59e0b' : '#d97706';
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(u.bbox.left, y);
            ctx.lineTo(u.bbox.left + u.bbox.width, y);
            ctx.stroke();
            ctx.restore();
          }
        ]
      }
    };

    plotRef.current = new uPlot(opts, data, containerRef.current);

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && plotRef.current) {
        plotRef.current.setSize({ width: containerRef.current.clientWidth, height: 180 });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      plotRef.current?.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xLabels, values, goalValue, color]);

  return <div ref={containerRef} className="w-full" />;
}
