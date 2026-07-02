import React, { useEffect, useState } from "react";
import { ShieldOff, ArrowLeft, Mail, Loader, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const AccessDenied = ({ message = "You don't have permission to access this page.", onBack }) => {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowContent(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  if (!showContent) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoaderCircle className="w-9 h-9 animate-spin text-[#07486a]" />
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center max-h-[70vh] justify-center px-4 overflow-hidden">
      <div className="w-full max-w-md animate-fade-in">
        {/* Icon Container */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-32 h-32 bg-gradient-to-br from-[#07486a]/5 to-[#07486a]/10 rounded-full blur-2xl"></div>
          </div>
          <div className="relative flex items-center justify-center">
            <div className="w-20 h-20 bg-gradient-to-br from-gray-50 to-gray-100 rounded-full flex items-center justify-center border border-gray-200/50 shadow-lg">
              <ShieldOff className="w-10 h-10 text-[#07486a]" strokeWidth={1.5} />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="text-center space-y-4">
          {/* Error Badge */}
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 border border-gray-200">
            <span className="text-xs font-mono font-semibold text-gray-600 tracking-wider">403 FORBIDDEN</span>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
              Access Denied
            </h1>
            <div className="h-px w-16 bg-gradient-to-r from-transparent via-gray-300 to-transparent mx-auto"></div>
          </div>

          {/* Message */}
          <p className="text-gray-600 text-sm leading-relaxed">
            {message}
          </p>

          {/* Action Button */}
          <div className="pt-4">
            <Button
              onClick={onBack}
              className="w-full bg-[#07486a] hover:bg-[#07486a]/90 text-white font-medium rounded-lg transition-all duration-200"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </div>

          {/* Additional Help Text */}
          <p className="text-xs text-gray-500 pt-2">
            If you believe this is an error, please contact support.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AccessDenied;
