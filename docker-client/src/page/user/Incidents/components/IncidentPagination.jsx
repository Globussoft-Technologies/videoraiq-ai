import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

const IncidentPagination = ({
  totalEntries = 0,
  currentPage = 1,
  totalPages = 1,
  onPageChange = () => {},
  pageSize = 9,
}) => {

  const startEntry = totalEntries === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, totalEntries);


  const [goToPage, setGoToPage] = useState(currentPage.toString());


  useEffect(() => {
    setGoToPage(currentPage.toString());
  }, [currentPage]);

  const handleInputChange = (e) => {
    const raw = e.target.value;
    // Allow only digits or empty
    if (/^\d*$/.test(raw)) {
      setGoToPage(raw);
    }
    
  };

  // Handle "Go" action
  const handleGoToPage = () => {
    let pageNum = Number(goToPage);

    if (Number.isNaN(pageNum)) return;

    if (pageNum < 1) pageNum = 1;
    if (pageNum > totalPages) pageNum = totalPages;

    onPageChange(pageNum);
  };

  return (
    <div className="flex flex-col items-center md:flex-row md:items-center md:justify-between mt-10 gap-4">
      <p className="text-sm text-[#8C8C8C] font-normal text-center md:text-left">
        Showing {startEntry} To {endEntry} Of {totalEntries} Entries
      </p>

      <div className="flex items-center justify-center space-x-1 bg-[#FAFAFA] w-full md:w-auto">
        {/* First Page */}
        <button
          className="flex items-center justify-center h-10 w-10 rounded-[5px] text-white bg-[#07486a] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
        >
          <ChevronsLeft size={28} strokeWidth={2} />
        </button>

        {/* Prev Page */}
        <button
          className="flex items-center justify-center h-10 w-10 rounded-[5px] text-white bg-[#07486a] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <ChevronLeft size={28} strokeWidth={2} />
        </button>

        {/* Current / Total */}
        <span className="text-[14px] opacity-80 font-medium px-3 min-w-[120px] text-center text-[#333333]">
          Page {currentPage} of {totalPages}
        </span>

        {/* Next Page */}
        <button
          className="flex items-center justify-center h-10 w-10 rounded-[5px] text-white bg-[#07486a] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages || totalPages === 0}
        >
          <ChevronRight size={28} strokeWidth={2} />
        </button>

        {/* Last Page */}
        <button
          className="flex items-center justify-center h-10 w-10 rounded-[5px] text-white bg-[#07486a] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages || totalPages === 0}
        >
          <ChevronsRight size={28} strokeWidth={2} />
        </button>

        {/* Go To Page */}
        <div className="flex items-center gap-2 ml-4">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={goToPage}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === "Enter" && handleGoToPage()}
            placeholder="Page"
            className="w-20 h-10 px-2 border rounded-[5px] text-sm text-center"
          />
          <Button
            className="h-10 bg-[#07486a] hover:bg-[#063a54] text-white"
            onClick={handleGoToPage}
          >
            Go
          </Button>
        </div>
      </div>
    </div>
  );
};

export default IncidentPagination;
