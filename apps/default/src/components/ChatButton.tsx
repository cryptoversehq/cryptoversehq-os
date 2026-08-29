import React, { useState } from 'react';
import { useRTL } from '../hooks/useRTL';

interface ChatButtonProps { 
isOpen: boolean; 
onToggle: () => void;
}

export function ChatButton({ isOpen, onToggle }: ChatButtonProps) { 
const { isRTL } = useRTL(); 

return ( 
<div className={`chat-button-container ${isRTL ? 'rtl' : 'ltr'}`} style={{ position: 'fixed', bottom: '24px', right: isRTL ? undefined : '24px', left: isRTL ? '24px' : undefined, zIndex: 40 }}> 
<button 
onClick={onToggle} 
style={{ 
display: 'flex', 
alignItems: 'center', 
justifyContent: 'center', 
gap: '8px', 
padding: '12px 20px', 
background: 'linear-gradient(135deg, #FF6B00, #FF8C00)', 
color: '#FFFFFF', 
border: 'none', 
borderRadius: '9999px', 
cursor: 'pointer', 
boxShadow: '0 4px 18px rgba(255, 107, 0, 0.35)', 
fontWeight: '600', 
fontSize: '14px' 
}} 
> 
<span>🤖</span> 
<span>Lynx AI</span> 
</button> 

{ isOpen && ( 
<div 
className="chat-sub-menu" 
style={{ 
position: 'absolute', 
bottom: 'calc(100% + 12px)', 
background: 'hsl(var(--card))', 
color: 'hsl(var(--card-foreground))', 
borderRadius: '12px', 
boxShadow: '0 4px 24px rgba(0,0,0,0.2)', 
border: '1px solid hsl(var(--border))', 
padding: '8px', 
minWidth: '200px', 
zIndex: 41,
...(isRTL ? { left: '0' } : { right: '0' }) 
}} 
> 
{[ 
{ icon: '💬', label: 'New Chat' }, 
{ icon: '📊', label: 'Trading Analysis' }, 
{ icon: '🎓', label: 'Academy Help' }, 
{ icon: '🛡️', label: 'Risk Check' } 
].map((item) => ( 
<div 
key={item.label} 
style={{ 
display: 'flex', 
alignItems: 'center', 
...(isRTL ? { flexDirection: 'row-reverse' } : {}), 
gap: '10px', 
padding: '10px 16px', 
borderRadius: '8px', 
cursor: 'pointer', 
transition: 'background 0.2s', 
color: 'inherit',
}} 
onMouseEnter={(e) => { 
(e.currentTarget as HTMLDivElement).style.background = 'hsl(var(--secondary))'; 
}} 
onMouseLeave={(e) => { 
(e.currentTarget as HTMLDivElement).style.background = 'transparent'; 
}} 
> 
<span>{item.icon}</span> 
<span>{item.label}</span> 
</div> 
))} 
</div> 
)} 
</div> 
);
}