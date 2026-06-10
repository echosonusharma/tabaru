import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { GreetingWidgetConfig } from '../types';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function GreetingWidget({ config }: { config: GreetingWidgetConfig }) {
  const [greeting, setGreeting] = useState(getGreeting());

  useEffect(() => {
    const id = setInterval(() => setGreeting(getGreeting()), 60_000);
    return () => clearInterval(id);
  }, []);

  const text = config.name.trim()
    ? `${greeting}, ${config.name.trim()}`
    : greeting;

  return <div class="nt-greeting">{text}</div>;
}
