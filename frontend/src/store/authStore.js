import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
    }),
    {
      name: 'regavim-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ token: state.token }),
    }
  )
);

export default useAuthStore;
