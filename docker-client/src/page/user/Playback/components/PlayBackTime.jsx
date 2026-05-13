import React from 'react';

function PlayBackTime({ dateTime, className = '' }) {
  // Accepts a dateTime prop (Date object or ISO string)
  const displayDate = dateTime ? new Date(dateTime) : new Date(0);

  // Format: dd-MM-yyyy HH:mm:ss
  const pad = (n) => n.toString().padStart(2, '0');
  const formattedDateTime = `${pad(displayDate.getDate())}-${pad(displayDate.getMonth() + 1)}-${displayDate.getFullYear()} ${pad(displayDate.getHours())}:${pad(displayDate.getMinutes())}:${pad(displayDate.getSeconds())}`;

  return (
    <div className="datetime-container">
      <span className={`2xl:text-[16px] text-xs text-[#595959] ${className}`}>
        {formattedDateTime}
      </span>
    </div>
  );
}

export default PlayBackTime;
