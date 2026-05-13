import React, { useEffect, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import { getDetectionData } from './Api/post';
import { Circle, ChevronLeft, ChevronRight, Search, ChartColumnBig } from 'lucide-react'; // Import Chevron icons
import ComparisonChart from './Linechart';
import Skeleton from 'react-loading-skeleton'; // Import Skeleton
import 'react-loading-skeleton/dist/skeleton.css'; // Import skeleton CSS

const formatKeyToLabel = (key) =>
  key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const ActivityChart = ({ nvrId, department, location }) => {
  const [chartState, setChartState] = React.useState({
    series: [],
    options: {
      chart: {
        type: 'bar',
        height: 350,
        stacked: true,
        toolbar: { show: false },
        zoom: { enabled: false },
      },
      plotOptions: {
        bar: {
          horizontal: false,
          borderRadius: 5,
          borderRadiusApplication: 'end',
          borderRadiusWhenStacked: 'last',
          columnWidth: '40%',
        },
      },
      colors: [
        '#FBDE9D', // Light Yellow
        '#F7AAED', // Light Pink
        '#B6B0FB', // Light Purple
        '#E0E0E0', // Neutral Gray
        '#90EE90', // Light Green
        '#ADD8E6', // Light Blue
        '#FFB6C1', // Light Pink 2
        '#FFD700', // Gold
        '#FFA07A', // Light Salmon
        '#20B2AA', // Light Sea Green
        '#DDA0DD', // Plum
        '#87CEFA', // Light Sky Blue
        '#F08080', // Light Coral
        '#EEE8AA', // Pale Goldenrod
        '#98FB98', // Pale Green
      ],
      xaxis: {
        categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        labels: {
          style: {
            fontWeight: 500,
          },
        },
      },
      legend: {
        position: 'bottom',
        horizontalAlign: 'center',
        fontWeight: 600,
        fontSize: '12px',
        markers: {
          radius: 4,
        },
      },
      dataLabels: {
        enabled: false,
      },
      grid: {
        show: false,
      },
      fill: {
        opacity: 1,
      },
      tooltip: {
        y: {
          formatter: (val) => `${val} detections`,
        },
      },
    },
  });

  const [loading, setLoading] = useState(true); // Add loading state for ActivityChart

  // --- Start of Carousel Specific Code ---
  const [currentChartIndex, setCurrentChartIndex] = useState(1); // 0 for ActivityChart, 1 for ComparisonChart
  const charts = ['activity', 'comparison']; // Identifiers for your charts

  const handleNextChart = () => {
    setCurrentChartIndex((prevIndex) => (prevIndex + 1) % charts.length);
  };

  const handlePrevChart = () => {
    setCurrentChartIndex((prevIndex) => (prevIndex - 1 + charts.length) % charts.length);
  };

  // Function to directly jump to a chart based on dot click
  const goToChart = (index) => {
    setCurrentChartIndex(index);
  };
  // --- End of Carousel Specific Code ---

 useEffect(() => {
  const fetchChartData = async () => {
    try {
      setLoading(true); // Start loading
      const response = await getDetectionData();

      if (response?.data?.statusCode === 200) {
        const data = response.data.body?.data || {};

        const series = [];
        const totalPerDay = Array(7).fill(0); // Properly initialize with 7 zeros

        Object.entries(data).forEach(([key, values]) => {
          const label = formatKeyToLabel(key);
          values.forEach((val, idx) => {
            totalPerDay[idx] += val; //  Safe accumulation
          });
          series.push({ name: label, data: values });
        });

        // Only add "Neutral" if there’s real data
        if (series.length > 0) {
          const neutral = totalPerDay.map((val) => Math.max(0, 100 - val));
          series.push({ name: 'Neutral', data: neutral });
        }

        setChartState((prev) => ({
          ...prev,
          series,
        }));
      } else {
        console.error('Failed to fetch detection data:', response);
        setChartState((prev) => ({ ...prev, series: [] })); // reset if error
      }
    } catch (error) {
      console.error('Error fetching chart data:', error);
      setChartState((prev) => ({ ...prev, series: [] })); //  reset if exception
    } finally {
      setLoading(false); //  Always stop loading
    }
  };

  fetchChartData();
}, [nvrId,department, location]);


  return (
    <div className="chart-container h-full bg-[#Fafafa] rounded-[10px] p-[20px] relative overflow-hidden">
    <h3 className="text-center mb-5 text-[#7A7A7A] font-medium 2xl:text-[14px] text-[10px]">
      {loading ? (
        <Skeleton width={250} className="mx-auto" />
      ) : (
        currentChartIndex === 0
          ? 'AI Detection Activity Over the Past Week'
          : 'Multi-Camera Activity Review & Comparison'
      )}
    </h3>
  
    {/* Conditionally render charts or skeleton based on currentChartIndex and loading state */}
    {loading ? (
      <div className="flex flex-col items-center justify-center h-350px">
        <Skeleton height={300} width="90%" /> {/* Skeleton for the chart area */}
        <div className="mt-4">
          <Skeleton width={100} /> {/* Skeleton for the "Neutral" text */}
        </div>
      </div>
    ) : (
      <>
        {currentChartIndex === 0 && (
          <>
            <h4 className="text-center font-semibold text-[#333333] 2xl:text-[17px] xl:text-xs mb-2.5">
              {/* <Circle
                className="inline-block w-2.5 h-2.5 mr-0.5 mb-0.5"
                fill="#14A433"
                strokeWidth={0}
              />
              Neutral */}
            </h4>
            {chartState.series[0]?.data?.length > 0 ? (
            <ReactApexChart
              options={chartState.options}
              series={chartState.series}
              type="bar"
              height={350}
            />
          ) : (
          <div className="flex flex-col items-center justify-center h-[420px] text-gray-500 text-base">
            <ChartColumnBig className="w-12 h-12 mb-3 text-gray-400" />
            <p className="text-center">No detection found</p>
          </div>
          )}
         </>
        )}

        {currentChartIndex === 1 && <ComparisonChart nvrId={nvrId} department={department} location={location} />}
      </>
    )}
  
    {/* --- Start of Carousel Navigation UI --- */}
    <div className="absolute 2xl:top-[51%] top-[53%] left-0 right-0 flex justify-between px-2 -translate-y-1/2 pointer-events-none">
      {loading ? (
        <>
          <Skeleton circle={true} height={40} width={40} className="pointer-events-auto" /> {/* Skeleton for left arrow */}
          <Skeleton circle={true} height={40} width={40} className="pointer-events-auto" /> {/* Skeleton for right arrow */}
        </>
      ) : (
        <>
          <button
            onClick={handlePrevChart}
            className=" cursor-pointer flex items-center text-[#5D5D5D] justify-center transition-colors duration-200 hover:bg-white/90 pointer-events-auto -ml-2"
            aria-label="Previous chart"
          >
            <ChevronLeft className='2xl:w-6 2xl:h-6 w-5 h-5' />
          </button>
          <button
            onClick={handleNextChart}
            className=" cursor-pointer flex items-center text-[#5D5D5D] justify-center transition-colors duration-200 hover:bg-white/90 pointer-events-auto -mr-2"
            aria-label="Next chart"
          >
            <ChevronRight className='2xl:w-6 2xl:h-6 w-5 h-5' />
          </button>
        </>
      )}
    </div>
    {/* --- End of Carousel Navigation UI --- */}
  
    {/* Carousel Pagination Dots at the very bottom of the container */}
    {loading ? (
      <div className="absolute bottom-4 left-0 right-0 flex justify-center">
        <Skeleton width={60} height={8} /> {/* Skeleton for pagination dots */}
      </div>
    ) : (
      <div className="absolute bottom-4 left-0 right-0 flex justify-center">
        {charts.map((_, index) => (
          <button
            key={index}
            className={`h-2 w-2 mx-[2px] rounded-full ${index === currentChartIndex ? 'bg-[#07486a] px-[5px]' : 'bg-[#D9D9D9]'}`}
            onClick={() => goToChart(index)}
            aria-label={`Go to chart ${index + 1}`}
          ></button>
        ))}
      </div>
    )}
  </div>
  );
};

export default ActivityChart;