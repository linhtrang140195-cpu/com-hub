import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';

async function downloadExcel(campaignId, campaignName) {
  const blob = await api.getBlob(`/reports/campaign/${campaignId}/export`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${campaignName || 'campaign'}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CampaignReport() {
  const { campaignId } = useParams();
  const [data, setData] = useState(null);
  const [campaignType, setCampaignType] = useState(null);

  useEffect(() => {
    api.get(`/reports/campaign/${campaignId}`).then(d => {
      setData(d);
      return api.get(`/campaign-types/${d.campaign.type}`);
    }).then(setCampaignType).catch(console.error);
  }, [campaignId]);

  if (!data) return <div className="text-sm text-slate-400">Đang tải...</div>;
  const { campaign, summary, engagement, top_posts, by_post_type } = data;

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try { await downloadExcel(campaignId, campaign.name); }
    catch (e) { alert('Lỗi xuất Excel: ' + e.message); }
    finally { setExporting(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: campaign.color }} />
          <div className="text-[22px] font-extrabold">{campaign.name} — Report</div>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-1.5 text-[13px] font-bold bg-[#1A1A2E] text-white px-4 py-2 rounded-lg hover:bg-[#252542] disabled:opacity-50 cursor-pointer"
        >
          {exporting ? '⏳ Đang xuất...' : '📥 Xuất Excel'}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          ['Tổng bài', summary.total],
          ['Đã đăng', summary.posted],
          ['Chưa đăng', summary.scheduled],
          ['Completion rate', `${summary.completion_rate}%`],
        ].map(([label, val]) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
            <div className="text-[10px] text-slate-400 mb-1 font-bold">{label}</div>
            <div className="text-lg font-bold">{val}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <div className="text-xs font-bold text-slate-400 tracking-wide mb-3.5">ENGAGEMENT TỔNG</div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            ['Avg Seen/bài', engagement.avg_seen],
            ['Avg React/bài', engagement.avg_react],
            ['Avg Reply/bài', engagement.avg_reply],
          ].map(([label, val]) => (
            <div key={label}>
              <div className="text-[11px] text-slate-400">{label}</div>
              <div className="text-base font-bold">{val}</div>
            </div>
          ))}
        </div>
        {campaignType?.metrics && (
          <div className="text-[11px] text-slate-400 border-t border-slate-100 pt-3">
            <div className="font-bold mb-1.5">Nguồn dữ liệu:</div>
            {campaignType.metrics.map(m => (
              <div key={m.key} className="mb-0.5">
                <span className="font-semibold">{m.label}</span> — {m.source === 'manual' ? '✋ điền tay' : '🔄 tự động'} ({m.source_detail})
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <div className="text-xs font-bold text-slate-400 tracking-wide mb-3.5">TOP 3 BÀI ENGAGEMENT CAO NHẤT</div>
        {top_posts.length === 0 && <div className="text-xs text-slate-400">Chưa có bài đã đăng.</div>}
        {top_posts.map((p, i) => (
          <div key={p.id} className="flex justify-between py-2 border-t border-slate-100 first:border-t-0 text-sm">
            <span>{i + 1}. {p.title}</span>
            <span className="text-slate-500">{p.st_react} react · {p.web_views} views</span>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="text-xs font-bold text-slate-400 tracking-wide mb-3.5">THEO LOẠI BÀI</div>
        {Object.entries(by_post_type).map(([type, stats]) => (
          <div key={type} className="flex justify-between py-2 border-t border-slate-100 first:border-t-0 text-sm">
            <span>{type}</span>
            <span className="text-slate-500">{stats.posted}/{stats.total} đăng · avg {stats.avg_react} react</span>
          </div>
        ))}
      </div>
    </div>
  );
}
