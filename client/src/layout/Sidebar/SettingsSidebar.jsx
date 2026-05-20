import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AddNVRForm from '../../page/user/Streams/Nvrform';
import { Button } from '@/components/ui/button';
import SidebarSkeleton from './SidebarSkeleton';
import { Siren, Cctv, TriangleAlert, ShieldAlert, HardDrive,Database, User } from 'lucide-react';

const ConfigIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2.63221 18.237C2.67188 17.8602 2.94488 17.5568 3.49088 16.949L4.69371 15.6038C4.98771 15.2305 5.19654 14.583 5.19654 13.9997C5.19654 13.4163 4.98771 12.7677 4.69488 12.3955L3.48971 11.0503C2.94371 10.4437 2.67071 10.1392 2.63104 9.76234C2.59138 9.38551 2.79438 9.03084 3.20271 8.32267L3.77904 7.32284C4.21421 6.56684 4.43238 6.18884 4.80338 6.03951C5.17321 5.88784 5.59204 6.00684 6.43088 6.24484L7.85421 6.64501C8.38971 6.76867 8.95088 6.69867 9.43854 6.44784L9.83171 6.22151C10.2508 5.95278 10.5729 5.55705 10.751 5.09217L11.1407 3.92901C11.3974 3.15901 11.5257 2.77401 11.8302 2.55234C12.137 2.33301 12.5419 2.33301 13.3515 2.33301H14.6524C15.462 2.33301 15.868 2.33301 16.1725 2.55351C16.477 2.77401 16.6054 3.15901 16.8609 3.92901L17.2517 5.09217C17.4298 5.55705 17.752 5.95278 18.171 6.22151L18.5642 6.44784C19.0519 6.69867 19.6142 6.76867 20.1485 6.64617L21.5719 6.24484C22.4107 6.00684 22.8295 5.88784 23.1994 6.03834C23.5704 6.19001 23.7885 6.56684 24.2237 7.32284L24.7989 8.32267C25.2072 9.03084 25.4114 9.38434 25.3717 9.76234C25.332 10.1403 25.059 10.4425 24.513 11.0503L23.3102 12.3955C23.0162 12.7677 22.8074 13.4163 22.8074 13.9997C22.8074 14.583 23.0162 15.2317 23.309 15.6038L24.513 16.949C25.059 17.5557 25.332 17.8602 25.3717 18.237C25.4114 18.6138 25.2084 18.9685 24.8 19.6767L24.2237 20.6765C23.7885 21.4325 23.5704 21.8105 23.1994 21.9598C22.8295 22.1115 22.4107 21.9925 21.5719 21.7545L20.1485 21.3543C19.6133 21.2314 19.0519 21.3013 18.563 21.5515L18.171 21.7778C17.751 22.0462 17.429 22.4428 17.2517 22.9072L16.862 24.0703C16.6054 24.8403 16.477 25.2253 16.1725 25.447C15.868 25.6663 15.462 25.6663 14.6524 25.6663H13.3515C12.5419 25.6663 12.137 25.6663 11.8314 25.4458C11.5269 25.2253 11.3985 24.8415 11.143 24.0715"
      className="stroke-current"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3.19314 21.9094C4.45314 20.6494 8.73714 16.4074 9.15714 15.9174C9.60164 15.3994 9.24114 14.6994 9.4558 12.5294C9.55964 11.4794 9.7848 10.6931 10.4311 10.1074C11.2011 9.37945 11.8311 9.37945 14.0011 9.33045C15.8911 9.37945 16.1151 9.16945 16.3111 9.65945C16.4511 10.0094 16.0311 10.2194 15.5271 10.7794C14.4071 11.8994 13.7491 12.4594 13.6861 12.8094C13.2311 14.3494 15.0231 15.2594 16.0031 14.2794C16.3741 13.9084 18.0891 12.1794 18.2571 12.0394C18.3831 11.9274 18.6853 11.9321 18.8311 12.1094C18.9571 12.2331 18.9711 12.2494 18.9571 12.8094C18.9455 13.3274 18.9501 14.0718 18.9525 14.8394C18.9536 15.8334 18.9011 16.9394 18.4811 17.4994C17.6411 18.7594 16.2411 18.8294 14.9811 18.8854C13.7911 18.9554 12.8111 18.8294 12.5031 19.0534C12.2511 19.1794 10.9211 20.5794 9.31114 22.1894L6.44114 25.0594C4.06114 26.9494 1.44314 24.0094 3.19314 21.9094Z"
      className="stroke-current"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const profilesvg = ({ className }) => (
  <svg className={`${className} ml-2`} width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path className="stroke-current" d="M10.4083 4.68929C9.88903 4.47908 9.32141 4.36332 8.72666 4.36332C6.24998 4.36332 4.24223 6.37107 4.24223 8.84775C4.24223 11.3244 6.24998 13.3322 8.72666 13.3322C10.066 13.3322 11.2683 12.7449 12.09 11.814M15.6792 1.23903C15.5779 1.38381 15.5779 1.58805 15.5779 1.99654V2.66492C15.4779 2.70027 15.3803 2.74078 15.2856 2.78614L14.8128 2.31343C14.524 2.02459 14.3796 1.88017 14.2055 1.84949C14.1412 1.83813 14.0752 1.83813 14.0109 1.84949C13.8368 1.88017 13.6924 2.02459 13.4035 2.31343C13.1147 2.60229 12.9703 2.74671 12.9396 2.92076C12.9282 2.98516 12.9282 3.05104 12.9396 3.11544C12.9703 3.28949 13.1147 3.43391 13.4035 3.72275L13.8761 4.19542C13.8308 4.29026 13.7903 4.38785 13.7549 4.48789H13.0865C12.678 4.48789 12.4739 4.48789 12.329 4.58927C12.2754 4.62677 12.2289 4.67336 12.1913 4.72692C12.09 4.8717 12.09 5.07594 12.09 5.48443C12.09 5.89291 12.09 6.09716 12.1913 6.24194C12.2289 6.29549 12.2754 6.34209 12.329 6.37959C12.4737 6.48097 12.678 6.48097 13.0865 6.48097H13.7549C13.7903 6.58098 13.8307 6.67854 13.8761 6.77334L13.4035 7.24607C13.1146 7.53491 12.9702 7.67933 12.9394 7.85338C12.9281 7.91778 12.9281 7.98367 12.9394 8.04806C12.9702 8.22213 13.1146 8.36655 13.4035 8.65539C13.6923 8.94423 13.8367 9.08865 14.0108 9.11934C14.0751 9.13069 14.141 9.13069 14.2054 9.11934C14.3795 9.08865 14.5239 8.94423 14.8127 8.65539L15.2855 8.18268C15.3803 8.22806 15.4779 8.26857 15.5779 8.30393V8.97232C15.5779 9.3808 15.5779 9.58505 15.6792 9.72983C15.7168 9.78339 15.7633 9.82997 15.8169 9.86749C15.9617 9.96886 16.1659 9.96886 16.5744 9.96886C16.9829 9.96886 17.1871 9.96886 17.3319 9.86749C17.3855 9.82997 17.4321 9.78339 17.4696 9.72983C17.571 9.58505 17.571 9.3808 17.571 8.97232V8.30393C17.671 8.26857 17.7686 8.22805 17.8635 8.18265L18.3361 8.65538C18.625 8.94422 18.7694 9.08864 18.9434 9.11934C19.0079 9.13068 19.0737 9.13068 19.1382 9.11934C19.3122 9.08864 19.4567 8.94422 19.7455 8.65538C20.0343 8.36654 20.1788 8.22212 20.2094 8.04805C20.2208 7.98366 20.2208 7.91778 20.2094 7.85338C20.1788 7.67932 20.0343 7.5349 19.7455 7.24606L19.2727 6.77331C19.3181 6.67852 19.3586 6.58096 19.3939 6.48097H20.0623C20.4708 6.48097 20.675 6.48097 20.8198 6.37959C20.8734 6.34209 20.9199 6.29549 20.9575 6.24194C21.0588 6.09716 21.0588 5.89291 21.0588 5.48443C21.0588 5.07594 21.0588 4.8717 20.9575 4.72692C20.9199 4.67336 20.8734 4.62677 20.8198 4.58927C20.675 4.48789 20.4708 4.48789 20.0623 4.48789H19.3939C19.3586 4.38786 19.318 4.29028 19.2727 4.19547L19.7454 3.72277C20.0343 3.43392 20.1787 3.2895 20.2093 3.11545C20.2207 3.05105 20.2207 2.98517 20.2093 2.92077C20.1787 2.74671 20.0341 2.60229 19.7454 2.31344C19.4566 2.0246 19.312 1.88018 19.138 1.8495C19.0737 1.83814 19.0078 1.83814 18.9433 1.8495C18.7693 1.88018 18.6249 2.0246 18.336 2.31344L17.8633 2.78616C17.7685 2.74079 17.671 2.70027 17.571 2.66492V1.99654C17.571 1.58805 17.571 1.38381 17.4696 1.23903C17.4321 1.18546 17.3855 1.13888 17.3319 1.10137C17.1871 1 16.9829 1 16.5744 1C16.1659 1 15.9617 1 15.8169 1.10137C15.7633 1.13888 15.7168 1.18546 15.6792 1.23903ZM17.6955 5.48443C17.6955 6.10359 17.1936 6.60554 16.5744 6.60554C15.9552 6.60554 15.4533 6.10359 15.4533 5.48443C15.4533 4.86526 15.9552 4.36332 16.5744 4.36332C17.1936 4.36332 17.6955 4.86526 17.6955 5.48443ZM5.71946 15.5744H11.7339C12.2749 15.5744 12.5453 15.5744 12.7872 15.6261C13.6246 15.8049 14.3487 16.4333 14.7543 17.3334C14.8716 17.5934 14.9571 17.9024 15.1282 18.5204C15.3337 19.2629 15.4365 19.6343 15.4504 19.9337C15.4994 20.9902 14.9284 21.9442 14.0806 22.2222C13.8404 22.301 13.5154 22.301 12.8653 22.301H4.58803C3.93801 22.301 3.61301 22.301 3.37271 22.2222C2.5249 21.9442 1.95392 20.9902 2.00294 19.9337C2.01685 19.6343 2.11962 19.2629 2.32517 18.5204C2.49624 17.9024 2.58177 17.5934 2.69898 17.3334C3.10464 16.4333 3.82872 15.8049 4.66608 15.6261C4.90802 15.5744 5.1785 15.5744 5.71946 15.5744Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
);

const sidebarItems = import.meta.env.VITE_DESK_CLIENT === 'true'  ? [ 
  // { label: 'Profile', icon: profilesvg },
  { label: 'Detection Settings', icon: ShieldAlert, activePaths: ['/detection-settings', '/settings/inner'] },
  { label: 'Alert Recipients', icon: TriangleAlert },
  // { label: 'Storage Settings', icon: Database },
 
]:
 [ 
  { label: 'Profile', icon: profilesvg },
  { label: 'Detection Settings', icon: ShieldAlert, activePaths: ['/detection-settings', '/settings/inner'] },
  { label: 'Alert Recipients', icon: TriangleAlert },
  { label: 'Storage Settings', icon: Database },
 
];





const sidebarRoutes =import.meta.env.VITE_DESK_CLIENT === 'true'  ?  [
  // '/profile',
  '/detection-settings',
  '/notification-recipients',
  // '/storage-settings',
  
]:
  [
  '/profile',
  '/detection-settings',
  '/notification-recipients',
  '/storage-settings',
  
];

const SettingsSidebar = () => {
  const [showNVRForm, setShowNVRForm] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <>
      <div
        className="fixed hidden sm:flex bg-white ml-4 2xl:ml-5 rounded-[18px] transition-all duration-200 ease-in-out
          left-0 top-[110px] bottom-4 z-40 w-[230px] py-4 px-2 overflow-y-auto"
      >
        {/* Expanded View */}
        <div className="transition-all duration-200 ease-in-out opacity-100 translate-x-0 w-full">
          <div className="flex flex-col w-full gap-2">
            <div className="customscrollbar">
              {/* {sidebarItems.map(({ label, icon }, idx) => {
                const Icon = icon;
                // Check if current route matches, or if it's Detection Settings and we're on the inner settings page
                const isActive = pathname === sidebarRoutes[idx] || 
                  (label === 'Detection Settings' && pathname === '/settings/inner');
                // const isDisabled = label === 'Storage Settings';
                return (
                  <div
                    key={label}
                    // role={isDisabled ? 'button' : 'link'}
                    // aria-disabled={isDisabled}
                    className={`flex ${'cursor-pointer hover:bg-gray-100'} items-center gap-2 rounded-2xl py-2 pl-2 pr-3 justify-start mb-2 ${isActive ? 'bg-[#E3F5FF]' : ''}`}
                    onClick={() => {
                      // if (isDisabled) return;
                      navigate(sidebarRoutes[idx]);
                    }}
                  >
                    <div className={`min-w-[50px] min-h-[50px] flex items-center justify-center rounded-lg ${isActive ? 'bg-white' : 'bg-[#F3F3F3]'} ${isDisabled ? 'opacity-60' : ''}`}>
                      <Icon className={`w-6 h-6 ${isActive ? 'text-[#07486A]' : 'text-[#696969]'} ${isDisabled ? 'text-[#9E9E9E]' : ''}`} />
                    </div>
                    <span className={`font-[400] whitespace-nowrap text-[12px] 2xl:text-sm ${isActive ? 'text-[#07486A] font-[500]' : 'text-[#696969]'} ${isDisabled ? 'text-[#9E9E9E]' : ''}`}>{label}</span>
                  </div>
                );
              })} */}
              {sidebarItems.map(({ label, icon, activePaths }, idx) => {
                const Icon = icon;
                const isActive = activePaths ? activePaths.includes(pathname) : pathname === sidebarRoutes[idx];

                return (
                  <div
                    key={label}
                    className={`flex cursor-pointer hover:bg-gray-100 items-center gap-2 rounded-2xl py-2 pl-2 pr-3 justify-start mb-2 ${isActive ? 'bg-[#E3F5FF]' : ''}`}
                    onClick={() => navigate(sidebarRoutes[idx])}
                  >
                    <div
                      className={`min-w-[50px] min-h-[50px] flex items-center justify-center rounded-lg ${isActive ? 'bg-white' : 'bg-[#F3F3F3]'
                        }`}
                    >
                      <Icon className={`w-6 h-6 ${isActive ? 'text-[#07486A]' : 'text-[#696969]'}`} />
                    </div>

                    <span
                      className={`font-[400] whitespace-nowrap text-[12px] 2xl:text-sm ${isActive ? 'text-[#07486A] font-[500]' : 'text-[#696969]'
                        }`}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {showNVRForm && (
        <AddNVRForm
          onClose={() => setShowNVRForm(false)}
          isEdit={false}
          initialData={null}
          title="Add NVR"
        />
      )}
    </>
  );
};

export default SettingsSidebar;
