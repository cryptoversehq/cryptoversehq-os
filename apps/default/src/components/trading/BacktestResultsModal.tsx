import React from 'react';
import { X, BarChart2, AlertTriangle } from 'lucide-react';
import { EquityCurveChart } from '../common/EquityCurveChart';

interface BacktestResults {
  totalTrades?: number; winRate?: number; totalPnl?: number; maxDrawdown?: number;
  profitFactor?: number; avgWin?: number; avgLoss?: number;
  /** Sampled equity curve — added so results can show a visual, not just numbers. */
  equityCurve?: number[];
  /** Optional context shown in the header, e.g. "BTC/USDT · RSI Mean Reversion". */
  subtitle?: string;
}
interface Props { isOpen: boolean; onClose: () => void; results?: BacktestResults | null; }

function formatEquityValue(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' USD';
}

export function BacktestResultsModal({ isOpen, onClose, results }: Props) {
  if (!isOpen) return null;
  const bg = 'hsl(var(--card))';
  const fg = 'hsl(var(--card-foreground))';
  const muted = 'hsl(var(--muted-foreground))';
  const sec = 'hsl(var(--secondary))';
  const green = 'var(--cv-dash-green)';
  const red = 'var(--cv-dash-red)';
  if (!results) {
    return (<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={onClose}>
      <div style={{background:bg,color:fg,borderRadius:12,padding:24,maxWidth:500,width:'90%'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}><h3 style={{fontSize:18,margin:0}}>📊 Backtest Results</h3><button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:muted}}><X size={18}/></button></div>
        <p style={{textAlign:'center',color:muted,padding:'24px 0'}}><AlertTriangle size={32} style={{marginBottom:8,opacity:0.5}}/><br/>No backtest results. Run a strategy first.</p>
        <button onClick={onClose} style={{width:'100%',padding:10,background:'hsl(var(--primary))',color:'hsl(var(--primary-foreground))',border:'none',borderRadius:8,cursor:'pointer',fontWeight:600}}>Close</button>
      </div></div>);
  }
  const pnlPos = (results.totalPnl ?? 0) >= 0;
  const wrGood = (results.winRate ?? 0) >= 50;
  const metrics = [
    {v:(results.totalTrades ?? 0).toString(),l:'Total Trades'},
    {v:(results.winRate ?? 0).toFixed(1)+'%',l:'Win Rate',c:wrGood?green:red},
    {v:(pnlPos?'+':'')+'$'+(results.totalPnl ?? 0).toFixed(2),l:'Total P&L',c:pnlPos?green:red},
    {v:(results.maxDrawdown ?? 0).toFixed(1)+'%',l:'Max Drawdown',c:red},
    {v:results.profitFactor?results.profitFactor.toFixed(2):'—',l:'Profit Factor',c:(results.profitFactor??0)>=1.5?green:red},
    {v:'$'+(results.avgWin??0).toFixed(2),l:'Avg Win',c:green},
    {v:'-$'+Math.abs(results.avgLoss??0).toFixed(2),l:'Avg Loss',c:red},
  ];
  return (<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={onClose}>
    <div style={{background:bg,color:fg,borderRadius:12,padding:24,maxWidth:650,width:'90%',maxHeight:'80vh',overflow:'auto'}} onClick={e=>e.stopPropagation()}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h3 style={{fontSize:18,margin:0,display:'flex',alignItems:'center',gap:8}}><BarChart2 size={20} style={{color:'hsl(var(--primary))'}}/>Backtest Results</h3>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:muted}}><X size={18}/></button>
      </div>
      {results.subtitle && <p style={{fontSize:11,color:muted,marginTop:-8,marginBottom:14}}>{results.subtitle}</p>}
      {results.equityCurve && results.equityCurve.length > 1 && (
        <div style={{marginBottom:16}}>
          <EquityCurveChart points={results.equityCurve} height={100} formatValue={formatEquityValue} />
        </div>
      )}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))',gap:12,marginBottom:16}}>
        {metrics.map(({v,l,c}) => (<div key={l} style={{padding:12,background:sec,borderRadius:8,textAlign:'center'}}><div style={{fontSize:11,color:muted,marginBottom:4}}>{l}</div><div style={{fontSize:18,fontWeight:700,color:c??fg}}>{v}</div></div>))}
      </div>
      <p style={{fontSize:10,color:muted,marginBottom:12,lineHeight:1.5}}>
        Backtests run against real historical candles where available (CoinGecko), falling back to a simulated series if unavailable. Past performance does not guarantee future results.
      </p>
      <button onClick={onClose} style={{width:'100%',padding:10,background:'hsl(var(--primary))',color:'hsl(var(--primary-foreground))',border:'none',borderRadius:8,cursor:'pointer',fontWeight:600}}>Close</button>
    </div></div>);
}