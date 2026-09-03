import type { ContentEventsPage, ContentReviewEvent } from "../contentReview";

const MAX_VISIBLE_EVENTS = 6;

function formatEntityKey(entityKey: string | null): string {
    if (!entityKey) return "Unknown entity";
    return entityKey
        .split(/[-_]/g)
        .filter(Boolean)
        .map((part, index) => {
            const normalized = part.toLowerCase();
            return index === 0
                ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
                : normalized;
        })
        .join(" ");
}

function eventKindLabel(event: ContentReviewEvent): string {
    return event.entity_kind === "plant" ? "Plant" : "Pest/disease";
}

export function ContentSourceNotification({
    events,
    onOpenEvent,
}: {
    events: ContentEventsPage | null;
    onOpenEvent: (eventId: string) => void;
}) {
    if (!events || events.items.length === 0) return null;

    const visibleEvents = events.items.slice(0, MAX_VISIBLE_EVENTS);
    const hiddenCount = Math.max(0, events.total - visibleEvents.length);

    return (
        <section className="card content-source-notification" role="status" data-testid="content-source-notification">
            <div className="content-source-notification-header">
                <div>
                    <div className="content-source-notification-title-row">
                        <span className="pill warn">Needs review</span>
                        <h3>Content changes awaiting review</h3>
                    </div>
                    <p className="muted-text">
                        Markdown changes were detected. Review the incoming content in Content Inbox before importing it into SQLite.
                    </p>
                </div>
                <span className="badge warn">
                    {events.total} change{events.total === 1 ? "" : "s"}
                </span>
            </div>

            <ul className="content-source-notification-list">
                {visibleEvents.map((event) => (
                    <li key={event.event_id} data-testid={`content-source-item-${event.event_id}`}>
                        <button
                            type="button"
                            className="content-source-event-button"
                            onClick={() => onOpenEvent(event.event_id)}
                        >
                            <strong>{eventKindLabel(event)} · {formatEntityKey(event.entity_key)}</strong>
                            <span>{event.path}</span>
                        </button>
                        <span className="content-source-event-meta">
                            {event.locale ? `locale: ${event.locale.toUpperCase()}` : event.event_type}
                        </span>
                    </li>
                ))}
            </ul>
            <p className="muted-text content-source-notification-footer">
                {hiddenCount > 0
                    ? `+${hiddenCount} more change${hiddenCount === 1 ? "" : "s"} waiting in Content Inbox.`
                    : "Open Content Inbox to preview and approve the detected changes."}
            </p>
        </section>
    );
}
