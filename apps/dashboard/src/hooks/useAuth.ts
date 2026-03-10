import { useState, useCallback } from "react";
import { apiFetch, API_BASE } from "../constants";

const TOKEN_KEY = "richfarm_dash_token";
const EMAIL_KEY = "richfarm_dash_email";

function loadSaved() {
    try {
        return {
            token: sessionStorage.getItem(TOKEN_KEY) ?? "",
            email: sessionStorage.getItem(EMAIL_KEY) ?? "",
        };
    } catch {
        return { token: "", email: "" };
    }
}

export function useAuth() {
    const saved = loadSaved();
    const [token, setToken] = useState(saved.token);
    const [email, setEmail] = useState(saved.email);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const login = useCallback(async (emailInput: string, password: string): Promise<boolean> => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`${API_BASE}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: emailInput.trim(), password }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? "Login failed");
                return false;
            }
            setToken(data.token);
            setEmail(emailInput.trim());
            sessionStorage.setItem(TOKEN_KEY, data.token);
            sessionStorage.setItem(EMAIL_KEY, emailInput.trim());
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Network error");
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    const logout = useCallback(() => {
        setToken("");
        setEmail("");
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(EMAIL_KEY);
    }, []);

    const authedFetch = useCallback(
        (path: string, options?: RequestInit) => apiFetch(path, { ...options, token }),
        [token],
    );

    return { token, email, loading, error, login, logout, authedFetch, isLoggedIn: Boolean(token) };
}
