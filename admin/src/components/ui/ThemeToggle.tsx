import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
type Theme = 'dark' | 'light';
function apply(theme: Theme) {
  document.documentElement.dataset.theme=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#111B1D':'#F4F7F5');
}
export function ThemeToggle() {
  const [theme,setTheme]=useState<Theme>(()=>{try{return localStorage.getItem('pairtalk-admin-theme')==='light'?'light':'dark';}catch{return 'dark';}});
  useEffect(()=>apply(theme),[theme]);
  return <button className="admin-theme-toggle" type="button" aria-label={`Switch to ${theme==='dark'?'light':'dark'} theme`} onClick={()=>{const next=theme==='dark'?'light':'dark';setTheme(next);try{localStorage.setItem('pairtalk-admin-theme',next);}catch{/* Storage is optional. */}}}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button>;
}
