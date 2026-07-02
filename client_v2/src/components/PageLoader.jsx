import React from "react";
import { LoaderCircle } from "lucide-react";

const PageLoader = () => (
  <div className="flex items-center justify-center h-screen">
    <LoaderCircle className="w-9 h-9 animate-spin text-[#07486a]" />
  </div>
);

export default PageLoader;
