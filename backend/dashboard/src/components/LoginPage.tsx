import { useState } from "react";
import type { useAuth } from "../hooks/useAuth";

type AuthHook = ReturnType<typeof useAuth>;

export function LoginPage({ auth }: { auth: AuthHook }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        await auth.login(email, password);
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">
                    <span className="login-icon">🌿</span>
                    <h1>RichFarm Admin</h1>
                    <p className="muted">Sign in to manage plant data</p>
                </div>
                <form onSubmit={(e) => void handleSubmit(e)} className="login-form">
                    {auth.error && <div className="error-banner">{auth.error}</div>}
                    <label>
                        Email
                        <input
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@richfarm.app"
                            required
                        />
                    </label>
                    <label>
                        Password
                        <input
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </label>
                    <button
                        type="submit"
                        className="btn primary full-width"
                        disabled={auth.loading}
                    >
                        {auth.loading ? "Signing in…" : "Sign in"}
                    </button>
                </form>
            </div>
        </div>
    );
}
