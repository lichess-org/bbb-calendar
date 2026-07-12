import { useCallback, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import allLocales from "@fullcalendar/core/locales-all";
import type {
  EventClickArg,
  EventContentArg,
  EventInput,
  EventMountArg,
  EventSourceFunc,
} from "@fullcalendar/core";

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

interface EventExtendedProps {
  source: "event" | "tournament";
  manage: string;
  createdBy: string;
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

function renderEventContent(arg: EventContentArg) {
  const { source, enabled, isPromo, tag } = arg.event.extendedProps as EventExtendedProps;
  const classNames = ["event-pill"];
  if (source === "tournament") classNames.push("event-pill--tournament");
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

  const fetchEvents: EventSourceFunc = useCallback((info, success, failure) => {
    const since = info.start.getTime();
    const until = info.end.getTime();

    const fetchJson = <T,>(path: string) =>
      fetch(`${path}?since=${since}&until=${until}`).then((res) => {
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        return res.json() as Promise<T>;
      });

    Promise.all([
      fetchJson<ApiResponse>("/api/event/calendar"),
      fetchJson<TournamentApiResponse>("/api/tournament/manager/calendar"),
    ])
      .then(([eventData, tournamentData]) => {
        setError(null);

        const events: EventInput[] = eventData.currentPageResults.flatMap((ev) => {
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
        });

        const tournaments: EventInput[] = tournamentData.currentPageResults.flatMap((t) => {
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
        });

        success([...events, ...tournaments]);
      })
      .catch((err: Error) => {
        setError(err.message);
        failure(err);
      });
  }, []);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    arg.jsEvent.preventDefault();
    const { manage } = arg.event.extendedProps as EventExtendedProps;
    if (manage) window.open(manage, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__brand-name">Lichess BBB Calendar</span>
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
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          locales={allLocales}
          locale={browserLocale}
          height="100%"
          nowIndicator
          dayMaxEvents={3}
          events={fetchEvents}
          eventContent={renderEventContent}
          eventDidMount={handleEventDidMount}
          eventClick={handleEventClick}
          loading={setIsLoading}
        />
      </main>
    </div>
  );
}
