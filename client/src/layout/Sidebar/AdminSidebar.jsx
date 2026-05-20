import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AddNVRForm from '../../page/user/Streams/Nvrform';
import { Button } from '@/components/ui/button';
import SidebarSkeleton from './SidebarSkeleton';
import { Siren, Cctv, TriangleAlert, ShieldAlert, HardDrive, Database, User, Users, Settings, FileText, User2, Key, ChevronDown, ChevronUp, MapPin, Building2 } from 'lucide-react';

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

const sidebarItems = [
  {
    label: 'User Details',
    icon: User2,
    children: [
      { label: 'User Role Detail', route: '/user-details' },
      { label: 'Register your User', route: '/register-users' },
    ]
  },
  { label: 'Role & Permission', icon: Key, route: '/roles-permissions' },
  { label: 'Locations', icon: MapPin, route: '/locations' },
  { label: 'Departments', icon: Building2, route: '/departments' },
];

const AdminSidebar = () => {
  const [showNVRForm, setShowNVRForm] = useState(false);
  const [expandedItems, setExpandedItems] = useState({ 'User Details': true });
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const toggleExpand = (label) => {
    setExpandedItems(prev => ({ ...prev, [label]: !prev[label] }));
  };

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
              {sidebarItems.map((item, idx) => {
                const Icon = item.icon;
                const isExpanded = expandedItems[item.label];
                const hasChildren = item.children && item.children.length > 0;
                
                // Check if any child is active to highlight parent
                const isChildActive = hasChildren && item.children.some(child => pathname === child.route);
                const isActive = !hasChildren && pathname === item.route;

                return (
                  <div key={item.label} className="mb-2">
                    <div
                      className={`flex cursor-pointer items-center gap-2 rounded-2xl hover:bg-gray-100 py-2 pl-2 pr-3 justify-between ${isActive || isChildActive ? 'bg-[#E3F5FF]' : ''}`}
                      onClick={() => {
                        if (hasChildren) {
                          toggleExpand(item.label);
                        } else {
                          navigate(item.route);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`min-w-[50px] min-h-[50px] flex items-center justify-center rounded-lg ${isActive || isChildActive ? 'bg-white' : 'bg-[#F3F3F3]'}`}>
                          <Icon className={`w-6 h-6 ${isActive || isChildActive ? 'text-[#07486A]' : 'text-[#696969]'}`} />
                        </div>
                        <span className={`font-[400] whitespace-nowrap text-[10px] 2xl:text-xs ${isActive || isChildActive ? 'text-[#07486A] font-[500]' : 'text-[#696969]'}`}>{item.label}</span>
                      </div>
                      {hasChildren && (
                        isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />
                      )}
                    </div>

                    {/* Children */}
                    {hasChildren && isExpanded && (
                      <div className="mt-2 space-y-2">
                        {item.children.map((child) => {
                          const isChildActive = pathname === child.route;
                          return (
                            <div
                              key={child.label}
                              className={`cursor-pointer py-3 px-4 rounded-lg text-[10px] 2xl:text-xs transition-colors ${
                                isChildActive 
                                  ? 'text-[#07486A] font-medium bg-[#E3F5FF]' 
                                  : 'text-[#696969] bg-[#F5F5F5] hover:bg-gray-100'
                              }`}
                              onClick={() => navigate(child.route)}
                            >
                              {child.label}
                            </div>
                          );
                        })}
                      </div>
                    )}
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

export default AdminSidebar;