import React, { useState, useEffect } from 'react';

function DynamicDateTime({ className = '', incidentDate }) {
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000); 

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, []);

  const formattedDateTime = currentDateTime.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(incidentDate ? {} : { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
  });

  return (
    <div className="datetime-container">
      <span className={`text-[9px] md:text-[10px] 2xl:text-xs text-[#595959] ${className}`}>
        {formattedDateTime}
      </span>
    </div>
  );
}

export default DynamicDateTime;
