import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../services/api';
import { formatDateShort, formatWeekdayVN, formatTimeVN } from '../../utils/datetime';
import { generateWeeklyDigest } from '../../utils/digest';
import { copyText } from '../../services/clipboard';
import ConflictAlert from '../shared/ConflictAlert';

export default function MasterTimeline() {
  const { campaigns } = useOutletContext();
  const [posts, setPosts] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getTime() - 2 * 86400000).toISOString();
    const to = new Date(now.getTime() + 21 * 86400000).toISOString();
    api.get(`/posts?from=${from}&to=${to}&include_conflicts=true`)
      .then(data => {
        setPosts(data.posts);
        setConflicts(data.conflicts);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleCopyDigest = async () => {
    const upcoming = posts.filter(p => {
      const days = (new Date(p.scheduled_at) - Date.now()) / 86400000;
      return days >= -1 && days <= 7;
    });
    const text = generateWeeklyDigest(upcoming);
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const activeCampaigns = campaigns.filter(c => c.status === 'active');

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="text-[22px] font-extrabold text-[#1A1A2E] mb-1">📅 Master Timeline</div>
          <div className="text-[13px] text-slate-400">
            Tất cả campaigns đang chạy — {activeCampaigns.length} active
          </div>
        </div>
        <button
          onClick={handleCopyDigest}
          className={`rounded-lg px-4.5 py-2.5 text-white text-[13px] font-bold cursor-pointer ${copied ? 'bg-green-600' : 'bg-[#1A1A2E] hover:bg-[#252542]'}`}
        >
          {copied ? '✓ Đã copy!' : '📤 Copy lịch tuần → SeaTalk'}
        </button>
      </div>

      <ConflictAlert conflicts={conflicts} posts={posts} />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-[110px_60px_1fr_140px_110px_110px] px-5 py-2.5 bg-[#F8F9FF] text-[10px] text-slate-400 font-bold tracking-wider gap-2">
          <span>NGÀY</span><span>GIỜ</span><span>NỘI DUNG</span><span>CAMPAIGN</span><span>KÊNH</span><span>OPERATOR</span>
        </div>
        {loading && <div className="p-5 text-sm text-slate-400">Đang tải...</div>}
        {!loading && posts.length === 0 && <div className="p-5 text-sm text-slate-400">Chưa có bài nào trong khoảng thời gian này.</div>}
        {posts.map(p => {
          const isConflict = conflicts.some(c => c.post_a === p.id || c.post_b === p.id);
          return (
            <div
              key={p.id}
              className={`grid grid-cols-[110px_60px_1fr_140px_110px_110px] px-5 py-3.5 border-t border-slate-100 items-center gap-2 ${isConflict ? 'bg-red-50' : ''}`}
            >
              <span className="text-xs text-slate-600 font-medium">{formatWeekdayVN(p.scheduled_at)} {formatDateShort(p.scheduled_at)}</span>
              <span className={`text-xs ${isConflict ? 'text-[#E94560] font-bold' : ''}`}>{formatTimeVN(p.scheduled_at)}</span>
              <div className="flex items-center gap-2">
                {isConflict && <span className="text-[10px] bg-red-100 text-[#E94560] px-1.5 py-0.5 rounded font-bold">CONFLICT</span>}
                <span className="text-[13px]">{p.title}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.campaign_color }} />
                <span className="text-[11px] text-slate-600">{p.campaign_name}</span>
              </div>
              <span className="text-[11px] text-slate-400">{(p.channels || []).join(' + ')}</span>
              <span className="text-[11px] text-slate-400">{p.operator_email?.split('@')[0] || '—'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
