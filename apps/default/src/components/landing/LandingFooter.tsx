import React from 'react';
import { Link } from 'react-router-dom';
import { Twitter, MessageCircle } from 'lucide-react';
import { CryptoVerseLogo } from '../CryptoVerseLogo';

const FOOTER_COLS = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Academy', href: '#learning-journey' },
      { label: 'Simulator', href: '#simulator' },
      { label: 'Competitions', href: '#competitions' },
      { label: 'Pricing', href: '#pricing' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Help Center', href: '/help', route: true },
      { label: 'API Docs', href: '/api-docs', route: true },
      { label: 'Community', href: '/community', route: true },
      { label: 'Blog', href: '/blog', route: true },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about', route: true },
      { label: 'Careers', href: '/careers', route: true },
      { label: 'Contact', href: '/contact', route: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy', route: true },
      { label: 'Terms of Service', href: '/terms', route: true },
      { label: 'Security', href: '/security', route: true },
      { label: 'Status', href: '/status', route: true },
      { label: 'Cookie Policy', href: '/cookie-policy', route: true },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2 sm:col-span-1">
            <Link to="/" className="flex items-center gap-4 mb-4">
              <CryptoVerseLogo size={32} />
              <span className="text-base font-bold text-foreground">CryptoVerse HQ</span>
            </Link>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[180px]">
              Learn crypto through AI guidance, structured lessons, risk-free practice, and friendly competitions—all in one place.
            </p>
          </div>

          {FOOTER_COLS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h4 className="text-xs font-bold text-foreground/60 uppercase tracking-wider mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.route ? (
                      <Link to={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="text-xs text-muted-foreground/70 text-center mb-8">
          Learn responsibly. Practice before trading real markets.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} CryptoVerse HQ. Built for learning.
          </p>
          <div className="flex items-center gap-4">
            <a href="#" aria-label="Twitter" className="text-muted-foreground hover:text-foreground transition-colors">
              <Twitter className="h-4 w-4" />
            </a>
            <a href="#" aria-label="Discord" className="text-muted-foreground hover:text-foreground transition-colors">
              <MessageCircle className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
