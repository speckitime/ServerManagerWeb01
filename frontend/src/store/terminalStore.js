import { create } from 'zustand';

const useTerminalStore = create((set, get) => ({
  // Map of serverId -> array of terminal sessions
  // Each session: { id, title, buffer: string[] }
  sessions: {},

  // Map of serverId -> active tab index
  activeTab: {},

  getServerSessions: (serverId) => {
    return get().sessions[serverId] || [];
  },

  getActiveTab: (serverId) => {
    return get().activeTab[serverId] || 0;
  },

  setActiveTab: (serverId, tabIndex) => {
    set((state) => ({
      activeTab: { ...state.activeTab, [serverId]: tabIndex },
    }));
  },

  addSession: (serverId) => {
    set((state) => {
      const existing = state.sessions[serverId] || [];
      const newSession = {
        id: Date.now().toString(),
        title: `Terminal ${existing.length + 1}`,
        buffer: [],
      };
      const updated = [...existing, newSession];
      return {
        sessions: { ...state.sessions, [serverId]: updated },
        activeTab: { ...state.activeTab, [serverId]: updated.length - 1 },
      };
    });
  },

  removeSession: (serverId, sessionId) => {
    set((state) => {
      const existing = state.sessions[serverId] || [];
      const updated = existing.filter((s) => s.id !== sessionId);
      const currentTab = state.activeTab[serverId] || 0;
      const newTab = currentTab >= updated.length ? Math.max(0, updated.length - 1) : currentTab;
      return {
        sessions: { ...state.sessions, [serverId]: updated },
        activeTab: { ...state.activeTab, [serverId]: newTab },
      };
    });
  },

  appendBuffer: (serverId, sessionId, data) => {
    set((state) => {
      const existing = state.sessions[serverId] || [];
      const updated = existing.map((s) => {
        if (s.id === sessionId) {
          // Keep last 5000 lines to prevent memory bloat
          const newBuffer = [...s.buffer, data];
          if (newBuffer.length > 5000) {
            newBuffer.splice(0, newBuffer.length - 5000);
          }
          return { ...s, buffer: newBuffer };
        }
        return s;
      });
      return { sessions: { ...state.sessions, [serverId]: updated } };
    });
  },

  clearBuffer: (serverId, sessionId) => {
    set((state) => {
      const existing = state.sessions[serverId] || [];
      const updated = existing.map((s) => {
        if (s.id === sessionId) {
          return { ...s, buffer: [] };
        }
        return s;
      });
      return { sessions: { ...state.sessions, [serverId]: updated } };
    });
  },

  // Initialize first session if none exist
  ensureSession: (serverId) => {
    const existing = get().sessions[serverId] || [];
    if (existing.length === 0) {
      get().addSession(serverId);
    }
  },
}));

export default useTerminalStore;
