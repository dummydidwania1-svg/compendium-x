/**
 * Builds QuickChart.io image URLs for the weekly KPI report — GET-only,
 * no API key needed at this request volume (once a week, a handful of
 * charts). Pure functions: no network call happens here, just URL
 * construction; the recipient's email client fetches the image when
 * rendered (or shows a broken-image placeholder if images are blocked,
 * which is why every number a chart shows is also present as plain text
 * nearby in the email — see reportEmail.ts).
 *
 * Chart.js config objects, JSON-stringified and URL-encoded into
 * `https://quickchart.io/chart?c=...`, styled with the brand palette so
 * charts look native to the report rather than generic default Chart.js
 * styling.
 */

const BRAND = {
  green: '#3d5a35',
  gold: '#b08b48',
  brown: '#2c2218',
  cream: '#f4ede3',
  ivory: '#fff8f0',
  textMuted: '#78695e',
  gridLine: '#ded1c3',
}

const QUICKCHART_BASE = 'https://quickchart.io/chart'

function buildUrl(chartConfig: Record<string, unknown>, opts: { width: number; height: number }): string {
  const params = new URLSearchParams({
    c: JSON.stringify(chartConfig),
    backgroundColor: BRAND.ivory,
    width: String(opts.width),
    height: String(opts.height),
    devicePixelRatio: '2',
  })
  return `${QUICKCHART_BASE}?${params.toString()}`
}

/**
 * Trend line for a single metric across N trailing weeks (e.g. weekly
 * signups or sessions completed, oldest to newest, left to right).
 */
export function trendLineChartUrl(opts: {
  labels: string[]
  values: number[]
  label: string
  width?: number
  height?: number
}): { url: string; alt: string } {
  const config = {
    type: 'line',
    data: {
      labels: opts.labels,
      datasets: [
        {
          label: opts.label,
          data: opts.values,
          borderColor: BRAND.green,
          backgroundColor: `${BRAND.green}22`,
          fill: true,
          tension: 0.3,
          pointBackgroundColor: BRAND.green,
          pointRadius: 3,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false }, title: { display: false } },
      scales: {
        x: { grid: { color: BRAND.gridLine }, ticks: { color: BRAND.textMuted, font: { size: 10 } } },
        y: { grid: { color: BRAND.gridLine }, ticks: { color: BRAND.textMuted, font: { size: 10 } }, beginAtZero: true },
      },
    },
  }
  return {
    url: buildUrl(config, { width: opts.width ?? 520, height: opts.height ?? 220 }),
    alt: `${opts.label} trend: ${opts.labels.map((l, i) => `${l}=${opts.values[i]}`).join(', ')}`,
  }
}

/** Horizontal bar chart for a distribution (e.g. case-type mix, device breakdown). */
export function distributionBarChartUrl(opts: {
  labels: string[]
  values: number[]
  label: string
  width?: number
  height?: number
}): { url: string; alt: string } {
  const config = {
    type: 'horizontalBar',
    data: {
      labels: opts.labels,
      datasets: [
        {
          label: opts.label,
          data: opts.values,
          backgroundColor: BRAND.gold,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        xAxes: [{ gridLines: { color: BRAND.gridLine }, ticks: { fontColor: BRAND.textMuted, fontSize: 10, beginAtZero: true } }],
        yAxes: [{ gridLines: { display: false }, ticks: { fontColor: BRAND.brown, fontSize: 11 } }],
      },
    },
  }
  return {
    url: buildUrl(config, { width: opts.width ?? 520, height: opts.height ?? Math.max(160, opts.labels.length * 34) }),
    alt: `${opts.label}: ${opts.labels.map((l, i) => `${l}=${opts.values[i]}`).join(', ')}`,
  }
}

/** Grouped bar chart for a period-over-period comparison (e.g. this week vs last week). */
export function comparisonBarChartUrl(opts: {
  categoryLabels: string[]
  seriesA: { label: string; values: number[] }
  seriesB: { label: string; values: number[] }
  width?: number
  height?: number
}): { url: string; alt: string } {
  const config = {
    type: 'bar',
    data: {
      labels: opts.categoryLabels,
      datasets: [
        { label: opts.seriesA.label, data: opts.seriesA.values, backgroundColor: `${BRAND.green}99` },
        { label: opts.seriesB.label, data: opts.seriesB.values, backgroundColor: BRAND.green },
      ],
    },
    options: {
      plugins: { legend: { position: 'bottom', labels: { color: BRAND.brown, font: { size: 10 } } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: BRAND.textMuted, font: { size: 10 } } },
        y: { grid: { color: BRAND.gridLine }, ticks: { color: BRAND.textMuted, font: { size: 10 } }, beginAtZero: true },
      },
    },
  }
  return {
    url: buildUrl(config, { width: opts.width ?? 520, height: opts.height ?? 240 }),
    alt: `${opts.seriesA.label} vs ${opts.seriesB.label} by ${opts.categoryLabels.join('/')}`,
  }
}
