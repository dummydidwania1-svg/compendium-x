/**
 * Weekly KPI report email template — matches the Case CompendiumX brand
 * system used in emails.ts (masthead, green accent stripe, Georgia serif
 * headings, cream/ivory background, table-based/inline-style layout for
 * email-client compatibility). New file rather than appended to the
 * already-473-line emails.ts, since this template is structurally a
 * different kind of document (multi-section report vs. single-CTA
 * transactional email).
 *
 * Pure function: buildWeeklyReportEmailHtml(metrics, meta) takes no I/O,
 * independently testable against a hand-built fixture.
 */
import { escapeHtml } from './emails.js'
import type { FullReportMetrics, WindowMetrics } from './reportMetrics.js'
import { comparisonBarChartUrl, distributionBarChartUrl, trendLineChartUrl } from './quickchart.js'

const COLOR = {
  green: '#3d5a35',
  gold: '#b08b48',
  brown: '#2c2218',
  cream: '#f4ede3',
  ivory: '#fff8f0',
  border: '#ded1c3',
  borderLight: '#e4d9ce',
  text: '#3b2f2f',
  textMuted: '#65564c',
  textFaint: '#89786c',
}

export interface ReportRunMeta {
  isoWeekKey: string
  weekWindowLabel: string // e.g. "Jul 27 – Aug 1, 2026"
  monthLabel: string // e.g. "August 2026"
  yearLabel: string // e.g. "2026"
  triggeredBy: 'schedule' | 'manual-test'
  isTest: boolean
  priorWeek?: WindowMetrics // for WoW comparison, undefined if no history yet
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US')
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return 'N/A'
  return `${(n * 100).toFixed(1)}%`
}

function deltaBadge(current: number, prior: number | null | undefined): string {
  if (prior == null) return `<span style="font-family:Arial,sans-serif;font-size:11px;color:${COLOR.textFaint};">insufficient history</span>`
  if (prior === 0 && current === 0) return `<span style="font-family:Arial,sans-serif;font-size:11px;color:${COLOR.textFaint};">flat</span>`
  const pct = prior === 0 ? 100 : ((current - prior) / prior) * 100
  const up = pct >= 0
  const color = up ? COLOR.green : '#a13a2f'
  const glyph = up ? '&#9650;' : '&#9660;'
  return `<span style="font-family:Arial,sans-serif;font-size:12px;font-weight:bold;color:${color};">${glyph} ${Math.abs(pct).toFixed(1)}%</span>`
}

function kpiTile(label: string, value: string, deltaHtml?: string): string {
  return `
    <td valign="top" style="width:25%;padding:14px 12px;background-color:${COLOR.ivory};border:1px solid ${COLOR.borderLight};">
      <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:9px;line-height:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${COLOR.textFaint};">${escapeHtml(label)}</p>
      <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:30px;color:${COLOR.brown};">${value}</p>
      ${deltaHtml ? `<p style="margin:4px 0 0;">${deltaHtml}</p>` : ''}
    </td>`
}

function sectionHeader(label: string): string {
  return `
    <tr>
      <td style="padding:34px 48px 14px;">
        <p style="margin:0;font-family:Arial,sans-serif;font-size:10px;line-height:14px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:${COLOR.green};border-bottom:2px solid ${COLOR.green};display:inline-block;padding-bottom:4px;">${escapeHtml(label)}</p>
      </td>
    </tr>`
}

function barRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:13px;color:${COLOR.text};">${escapeHtml(label)}</td>
      <td align="right" style="padding:5px 0;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:${COLOR.brown};font-variant-numeric:tabular-nums;">${escapeHtml(value)}</td>
    </tr>`
}

function twoColTable(rows: string[]): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows.join('')}</table>`
}

function imageRow(url: string, alt: string, width = 520, height = 220): string {
  return `
    <tr>
      <td style="padding:10px 0 4px;">
        <img src="${url}" width="${width}" height="${height}" alt="${escapeHtml(alt)}" style="display:block;width:100%;max-width:${width}px;height:auto;border:1px solid ${COLOR.borderLight};" />
      </td>
    </tr>`
}

function subLabel(text: string): string {
  return `<p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:.3px;color:${COLOR.textMuted};">${escapeHtml(text)}</p>`
}

export function buildWeeklyReportEmailHtml(metrics: FullReportMetrics, meta: ReportRunMeta): string {
  const { week, month, year } = metrics
  const prior = meta.priorWeek

  // A single-point "trend" isn't a trend — only render this once a real
  // prior-week snapshot exists to plot against, so the chart always shows
  // at least two genuine points. Before that, a plain text line is shown
  // instead (see the year-to-date section below).
  const trendChart = prior
    ? trendLineChartUrl({
        labels: ['Last week', 'This week'],
        values: [prior.usage.casesCompleted, week.usage.casesCompleted],
        label: 'Cases completed',
      })
    : null

  const caseTypeChart = week.usage.caseTypeDistribution.length > 0
    ? distributionBarChartUrl({
        labels: week.usage.caseTypeDistribution.map((c) => c.caseType),
        values: week.usage.caseTypeDistribution.map((c) => c.count),
        label: 'Cases completed by type',
      })
    : null

  // All-zero data renders as an empty-looking chart (correct, but reads as
  // broken to a human) — only render this once at least one side has a
  // real non-zero value.
  const engagementValues = [
    week.engagement.newVsReturning.new,
    week.engagement.uniqueVsRecurring.unique,
    week.engagement.newVsReturning.returning,
    week.engagement.uniqueVsRecurring.recurring,
  ]
  const engagementComparisonChart = engagementValues.some((v) => v > 0)
    ? comparisonBarChartUrl({
        categoryLabels: ['New vs Returning', 'Unique vs Recurring'],
        seriesA: { label: 'New / Unique', values: [week.engagement.newVsReturning.new, week.engagement.uniqueVsRecurring.unique] },
        seriesB: { label: 'Returning / Recurring', values: [week.engagement.newVsReturning.returning, week.engagement.uniqueVsRecurring.recurring] },
      })
    : null

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>Weekly KPI Report</title>
    <style>
      @media only screen and (max-width: 640px) {
        .email-shell { width: 100% !important; }
        .email-pad { padding-left: 20px !important; padding-right: 20px !important; }
        .kpi-tile { display: block !important; width: 100% !important; margin-bottom: 8px; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${COLOR.cream};color:${COLOR.text};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(meta.weekWindowLabel)} — signups, engagement, usage, demographics and reliability at a glance.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:${COLOR.cream};">
      <tr>
        <td align="center" style="padding:38px 14px 48px;">
          <table role="presentation" class="email-shell" width="640" cellspacing="0" cellpadding="0" border="0" style="width:640px;max-width:640px;background-color:${COLOR.ivory};border:1px solid ${COLOR.border};">
            <tr>
              <td style="height:6px;background-color:${COLOR.green};font-size:0;line-height:0;">&nbsp;</td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:28px 48px 18px;border-bottom:1px solid ${COLOR.borderLight};">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="font-family:Arial,sans-serif;font-size:10px;line-height:14px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:${COLOR.green};">
                      ${meta.isTest ? 'Weekly KPI Report &mdash; TEST SEND' : 'Weekly KPI Report'}
                    </td>
                    <td align="right" style="font-family:Arial,sans-serif;font-size:10px;line-height:14px;letter-spacing:1.4px;text-transform:uppercase;color:${COLOR.textFaint};">
                      ${escapeHtml(meta.isoWeekKey)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="email-pad" align="center" style="padding:36px 48px 30px;border-bottom:1px solid ${COLOR.borderLight};">
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:38px;font-weight:normal;letter-spacing:-1px;color:${COLOR.brown};">
                  Case Compendium<span style="color:${COLOR.green};">X</span>
                </p>
                <p style="margin:6px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:20px;font-style:italic;color:${COLOR.gold};">
                  ${escapeHtml(meta.weekWindowLabel)}
                </p>
              </td>
            </tr>

            <!-- This Week at a Glance -->
            <tr>
              <td class="email-pad" style="padding:30px 48px 8px;">
                <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:10px;line-height:14px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:${COLOR.green};">
                  This Week at a Glance
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    ${kpiTile('New signups', fmtNum(week.acquisition.newSignups), prior ? deltaBadge(week.acquisition.newSignups, prior.acquisition.newSignups) : undefined)}
                    ${kpiTile('Weekly active', fmtNum(week.engagement.wau), prior ? deltaBadge(week.engagement.wau, prior.engagement.wau) : undefined)}
                    ${kpiTile('Cases completed', fmtNum(week.usage.casesCompleted), prior ? deltaBadge(week.usage.casesCompleted, prior.usage.casesCompleted) : undefined)}
                    ${kpiTile('Minutes practiced', fmtNum(week.usage.minutesPracticed), prior ? deltaBadge(week.usage.minutesPracticed, prior.usage.minutesPracticed) : undefined)}
                  </tr>
                </table>
              </td>
            </tr>

            ${sectionHeader('A. Acquisition')}
            <tr>
              <td class="email-pad" style="padding:0 48px 20px;">
                ${twoColTable([
                  barRow('New signups this week', fmtNum(week.acquisition.newSignups)),
                  barRow('College-domain signups', fmtNum(week.acquisition.domainBreakdown.college)),
                  barRow('Personal-email signups', fmtNum(week.acquisition.domainBreakdown.personal)),
                  barRow('Other-domain signups', fmtNum(week.acquisition.domainBreakdown.other)),
                  barRow('Site visitors who never signed up', week.acquisition.neverSignedUpVisitors != null ? fmtNum(week.acquisition.neverSignedUpVisitors) : 'N/A — GA4 access not configured'),
                ])}
                ${week.acquisition.topColleges.length > 0 ? `
                  <div style="margin-top:14px;">
                    ${subLabel('Top colleges this week')}
                    ${twoColTable(week.acquisition.topColleges.map((c) => barRow(c.college, fmtNum(c.count))))}
                  </div>` : ''}
                ${week.acquisition.utmSourceBreakdown.length > 0 ? `
                  <div style="margin-top:14px;">
                    ${subLabel('Signup source')}
                    ${twoColTable(week.acquisition.utmSourceBreakdown.map((s) => barRow(s.source, fmtNum(s.count))))}
                  </div>` : ''}
              </td>
            </tr>

            ${sectionHeader('B. Activation & Engagement')}
            <tr>
              <td class="email-pad" style="padding:0 48px 20px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="48%" valign="top" style="width:48%;background-color:${COLOR.cream};padding:14px 16px;border-left:3px solid ${COLOR.green};">
                      ${subLabel('New vs. Returning (activation)')}
                      ${twoColTable([
                        barRow('New users', fmtNum(week.engagement.newVsReturning.new)),
                        barRow('Returning users', fmtNum(week.engagement.newVsReturning.returning)),
                      ])}
                    </td>
                    <td width="4%">&nbsp;</td>
                    <td width="48%" valign="top" style="width:48%;background-color:${COLOR.cream};padding:14px 16px;border-left:3px solid ${COLOR.gold};">
                      ${subLabel('Unique vs. Recurring (repeat visits)')}
                      ${twoColTable([
                        barRow('Unique (1 day this week)', fmtNum(week.engagement.uniqueVsRecurring.unique)),
                        barRow('Recurring (2+ days)', fmtNum(week.engagement.uniqueVsRecurring.recurring)),
                      ])}
                    </td>
                  </tr>
                </table>
                <div style="margin-top:16px;">
                  ${twoColTable([
                    barRow('Daily active users (avg)', fmtNum(week.engagement.dau)),
                    barRow('Weekly active users', fmtNum(week.engagement.wau)),
                    barRow('Monthly active users', fmtNum(week.engagement.mau)),
                    barRow('Stickiness (DAU/MAU)', fmtPct(week.engagement.stickiness)),
                  ])}
                </div>
                ${engagementComparisonChart
                  ? imageRow(engagementComparisonChart.url, engagementComparisonChart.alt)
                  : `<p style="margin:10px 0 0;font-family:Arial,sans-serif;font-size:12px;color:${COLOR.textFaint};">No engagement activity recorded yet this week.</p>`}
              </td>
            </tr>

            ${sectionHeader('C. Platform Usage')}
            <tr>
              <td class="email-pad" style="padding:0 48px 20px;">
                ${twoColTable([
                  barRow('Cases completed', fmtNum(week.usage.casesCompleted)),
                  barRow('Cases abandoned', fmtNum(week.usage.casesAbandoned)),
                  barRow('Minutes practiced', fmtNum(week.usage.minutesPracticed)),
                  barRow('Minutes transcribed', fmtNum(week.usage.minutesTranscribed)),
                  barRow('Transcription completion rate', fmtPct(week.usage.transcriptionCompletionRate)),
                  barRow('Cases viewed (browsed)', fmtNum(week.usage.casesViewed)),
                  barRow('Cases started', fmtNum(week.usage.casesStarted)),
                  barRow('Viewed but never started', fmtPct(week.usage.viewedButNeverStartedRate)),
                  barRow('Evaluations completed', fmtNum(week.usage.evaluationsCompleted)),
                  barRow('Avg structure score', week.usage.avgScores.structure != null ? week.usage.avgScores.structure.toFixed(2) : '—'),
                  barRow('Avg understanding score', week.usage.avgScores.understanding != null ? week.usage.avgScores.understanding.toFixed(2) : '—'),
                  barRow('Avg delivery score', week.usage.avgScores.delivery != null ? week.usage.avgScores.delivery.toFixed(2) : '—'),
                  barRow('Avg creativity score', week.usage.avgScores.creativity != null ? week.usage.avgScores.creativity.toFixed(2) : '—'),
                  barRow('Goal Tracker configs updated', fmtNum(week.usage.goalTrackerAdoption)),
                  barRow('Forum threads created', fmtNum(week.usage.forumEngagement.threads)),
                  barRow('Forum replies posted', fmtNum(week.usage.forumEngagement.replies)),
                ])}
                ${caseTypeChart ? imageRow(caseTypeChart.url, caseTypeChart.alt, 520, Math.max(160, week.usage.caseTypeDistribution.length * 34)) : ''}
              </td>
            </tr>

            ${sectionHeader('D. Demographics')}
            <tr>
              <td class="email-pad" style="padding:0 48px 20px;">
                ${week.demographics.geoBreakdown.length > 0 ? `
                  ${subLabel('New signups by location (IP geolocation at signup)')}
                  ${twoColTable(week.demographics.geoBreakdown.slice(0, 10).map((g) => barRow(g.location, fmtNum(g.count))))}
                ` : `<p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:13px;color:${COLOR.textFaint};">No geolocated signups this week.</p>`}
                <div style="margin-top:14px;">
                  ${subLabel('All-visitor breakdown (GA4)')}
                  ${twoColTable([
                    barRow('Avg time on site', week.demographics.avgTimeOnSiteSeconds != null ? `${Math.round(week.demographics.avgTimeOnSiteSeconds)}s` : 'N/A — GA4 access not configured'),
                  ])}
                  ${week.demographics.ga4DeviceBreakdown ? twoColTable(week.demographics.ga4DeviceBreakdown.map((d) => barRow(d.dimensionValue, fmtNum(d.metricValue)))) : ''}
                </div>
              </td>
            </tr>

            ${sectionHeader('E. Technical & Reliability')}
            <tr>
              <td class="email-pad" style="padding:0 48px 30px;">
                ${twoColTable([
                  barRow('Session failure rate (abandoned)', fmtPct(week.reliability.sessionFailureRate)),
                  barRow('Transcription failure rate', fmtPct(week.reliability.transcriptionFailureRate)),
                  barRow('Accounts pending deletion', fmtNum(week.reliability.totalAccountsPendingDeletion)),
                ])}
              </td>
            </tr>

            ${sectionHeader(`Month-to-date — ${meta.monthLabel}`)}
            <tr>
              <td class="email-pad" style="padding:0 48px 20px;">
                ${twoColTable([
                  barRow('New signups', fmtNum(month.acquisition.newSignups)),
                  barRow('Monthly active users', fmtNum(month.engagement.mau)),
                  barRow('Cases completed', fmtNum(month.usage.casesCompleted)),
                  barRow('Minutes practiced', fmtNum(month.usage.minutesPracticed)),
                ])}
              </td>
            </tr>

            ${sectionHeader(`Year-to-date — ${meta.yearLabel}`)}
            <tr>
              <td class="email-pad" style="padding:0 48px 30px;">
                ${twoColTable([
                  barRow('New signups', fmtNum(year.acquisition.newSignups)),
                  barRow('Cases completed', fmtNum(year.usage.casesCompleted)),
                  barRow('Minutes practiced', fmtNum(year.usage.minutesPracticed)),
                  barRow('Evaluations completed', fmtNum(year.usage.evaluationsCompleted)),
                ])}
                ${trendChart
                  ? imageRow(trendChart.url, trendChart.alt, 520, 200)
                  : `<p style="margin:10px 0 0;font-family:Arial,sans-serif;font-size:12px;color:${COLOR.textFaint};">Trend chart will appear once at least two weekly reports have been sent.</p>`}
              </td>
            </tr>

            <tr>
              <td class="email-pad" style="padding:20px 48px;background-color:${COLOR.cream};border-top:1px solid ${COLOR.border};">
                <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;line-height:18px;color:${COLOR.textFaint};">
                  ${meta.isTest ? 'Manually triggered test send. ' : 'Automated weekly send. '}
                  Generated ${escapeHtml(meta.isoWeekKey)} for
                  <a href="https://www.casecompendiumx.in" style="color:${COLOR.green};text-decoration:none;">casecompendiumx.in</a>.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
