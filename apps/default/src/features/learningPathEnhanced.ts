/**
 * learningPathEnhanced.ts — CryptoVerse HQ Enhanced Learning Path
 * Questionnaire, adaptive difficulty, badges, reminders, progress tracking.
 */
import { deepSeekAsk } from '@/lib/deepSeekClient';
import { useAcademyStore } from '@/lib/academyStore';

export interface Questionnaire {
  level: 'beginner'|'intermediate'|'advanced';
  goals: string; interests: string; hoursPerWeek: '1-2'|'3-5'|'6+';
}

export interface PathStep {
  id: string; module: string; lesson: string;
  priority: number; estimatedMinutes: number;
  completed: boolean; badge: string;
}

const KEY = 'cv_learning_path';
const QUIZ_KEY = 'cv_learning_quiz';

export function saveQuestionnaire(q: Questionnaire): void {
  try { localStorage.setItem(QUIZ_KEY,JSON.stringify(q)); } catch {}
}
export function getQuestionnaire(): Questionnaire|null {
  try { return JSON.parse(localStorage.getItem(QUIZ_KEY)||'null'); } catch { return null; }
}

export async function generatePath(q: Questionnaire): Promise<PathStep[]> {
  const completed = [...(useAcademyStore.getState().completedLessons||[])];
  const fallback: PathStep[] = [
    {id:'l1',module:'Blockchain Basics',lesson:'What is Blockchain?',priority:1,estimatedMinutes:15,completed:completed.includes('l1'),badge:'🌱'},
    {id:'l5',module:'Market Analysis',lesson:'Technical Analysis Fundamentals',priority:2,estimatedMinutes:20,completed:completed.includes('l5'),badge:'📊'},
    {id:'l9',module:'Risk Management',lesson:'Position Sizing',priority:3,estimatedMinutes:15,completed:completed.includes('l9'),badge:'🛡'},
    {id:'l13',module:'DeFi',lesson:'What is DeFi?',priority:4,estimatedMinutes:20,completed:completed.includes('l13'),badge:'🔗'},
    {id:'l17',module:'On-Chain',lesson:'Reading Blockchain Explorers',priority:5,estimatedMinutes:15,completed:completed.includes('l17'),badge:'⛓'},
  ];

  try {
    const r = await deepSeekAsk(`Student: level ${q.level}, goals: ${q.goals}, interests: ${q.interests}, hours: ${q.hoursPerWeek}h, completed: [${completed}]. Create 5-lesson learning path. JSON: [{"id":"l#","module":"...","lesson":"...","priority":N,"estimatedMinutes":N,"badge":"emoji"}]. Only JSON.`);
    const j = JSON.parse(r.replace(/```json\n?/g,'').replace(/\n?```/g,'').trim());
    return j.map((x:PathStep,i:number)=>({...x,completed:completed.includes(x.id),estimatedMinutes:x.estimatedMinutes||fallback[i]?.estimatedMinutes||15}));
  } catch { return fallback.filter(f=>!f.completed); }
}

export function savePath(path: PathStep[]): void {
  try { localStorage.setItem(KEY,JSON.stringify(path)); } catch {}
}
export function loadPath(): PathStep[]{ try { return JSON.parse(localStorage.getItem(KEY)||'[]'); } catch { return []; }}

export function getProgress(path: PathStep[]): {done:number;total:number;pct:number;message:string} {
  const done = path.filter(p=>p.completed).length;
  const total = path.length;
  const pct = total>0?Math.round((done/total)*100):0;
  let msg = `${done}/${total} steps done (${pct}%)`;
  if (pct===100) msg = 'Path complete! Great work!';
  else if (pct>=60) msg = `You're ${pct}% through. Only ${total-done} lessons left!`;
  return {done,total,pct,message:msg};
}
