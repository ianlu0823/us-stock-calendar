const dayMs = 24 * 60 * 60 * 1000;
const today = toDateString(new Date());
const fallbackVersion = "0.2.0";
const fallbackReleaseNotes = `# Release Notes

## v0.2.0 - Event Calendar Export

This version adds per-event .ics calendar export for upcoming US earnings events.

### Highlights

- New /calendar.ics endpoint with optional event filters.
- Click a Pre/After timing badge to download that event's calendar file.
- Timed calendar events instead of all-day events:
  - Pre: 08:00 America/New_York
  - After: 16:30 America/New_York
- 30-minute event duration.
- Stable event UIDs based on ticker, report date, and timing.
- Unfiltered feed defaults to the current core use case: Mega cap earnings with known timing over the next 60 days.

### Notes

- Calendar files are generated from the local cache. Refresh data first if the cache is empty.
- On Render Free, the cache remains ephemeral and can be lost after restarts or idle spin-downs.

## v0.1.0 - Local Earnings Calendar

This first version establishes a local-first US stock earnings calendar for personal use.

### Highlights

- Daily, weekly, and monthly earnings calendar views.
- Manual refresh from public Nasdaq earnings data.
- Local JSON cache under data/, excluded from git.
- Default display focused on Mega cap stocks.
- Market-cap filters:
  - Mega: $200B+
  - Large: $10B-$200B
  - Small: <$10B
- Sector dropdown filter populated from Nasdaq stock screener data.
- Earnings timing badges:
  - Pre: pre market
  - After: after market
- Events with unknown earnings timing are cached but hidden from the calendar.
- Event cards show:
  - ticker
  - timing badge
  - market-cap tier
  - company name
  - sector
  - latest sale, net change, and percent change
  - EPS estimate when available

### Data Sources

- Earnings calendar: Nasdaq public earnings calendar endpoint.
- Sector, industry, country, latest sale, and price change: Nasdaq public stock screener endpoint.

### Known Limitations

- No login or multi-user support.
- No Telegram reminder yet.
- No automatic scheduled refresh yet.
- Earnings dates and market data depend on public Nasdaq endpoints.
- Sector labels use Nasdaq's classification, not standardized GICS categories.

### Next Candidates

- Telegram daily or weekly digest.
- Optional watchlist/import support.
- ETF or index-based filters.
- Deployment target for always-on refresh and notifications.`;

const state = {
  events: [],
  meta: null,
  view: "week",
  selectedDate: today,
  tiers: new Set(["mega"]),
  sector: "",
  loading: true,
  refreshing: false,
  error: "",
  version: fallbackVersion,
  releaseNotes: fallbackReleaseNotes,
  releaseNotesError: "",
};

const output = document.querySelector("#calendar-output");
const statusLine = document.querySelector("#status-line");
const refreshButton = document.querySelector("#refresh-button");
const versionLink = document.querySelector("#version-link");
const releaseDialog = document.querySelector("#release-dialog");
const releaseTitle = document.querySelector("#release-title");
const releaseContent = document.querySelector("#release-content");
const releaseClose = document.querySelector("#release-close");
const sectorFilter = document.querySelector("#sector-filter");

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    render();
  });
});

document.querySelectorAll("[data-tier]").forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      state.tiers.add(checkbox.dataset.tier);
    } else {
      state.tiers.delete(checkbox.dataset.tier);
    }
    render();
  });
});

refreshButton.addEventListener("click", refreshData);
versionLink.addEventListener("click", openReleaseNotes);
releaseClose.addEventListener("click", closeReleaseNotes);
releaseDialog.addEventListener("click", (event) => {
  if (event.target === releaseDialog) {
    closeReleaseNotes();
  }
});

sectorFilter.addEventListener("change", () => {
  state.sector = sectorFilter.value;
  render();
});

output.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) {
    return;
  }

  if (action === "prev-day") shiftSelectedDate(-1);
  if (action === "next-day") shiftSelectedDate(1);
  if (action === "prev-week") shiftSelectedDate(-7);
  if (action === "next-week") shiftSelectedDate(7);
  if (action === "prev-month") shiftSelectedMonth(-1);
  if (action === "next-month") shiftSelectedMonth(1);
  if (action === "show-day") showDay(event.target.closest("[data-date]")?.dataset.date);
});

output.addEventListener("change", (event) => {
  if (event.target.matches("[data-date-picker]")) {
    state.selectedDate = event.target.value || today;
    render();
  }
});

loadVersion();
loadData();

async function loadVersion() {
  try {
    const response = await fetch("/api/version");
    if (!response.ok) {
      throw new Error(`Release notes request failed: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("Release notes response was not JSON.");
    }

    const payload = await response.json();
    state.version = payload.version || state.version;
    state.releaseNotes = payload.releaseNotes || state.releaseNotes;
    state.releaseNotesError = "";
    versionLink.textContent = state.version ? `v${state.version}` : versionLink.textContent;
  } catch (error) {
    state.releaseNotesError = error.message || "Unable to load release notes.";
  }
}

function openReleaseNotes() {
  releaseTitle.textContent = state.version ? `Latest version v${state.version}` : "Release notes";
  releaseContent.innerHTML = state.releaseNotes
    ? renderReleaseNotes(state.releaseNotes)
    : renderReleaseNotesFallback(state.releaseNotesError);

  if (typeof releaseDialog.showModal === "function") {
    releaseDialog.showModal();
  } else {
    releaseDialog.setAttribute("open", "");
  }
}

function renderReleaseNotesFallback(message) {
  return `
    <p>Release notes are not available yet.</p>
    <p>${escapeHtml(message || "Try refreshing after the latest deployment finishes.")}</p>
  `;
}

function closeReleaseNotes() {
  releaseDialog.close();
}

async function loadData() {
  state.loading = true;
  state.error = "";
  render();

  try {
    const response = await fetch("/api/events");
    const payload = await response.json();
    state.events = Array.isArray(payload.events) ? payload.events : [];
    state.meta = payload.meta || null;
    renderSectorOptions();

    if (!state.meta?.updatedAt) {
      state.loading = false;
      render();
      await refreshData();
    }
  } catch (error) {
    state.error = error.message || "Unable to load events.";
  } finally {
    state.loading = false;
    render();
  }
}

async function refreshData() {
  state.refreshing = true;
  state.error = "";
  render();

  try {
    const response = await fetch("/api/refresh", { method: "POST" });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Refresh failed.");
    }

    state.events = Array.isArray(payload.events) ? payload.events : [];
    state.meta = payload.meta || null;
    renderSectorOptions();
  } catch (error) {
    state.error = error.message || "Refresh failed.";
  } finally {
    state.refreshing = false;
    render();
  }
}

function render() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === state.view));
  });

  refreshButton.disabled = state.refreshing;
  refreshButton.textContent = state.refreshing ? "Refreshing..." : "Refresh";
  statusLine.textContent = statusText();

  if (state.loading) {
    output.innerHTML = `<div class="empty-state">Loading earnings calendar...</div>`;
    return;
  }

  if (state.error) {
    output.innerHTML = `<div class="empty-state error">${escapeHtml(state.error)}</div>`;
    return;
  }

  if (state.view === "day") {
    output.innerHTML = renderDailyView();
    return;
  }

  if (state.view === "month") {
    output.innerHTML = renderMonthlyView();
    return;
  }

  output.innerHTML = renderWeeklyView();
}

function statusText() {
  if (state.refreshing) {
    return "Refreshing US market earnings data...";
  }

  if (!state.meta?.updatedAt) {
    return "No local cache yet.";
  }

  const updated = new Date(state.meta.updatedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${state.meta.eventCount || state.events.length} events cached. Updated ${updated}.`;
}

function renderDailyView() {
  const events = eventsForDate(state.selectedDate);

  return `
    ${renderDateNavigator("day", formatLongDate(state.selectedDate))}
    ${renderTimeGroups(events)}
  `;
}

function renderWeeklyView() {
  const weekStart = startOfWeek(parseDate(state.selectedDate));
  const days = Array.from({ length: 5 }, (_, index) => addDays(weekStart, index));
  const title = `${formatShortDate(toDateString(days[0]))} - ${formatShortDate(toDateString(days[4]))}`;

  return `
    ${renderDateNavigator("week", title)}
    <div class="week-grid">
      ${days
        .map((day) => {
          const date = toDateString(day);
          const events = eventsForDate(date);
          return `
            <section class="day-column">
              <div class="day-heading">
                <span>${weekdayName(day)}</span>
                <strong>${formatMonthDay(date)}</strong>
              </div>
              <div class="event-stack">
                ${events.length ? events.slice(0, 12).map(renderEventCard).join("") : renderQuietEmpty()}
                ${
                  events.length > 12
                    ? `<button type="button" class="more-count" data-action="show-day" data-date="${date}">+${events.length - 12} more</button>`
                    : ""
                }
              </div>
            </section>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderMonthlyView() {
  const selected = parseDate(state.selectedDate);
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = startOfWeek(firstOfMonth);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

  return `
    ${renderDateNavigator("month", firstOfMonth.toLocaleString(undefined, { month: "long", year: "numeric" }))}
    <div class="month-grid">
      ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `<div class="weekday">${day}</div>`).join("")}
      ${days
        .map((day) => {
          const date = toDateString(day);
          const events = eventsForDate(date);
          const isOutside = day.getMonth() !== month;
          return `
            <section class="month-cell ${isOutside ? "is-outside" : ""}">
              <div class="month-date">${day.getDate()}</div>
              ${
                events.length
                  ? `<div class="month-count">${events.length} earnings</div>
                     <div class="ticker-line">${events.slice(0, 4).map((event) => escapeHtml(event.symbol)).join(" · ")}</div>`
                  : ""
              }
            </section>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderDateNavigator(scope, title) {
  const prevAction = scope === "day" ? "prev-day" : scope === "month" ? "prev-month" : "prev-week";
  const nextAction = scope === "day" ? "next-day" : scope === "month" ? "next-month" : "next-week";

  return `
    <div class="calendar-header">
      <button type="button" class="icon-button" data-action="${prevAction}" aria-label="Previous">‹</button>
      <div>
        <h2>${escapeHtml(title)}</h2>
        <input type="date" value="${state.selectedDate}" data-date-picker>
      </div>
      <button type="button" class="icon-button" data-action="${nextAction}" aria-label="Next">›</button>
    </div>
  `;
}

function renderTimeGroups(events) {
  if (!events.length) {
    return `<div class="empty-state">No earnings match the selected filters.</div>`;
  }

  return `
    <div class="time-groups">
      ${["premarket", "afterhours"]
        .map((time) => {
          const groupedEvents = events.filter((event) => event.reportTime === time);
          if (!groupedEvents.length) {
            return "";
          }

          return `
            <section class="time-group">
              <h3>${timeLabel(time)}</h3>
              <div class="event-list">${groupedEvents.map(renderEventRow).join("")}</div>
            </section>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderEventRow(event) {
  return `
    <article class="event-row">
      <div>
        <div class="symbol-line">
          <strong>${escapeHtml(event.symbol)}</strong>
          ${renderTimeBadge(event)}
          ${renderTierBadge(event.marketCapTier)}
        </div>
        <p>${escapeHtml(event.name || "Unknown company")}</p>
        ${renderIndustryLine(event)}
      </div>
      <div class="event-metrics">
        <span>${escapeHtml(latestCloseText(event))}</span>
        <span>EPS ${escapeHtml(event.epsForecast || "N/A")}</span>
      </div>
    </article>
  `;
}

function renderEventCard(event) {
  return `
    <article class="event-card">
      <div class="symbol-line">
        <strong>${escapeHtml(event.symbol)}</strong>
        ${renderTimeBadge(event)}
        ${renderTierBadge(event.marketCapTier)}
      </div>
      <p class="company-name">${escapeHtml(event.name || "Unknown company")}</p>
      ${renderIndustryLine(event)}
      <span class="latest-sale">${escapeHtml(latestCloseText(event))}</span>
    </article>
  `;
}

function renderIndustryLine(event) {
  const classification = event.sector || event.industry;
  if (!classification) {
    return `<p class="industry-line">Unclassified</p>`;
  }

  return `<p class="industry-line">${escapeHtml(classification)}</p>`;
}

function renderTierBadge(tier) {
  return `<span class="tier ${escapeHtml(tier || "unknown")}">${tierLabel(tier)}</span>`;
}

function renderTimeBadge(event) {
  const time = event.reportTime;
  const label = timeLabel(time);
  if (!label) {
    return "";
  }

  const href = calendarEventUrl(event);
  const download = `${event.symbol}-${event.reportDate}-${event.reportTime}.ics`;

  return `<a class="time-badge ${escapeHtml(time)}" href="${escapeHtml(href)}" download="${escapeHtml(download)}" aria-label="Add ${escapeHtml(event.symbol)} ${label} earnings to calendar">${label}</a>`;
}

function calendarEventUrl(event) {
  const params = new URLSearchParams({
    symbol: event.symbol,
    date: event.reportDate,
    time: event.reportTime,
  });
  return `/calendar.ics?${params.toString()}`;
}

function latestCloseText(event) {
  if (!event.lastSale) {
    return "N/A";
  }

  const netChange = signedValue(event.netChange);
  const percentChange = signedValue(event.percentChange);

  if (netChange && percentChange) {
    return `${event.lastSale} ${netChange} (${percentChange})`;
  }

  if (netChange) {
    return `${event.lastSale} ${netChange}`;
  }

  return event.lastSale;
}

function renderQuietEmpty() {
  return `<div class="quiet-empty">No matches</div>`;
}

function eventsForDate(date) {
  return filteredEvents()
    .filter((event) => event.reportDate === date)
    .sort(compareEvents);
}

function filteredEvents() {
  return state.events.filter((event) => {
    return (
      event.reportTime !== "unknown" &&
      state.tiers.has(event.marketCapTier || "unknown") &&
      (!state.sector || event.sector === state.sector)
    );
  });
}

function renderSectorOptions() {
  const sectors = [...new Set(state.events.map((event) => event.sector).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const currentSector = sectors.includes(state.sector) ? state.sector : "";
  state.sector = currentSector;

  sectorFilter.innerHTML = [
    `<option value="">All sectors</option>`,
    ...sectors.map((sector) => {
      const selected = sector === currentSector ? " selected" : "";
      return `<option value="${escapeHtml(sector)}"${selected}>${escapeHtml(sector)}</option>`;
    }),
  ].join("");
}

function compareEvents(a, b) {
  const timeDiff = timeRank(a.reportTime) - timeRank(b.reportTime);
  if (timeDiff) {
    return timeDiff;
  }
  return (b.marketCap || 0) - (a.marketCap || 0);
}

function timeRank(time) {
  return { premarket: 0, afterhours: 1 }[time] ?? 2;
}

function timeLabel(time) {
  return {
    premarket: "Pre",
    afterhours: "After",
  }[time] || "";
}

function signedValue(value) {
  const text = String(value || "").trim();
  if (!text || text === "N/A") {
    return "";
  }

  if (text.startsWith("-") || text.startsWith("+")) {
    return text;
  }

  const numeric = Number(text.replace("%", ""));
  if (!Number.isFinite(numeric) || numeric === 0) {
    return text;
  }

  return `+${text}`;
}

function tierLabel(tier) {
  return {
    mega: "Mega",
    large: "Large",
    small: "Small",
    unknown: "",
  }[tier || "unknown"];
}

function shiftSelectedDate(days) {
  state.selectedDate = toDateString(addDays(parseDate(state.selectedDate), days));
  render();
}

function shiftSelectedMonth(months) {
  const date = parseDate(state.selectedDate);
  date.setMonth(date.getMonth() + months);
  state.selectedDate = toDateString(date);
  render();
}

function showDay(date) {
  if (!date) {
    return;
  }

  state.selectedDate = date;
  state.view = "day";
  render();
}

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function parseDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLongDate(dateString) {
  return parseDate(dateString).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(dateString) {
  return parseDate(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatMonthDay(dateString) {
  return parseDate(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function weekdayName(date) {
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function renderReleaseNotes(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const html = [];
  let inList = false;
  let inCode = false;
  let codeLines = [];

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
      }
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const closeList = () => {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
    };

    if (!line.trim()) {
      closeList();
      continue;
    }

    if (line.startsWith("### ")) {
      closeList();
      html.push(`<h4>${escapeHtml(line.slice(4))}</h4>`);
      continue;
    }

    if (line.startsWith("## ")) {
      closeList();
      html.push(`<h3>${escapeHtml(line.slice(3))}</h3>`);
      continue;
    }

    if (line.startsWith("# ")) {
      closeList();
      continue;
    }

    if (line.trimStart().startsWith("- ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${escapeHtml(line.trimStart().slice(2))}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${escapeHtml(line)}</p>`);
  }

  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }

  if (inList) {
    html.push("</ul>");
  }

  return html.join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
