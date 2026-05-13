import React from 'react';
import { ChevronLeft, Cctv, ListRestart } from 'lucide-react';
import { useInnerSettings } from './InnerSettingsContext';

const Header = () => {
  const { onBack, onReset, rowData } = useInnerSettings();

  return (
    <div className="pb-5 mb-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 bg-white cursor-pointer rounded-[7px] transition-colors">
          <ChevronLeft className="w-6 h-6 text-[#333333]" strokeWidth={1.2} />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <Cctv className="w-7 h-7 text-[#333333]" strokeWidth={1.2} />
            <h1 className="font-medium text-[#333333] text-base">{rowData?.name ?? ''}</h1>
          </div>
        </div>
        <button onClick={onReset} className="ml-auto flex items-center gap-2 px-4 py-2 rounded-[11px] cursor-pointer hover:bg-gray-200 text-sm text-[#595959] bg-white">
          <ListRestart className="w-5 h-5 text-black" />
          Reset Setting
        </button>
      </div>
    </div>
  );
};

export default Header;
