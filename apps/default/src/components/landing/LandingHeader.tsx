import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Sparkles } from 'lucide-react';
import { CryptoVerseLogo } from '../CryptoVerseLogo';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Features', href: '#features' },
  { label: 'Academy', href: '#learning-journey' },
  { label: 'Competitions', href: '#competitions' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
  { label: 'About', href: '/about', route: true },
];

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const isAboutPage = location.pathname === '/about';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isNavActive = (item: typeof NAV_ITEMS[number]) => {
    if (item.route) {
      return location.pathname === item.href;
    }
    // Anchor links are only active on the Landing page (not on /about)
    if (isAboutPage) return false;
    return false; // Anchor active state handled by scroll observer elsewhere
  };

  return (
    <header
      className={cn(
        'fixed top-0 inset-x-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-background/85 backdrop-blur-xl border-b border-border shadow-sm'
          : 'bg-transparent',
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
        <Link to="/" className="flex items-center gap-4 group shrink-0">
          <CryptoVerseLogo size={36} />
          <span className="text-lg font-bold tracking-tight text-foreground">
            CryptoVerse HQ{' '}
            <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium inline-flex items-center gap-0.5 border border-amber-500/15">
              <Sparkles className="h-2 w-2" /> AI
            </span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isNavActive(item);
            if (item.route) {
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'px-4 py-2 text-sm rounded-lg transition-colors',
                    active
                      ? 'text-foreground font-medium bg-accent'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                >
                  {item.label}
                </Link>
              );
            }
            return (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  'px-4 py-2 text-sm rounded-lg transition-colors',
                  active
                    ? 'text-foreground font-medium bg-accent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          <Link
            to="/login"
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign In
          </Link>
          <Link
            to="/signup"
            className="px-5 py-2.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-sm"
          >
            Start Learning Free
          </Link>
        </div>

        <button
          className="lg:hidden p-2 text-foreground hover:text-primary transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden bg-background/98 backdrop-blur-xl border-b border-border px-4 pb-6 pt-2">
          {NAV_ITEMS.map((item) =>
            item.route ? (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'block py-3 text-sm transition-colors',
                  isNavActive(item)
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'block py-3 text-sm transition-colors',
                  isNavActive(item)
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </a>
            )
          )}
          <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-border">
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="w-full py-3 text-center text-sm font-medium rounded-xl border border-border hover:bg-accent transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              onClick={() => setMobileOpen(false)}
              className="w-full py-3 text-center text-sm font-semibold text-primary-foreground bg-primary rounded-xl transition-all"
            >
              Start Learning Free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
