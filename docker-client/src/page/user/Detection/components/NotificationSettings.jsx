import React from 'react';
import { useInnerSettings } from './InnerSettingsContext';
import { ArrowLeft, Camera, RotateCcw, Mail, Bell, Smartphone, Webhook, BrushCleaning, Play, CirclePlay, Cctv, ChevronLeft, ListRestart } from 'lucide-react';

const channelsList = [
  { key: 'email', label: 'Email', icon: Mail },
  // { key: 'smsWhatsapp', label: 'SMS/Whatsapp', icon: Smartphone },
  { key: 'push', label: 'Push', icon: Bell },
  // { key: 'webhook', label: 'Webhook', icon: Webhook },
];

const NotificationSettings = () => {
  const { appliedProfileData } = useInnerSettings();
  const appliedProfile = appliedProfileData;

  return (
    <div>
      <h3 className="text-sm md:text-xs 2xl:text-sm font-semibold text-[#333333] mb-4 md:mb-3 2xl:mb-4">Notification</h3>
      <div className="space-y-3.5 md:space-y-3 2xl:space-y-3.5">
        <div className="grid grid-cols-2 gap-x-8 md:gap-x-6 2xl:gap-x-8 gap-y-2.5 md:gap-y-2 2xl:gap-y-2.5">
          <div>
            <p className="text-xs md:text-[11px] 2xl:text-xs text-[#878787] mb-1">Notify</p>
            <p className="text-xs md:text-[11px] 2xl:text-xs text-[#333333] font-medium">{appliedProfile?.profile?.notification?.notify}</p>
          </div>
          {appliedProfile?.profile?.notification?.digestEveryMinutes && (
            <div>
              <p className="text-xs md:text-[11px] 2xl:text-xs text-[#878787] mb-1">Digest Interval</p>
              <p className="text-xs md:text-[11px] 2xl:text-xs text-[#333333] font-medium">{appliedProfile?.profile?.notification?.digestEveryMinutes}</p>
            </div>
          )}
        </div>

        <div className="space-y-2 md:space-y-1.5 2xl:space-y-2">
          <label className="text-xs md:text-[11px] 2xl:text-xs text-[#878787] block">Channels</label>
          <div className="flex gap-2 md:gap-1.5 2xl:gap-2 flex-wrap">
            {channelsList.map((ch) => {
              const IconComponent = ch.icon;
              return (
                <button key={ch.key} disabled className={`flex items-center cursor-not-allowed justify-center w-9 h-9 rounded-lg transition-all ${appliedProfile?.profile?.notification?.channels?.[ch.key] ? 'bg-[#07486A] text-white shadow-sm' : 'bg-white text-[#595959] border border-[#E6E6E6]'}`} title={ch.label}>
                  {IconComponent && <IconComponent size={20} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationSettings;
