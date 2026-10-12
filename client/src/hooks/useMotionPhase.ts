import { createContext, useContext } from 'react';
export type MotionPhase = 'entering' | 'open' | 'closing';
export const MotionContext = createContext<MotionPhase>('open');
export const useMotionPhase = () => useContext(MotionContext);
