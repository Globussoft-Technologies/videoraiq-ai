import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import Emotion from "@/assets/Emotionicon.svg";
import Fire from "@/assets/Fireicon.svg";
import Phone from "@/assets/Phoneicon.svg";
import Theft from "@/assets/Thefticon.svg";
import Traffic from "@/assets/Trafficcone.svg";
import Alert from "@/assets/alert.svg";

const AlertPreferences = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedAlerts, setSelectedAlerts] = useState({
    fire: false,
    emotion: false,
    theft: false,
    traffic: false,
    phone: false,
    all: false,
  });

  const handleCheckboxChange = (key) => {
    setSelectedAlerts((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const options = [
    {
      key: "fire",
      img: Fire,
      title: "Fire Alert",
      description: "Receive alerts for heat signatures above the defined threshold",
    },
    {
      key: "emotion",
      img: Emotion,
      title: "Emotion Detection",
      description: "Emotion (anger, fear, or distress) detection",
    },
    {
      key: "theft",
      img: Theft,
      title: "Theft Alert",
      description: "Object disappears for indefinite time beyond the preset threshold",
    },
    {
      key: "traffic",
      img: Traffic,
      title: "Traffic Alert",
      description: "Vehicle patterns or heat signatures beyond the defined threshold",
    },
    {
      key: "phone",
      img: Phone,
      title: "Phone Use Detected",
      description: "Analyze movements using pattern analysis",
    },
    {
      key: "all",
      img: Alert,
      title: "All Alerts",
      description: "Receive alerts for all cameras and system-wide security coverage",
    },
  ];

  return (
    <div className="bg-[#FFFFFF] rounded-[10px]">
      <div
        className="flex items-center justify-between px-4 py-6 rounded-[10px] bg-[#FAFAFA] cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="md:text-[20px] text-sm font-medium text-[#333333]">
          Alert Preferences
        </h2>
        {isExpanded ? (
          <ChevronUp className="w-8 h-8 text-[#333333]" />
        ) : (
          <ChevronDown className="w-8 h-8 text-[#333333]" />
        )}
      </div>

      {isExpanded && (
        <div className="py-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {options.map((option) => (
            <div
              key={option.key}
              className="flex space-x-3 bg-[#FAFAFA] p-5 rounded-lg"
            >
              <Checkbox
                id={option.key}
                checked={selectedAlerts[option.key]}
                iconClassName="size-4"
                className="data-[state=checked]:bg-[#07486A] border-2 border-[#07486A] cursor-pointer mt-10 mr-5 data-[state=checked]:text-white h-[22px] w-[22px]"
                onCheckedChange={() => handleCheckboxChange(option.key)}
              />
              <label
                htmlFor={option.key}
                className="flex flex-col items-start space-y-2 cursor-pointer"
              >
                <img src={option.img} alt={option.title} className="w-8 h-8" />
                <div>
                  <h3 className="font-medium text-[#333333]">{option.title}</h3>
                  <p className="text-sm text-gray-600">{option.description}</p>
                </div>
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlertPreferences;
