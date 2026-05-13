import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { DateRangePickerComponent } from '@/components/ui/calendar';
import { formatDateRange } from '@/utils/formatDateRange';
import Month from '../assets/Calendar.svg';

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

const StreamHeader = ({
  title,
  showConfigButton = true,
  onConfigClick,
  buttonText = 'CCTV Configurations',
}) => {
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const isLocalSetup = import.meta.env.VITE_LOCAL_SETUP === 'true';

  return (
    <div className="border-b border-[#D8D8D8] pb-5 mb-8 2xl:pb-6 2xl:mb-10">
      <div className="flex flex-col gap-3 mt-1.5 md:flex-row md:justify-between md:items-center md:gap-0 2xl:gap-4 2xl:mt-2">
        <h1 className="text-2xl font-medium text-gray-800 max-[955px]:text-[18px] max-[955px]:pr-2 2xl:text-[34px]">
          {title}
        </h1>
        <div className="flex flex-col w-full gap-2 md:flex-row md:space-x-3 md:w-auto 2xl:gap-3 2xl:md:space-x-4">
          {showConfigButton && !isLocalSetup && (
            <Button
              className="group h-9 mt-0.5 w-full cursor-pointer px-3 text-start border-[#07486a] text-[#07486a] border-[2px] rounded-lg py-2 text-xs font-normal transition-all duration-200 ease-in-out hover:bg-[#07486a] hover:text-white md:w-auto md:px-4 2xl:h-12 2xl:px-6 2xl:rounded-[10px] 2xl:py-5 2xl:text-sm"
              onClick={onConfigClick}
            >
              <span className="flex items-center">
                <span className="mr-1.5 2xl:mr-2">
                  <ConfigIcon
                    className="size-4 md:size-[18px] 2xl:size-[28px] text-[#07486a] transition-colors duration-200 ease-in-out group-hover:text-white"
                  />
                </span>
                {buttonText}
              </span>
            </Button>
          )}

          {/* Changed to DateRangePickerComponent */}
          {/* <DateRangePickerComponent
            startDate={dateRange.start}
            endDate={dateRange.end}
            onRangeChange={setDateRange}
            buttonClassName="h-9 transition-shadow duration-300 ease-in-out hover:shadow-sm text-[#5D5D5D] font-medium cursor-pointer md:py-2 px-3 bg-[#FFFFFF] rounded-lg text-xs border border-[#C7C7C7] flex items-center justify-between min-w-[180px] md:w-auto md:px-4 2xl:h-10 2xl:py-6 2xl:px-6 2xl:rounded-[10px] 2xl:text-[16px] 2xl:min-w-[200px]"
            buttonContent={
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center overflow-hidden whitespace-nowrap">
                  <img
                    src={Month}
                    className="w-4 h-4 mr-1.5 shrink-0 2xl:w-5 2xl:h-5 2xl:mr-2 mt-0.5"
                    alt="Calendar Icon"
                  />
                  <span className="truncate block md:mt-0.5 w-[100px] text-left 2xl:md:mt-1 2xl:w-[120px]">
                    {dateRange.start && dateRange.end
                      ? formatDateRange(dateRange.start, dateRange.end)
                      : 'Select Date'}
                  </span>
                </div>
                <ChevronDown className="w-[14px] h-[14px] text-[#5D5D5D] ml-1.5 shrink-0 2xl:w-[15px] 2xl:h-[16px] 2xl:ml-2" />
              </div>
            }
            popoverClassName="mt-1 z-50 2xl:mt-2"
            calendarClassName="p-3 bg-white shadow-lg border border-[#D8D8D8] 2xl:p-4"
          /> */}
        </div>
      </div>
    </div>
  );
};

export default StreamHeader;
