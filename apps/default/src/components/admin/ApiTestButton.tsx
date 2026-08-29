/**
 * ApiTestButton.tsx — one-click live verification for an external API.
 *
 * Sends a single minimal request (through GenesisClient.proxy() for keyed
 * APIs — the key never touches the browser) and surfaces the classified
 * result inline + as a toast. Disabled while a test is in flight or when
 * the API's kill switch is off.
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FlaskConical, Loader2, CheckCircle2, XCircle, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useApiMgmtStore,
  API_BY_ID,
  type ApiId,
  type ApiTestResult,
} from '@/lib/apiStatusService';

interface ApiTestButtonProps {
  apiId: ApiId;
  /** Display name of the acting super admin (for the audit log). */
  actor: string;
  /** Compact = icon-only (used in dense rows). */
  compact?: boolean;
  className?: string;
  onResult?: (result: ApiTestResult) => void;
}

export function ApiTestButton({ apiId, actor, compact = false, className, onResult }: ApiTestButtonProps) {
  const testApi  = useApiMgmtStore(s => s.testApi);
  const testing  = useApiMgmtStore(s => !!s.testing[apiId]);
  const enabled  = useApiMgmtStore(s => s.apis[apiId].enabled);
  const lastTest = useApiMgmtStore(s => s.apis[apiId].lastTest);
  const def = API_BY_ID[apiId];

  const run = async () => {
    if (testing) return;
    const result = await testApi(apiId, actor);
    onResult?.(result);
    if (result.ok) {
      toast.success(`${def.name}: test passed`, {
        description: `${result.status} in ${result.latencyMs}ms — key verified server-side.`,
      });
    } else if (result.health === 'no_key') {
      toast.warning(`${def.name}: no valid key`, { description: result.message });
    } else {
      toast.error(`${def.name}: test failed`, { description: result.message });
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        onClick={run}
        disabled={testing || !enabled}
        title={!enabled ? 'API is disabled — enable it to run a test' : `Send one test request to ${def.name}`}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-xl text-xs font-semibold transition-all border',
          compact ? 'p-2' : 'px-3 py-2',
          testing
            ? 'bg-blue-500/10 border-blue-500/25 text-blue-300 cursor-wait'
            : !enabled
              ? 'bg-white/3 border-white/8 text-white/20 cursor-not-allowed'
              : 'bg-blue-500/10 border-blue-500/25 text-blue-300 hover:bg-blue-500/20 hover:border-blue-500/40 active:scale-[0.97]',
        )}
      >
        {testing
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <FlaskConical className="h-3.5 w-3.5" />}
        {!compact && <span>{testing ? 'Testing…' : 'Test'}</span>}
      </button>

      {/* Inline last-result chip */}
      <AnimatePresence mode="wait">
        {!testing && lastTest && !compact && (
          <motion.span
            key={lastTest.at}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            title={lastTest.message}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono border',
              lastTest.ok
                ? 'bg-green-500/8 border-green-500/20 text-green-400'
                : lastTest.health === 'no_key'
                  ? 'bg-amber-500/8 border-amber-500/20 text-amber-400'
                  : 'bg-red-500/8 border-red-500/20 text-red-400',
            )}
          >
            {lastTest.ok
              ? <CheckCircle2 className="h-3 w-3" />
              : lastTest.health === 'no_key'
                ? <KeyRound className="h-3 w-3" />
                : <XCircle className="h-3 w-3" />}
            {lastTest.status ?? 'ERR'} · {lastTest.latencyMs}ms
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
