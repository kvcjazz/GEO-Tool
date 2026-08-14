"use client";

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
);

// COPTS — ported verbatim from the prototype. Typed loosely so the same object
// can be handed to both Bar and Line (cast at each call site).
export const COPTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { beginAtZero: true, max: 100, grid: { color: "#eef1f7" } },
    x: { grid: { display: false } },
  },
};

export const BAR_OPTS = COPTS as ChartOptions<"bar">;
export const LINE_OPTS = COPTS as ChartOptions<"line">;

export function barOpts(extra: Record<string, unknown>): ChartOptions<"bar"> {
  return { ...COPTS, ...extra } as ChartOptions<"bar">;
}

export { Bar, Line } from "react-chartjs-2";
