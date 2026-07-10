import { useCallback, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  EventClickArg,
  EventContentArg,
  EventInput,
  EventMountArg,
  EventSourceFunc,
} from "@fullcalendar/core";

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

interface EventExtendedProps {
  enabled: boolean;
  homepageHours: number;
  language: string;
  createdBy: string;
  hostedBy?: string;
  manage: string;
  url: string;
  isPromo?: boolean;
}

function renderEventContent(arg: EventContentArg) {
  const { enabled, language, isPromo } = arg.event.extendedProps as EventExtendedProps;
  const classNames = ["event-pill"];
  if (!enabled) classNames.push("event-pill--disabled");
  if (isPromo) classNames.push("event-pill--promo");
  return (
    <div className={classNames.join(" ")}>
      {arg.timeText && <span className="event-pill__time">{arg.timeText}</span>}
      <span className="event-pill__title">{arg.event.title}</span>
      <span className="event-pill__lang">{language}</span>
    </div>
  );
}

function handleEventDidMount(arg: EventMountArg) {
  const { enabled, homepageHours, language, createdBy, hostedBy, isPromo } =
    arg.event.extendedProps as EventExtendedProps;
  arg.el.title = [
    arg.event.title,
    isPromo
      ? `Homepage promo · ${homepageHours}h leading up to the event · ${language.toUpperCase()}`
      : `${enabled ? "Enabled" : "Disabled"} · ${homepageHours}h on homepage · ${language.toUpperCase()}`,
    `Created by ${createdBy}${hostedBy ? ` · Hosted by ${hostedBy}` : ""}`,
  ].join("\n");
}

export function App() {
  const calendarRef = useRef<FullCalendar>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents: EventSourceFunc = useCallback((info, success, failure) => {
    const since = info.start.getTime();
    const until = info.end.getTime();

    fetch(`/api/event/calendar?since=${since}&until=${until}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        return res.json() as Promise<ApiResponse>;
      })
      .then((data) => {
        setError(null);
        const events: EventInput[] = data.currentPageResults.flatMap((ev) => {
          const extendedProps: EventExtendedProps = {
            enabled: ev.enabled,
            homepageHours: ev.homepageHours,
            language: ev.language,
            createdBy: ev.createdBy,
            hostedBy: ev.hostedBy,
            manage: ev.manage,
            url: ev.url,
          };
          const title = ev.title.trim();
          const mainEvent: EventInput = {
            id: ev.manage,
            title,
            start: ev.start,
            end: ev.end,
            extendedProps,
          };
          if (!ev.homepageHours) return [mainEvent];

          const promoStart = new Date(
            new Date(ev.start).getTime() - ev.homepageHours * 60 * 60 * 1000,
          ).toISOString();
          const promoEvent: EventInput = {
            id: `${ev.manage}-promo`,
            title: `(promo) ${title}`,
            start: promoStart,
            end: ev.start,
            extendedProps: { ...extendedProps, isPromo: true },
          };
          return [promoEvent, mainEvent];
        });
        success(events);
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
          buttonText={{ today: "Today", month: "Month", week: "Week", day: "Day" }}
          firstDay={1}
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
