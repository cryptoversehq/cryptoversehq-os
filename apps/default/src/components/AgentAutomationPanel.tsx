import type { ReactNode } from 'react';
import { Bot, BrainCircuit, CircleCheck, ExternalLink, GitBranch, MailCheck, Wrench } from 'lucide-react';

const AGENTS = [
  {
    name: 'AI Assistant',
    description: 'Navigate CryptoVerse and explain the workspace.',
    publicId: '01KZ4MPA7QSFHNR4KWZT74EKC7',
    icon: Bot,
  },
  {
    name: 'Data Analyst',
    description: 'Review reports, payments, tickets, and user trends.',
    publicId: '01KZZX54572M9KHCJ9ZSCVCP36',
    icon: BrainCircuit,
  },
  {
    name: 'Operations Operator',
    description: 'Inspect and update operational records safely.',
    publicId: '01KZZX5459ECRNXBJCR3RG3KEN',
    icon: Wrench,
  },
] as const;

const FLOWS = [
  {
    name: 'Support ticket routing',
    detail: 'AI status + owner email',
    flowId: '01KZ4MV4YG6F2GAGBCEGGAF5DE',
    icon: GitBranch,
  },
  {
    name: 'Weekly Nations digest',
    detail: 'Scheduled report delivery',
    flowId: '01KXRB0HQX9DTWH3D4ZTDYM408',
    icon: MailCheck,
  },
  {
    name: 'Payment reminders',
    detail: '15-minute delayed email',
    flowId: '01KWRC9HNAAY064SF0D4D6DEN6',
    icon: CircleCheck,
  },
] as const;

function HostedAgentLink({ publicId, children }: { publicId: string; children: ReactNode }) {
  return (
    <a
      href={`/a/${publicId}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

function FlowLink({ flowId, children }: { flowId: string; children: ReactNode }) {
  return (
    <a
      href={`https://www.taskade.com/flows/${flowId}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

export function AgentAutomationPanel() {
  return (
    <section className="bg-card border border-border rounded-2xl p-5" aria-labelledby="agent-automation-title">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Workspace control room</p>
          <h2 id="agent-automation-title" className="mt-1 text-lg font-bold text-foreground">Agents & automations</h2>
          <p className="mt-1 text-xs text-muted-foreground">Your connected intelligence and background reflexes.</p>
        </div>
        <span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-400 sm:mt-0">
          <CircleCheck className="h-3 w-3" aria-hidden="true" /> Connected
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Bot className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Ask an agent
          </div>
          <div className="divide-y divide-border rounded-xl border border-border bg-secondary/10">
            {AGENTS.map(({ name, description, publicId, icon: Icon }) => (
              <div key={publicId} className="flex items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                    <p className="line-clamp-2 text-[11px] text-muted-foreground">{description}</p>
                  </div>
                </div>
                <HostedAgentLink publicId={publicId}>Open</HostedAgentLink>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Running reflexes
          </div>
          <div className="divide-y divide-border rounded-xl border border-border bg-secondary/10">
            {FLOWS.map(({ name, detail, flowId, icon: Icon }) => (
              <div key={flowId} className="flex items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10">
                    <Icon className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{detail}</p>
                  </div>
                </div>
                <FlowLink flowId={flowId}>View</FlowLink>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
