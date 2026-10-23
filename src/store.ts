import { create } from "zustand";
// This is only the selected profile ID. Profiles themselves live in IndexedDB.
function selectedProfile() {
  try {
    return (
      localStorage.getItem("retro-profile") ||
      sessionStorage.getItem("retro-profile")
    );
  } catch {
    return null;
  }
}
export const useApp = create<{
  profileId: string | null;
  setProfile: (id: string | null) => void;
  error: string;
  setError: (error: string) => void;
}>((set) => ({
  profileId: selectedProfile(),
  setProfile: (id) => {
    try {
      if (id) {
        localStorage.setItem("retro-profile", id);
        sessionStorage.setItem("retro-profile", id);
      } else {
        localStorage.removeItem("retro-profile");
        sessionStorage.removeItem("retro-profile");
      }
    } catch {
      /* A disabled preference store must not hide existing IDB profiles. */
    }
    set({ profileId: id });
  },
  error: "",
  setError: (error) => set({ error }),
}));
