/**
 * AdminStrategies.tsx — /admin/strategies (Batch D6)
 *
 * The Strategy Marketplace moderation workflow, moved into the portal so it is reachable
 * without the legacy Profile admin drawer (which was deleted, along with its
 * AdminStrategyManagement tab).
 *
 * WHY THIS IS A THIN PAGE AROUND THE EXISTING COMPONENT rather than a file-for-file copy:
 * `AdminStrategyManagement` is ~356 lines of working UI and a UNIQUE feature — pending
 * approvals, flagged strategies with remove/warn/ignore, and platform statistics. There is no
 * other page covering it (the portal has no strategies route until this one). Relocating it
 * would mean re-emitting every line through the tool that writes the VFS, where a single
 * transcription slip breaks a feature nothing else replaces. The page below gives the workflow
 * its portal home now; the physical relocation is a mechanical rename best done in a pass whose
 * build result is checked immediately.
 */
import { ShoppingBag } from 'lucide-react';
import { AdminStrategyManagement } from '../../../admin/AdminStrategyManagement';

export function AdminStrategies() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5 text-white">
      {/* Header — same shape as the other portal pages */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <ShoppingBag className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-lg font-black text-white flex items-center gap-2">
            Strategies
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/25 text-amber-400 tracking-wide">
              MARKETPLACE
            </span>
          </h1>
          <p className="text-[11px] text-white/35">
            Pending approvals, flagged strategies and platform performance.
          </p>
        </div>
      </div>

      <AdminStrategyManagement />
    </div>
  );
}

export default AdminStrategies;
