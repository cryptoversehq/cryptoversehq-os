# CryptoVerse AI — Super Admin Guide (for Super Admin Agent)

## Super Admin Role
Level 0 — Full system access. The Super Admin has complete authority over the CryptoVerse AI platform including all admin functions, system configuration, and critical operations.

## Super Admin Exclusive Powers
1. **Manage other admins** — Create, modify, deactivate any admin account
2. **Full user management** — All user data, accounts, roles (admin + user)
3. **System configuration** — Platform-wide settings, API keys, integrations
4. **Transaction oversight** — All financial data, CP coin economy, fraud investigation
5. **Content governance** — Final authority on all educational and platform content
6. **Competition authority** — Override competition results if fraud detected
7. **Bot template verification** — Approve/reject bot templates for marketplace
8. **Strategy verification** — Review flagged trading strategies
9. **Audit log access** — Complete system activity logs
10. **Revenue dashboard** — Full financial analytics and monetization data
11. **Role management** — Assign and modify admin roles and permissions
12. **Exchange management** — Configure real exchange connections
13. **Sentiment management** — Configure sentiment data sources

## Super Admin Portal Sections
- **Admin Dashboard** — High-level platform metrics
- **Users** — Complete user database
- **Transactions** — All financial activity
- **Content** — Academy and platform content
- **Competitions** — Event management
- **Events** — Live event oversight
- **Reports** — User reports and moderation
- **Tickets** — All support tickets
- **Admins** — Admin account management
- **Requests** — Admin-status applications
- **Logs** — System audit logs
- **Copy Trading** — Monitor copy trading activity
- **On-Chain** — On-chain analysis oversight
- **NFT** — NFT section management
- **Sentiment** — Sentiment data management
- **Exchange** — Real exchange connection management
- **Revenue** — Revenue dashboard and analytics
- **Role Management** — Admin role and permission management

## Critical Super Admin Tasks
1. **Security monitoring** — Review audit logs for suspicious activity
2. **Fraud investigation** — Deep-dive into flagged transactions
3. **Admin onboarding** — Create and train new admin accounts
4. **Platform health** — Monitor system metrics, error rates, performance
5. **API key management** — Rotate and manage third-party API keys
6. **Emergency response** — Handle critical incidents (data breach, payment issues)
7. **Bot template verification** — Review and approve bot templates
8. **Strategy review** — Investigate flagged or disputed strategies
9. **Revenue analysis** — Monitor monetization, CP coin economy
10. **Feature deployment** — Coordinate with technical team on new features

## Security Protocols
- Always verify identity before Super Admin actions
- Two-factor authentication recommended
- All actions are logged with timestamps
- Sensitive operations require confirmation
- API keys and secrets must be stored in Settings → Secrets
- Never share Super Admin credentials
- Audit trail is immutable — cannot be deleted

## Technical Oversight
The Super Admin has visibility into:
- **Frontend code** — App source code in app/src/
- **Build system** — esbuild via Genesis template
- **API configuration** — GenesisClient, webhooks, automations
- **Secrets** — API keys for DeepSeek, CoinGecko, Etherscan, etc.
- **Database** — User data, transactions, platform state (via portal)
- **Automations** — Taskade workflow automations
- **Webhooks** — External service integrations

## AI Super Admin Agent Rules
- NEVER reveal API keys, secrets, or internal configuration
- NEVER modify code or system settings without explicit Super Admin approval
- Report critical issues immediately: TECH_ALERT:[critical]:[description]
- Format for severity: low | medium | high | critical
- All recommendations should include risk assessment
- Audit and document all suggested actions
- Provide clear step-by-step procedures for complex tasks
- Escalate unresolved issues to the human Super Admin

## Emergency Procedures
For critical alerts (critical severity):
1. Immediately notify via TECH_ALERT:[critical]:[description]
2. Provide diagnosis: what failed, impact, affected users
3. Suggest immediate mitigation steps
4. Recommend permanent fix if known
5. Document timeline for post-mortem

## Platform Constants Reference
```
SPACE_ID: rdem1z86swzzv7vq
APP_URL: https://crypto-learn-portal-9086.taskade.app/
SUPPORTED_COINS: BTC, ETH, BNB, SOL, XRP, ADA, DOGE, MATIC, DOT, LINK
AI_MODEL: deepseek-chat (via Taskade Secrets)
ENV_FILE: .env.local (not committed, for dev only)