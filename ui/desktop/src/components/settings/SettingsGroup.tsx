import React from 'react';
import { cn } from '../../utils';

export function SettingsSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mb-10', className)}>
      {title && <h2 className="text-lg text-text-primary mb-3">{title}</h2>}
      {children}
    </section>
  );
}

export function SettingsGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border-primary bg-background-secondary divide-y divide-border-primary overflow-hidden',
        className
      )}
    >
      {children}
    </div>
  );
}

export function SettingsRow({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-6 px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="text-sm text-text-primary">{title}</h3>
        {description && <p className="text-sm text-text-secondary max-w-xl mt-1">{description}</p>}
      </div>
      {children && <div className="flex items-center shrink-0">{children}</div>}
    </div>
  );
}
