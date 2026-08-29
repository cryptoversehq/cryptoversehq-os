import React from 'react';
import { Trophy, Clock, Users, BarChart2 } from 'lucide-react';

export interface CompetitionRulesData {
  scoringFormula: string;
  duration: string;
  prizePool: number | string;
  participants: number;
  maxParticipants: number;
}

export function CompetitionRules({ competition }: { competition: CompetitionRulesData }) {
  return (
    <div className="competition-rules rounded-2xl border border-border bg-card p-5 space-y-3 shadow-sm">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <span className="text-lg">📋</span>
        <h4 className="text-sm font-bold text-foreground">Competition Rules</h4>
      </div>
      <ul className="space-y-2 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <BarChart2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <span><strong>Scoring:</strong> {competition.scoringFormula}</span>
        </li>
        <li className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span><strong>Duration:</strong> {competition.duration}</span>
        </li>
        <li className="flex items-center gap-2">
          <Trophy className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span><strong>Prize Pool:</strong> {typeof competition.prizePool === 'number' ? `${competition.prizePool.toLocaleString()} CP` : competition.prizePool}</span>
        </li>
        <li className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span><strong>Participants:</strong> {competition.participants} / {competition.maxParticipants}</span>
        </li>
      </ul>
    </div>
  );
}
