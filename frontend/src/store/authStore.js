import { create } from 'zustand';
import api from '../services/api';

const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  refreshToken: localStorage.getItem('refreshToken'),
  isAuthenticated: !!localStorage.getItem('token'),
  loading: false,

  login: async (username, password, totp_code) => {
    set({ loading: true });
    try {
      const { data } = await api.post('/auth/login', { username, password, totp_code });

      if (data.requires_2fa) {
        set({ loading: false });
        return { requires_2fa: true };
      }

      localStorage.setItem('token', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);

      set({
        user: data.user,
        token: data.accessToken,
        refreshToken: data.refreshToken,
        isAuthenticated: true,
        loading: false,
      });

      return { success: true };
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    set({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },

  fetchUser: async () => {
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data });

      // Apply theme
      if (data.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (data.theme === 'light') {
        document.documentElement.classList.remove('dark');
      }

      return data;
    } catch (err) {
      if (err.response?.status === 401) {
        get().logout();
      }
    }
  },

  updateProfile: async (updates) => {
    const { data } = await api.put('/auth/profile', updates);
    set({ user: data });
    return data;
  },
}));

export default useAuthStore;
