import type { PageKey } from "../types";

const NAV_ITEMS: { key: PageKey; label: string; icon: string }[] = [
    { key: "plants", label: "Plants", icon: "🌱" },
    { key: "groups", label: "Groups", icon: "📂" },
    { key: "photos", label: "Photos", icon: "📸" },
];

export function Sidebar({
    activePage,
    onNavigate,
}: {
    activePage: PageKey;
    onNavigate: (page: PageKey) => void;
}) {
    return (
        <aside className="sidebar">
            <div className="sidebar-brand">
                <span className="sidebar-logo">🌿</span>
                <div>
                    <h1 className="sidebar-title">RichFarm</h1>
                    <p className="sidebar-subtitle">Admin Dashboard</p>
                </div>
            </div>

            <nav className="sidebar-nav">
                <p className="sidebar-section-label">Management</p>
                {NAV_ITEMS.map((item) => (
                    <button
                        key={item.key}
                        className={`sidebar-link ${activePage === item.key ? "active" : ""}`}
                        onClick={() => onNavigate(item.key)}
                        type="button"
                    >
                        <span className="sidebar-link-icon">{item.icon}</span>
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>

            <div className="sidebar-footer">
                <p className="sidebar-footer-text">
                    RichFarm Dashboard v1.0
                </p>
            </div>
        </aside>
    );
}
