import { useState } from "react";
import type { PageKey } from "../types";

const NAV_ITEMS: { key: PageKey; label: string; icon: string }[] = [
    { key: "plants", label: "Plants", icon: "🌱" },
    { key: "groups", label: "Groups", icon: "📂" },
    { key: "photos", label: "Photos", icon: "📸" },
];

export function Sidebar({
    activePage,
    onNavigate,
    email,
    onLogout,
}: {
    activePage: PageKey;
    onNavigate: (page: PageKey) => void;
    email?: string;
    onLogout?: () => void;
}) {
    const [collapsed, setCollapsed] = useState(true);

    return (
        <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}`}>
            <div className="sidebar-brand">
                <span className="sidebar-logo">🌿</span>
                {!collapsed && (
                    <div>
                        <h1 className="sidebar-title">RichFarm</h1>
                        <p className="sidebar-subtitle">Admin Dashboard</p>
                    </div>
                )}
            </div>

            <nav className="sidebar-nav">
                {!collapsed && <p className="sidebar-section-label">Management</p>}
                {NAV_ITEMS.map((item) => (
                    <button
                        key={item.key}
                        className={`sidebar-link ${activePage === item.key ? "active" : ""}`}
                        onClick={() => onNavigate(item.key)}
                        title={collapsed ? item.label : undefined}
                        type="button"
                    >
                        <span className="sidebar-link-icon">{item.icon}</span>
                        {!collapsed && <span>{item.label}</span>}
                    </button>
                ))}
            </nav>

            <div className="sidebar-footer">
                {!collapsed && email && (
                    <p className="sidebar-user">{email}</p>
                )}
                {!collapsed && onLogout && (
                    <button className="btn ghost sidebar-logout" onClick={onLogout} type="button">
                        Sign out
                    </button>
                )}
                <button
                    className="sidebar-collapse-btn"
                    onClick={() => setCollapsed((c) => !c)}
                    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    type="button"
                >
                    {collapsed ? "▶" : "◀"}
                </button>
            </div>
        </aside>
    );
}
