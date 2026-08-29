import { Link } from 'react-router-dom';
import { SearchX, Home } from 'lucide-react';

/**
 * 404 — shown for any authenticated route that doesn't match a known page.
 * Also used as the landing spot for legacy/guessable path aliases that get
 * redirected elsewhere (see App.tsx: /settings, /onchain, /competitions).
 * Uses the app's theme-aware CSS-variable classes (bg-primary, text-foreground,
 * text-muted-foreground, etc.) so it renders correctly in both Light and Dark
 * Mode — no hardcoded colors.
 */
export function NotFound() {
  return (
    <div className="w-full max-w-sm mx-auto text-center space-y-6 rounded-3xl border border-border p-8 bg-card">
      <div className="flex justify-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          <SearchX className="h-10 w-10 text-primary" />
        </div>
      </div>
      <div className="space-y-2">
        <h1 className="text-4xl font-black text-foreground">404</h1>
        <h2 className="text-lg font-bold text-foreground/80">The requested page was not found</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The path you entered does not exist.
        </p>
      </div>
      <Link
        to="/"
        className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
      >
        <Home className="h-4 w-4" /> Return to home page
      </Link>
    </div>
  );
}
