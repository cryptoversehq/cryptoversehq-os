import { useEffect } from 'react';

export function LandingSEO() {
  useEffect(() => {
    document.title = 'CryptoVerse HQ — Learn Crypto Trading with AI | Free Simulator';

    const setMeta = (name: string, content: string, isProperty = false) => {
      const attr = isProperty ? 'property' : 'name';
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('description', 'Master cryptocurrency trading with AI-powered lessons, realistic simulations, and guided practice. Start free — no credit card required. Learn, practice, improve.');

    setMeta('og:title', 'CryptoVerse HQ — Learn Crypto Trading with AI', true);
    setMeta('og:description', 'AI-powered crypto learning platform with simulator, academy, and personal Lynx AI. Start free.', true);
    setMeta('og:type', 'website', true);
    setMeta('og:image', window.location.origin + '/og-image.svg', true);
    setMeta('og:image:width', '1200', true);
    setMeta('og:image:height', '630', true);

    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', 'CryptoVerse HQ — Learn Crypto Trading with AI');
    setMeta('twitter:description', 'AI-powered learning platform with simulator, academy, and Lynx AI. Free to start.');
    setMeta('twitter:image', window.location.origin + '/og-image.svg');

    const existingCanonical = document.querySelector('link[rel="canonical"]');
    if (!existingCanonical) {
      const link = document.createElement('link');
      link.rel = 'canonical';
      link.href = window.location.origin + '/';
      document.head.appendChild(link);
    }
  }, []);

  return null;
}

export function LandingStructuredData() {
  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      name: 'CryptoVerse HQ',
      description: 'AI-powered cryptocurrency trading education platform with simulator, academy, and personal Lynx AI.',
      url: window.location.origin + '/',
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'USD',
        lowPrice: '0',
        highPrice: '40',
      },
    });
    document.head.appendChild(script);
    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, []);

  return null;
}

// ── Reusable SEO helper for public pages ──

export interface PageSEOProps {
  title: string;        // e.g. "About" → sets document.title to "About — CryptoVerse HQ"
  description: string;  // 140–160 char meta description
  path: string;          // e.g. "/about" → canonical + og:url
}

export function PageSEO({ title, description, path }: PageSEOProps) {
  useEffect(() => {
    // Document title
    document.title = `${title} — CryptoVerse HQ`;

    const setMeta = (name: string, content: string, isProperty = false) => {
      const attr = isProperty ? 'property' : 'name';
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    // Meta description
    setMeta('description', description);

    // Open Graph
    const ogImage = window.location.origin + '/og-image.svg';
    setMeta('og:title', `${title} — CryptoVerse HQ`, true);
    setMeta('og:description', description, true);
    setMeta('og:type', 'website', true);
    setMeta('og:url', window.location.origin + path, true);
    setMeta('og:image', ogImage, true);
    setMeta('og:image:width', '1200', true);
    setMeta('og:image:height', '630', true);

    // Twitter
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', `${title} — CryptoVerse HQ`);
    setMeta('twitter:description', description);
    setMeta('twitter:image', ogImage);

    // Canonical
    const existingCanonical = document.querySelector('link[rel="canonical"]');
    if (!existingCanonical) {
      const link = document.createElement('link');
      link.rel = 'canonical';
      link.href = window.location.origin + path;
      document.head.appendChild(link);
    }
  }, [title, description, path]);

  return null;
}
