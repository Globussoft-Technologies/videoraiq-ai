import React, { useState, useEffect } from 'react';
import CounterImg1 from '@/assets/CounterImg1.png';
import CounterImg2 from '@/assets/CounterImg2.png';
import CounterImg3 from '@/assets/CounterImg3.png';
import CounterImg4 from '@/assets/CounterImg4.png';

const counterImgs = [CounterImg1, CounterImg2, CounterImg3, CounterImg4];

const RecordedScreens = ({ availableSegments, handleTimeSelect, formatTimeUTC, selectedIndex }) => {
  const [localSelectedIndex, setLocalSelectedIndex] = useState(selectedIndex);

  useEffect(() => {
    setLocalSelectedIndex(selectedIndex);
  }, [selectedIndex]);

  return (
    <div className="w-full overflow-x-auto py-3 md:py-5">
      <div className="flex gap-1.5 md:gap-2">
        {availableSegments.map((segment, index) => (
          <button
            key={`${segment.start}-${segment.end}`}
            className="flex flex-col gap-1.5 md:gap-2 w-[35%] md:w-[30%] xl:w-[18%] flex-shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#07486A] focus-visible:ring-offset-2 rounded-sm"
            onClick={() => {
              setLocalSelectedIndex(index);
              handleTimeSelect(segment, index);
            }}
            type="button"
          >
            <img 
              src={counterImgs[index % counterImgs.length]} 
              alt="Recording thumbnail"
              className={`w-full transition-all group-hover:border-[#07486A] border-2 md:border-4 duration-300 ${
                localSelectedIndex === index 
                  ? 'brightness-100 shadow-md md:shadow-lg border-[#07486A]' 
                  : 'brightness-75 group-hover:brightness-90 border-transparent'
              }`} />
            <span className='text-[#2C2C2C] font-[500] md:font-[600] text-[10px] md:text-[11px] text-center md:text-left'>
              {formatTimeUTC(segment.start)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default RecordedScreens;




// import React from 'react';
// import recordedImage from '../../../assets/recordedImage.svg';

// const RecordedScreens = ({ availableSegments, handleTimeSelect, formatTimeUTC }) => (
//   <div className="w-full overflow-x-auto mt-4">
//     <div className="flex gap-2">
//       {availableSegments.map((segment, index) => (
//         <div
//           key={index}
//           className="flex flex-col gap-2 xl:w-[18%] md:w-[23%] w-[30%] flex-shrink-0 cursor-pointer"
//           onClick={() => handleTimeSelect(segment, index)}
//         >
//           <img src={recordedImage} alt="" className="w-full" />
//           <span className='text-[#07486a] font-[600] text-[11px]'>
//             {formatTimeUTC(segment.start)}
//           </span>
//         </div>
//       ))}
//     </div>
//   </div>
// );

// export default RecordedScreens;
