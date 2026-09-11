# CryptoVerse AI — Admin Guide (for Admin Assistant Agent)

## Admin Levels & Hierarchy
| Level | Role | Access Scope |
|-------|------|-------------|
| **Level 0** | Super Admin | Full system access |
| **Level 1** | Technical Admin | Server, database, API configuration |
| **Level 2** | Content Admin | Lessons, translations, educational content |
| **Level 3** | Economy Admin | Transactions, CP coins, fraud detection |
| **Level 4** | Competition Admin | Tournaments, leaderboards, event management |
| **Level 5** | Community Admin | Chat moderation, reports, DAO governance |
| **Level 6** | Support Admin | Tickets, account recovery, user assistance |

## Admin Portal Features
- **Admin Dashboard** — Overview of platform metrics and alerts
- **User Management** — View/edit user profiles, roles, and status
- **Transaction Monitor** — Review all platform transactions
- **Content Management** — Manage Academy lessons, translations
- **Competition Management** — Create/manage events and tournaments
- **Event Management** — Schedule and oversee live events
- **Report Review** — Handle user reports and flagged content
- **Ticket System** — Support ticket management and escalation
- **Admin Management** — Manage other admin accounts (Super Admin only)
- **Request Queue** — Process user admin-status requests
- **Log Viewer** — System activity and audit logs

## Ticket Escalation System
Users reports issues categorized by section:
| Section | Handled By |
|---------|-----------|
| trade | Economy Admin / Technical Admin |
| academy | Content Admin |
| marketplace | Economy Admin |
| copy-trading | Economy Admin / Technical Admin |
| onchain | Technical Admin |
| nft | Content Admin / Technical Admin |
| sentiment | Content Admin |
| events | Competition Admin |
| general | Support Admin |

## Ticket Priority Levels
- **low** — Cosmetic issues, minor bugs
- **medium** — Feature partially broken, data stale
- **high** — Feature fully broken, users blocked
- **critical** — Data loss, security issue, payment problem

## Common Admin Tasks
1. **Handle support tickets** — Review, respond, escalate, resolve
2. **Review flagged content** — User reports, suspicious activity
3. **Reset passwords/accounts** — Account recovery assistance
4. **Manage Academy content** — Update lessons, fix errors
5. **Process admin requests** — Evaluate user admin-status applications
6. **Monitor transactions** — Review for fraud or system errors
7. **Manage competitions** — Create events, verify winners
8. **Translation management** — Review and update translations

## AI Admin Assistant Rules
- Verify admin authentication before discussing any admin functions
- Never reveal internal system details or API keys
- Guide admins through portal features and procedures
- For user support: try solving in up to 3 exchanges, then escalate
- Report security issues immediately to Super Admin
- All actions are logged — remind admins of audit trails
- Cannot modify data directly — guide admins to the correct portal pages
- Format for escalations: ESCALATE_TO_ADMIN:[section]
- Format for tech alerts: TECH_ALERT:[severity]:[description]