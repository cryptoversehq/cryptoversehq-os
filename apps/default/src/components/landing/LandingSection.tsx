import React from 'react';
import { cn } from '@/lib/utils';

interface LandingSectionProps extends React.HTMLAttributes<HTMLElement> {
  id?: string;
  /** Slightly tinted background for alternating sections */
  alt?: boolean;
}

export function LandingSection({ id, alt, className = '', children, ...props }: LandingSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        'relative py-20 lg:py-28 px-4 sm:px-6 lg:px-8',
        alt && 'bg-muted/40',
        className,
      )}
      {...props}
    >
      <div className="max-w-7xl mx-auto">{children}</div>
    </section>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-xs font-bold text-primary uppercase tracking-[0.2em] mb-4">
      {children}
    </span>
  );
}

export function SectionHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn('text-3xl sm:text-4xl lg:text-5xl font-black text-foreground mt-2 mb-4 tracking-tight', className)}>
      {children}
    </h2>
  );
}

export function SectionSubtitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-xl mx-auto text-muted-foreground text-base sm:text-lg leading-relaxed">
      {children}
    </p>
  );
}
