import React, { useState, useContext } from 'react';
import { Shield, Key, CheckCircle } from 'lucide-react';
import { supabase } from '../supabase';
import { logAuditTrail } from '../lib/audit';

export default function Security({ user }) {
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) return alert("Security: Use 6+ characters.");
    
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    
    if (error) {
      alert(error.message);
    } else {
      await logAuditTrail(
        user.email,
        'PWD_CHANGE_SELF',
        'USER',
        user.id,
        'Regular password rotation performed by owner.'
      );
      setMessage("Identity Confirmed: Credentials Updated.");
      setNewPassword('');
    }
    setLoading(false);
  };

  return (
    <div className="p-6 bg-slate-900/40 border border-slate-800/80 rounded-2xl shadow-xl animate-in slide-in-from-bottom-4">
      <div className="flex items-center space-x-4 mb-8">
        <div className="p-3 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-xl">
          <Shield size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-tight">Security Protocol</h2>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Self-Service Credential Authority</p>
        </div>
      </div>

      <form onSubmit={handleUpdate} className="space-y-6">
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Establish New Secure Password</label>
          <div className="relative">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="password" 
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-4 pl-12 pr-4 text-white text-sm outline-none focus:border-blue-500/50 transition-all shadow-inner"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95 disabled:opacity-50"
        >
          {loading ? 'Transmitting...' : 'Authorize Credential Change'}
        </button>

        {message && (
          <div className="p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-xl flex items-center text-emerald-400 animate-in fade-in">
            <CheckCircle size={16} className="mr-3" />
            <span className="text-[11px] font-bold uppercase tracking-tight">{message}</span>
          </div>
        )}
      </form>
    </div>
  );
}
