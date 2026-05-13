import React, { useState } from 'react';
import { ChevronDown, ChevronUp, } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const Reports = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedReport, setSelectedReport] = useState('download');

  return (
    <div className="bg-[#FFFFFF] rounded-[10px]">
      <div
        className="flex items-center justify-between px-4 py-6 rounded-[10px] bg-[#FAFAFA] cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="md:text-[20px] text-sm font-medium text-[#333333]">
          Reports
        </h2>
        {isExpanded ? (
          <ChevronUp className="w-8 h-8 text-[#333333]" />
        ) : (
          <ChevronDown className="w-8 h-8 text-[#333333]" />
        )}
      </div>

      {isExpanded && (
        <div className="py-4 ">
          <RadioGroup value={selectedReport} onValueChange={setSelectedReport}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start bg-[#FAFAFA] gap-3 p-5 rounded-[10px] hover:bg-gray-50 transition-colors">
                <RadioGroupItem
                  value="download"
                  className="border-[#07486a] text-[#07486A] mt-0"
                  id="download"
                />
                <label
                  htmlFor="download"
                  className="flex-1 min-w-0 cursor-pointer"
                >
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-medium text-gray-900 text-sm">
                      Download Report
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex items-start bg-[#FAFAFA] gap-3 p-5 rounded-[10px] hover:bg-gray-50 transition-colors">
                <RadioGroupItem
                  value="video"
                  className="border-[#07486A] text-[#07486A] mt-0.5"
                  id="video"
                />
                <label
                  htmlFor="video"
                  className="flex-1 min-w-0 cursor-pointer"
                >
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-medium text-gray-900 text-sm">
                      Video Link URL
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </RadioGroup>
        </div>
      )}
    </div>
  );
};

export default Reports;
