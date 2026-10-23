import { create } from "zustand";
export const useApp = create<{
  profileId: string | null;
  setProfile: (id: string | null) => void;
  error: string;
  setError: (error: string) => void;
}>((set) => ({
  profileId: sessionStorage.getItem("retro-profile"),
  setProfile: (id) => {
    id
      ? sessionStorage.setItem("retro-profile", id)
      : sessionStorage.removeItem("retro-profile");
    set({ profileId: id });
  },
  error: "",
  setError: (error) => set({ error }),
}));
