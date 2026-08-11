import { useState, useEffect, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import NewCampaignModal from '../admin/NewCampaignModal';
import { api } from '../../services/api';

export default function Layout() {
  const [campaigns, setCampaigns] = useState([]);
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [showNewCampaign, setShowNewCampaign] = useState(false);

  const loadCampaigns = useCallback(async () => {
    try {
      const data = await api.get('/campaigns');
      setCampaigns(data);
      if (!activeCampaign && data.length) setActiveCampaign(data.find(c => c.status === 'active') || data[0]);
    } catch (e) {
      console.error('Failed to load campaigns', e);
    }
  }, [activeCampaign]);

  useEffect(() => { loadCampaigns(); }, []);

  return (
    <div className="font-sans bg-slate-50 min-h-screen text-[#1e293b]">
      <TopBar campaigns={campaigns} activeCampaign={activeCampaign} onSelectCampaign={setActiveCampaign} onNewCampaign={() => setShowNewCampaign(true)} />
      <div className="flex min-h-[calc(100vh-52px)]">
        <Sidebar campaigns={campaigns} activeCampaignId={activeCampaign?.id} />
        <div className="flex-1 p-7 overflow-auto">
          <Outlet context={{ campaigns, activeCampaign, reloadCampaigns: loadCampaigns }} />
        </div>
      </div>
      {showNewCampaign && (
        <NewCampaignModal
          onClose={() => setShowNewCampaign(false)}
          onCreated={() => { setShowNewCampaign(false); loadCampaigns(); }}
        />
      )}
    </div>
  );
}
