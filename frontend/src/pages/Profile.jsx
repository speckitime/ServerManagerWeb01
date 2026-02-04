import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAuthStore from '../store/authStore';

export default function Profile() {
  const { user, updateProfile } = useAuthStore();
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    language: user?.language || 'en',
  });
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [totpCode, setTotpCode] = useState('');

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile(form);
      toast.success('Profile updated');
    } catch (err) {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('Passwords do not match');
      return;
    }
    setChangingPassword(true);
    try {
      await api.put('/auth/change-password', {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      toast.success('Password changed');
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const setup2FA = async () => {
    try {
      const { data } = await api.post('/auth/2fa/setup');
      setQrCode(data.qr_code);
      setShow2FA(true);
    } catch (err) {
      toast.error('Failed to set up 2FA');
    }
  };

  const verify2FA = async () => {
    try {
      await api.post('/auth/2fa/verify', { totp_code: totpCode });
      toast.success('2FA enabled');
      setShow2FA(false);
      setQrCode(null);
      setTotpCode('');
      useAuthStore.getState().fetchUser();
    } catch (err) {
      toast.error('Invalid code');
    }
  };

  const disable2FA = async () => {
    const password = prompt('Enter your password to disable 2FA:');
    if (!password) return;
    try {
      await api.post('/auth/2fa/disable', { password });
      toast.success('2FA disabled');
      useAuthStore.getState().fetchUser();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to disable 2FA');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile Settings</h1>

      {/* Profile form */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">General</h3>
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
            <input type="text" className="input-field bg-gray-50 dark:bg-gray-800" value={user?.username} disabled />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
            <input type="text" className="input-field" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Language</label>
            <select className="input-field" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Change Password</h3>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Password</label>
            <input type="password" className="input-field" required value={passwordForm.current_password} onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
            <input type="password" className="input-field" required minLength={8} value={passwordForm.new_password} onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm New Password</label>
            <input type="password" className="input-field" required value={passwordForm.confirm_password} onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })} />
          </div>
          <button type="submit" disabled={changingPassword} className="btn-primary">
            {changingPassword ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>

      {/* 2FA */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Two-Factor Authentication</h3>
        {user?.totp_enabled ? (
          <div>
            <p className="text-sm text-green-600 dark:text-green-400 mb-3">2FA is enabled</p>
            <button onClick={disable2FA} className="btn-danger text-sm">
              Disable 2FA
            </button>
          </div>
        ) : show2FA ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Scan this QR code with your authenticator app:
            </p>
            {qrCode && <img src={qrCode} alt="2FA QR Code" className="mx-auto" />}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Verification Code</label>
              <input
                type="text"
                className="input-field"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="Enter 6-digit code"
                maxLength={6}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={verify2FA} className="btn-primary">Verify & Enable</button>
              <button onClick={() => setShow2FA(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">2FA is not enabled</p>
            <button onClick={setup2FA} className="btn-primary text-sm">
              Enable 2FA
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
