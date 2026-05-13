import React, { useRef, useState, useEffect } from 'react';
import * as am5 from "@amcharts/amcharts5";
import * as am5xy from "@amcharts/amcharts5/xy";
import am5themes_Animated from "@amcharts/amcharts5/themes/Animated";
import { comparisonChart } from './Api/get';

const ComparisonChart = ({ nvrId, department, location }) => {
  const chartRef = useRef(null);

  const transformComparisonData = (apiData) => {
    const currentWeek = apiData.currentWeek.map(item => ({
      date: new Date(item.date).getTime(),
      value: item.value,
    }));

    const previousWeek = apiData.previousWeek.map((item, index) => ({
      date: new Date(apiData.currentWeek[index].date).getTime(),
      value: item.value,
      actualPreviousDate: new Date(item.date).getTime(),
    }));

    return { currentWeek, previousWeek };
  };

  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        const result = await comparisonChart();
        const transformed = transformComparisonData(result.body.data);
        setChartData(transformed);
      } catch (err) {
        console.error("Error fetching comparison data:", err);
      }
    };
    fetchChartData();
  }, [nvrId,department,location]);

  useEffect(() => {
    if (!chartData) return;

    let root = am5.Root.new("chartdiv");
    root._logo?.set("forceHidden", true);

    root.setThemes([
      am5themes_Animated.new(root)
    ]);

    let chart = root.container.children.push(am5xy.XYChart.new(root, {
      panX: true,
      panY: true,
      wheelX: "panX",
      wheelY: "zoomX",
      pinchZoomX: true
    }));

    let cursor = chart.set("cursor", am5xy.XYCursor.new(root, {}));
    cursor.lineY.set("visible", false);

    let xAxis = chart.xAxes.push(am5xy.DateAxis.new(root, {
      maxDeviation: 0.3,
      baseInterval: {
        timeUnit: "day",
        count: 1
      },
      renderer: am5xy.AxisRendererX.new(root, { minorGridEnabled: true }),
      tooltip: am5.Tooltip.new(root, {})
    }));

    // Decrease X Axis font size
    xAxis.get("renderer").labels.template.setAll({
      fontSize: 12
    });

    let yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, {
      maxDeviation: 0.3,
      renderer: am5xy.AxisRendererY.new(root, {})
    }));

    // Decrease Y Axis font size
    yAxis.get("renderer").labels.template.setAll({
      fontSize: 12
    });

    root.dateFormatter.setAll({
      dateFormat: "yyyy-MM-dd",
      dateFields: ["valueX", "actualPreviousDate"]
    });

    let currentWeekSeries = chart.series.push(am5xy.LineSeries.new(root, {
      name: "Current Week",
      xAxis: xAxis,
      yAxis: yAxis,
      valueYField: "value",
      valueXField: "date",
      tooltip: am5.Tooltip.new(root, {
        labelText: "{valueX.formatDate('yyyy-MM-dd')}: {value}"
      })
    }));

    currentWeekSeries.strokes.template.setAll({
      strokeWidth: 2,
      stroke: am5.color(0x80D0F5)
    });

    currentWeekSeries.bullets.push(function () {
      return am5.Bullet.new(root, {
        sprite: am5.Circle.new(root, {
          radius: 4,
          fill: currentWeekSeries.get("stroke")
        })
      });
    });

    let previousWeekSeries = chart.series.push(am5xy.LineSeries.new(root, {
      name: "Previous Week",
      xAxis: xAxis,
      yAxis: yAxis,
      valueYField: "value",
      valueXField: "date",
      tooltip: am5.Tooltip.new(root, {
        labelText: "{actualPreviousDate.formatDate('yyyy-MM-dd')}: {value}"
      })
    }));

    previousWeekSeries.strokes.template.setAll({
      strokeWidth: 2,
      strokeDasharray: [3, 3],
      stroke: am5.color(0xA795FF)
    });

    previousWeekSeries.bullets.push(function () {
      return am5.Bullet.new(root, {
        sprite: am5.Circle.new(root, {
          radius: 4,
          fill: previousWeekSeries.get("stroke")
        })
      });
    });

    currentWeekSeries.data.setAll(chartData.currentWeek);
    previousWeekSeries.data.setAll(chartData.previousWeek);

    currentWeekSeries.appear(1000);
    previousWeekSeries.appear(1000);
    chart.appear(1000, 100);

    chartRef.current = root;

    return () => {
      root.dispose();
    };
  }, [chartData]);

  return (
    <div className="bg-[#FAFAFA] p-5 rounded-lg">
      <div id="chartdiv" className="w-full h-[350px]"></div>
      <div className="flex justify-center gap-4 mt-2.5">
        <div className="flex items-center">
          <div className="w-3 h-3 bg-[#80D0F5] rounded-full mr-2"></div>
          <span className="2xl:text-sm text-[10px]">Current week</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-[#A795FF] rounded-full mr-2"></div>
          <span className="2xl:text-sm text-[10px]">Past week</span>
        </div>
      </div>
    </div>
  );
};

export default ComparisonChart;
