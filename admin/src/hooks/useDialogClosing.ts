import { createContext, useContext } from 'react';

export const DialogClosingContext = createContext(false);
export const useDialogClosing = () => useContext(DialogClosingContext);
