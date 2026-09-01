/**
 * hooks/useModalVisibility.ts
 *
 * Tracks whether any BottomSheet or Dialog is currently open.
 * CustomTabBar reads `modalCount` to hide itself when any modal is open.
 *
 * Usage:
 *   // In a modal component:
 *   const { showModal, hideModal } = useModalVisibility();
 *   useEffect(() => { if (visible) showModal(); else hideModal(); }, [visible]);
 *
 *   // In the tab bar:
 *   const { modalCount } = useModalVisibility();
 *   if (modalCount > 0) return null;
 */

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

interface ModalVisibilityContextValue {
  modalCount: number;
  showModal: () => void;
  hideModal: () => void;
}

const ModalVisibilityContext = createContext<ModalVisibilityContextValue>({
  modalCount: 0,
  showModal: () => {},
  hideModal: () => {},
});

export function ModalVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [modalCount, setModalCount] = useState(0);
  // Use a ref to track the real count synchronously and avoid stale-closure issues
  const countRef = useRef(0);

  const showModal = useCallback(() => {
    countRef.current += 1;
    setModalCount(countRef.current);
  }, []);

  const hideModal = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1);
    setModalCount(countRef.current);
  }, []);

  return (
    <ModalVisibilityContext.Provider value={{ modalCount, showModal, hideModal }}>
      {children}
    </ModalVisibilityContext.Provider>
  );
}

export function useModalVisibility() {
  return useContext(ModalVisibilityContext);
}
