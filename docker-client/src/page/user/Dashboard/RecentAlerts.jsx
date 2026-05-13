import React from 'react';
import { Store, AlertTriangle } from 'lucide-react';
import AlertGauge from './AlertGauge';
import ActivityChart from './ActivityChart';

const RecentAlerts = () => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center mb-6">
        <div className="mr-4">
          <div className="bg-blue-100 rounded-full p-2">
            <Store className="h-5 w-5 text-blue-600" />
          </div>
        </div>
        <div>
          <h3 className="text-base font-medium">Walmart Store</h3>
          <p className="text-sm text-gray-500">NYC</p>
        </div>
        <div className="ml-auto">
          <p className="text-xs text-gray-500">15 May 2025, 11:45 AM</p>
          <div className="flex items-center text-xs text-red-500 mt-1">
            <span className="bg-red-100 text-red-500 text-xs px-2 py-1 rounded-md">
              High Risk Alert
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          {/* Alert image placeholder */}
          <div className="bg-gray-200 rounded-lg h-40 overflow-hidden">
            <img
              src="https://images.pexels.com/photos/3205570/pexels-photo-3205570.jpeg"
              alt="Retail surveillance"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="mt-4">
            <div className="flex text-xs space-x-2">
              <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full">
                Cam 1
              </span>
              <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full">
                Cam 2
              </span>
              <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full">
                Cam 3
              </span>
              <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full">
                Cam 4
              </span>
            </div>
          </div>
        </div>

        <div>
          <AlertGauge />
          <ActivityChart />
        </div>
      </div>
    </div>
  );
};

export default RecentAlerts;
