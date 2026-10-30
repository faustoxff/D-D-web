import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/auth.store.ts";
import { authFetch } from "./lib/auth.ts";
import { useGameStore } from "./store/game.store.ts";
import LoginPage from "./pages/LoginPage.tsx";
import CharacterPage from "./pages/CharacterPage.tsx";
import ZonePage from "./pages/ZonePage.tsx";
import DevPreviewPage from "./pages/DevPreviewPage.tsx";

// Offline preview (no login / no backend): open /preview in dev mode.
const DEV_PREVIEW =
  import.meta.env.DEV &&
  (import.meta.env.VITE_DEV_PREVIEW === "true" || window.location.pathname === "/preview");

export default function App() {
  return DEV_PREVIEW ? <DevPreviewPage /> : <RealApp />;
}

function RealApp() {
  const { user, loading, initialize } = useAuthStore();
  const { character, characterLoaded, setCharacter, setCharacterLoaded } = useGameStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Fetch character whenever the signed-in user changes
  useEffect(() => {
    if (!user) {
      setCharacterLoaded(true); // not signed in = no character, stop loading
      return;
    }

    authFetch("/api/characters/me")
      .then((r) => {
        if (r.status === 404) {
          setCharacter(null);
          setCharacterLoaded(true);
          return null;
        }
        return r.json();
      })
      .then((data: unknown) => {
        if (data && typeof data === "object" && "id" in data) {
          setCharacter(data as never);
        }
        setCharacterLoaded(true);
      })
      .catch(() => setCharacterLoaded(true));
  }, [user?.id, setCharacter, setCharacterLoaded]);

  if (loading || !characterLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-parchment-400 animate-pulse text-xl">
          Invocando el mundo...
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/create"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : character ? (
            <Navigate to="/" replace />
          ) : (
            <CharacterPage />
          )
        }
      />
      <Route
        path="/"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : !character ? (
            <Navigate to="/create" replace />
          ) : (
            <ZonePage />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
