'use client';

import type { GithubContributionCalendar, GithubContributionDay } from '@flowstate/shared';
import { formatCompact } from '@/lib/analytics';

///////////////
// Constants //
///////////////

/** GitHub's signature green scale, indexed by heat step 0–4 (0 = no contributions). */
const LEVEL_COLORS = ['rgba(235, 237, 240, 0.08)', '#0e4429', '#006d32', '#26a641', '#39d353'];

/** Left-column weekday labels — GitHub shows only Mon / Wed / Fri (rows 1, 3, 5). */
const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/////////////
// Helpers //
/////////////

/** Parse a `YYYY-MM-DD` day key as a local date. */
function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00`);
}

/** "Jul 14, 2026" for a cell's hover tooltip. */
function formatDayFull(day: string): string {
  const date = parseDay(day);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Place a week's days into 7 weekday slots (Sun→Sat); partial weeks leave gaps. */
function toWeekdaySlots(week: GithubContributionDay[]): (GithubContributionDay | null)[] {
  const slots: (GithubContributionDay | null)[] = [null, null, null, null, null, null, null];
  for (const day of week) {
    const weekday = parseDay(day.day).getDay();
    slots[weekday] = day;
  }
  return slots;
}

/**
 * Month label to show above each week column: the month name on the first week
 * whose leading day starts a new month, blank otherwise (GitHub's cadence).
 */
function monthLabels(weeks: GithubContributionDay[][]): string[] {
  let prevMonth = -1;
  return weeks.map((week) => {
    const first = week[0];
    if (!first) return '';
    const month = parseDay(first.day).getMonth();
    if (month === prevMonth) return '';
    prevMonth = month;
    return MONTH_LABELS[month];
  });
}

///////////////
// Component //
///////////////

/**
 * The GitHub-style contribution heatmap: week columns of day cells shaded by
 * GitHub's green scale, month labels across the top and Mon/Wed/Fri down the
 * side, plus a total-contributions caption and a Less→More legend.
 */
export function ContributionGraph({ data }: { data: GithubContributionCalendar }) {
  const labels = monthLabels(data.weeks);

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        <span className="font-semibold tabular-nums text-neutral-100">
          {formatCompact(data.totalContributions)}
        </span>{' '}
        contributions in the last year
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-1">
          {/* Weekday labels — offset down by the month-label row's height. */}
          <div className="flex flex-col gap-[3px] pt-[16px]">
            {WEEKDAY_LABELS.map((label, i) => (
              <div key={i} className="h-[11px] text-[9px] leading-[11px] text-muted-foreground">
                {label}
              </div>
            ))}
          </div>

          <div>
            {/* Month labels aligned to their week columns. */}
            <div className="mb-1 flex h-[12px] gap-[3px]">
              {labels.map((label, i) => (
                <div key={i} className="w-[11px] text-[9px] leading-[12px] text-muted-foreground">
                  {label}
                </div>
              ))}
            </div>

            {/* Week columns. */}
            <div className="flex gap-[3px]">
              {data.weeks.map((week, i) => (
                <div key={i} className="flex flex-col gap-[3px]">
                  {toWeekdaySlots(week).map((day, d) =>
                    day ? (
                      <div
                        key={d}
                        className="size-[11px] rounded-sm"
                        style={{ backgroundColor: LEVEL_COLORS[day.level] ?? LEVEL_COLORS[0] }}
                        title={`${day.count} contribution${day.count === 1 ? '' : 's'} on ${formatDayFull(day.day)}`}
                      />
                    ) : (
                      <div key={d} className="size-[11px]" />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend. */}
      <div className="flex items-center justify-end gap-1 text-[9px] text-muted-foreground">
        <span>Less</span>
        {LEVEL_COLORS.map((color, i) => (
          <div key={i} className="size-[11px] rounded-sm" style={{ backgroundColor: color }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
