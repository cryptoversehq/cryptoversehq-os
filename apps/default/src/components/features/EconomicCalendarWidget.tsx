import { useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Clock, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const EVENTS = [
  { date: 'Jul 3', time: '14:00', title: 'FOMC Meeting Minutes', impact: 'High' as const, description: 'Federal Reserve releases minutes from June policy meeting' },
  { date: 'Jul 5', time: '08:30', title: 'US Non-Farm Payrolls', impact: 'High' as const, description: 'Key employment data affecting USD and risk assets' },
  { date: 'Jul 7', time: '10:00', title: 'Bitcoin ETF Flow Data', impact: 'Medium' as const, description: 'Weekly ETF inflow/outflow report' },
  { date: 'Jul 10', time: '08:30', title: 'US CPI Data (June)', impact: 'High' as const, description: 'Consumer Price Index - key inflation metric' },
  { date: 'Jul 12', time: '16:00', title: 'ETH ETF Decision Deadline', impact: 'High' as const, description: 'SEC ruling on spot Ethereum ETF applications' },
];

const impactColor = { High: 'text-red-400 bg-red-400/10 border-red-400/20', Medium: 'text-amber-400 bg-amber-400/10 border-amber-400/20', Low: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' };

export function EconomicCalendarWidget() {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? EVENTS : EVENTS.slice(0, 3);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-white/5 rounded-2xl overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center"><CalendarDays className="h-4 w-4 text-primary" /></div>
          Economic Calendar
        </h2>
        <button onClick={() => setExpanded(o => !o)} className="text-[10px] text-primary font-semibold flex items-center gap-0.5 hover:text-primary/80 transition-colors">
          {expanded ? 'Collapse' : 'View all'} <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
        </button>
      </div>
      <div className="divide-y divide-white/4">
        {visible.map((event, i) => (
          <div key={i} className="px-5 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
            <div className="w-12 text-center flex-shrink-0">
              <p className="text-xs font-bold text-foreground">{event.date}</p>
              <p className="text-[9px] text-muted-foreground flex items-center justify-center gap-0.5"><Clock className="w-2 h-2" />{event.time}</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{event.title}</p>
              <p className="text-[10px] text-muted-foreground truncate">{event.description}</p>
            </div>
            <span className={impactColor[event.impact] + ' text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0'}>{event.impact}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
function cn(...args: (string | undefined | false)[]) { return args.filter(Boolean).join(' '); }
