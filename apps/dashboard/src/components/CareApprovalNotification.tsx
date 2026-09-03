import type { PendingCareApproval } from "../types";

export function CareApprovalNotification({
    approvals,
    onOpenPlant,
}: {
    approvals: PendingCareApproval[] | null;
    onOpenPlant: (plantId: number) => void;
}) {
    if (!approvals || approvals.length === 0) return null;

    const pendingLocaleCount = approvals.reduce((total, item) => total + item.locales.length, 0);
    return (
        <section className="card care-approval-notification" role="status" data-testid="care-approval-notification">
            <div className="care-approval-notification-header">
                <div>
                    <div className="care-approval-notification-title-row">
                        <span className="pill warn">Needs review</span>
                        <h3>Care content awaiting second approval</h3>
                    </div>
                    <p className="muted-text">
                        Markdown has been imported into SQLite. Review these plants in Plant Detail → Translations before
                        <strong> Publish approved</strong> can send them to Convex.
                    </p>
                </div>
                <span className="badge warn">
                    {approvals.length} plant{approvals.length === 1 ? "" : "s"}
                </span>
            </div>

            <ul className="care-approval-notification-list">
                {approvals.map((item) => (
                    <li key={item.plantId} data-testid={"care-approval-item-" + item.plantId}>
                        <button
                            type="button"
                            className="care-approval-plant-button"
                            onClick={() => onOpenPlant(item.plantId)}
                        >
                            <strong>{item.displayName}</strong>
                            <span>
                                {item.scientificName ?? "Scientific name unavailable"} · {item.plantCode}
                            </span>
                        </button>
                        <span className="care-approval-locales">
                            locale{item.locales.length === 1 ? "" : "s"}: {item.locales.map((locale) => locale.toUpperCase()).join(", ")}
                        </span>
                    </li>
                ))}
            </ul>
            <p className="muted-text care-approval-notification-footer">
                {pendingLocaleCount} locale{pendingLocaleCount === 1 ? "" : "s"} waiting for the second approval.
            </p>
        </section>
    );
}
