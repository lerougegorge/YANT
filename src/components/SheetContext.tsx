import { createContext, useContext, useState, type ReactNode } from 'react';
import type { FoodInstance, FoodItem } from '../db/types';
import { LogSheet } from './LogSheet';
import { EditInstanceSheet } from './EditInstanceSheet';

type SheetState = { type: 'log'; item: FoodItem } | { type: 'editInstance'; instance: FoodInstance } | null;

interface SheetApi {
  openLogSheet: (item: FoodItem) => void;
  openEditInstance: (instance: FoodInstance) => void;
}

const SheetCtx = createContext<SheetApi | null>(null);

export function useSheets(): SheetApi {
  const ctx = useContext(SheetCtx);
  if (!ctx) throw new Error('useSheets must be used within SheetProvider');
  return ctx;
}

export function SheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SheetState>(null);

  return (
    <SheetCtx.Provider
      value={{
        openLogSheet: (item) => setState({ type: 'log', item }),
        openEditInstance: (instance) => setState({ type: 'editInstance', instance })
      }}
    >
      {children}
      {state?.type === 'log' && <LogSheet item={state.item} onClose={() => setState(null)} />}
      {state?.type === 'editInstance' && <EditInstanceSheet instance={state.instance} onClose={() => setState(null)} />}
    </SheetCtx.Provider>
  );
}
