import { useState, useEffect, useCallback, Reducer, useReducer } from 'react';

// Custom hook to debounce a value.
const useDebounce = <T,>(value: T, delay: number): T => {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
};


interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

// Action types for the reducer
const UNDO = 'UNDO';
const REDO = 'REDO';
const SET = 'SET';
const CLEAR = 'CLEAR';

type HistoryAction<T> =
  | { type: typeof UNDO }
  | { type: typeof REDO }
  | { type: typeof SET; newPresent: T }
  | { type: typeof CLEAR; initialPresent: T };


const historyReducer = <T>(state: HistoryState<T>, action: HistoryAction<T>): HistoryState<T> => {
  const { past, present, future } = state;

  switch (action.type) {
    case UNDO:
      if (past.length === 0) return state;
      const previous = past[past.length - 1];
      const newPast = past.slice(0, past.length - 1);
      return {
        past: newPast,
        present: previous,
        future: [present, ...future],
      };
    case REDO:
      if (future.length === 0) return state;
      const next = future[0];
      const newFuture = future.slice(1);
      return {
        past: [...past, present],
        present: next,
        future: newFuture,
      };
    case SET:
      if (action.newPresent === present) return state;
      return {
        past: [...past, present],
        present: action.newPresent,
        future: [],
      };
    case CLEAR:
      return {
        past: [],
        present: action.initialPresent,
        future: [],
      }
    default:
      return state;
  }
};

export const useHistory = <T>(localStorageKey: string, initialPresent: T) => {
    const getInitialState = useCallback((): T => {
        if (typeof window === 'undefined') {
            return initialPresent;
        }
        try {
            const item = window.localStorage.getItem(localStorageKey);
            return item ? JSON.parse(item) : initialPresent;
        } catch (error) {
            console.error(error);
            return initialPresent;
        }
    }, [localStorageKey, initialPresent]);

    const [state, dispatch] = useReducer<Reducer<HistoryState<T>, HistoryAction<T>>>(
        historyReducer,
        {
            past: [],
            present: getInitialState(),
            future: [],
        }
    );

    const canUndo = state.past.length > 0;
    const canRedo = state.future.length > 0;

    const undo = useCallback(() => dispatch({ type: UNDO }), []);
    const redo = useCallback(() => dispatch({ type: REDO }), []);
    const set = useCallback((newPresent: T) => dispatch({ type: SET, newPresent }), []);
    const clear = useCallback(() => dispatch({ type: CLEAR, initialPresent }), [initialPresent]);
    
    // Debounce saving the present state to localStorage
    const debouncedPresent = useDebounce(state.present, 500);

    useEffect(() => {
        try {
            if (typeof window !== 'undefined') {
                const valueToStore = JSON.stringify(debouncedPresent);
                window.localStorage.setItem(localStorageKey, valueToStore);
            }
        } catch (error) {
            console.error("Failed to save state to localStorage:", error);
        }
    }, [localStorageKey, debouncedPresent]);


    return { state: state.present, set, undo, redo, canUndo, canRedo, clear };
};
