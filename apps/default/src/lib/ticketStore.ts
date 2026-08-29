/**
 * ticketStore.ts
 * Live support ticket system backed by Taskade project xEbVr5jGY28mkLb6
 * Sections: trade | academy | marketplace | copy-trading | onchain | nft | sentiment | events | general
 */

const TICKETS_PROJECT = 'xEbVr5jGY28mkLb6';
import { cloudDataLayer } from './cloudData';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TicketSection =
  | 'trade' | 'academy' | 'marketplace' | 'copy-trading'
  | 'onchain' | 'nft' | 'sentiment' | 'events' | 'general';

export type TicketStatus =
  | 'open' | 'ai_handling' | 'admin_handling' | 'resolved' | 'closed';

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Ticket {
  nodeId:        string;
  userEmail:     string;
  userName:      string;
  section:       TicketSection;
  title:         string;
  description:   string;
  status:        TicketStatus;
  priority:      TicketPriority;
  rating?:       number;          // 1-5 stars, set when closed
  aiResponse?:   string;
  adminResponse?: string;
  adminId?:      string;
  createdAt:     string;
  updatedAt:     string;
}

// ─── Field maps ───────────────────────────────────────────────────────────────

const STATUS_TO_OPTION: Record<TicketStatus, string> = {
  open:           'tk_open',
  ai_handling:    'tk_ai',
  admin_handling: 'tk_admin',
  resolved:       'tk_resolved',
  closed:         'tk_closed',
};
const OPTION_TO_STATUS: Record<string, TicketStatus> = Object.fromEntries(
  Object.entries(STATUS_TO_OPTION).map(([k, v]) => [v, k as TicketStatus]),
);

const PRIO_TO_OPTION: Record<TicketPriority, string> = {
  low:      'tk_low',
  medium:   'tk_medium',
  high:     'tk_high',
  critical: 'tk_critical',
};
const OPTION_TO_PRIO: Record<string, TicketPriority> = Object.fromEntries(
  Object.entries(PRIO_TO_OPTION).map(([k, v]) => [v, k as TicketPriority]),
);

// ─── CloudDataLayer compatibility helpers ────────────────────────────────────

async function projectNodes(): Promise<{ payload: { nodes: Record<string, unknown>[] } }> {
  return { payload: { nodes: await cloudDataLayer.projectNodes(TICKETS_PROJECT) } };
}

function parseNode(node: any): Ticket {
  const f = node.fieldValues ?? {};
  return {
    nodeId:        node.id,
    userEmail:     f['/attributes/@tk_uid']    ?? '',
    userName:      f['/attributes/@tk_uname']  ?? '',
    section:       (f['/attributes/@tk_sect']  ?? 'general') as TicketSection,
    title:         f['/attributes/@tk_title']  ?? f['/text'] ?? '',
    description:   f['/attributes/@tk_desc']   ?? '',
    status:        OPTION_TO_STATUS[f['/attributes/@tk_status']] ?? 'open',
    priority:      OPTION_TO_PRIO[f['/attributes/@tk_prio']]    ?? 'medium',
    rating:        f['/attributes/@tk_rating'] ? Number(f['/attributes/@tk_rating']) : undefined,
    aiResponse:    f['/attributes/@tk_airesp'] ?? '',
    adminResponse: f['/attributes/@tk_adresp'] ?? '',
    adminId:       f['/attributes/@tk_adminid'] ?? '',
    createdAt:     f['/attributes/@tk_cat']    ?? new Date().toISOString(),
    updatedAt:     f['/attributes/@tk_uat']    ?? new Date().toISOString(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Fetch all tickets */
export async function fetchTickets(): Promise<Ticket[]> {
  const data  = await projectNodes();
  const nodes = data?.payload?.nodes ?? [];
  return (nodes as any[]).map(parseNode).filter((t: Ticket) => t.userEmail);
}

/** Fetch tickets for a specific user */
export async function fetchUserTickets(userEmail: string): Promise<Ticket[]> {
  const all = await fetchTickets();
  return all.filter(t => t.userEmail.toLowerCase() === userEmail.toLowerCase());
}

/** Fetch tickets for a specific section (for section admins) */
export async function fetchSectionTickets(section: TicketSection): Promise<Ticket[]> {
  const all = await fetchTickets();
  return all.filter(t => t.section === section);
}

/** Create a new ticket (returns nodeId) */
export async function createTicket(params: {
  userEmail: string;
  userName:  string;
  section:   TicketSection;
  title:     string;
  description: string;
  priority?:  TicketPriority;
}): Promise<string> {
  const now = new Date().toISOString();
  const res: any = await cloudDataLayer.createProjectNode(TICKETS_PROJECT, {
    '/text':                      params.title,
    '/attributes/@tk_uid':        params.userEmail,
    '/attributes/@tk_uname':      params.userName,
    '/attributes/@tk_sect':       params.section,
    '/attributes/@tk_title':      params.title,
    '/attributes/@tk_desc':       params.description,
    '/attributes/@tk_status':     STATUS_TO_OPTION['open'],
    '/attributes/@tk_prio':       PRIO_TO_OPTION[params.priority ?? 'medium'],
    '/attributes/@tk_cat':        now,
    '/attributes/@tk_uat':        now,
  });
  return res?.payload?.node?.id ?? res?.payload?.id ?? '';
}

/** Patch arbitrary fields on a ticket */
async function patchTicket(nodeId: string, fields: Record<string, any>): Promise<void> {
  await cloudDataLayer.updateProjectNode(TICKETS_PROJECT, nodeId, {
    ...fields,
    '/attributes/@tk_uat': new Date().toISOString(),
  });
}

/** Set AI response and move ticket to admin if unresolved */
export async function setAiResponse(nodeId: string, aiResponse: string, resolved: boolean): Promise<void> {
  await patchTicket(nodeId, {
    '/attributes/@tk_airesp':  aiResponse,
    '/attributes/@tk_status':  STATUS_TO_OPTION[resolved ? 'resolved' : 'admin_handling'],
  });
}

/** Admin responds to a ticket */
export async function adminRespond(nodeId: string, adminId: string, response: string): Promise<void> {
  await patchTicket(nodeId, {
    '/attributes/@tk_adresp':  response,
    '/attributes/@tk_adminid': adminId,
    '/attributes/@tk_status':  STATUS_TO_OPTION['resolved'],
  });
}

/** User closes ticket and optionally rates it (1-5) */
export async function closeTicket(nodeId: string, rating?: number): Promise<void> {
  const fields: Record<string, any> = {
    '/attributes/@tk_status': STATUS_TO_OPTION['closed'],
  };
  if (rating !== undefined) {
    fields['/attributes/@tk_rating'] = rating;
  }
  await patchTicket(nodeId, fields);
}

/** Update ticket status directly */
export async function updateTicketStatus(nodeId: string, status: TicketStatus): Promise<void> {
  await patchTicket(nodeId, {
    '/attributes/@tk_status': STATUS_TO_OPTION[status],
  });
}

/** Update ticket priority */
export async function updateTicketPriority(nodeId: string, priority: TicketPriority): Promise<void> {
  await patchTicket(nodeId, {
    '/attributes/@tk_prio': PRIO_TO_OPTION[priority],
  });
}

/** Get admin performance stats for a given adminId */
export async function getAdminTicketStats(adminId: string): Promise<{
  totalHandled: number;
  closedCount:  number;
  avgRating:    number;
}> {
  const all     = await fetchTickets();
  const mine    = all.filter(t => t.adminId === adminId);
  const closed  = mine.filter(t => t.status === 'closed');
  const rated   = closed.filter(t => t.rating !== undefined);
  const avgRating = rated.length > 0
    ? rated.reduce((s, t) => s + (t.rating ?? 0), 0) / rated.length
    : 0;
  return {
    totalHandled: mine.length,
    closedCount:  closed.length,
    avgRating:    Math.round(avgRating * 10) / 10,
  };
}
