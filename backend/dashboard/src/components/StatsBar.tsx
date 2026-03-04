export function StatsBar({
    stats,
    groupCount,
}: {
    stats: { total: number; missingI18n: number; missingImages: number };
    groupCount: number;
}) {
    const cards = [
        {
            label: "Total Plants",
            value: stats.total,
            icon: "🌱",
            color: "var(--color-teal)",
        },
        {
            label: "Missing i18n",
            value: stats.missingI18n,
            icon: "🌐",
            color: stats.missingI18n > 0 ? "var(--color-amber)" : "var(--color-green)",
        },
        {
            label: "Missing Images",
            value: stats.missingImages,
            icon: "🖼️",
            color: stats.missingImages > 0 ? "var(--color-red)" : "var(--color-green)",
        },
        {
            label: "Plant Groups",
            value: groupCount,
            icon: "📂",
            color: "var(--color-blue)",
        },
    ];

    return (
        <div className="stats-bar">
            {cards.map((card) => (
                <div key={card.label} className="stat-card">
                    <div className="stat-card-icon" style={{ background: card.color }}>
                        {card.icon}
                    </div>
                    <div className="stat-card-body">
                        <span className="stat-card-value">{card.value}</span>
                        <span className="stat-card-label">{card.label}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}
