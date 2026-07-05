import { addDays, formatDate, parseDate } from "./dateRange.js";

const calendarName = "US Stock Earnings";
const feedDomain = "us-stock-calendar.local";
const calendarTimezone = "America/New_York";
const eventDurationMinutes = 30;

const reportTimes = {
  premarket: {
    label: "Before open",
    hour: 8,
    minute: 0,
  },
  afterhours: {
    label: "After close",
    hour: 16,
    minute: 30,
  },
};

export function buildCalendarFeed(cache, options = {}) {
  const now = options.now || new Date();
  const startDate = options.startDate || formatDate(now);
  const endDate = options.endDate || formatDate(addDays(now, 60));
  const tiers = new Set(options.tiers || ["mega"]);
  const symbol = normalizeSymbol(options.symbol);
  const reportDate = options.reportDate || "";
  const reportTime = options.reportTime || "";
  const events = Array.isArray(cache?.events) ? cache.events : [];
  const generatedAt = formatUtcDateTime(now);
  const calendarEvents = events
    .filter((event) => isCalendarEvent(event, startDate, endDate, tiers, { symbol, reportDate, reportTime }))
    .sort(compareCalendarEvents)
    .map((event) => renderCalendarEvent(event, generatedAt));

  return foldIcsLines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//us-stock-calendar//Earnings Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    `X-WR-TIMEZONE:${calendarTimezone}`,
    renderTimezone(),
    ...calendarEvents,
    "END:VCALENDAR",
    "",
  ]);
}

function isCalendarEvent(event, startDate, endDate, tiers, filter) {
  return (
    event.reportDate >= startDate &&
    event.reportDate <= endDate &&
    Boolean(reportTimes[event.reportTime]) &&
    tiers.has(event.marketCapTier || "unknown") &&
    (!filter.symbol || normalizeSymbol(event.symbol) === filter.symbol) &&
    (!filter.reportDate || event.reportDate === filter.reportDate) &&
    (!filter.reportTime || event.reportTime === filter.reportTime)
  );
}

function renderCalendarEvent(event, generatedAt) {
  const timing = reportTimes[event.reportTime];
  const start = zonedDateTime(event.reportDate, timing.hour, timing.minute);
  const endDate = new Date(parseDate(event.reportDate).getTime() + eventDurationMinutes * 60 * 1000);
  endDate.setHours(timing.hour, timing.minute + eventDurationMinutes, 0, 0);
  const end = zonedDateTime(formatDate(endDate), endDate.getHours(), endDate.getMinutes());
  const summary = `${event.symbol} earnings - ${timing.label}`;
  const description = [
    event.name,
    `Timing: ${timing.label}`,
    event.sector ? `Sector: ${event.sector}` : "",
    event.industry ? `Industry: ${event.industry}` : "",
    `Yahoo Finance: ${yahooAnalysisUrl(event.symbol)}`,
    event.marketCapDisplay ? `Market cap: ${event.marketCapDisplay}` : "",
    "Source: Nasdaq public earnings calendar",
  ].filter(Boolean);

  return [
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(calendarUid(event))}`,
    `DTSTAMP:${generatedAt}`,
    `DTSTART;TZID=${calendarTimezone}:${start}`,
    `DTEND;TZID=${calendarTimezone}:${end}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description.join("\n"))}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ].join("\r\n");
}

function foldIcsLines(lines) {
  return lines
    .flatMap((line) => String(line).split(/\r?\n/))
    .flatMap((line) => {
      const chunks = [];
      let remaining = line;

      while (remaining.length > 75) {
        chunks.push(remaining.slice(0, 75));
        remaining = ` ${remaining.slice(75)}`;
      }

      chunks.push(remaining);
      return chunks;
    })
    .join("\r\n");
}

function renderTimezone() {
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${calendarTimezone}`,
    "X-LIC-LOCATION:America/New_York",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ].join("\r\n");
}

function calendarUid(event) {
  const symbol = String(event.symbol || "UNKNOWN").replaceAll(/[^A-Z0-9-]/gi, "-");
  return `${symbol}-${event.reportDate}-${event.reportTime}@${feedDomain}`;
}

function yahooAnalysisUrl(symbol) {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(String(symbol || "").toUpperCase())}/analysis/`;
}

function compareCalendarEvents(a, b) {
  if (a.reportDate !== b.reportDate) {
    return a.reportDate.localeCompare(b.reportDate);
  }

  const timeDiff = timeRank(a.reportTime) - timeRank(b.reportTime);
  if (timeDiff) {
    return timeDiff;
  }

  return (b.marketCap || 0) - (a.marketCap || 0);
}

function timeRank(reportTime) {
  return reportTime === "premarket" ? 0 : reportTime === "afterhours" ? 1 : 2;
}

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function zonedDateTime(dateString, hour, minute) {
  const [year, month, day] = dateString.split("-");
  return `${year}${month}${day}T${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}00`;
}

function formatUtcDateTime(date) {
  return date.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}
