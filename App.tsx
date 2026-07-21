import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import allLocales from "@fullcalendar/core/locales-all";
import type { DatesSetArg, EventClickArg, EventContentArg, EventInput, EventMountArg } from "@fullcalendar/core";

const browserLocale = typeof navigator !== "undefined" ? navigator.language : "en";

interface ApiEvent {
  title: string;
  enabled: boolean;
  start: string;
  end: string;
  homepageHours: number;
  url: string;
  language: string;
  createdBy: string;
  manage: string;
  hostedBy?: string;
}

interface ApiResponse {
  currentPageResults: ApiEvent[];
  nbResults: number;
}

interface TournamentApiEvent {
  id: string;
  createdBy: string;
  system: string;
  rated: boolean;
  fullName: string;
  nbPlayers: number;
  startsAt: number;
  finishesAt: number;
  clock: { limit: number; increment: number };
  perf: { key: string; name: string };
  spotlight: { headline: string | null; homepageHours: number | null; manage: string };
}

interface TournamentApiResponse {
  currentPageResults: TournamentApiEvent[];
  nbResults: number;
}

interface SpotlightRoundApiEvent {
  id: string;
  name: string;
  rated: boolean;
  startsAt?: number;
  startsAfterPrevious?: boolean;
  url: string;
  tour: {
    id: string;
    name: string;
    tier: number;
  };
  spotlight: { language: string; title: string; tier: number };
}

interface EventExtendedProps {
  source: "event" | "tournament" | "spotlight";
  manage: string;
  createdBy?: string;
  tag: string;
  isPromo?: boolean;
  // event-source fields
  enabled?: boolean;
  homepageHours?: number;
  language?: string;
  hostedBy?: string;
  url?: string;
  // tournament-source fields
  rated?: boolean;
  perfName?: string;
  clockText?: string;
  nbPlayers?: number;
  // spotlight-round-source fields
  tourName?: string;
  spotlightTitle?: string;
  tier?: number;
}

interface EventColors {
  backgroundColor: string;
  borderColor: string;
}

function withPromo(
  id: string,
  title: string,
  start: string | number,
  end: string | number,
  homepageHours: number | null | undefined,
  promoTitle: string,
  extendedProps: EventExtendedProps,
  colors?: { main: EventColors; promo: EventColors },
): EventInput[] {
  const mainEvent: EventInput = { id, title, start, end, extendedProps, ...colors?.main };
  if (!homepageHours) return [mainEvent];

  const promoStart = new Date(new Date(start).getTime() - homepageHours * 60 * 60 * 1000).toISOString();
  const promoEvent: EventInput = {
    id: `${id}-promo`,
    title: promoTitle,
    start: promoStart,
    end: start,
    extendedProps: { ...extendedProps, isPromo: true },
    ...colors?.promo,
  };
  return [promoEvent, mainEvent];
}

const EVENT_COLORS = {
  main: { backgroundColor: "var(--event-accent)", borderColor: "var(--event-accent-strong)" },
  promo: { backgroundColor: "var(--event-accent-tint)", borderColor: "var(--event-accent)" },
};

const TOURNAMENT_COLORS = {
  main: { backgroundColor: "var(--accent2)", borderColor: "var(--accent2-strong)" },
  promo: { backgroundColor: "var(--accent2-tint)", borderColor: "var(--accent2)" },
};

const SPOTLIGHT_COLORS: EventColors = {
  backgroundColor: "var(--spotlight-accent)",
  borderColor: "var(--spotlight-accent-strong)",
};

const SOURCE_TYPES = ["event", "tournament", "spotlight"] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

const SOURCE_LABELS: Record<SourceType, string> = {
  event: "Event",
  tournament: "Tournament",
  spotlight: "Broadcast",
};

function renderEventContent(arg: EventContentArg) {
  const { source, enabled, isPromo, tag } = arg.event.extendedProps as EventExtendedProps;
  const classNames = ["event-pill"];
  if (source === "tournament") classNames.push("event-pill--tournament");
  if (source === "spotlight") classNames.push("event-pill--spotlight");
  if (enabled === false) classNames.push("event-pill--disabled");
  if (isPromo) classNames.push("event-pill--promo");
  return (
    <div className={classNames.join(" ")}>
      {arg.timeText && <span className="event-pill__time">{arg.timeText}</span>}
      <span className="event-pill__title">{arg.event.title}</span>
      {tag && <span className="event-pill__lang">{tag}</span>}
    </div>
  );
}

function handleEventDidMount(arg: EventMountArg) {
  const props = arg.event.extendedProps as EventExtendedProps;
  const lines = [arg.event.title];

  if (props.source === "tournament") {
    lines.push(
      `${props.rated ? "Rated" : "Casual"} ${props.perfName} · ${props.clockText} · ${props.nbPlayers} players`,
    );
    lines.push(`Created by ${props.createdBy}`);
  } else if (props.source === "spotlight") {
    lines.push(`${props.rated ? "Rated" : "Casual"} · Tier ${props.tier} · ${props.language?.toUpperCase()}`);
    lines.push(`Spotlight: ${props.spotlightTitle}`);
    lines.push(`Part of ${props.tourName}`);
  } else {
    lines.push(
      props.isPromo
        ? `Homepage promo · ${props.homepageHours}h leading up to the event · ${props.language?.toUpperCase()}`
        : `${props.enabled ? "Enabled" : "Disabled"} · ${props.homepageHours}h on homepage · ${props.language?.toUpperCase()}`,
    );
    lines.push(`Created by ${props.createdBy}${props.hostedBy ? ` · Hosted by ${props.hostedBy}` : ""}`);
  }

  arg.el.title = lines.join("\n");
}

export function App() {
  const calendarRef = useRef<FullCalendar>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawEvents, setRawEvents] = useState<EventInput[]>([]);
  const [activeSources, setActiveSources] = useState<Set<SourceType>>(new Set(SOURCE_TYPES));
  const [activeLanguage, setActiveLanguage] = useState<string | null>(null);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const langFilterRef = useRef<HTMLDetailsElement>(null);
  const latestRequestId = useRef(0);

  useEffect(() => {
    if (!isLangOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (langFilterRef.current && !langFilterRef.current.contains(e.target as Node)) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isLangOpen]);

  const loadEvents = useCallback((start: Date, end: Date) => {
    const requestId = ++latestRequestId.current;
    const since = start.getTime();
    const until = end.getTime();

    const fetchJson = <T,>(path: string) =>
      fetch(`${path}?since=${since}&until=${until}`).then((res) => {
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        return res.json() as Promise<T>;
      });

    const fetchNdjson = <T,>(path: string) =>
      fetch(`${path}?since=${since}&until=${until}`).then(async (res) => {
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        const text = await res.text();
        return text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => JSON.parse(line) as T);
      });

    const describeFailure = (label: string, result: PromiseSettledResult<unknown>) =>
      result.status === "rejected"
        ? `${label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`
        : null;

    setIsLoading(true);

    Promise.allSettled([
      fetchJson<ApiResponse>("/api/event/calendar"),
      fetchJson<TournamentApiResponse>("/api/tournament/manager/calendar"),
      fetchNdjson<SpotlightRoundApiEvent>("/api/broadcast/spotlight-rounds"),
    ]).then(([eventResult, tournamentResult, spotlightResult]) => {
      if (requestId !== latestRequestId.current) return; // a newer request has since superseded this one

      const events: EventInput[] =
        eventResult.status === "fulfilled"
          ? eventResult.value.currentPageResults.flatMap((ev) => {
              const title = ev.title.trim();
              const extendedProps: EventExtendedProps = {
                source: "event",
                enabled: ev.enabled,
                homepageHours: ev.homepageHours,
                language: ev.language,
                createdBy: ev.createdBy,
                hostedBy: ev.hostedBy,
                manage: ev.manage,
                url: ev.url,
                tag: ev.language.toUpperCase(),
              };
              return withPromo(
                ev.manage,
                title,
                ev.start,
                ev.end,
                ev.homepageHours,
                `(promo) ${title}`,
                extendedProps,
                EVENT_COLORS,
              );
            })
          : [];

      const tournaments: EventInput[] =
        tournamentResult.status === "fulfilled"
          ? tournamentResult.value.currentPageResults.flatMap((t) => {
              const clockText = `${Math.floor(t.clock.limit / 60)}+${t.clock.increment}`;
              const extendedProps: EventExtendedProps = {
                source: "tournament",
                createdBy: t.createdBy,
                manage: t.spotlight.manage,
                tag: clockText,
                rated: t.rated,
                perfName: t.perf.name,
                clockText,
                nbPlayers: t.nbPlayers,
              };
              const promoTitle = `(promo) ${t.spotlight.headline?.trim() || t.fullName}`;
              return withPromo(
                t.id,
                t.fullName,
                t.startsAt,
                t.finishesAt,
                t.spotlight.homepageHours,
                promoTitle,
                extendedProps,
                TOURNAMENT_COLORS,
              );
            })
          : [];

      const spotlights: EventInput[] =
        spotlightResult.status === "fulfilled"
          ? spotlightResult.value
              .filter((r): r is SpotlightRoundApiEvent & { startsAt: number } => typeof r.startsAt === "number")
              .map((r) => {
                const extendedProps: EventExtendedProps = {
                  source: "spotlight",
                  manage: r.url,
                  tag: r.spotlight.language.toUpperCase(),
                  rated: r.rated,
                  tourName: r.tour.name,
                  spotlightTitle: r.spotlight.title,
                  tier: r.spotlight.tier,
                  language: r.spotlight.language,
                };
                return {
                  id: r.id,
                  title: `${r.tour.name} · ${r.name}`,
                  start: r.startsAt,
                  extendedProps,
                  ...SPOTLIGHT_COLORS,
                } satisfies EventInput;
              })
          : [];

      const errors = [
        describeFailure("Events", eventResult),
        describeFailure("Tournaments", tournamentResult),
        describeFailure("Spotlight rounds", spotlightResult),
      ].filter((e): e is string => e !== null);

      setError(errors.length ? errors.join(" · ") : null);
      setRawEvents([...events, ...tournaments, ...spotlights]);
      setIsLoading(false);
    });
  }, []);

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      loadEvents(arg.start, arg.end);
    },
    [loadEvents],
  );

  const handleEventClick = useCallback((arg: EventClickArg) => {
    arg.jsEvent.preventDefault();
    const { manage } = arg.event.extendedProps as EventExtendedProps;
    if (manage) window.open(manage, "_blank", "noopener,noreferrer");
  }, []);

  const toggleSource = useCallback((source: SourceType) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }, []);

  const availableLanguages = useMemo(() => {
    const languages = new Set<string>();
    for (const ev of rawEvents) {
      const language = (ev.extendedProps as EventExtendedProps | undefined)?.language;
      if (language) languages.add(language);
    }
    return Array.from(languages).sort();
  }, [rawEvents]);

  const filteredEvents = useMemo(() => {
    return rawEvents.filter((ev) => {
      const props = ev.extendedProps as EventExtendedProps | undefined;
      if (!props) return true;
      if (!activeSources.has(props.source)) return false;
      if (activeLanguage && props.language && props.language !== activeLanguage) return false;
      return true;
    });
  }, [rawEvents, activeSources, activeLanguage]);

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__brand-name">Lichess BBB Calendar</span>
        </div>
        <div className="app__filters">
          <div className="type-filter" role="group" aria-label="Filter by type">
            {SOURCE_TYPES.map((source) => (
              <button
                key={source}
                type="button"
                className={`type-filter__btn type-filter__btn--${source}${
                  activeSources.has(source) ? " type-filter__btn--active" : ""
                }`}
                aria-pressed={activeSources.has(source)}
                onClick={() => toggleSource(source)}
              >
                {SOURCE_LABELS[source]}
              </button>
            ))}
          </div>
          <details
            className="lang-filter"
            ref={langFilterRef}
            open={isLangOpen}
            onToggle={(e) => setIsLangOpen(e.currentTarget.open)}
          >
            <summary>Language: {activeLanguage ? activeLanguage.toUpperCase() : "All"}</summary>
            <div className="lang-filter__panel">
              <label className="lang-filter__option">
                <input
                  type="radio"
                  name="language"
                  checked={activeLanguage === null}
                  onChange={() => {
                    setActiveLanguage(null);
                    setIsLangOpen(false);
                  }}
                />
                All languages
              </label>
              {availableLanguages.map((language) => (
                <label key={language} className="lang-filter__option">
                  <input
                    type="radio"
                    name="language"
                    checked={activeLanguage === language}
                    onChange={() => {
                      setActiveLanguage(language);
                      setIsLangOpen(false);
                    }}
                  />
                  {language.toUpperCase()}
                </label>
              ))}
            </div>
          </details>
        </div>
        <div className="app__status" role="status">
          {isLoading && <span className="app__status-pill">Loading&hellip;</span>}
          {error && <span className="app__status-pill app__status-pill--error">{error}</span>}
        </div>
      </header>
      <main className="app__main">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          locales={allLocales}
          locale={browserLocale}
          height="100%"
          nowIndicator
          dayMaxEvents={10}
          events={filteredEvents}
          datesSet={handleDatesSet}
          eventContent={renderEventContent}
          eventDidMount={handleEventDidMount}
          eventClick={handleEventClick}
        />
      </main>
    </div>
  );
}
