import React, { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

const Pagination = ({ currentPage, totalPages, onPageChange, className = "mt-6 flex justify-center", showGoTo = true }) => {
  const [pageInput, setPageInput] = useState("");

  const goToPage = (page) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    onPageChange(page);
  };

  const handleGoToPage = () => {
    const page = parseInt(pageInput, 10);
    if (!Number.isFinite(page)) return;
    goToPage(Math.min(Math.max(page, 1), totalPages));
    setPageInput("");
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2 ">
        {/* First Page Button */}
        <button
          onClick={() => goToPage(1)}
          disabled={currentPage === 1}
          className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${currentPage === 1
            ? "text-[var(--tx3)] cursor-not-allowed"
            : "text-[var(--tx2)] hover:bg-[var(--bg2)] hover:text-[var(--tx)] cursor-pointer"
            }`}
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        {/* Previous Button */}
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${currentPage === 1
            ? "text-[var(--tx3)] cursor-not-allowed"
            : "text-[var(--tx2)] hover:bg-[var(--bg2)] hover:text-[var(--tx)] cursor-pointer"
            }`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Page Numbers */}
        {(() => {
          const pages = [];
          const maxVisiblePages = 5;

          if (totalPages <= maxVisiblePages) {
            // Show all pages if total is small
            for (let i = 1; i <= totalPages; i++) {
              pages.push(i);
            }
          } else {
            // Show smart pagination
            if (currentPage <= 3) {
              // Show first 4 pages + ... + last
              for (let i = 1; i <= 4; i++) pages.push(i);
              if (totalPages > 5) pages.push('...');
              pages.push(totalPages);
            } else if (currentPage >= totalPages - 2) {
              // Show first + ... + last 4 pages
              pages.push(1);
              if (totalPages > 5) pages.push('...');
              for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
            } else {
              // Show first + ... + current-1, current, current+1 + ... + last
              pages.push(1);
              pages.push('...');
              for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
              pages.push('...');
              pages.push(totalPages);
            }
          }

          return pages.map((page, index) =>
            page === '...' ? (
              <span
                key={`ellipsis-${index}`}
                className="flex items-center justify-center min-w-[2rem] h-8 px-2 text-[var(--tx3)]"
              >
                ...
              </span>
            ) : (
              <button
                key={page}
                onClick={() => goToPage(page)}
                className={`flex items-center justify-center min-w-[2.25rem] h-8 px-2 rounded text-xs sm:text-sm cursor-pointer font-medium transition-colors ${currentPage === page
                  ? "bg-[var(--blue)] text-white shadow-sm shadow-[var(--blue)]/30"
                  : "text-[var(--tx2)] hover:bg-[var(--bg2)] hover:text-[var(--tx)]"
                  }`}
              >
                {page}
              </button>
            )
          );
        })()}

        {/* Next Button */}
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${currentPage === totalPages
            ? "text-[var(--tx3)] cursor-not-allowed"
            : "text-[var(--tx2)] hover:bg-[var(--bg2)] hover:text-[var(--tx)] cursor-pointer"
            }`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Last Page Button */}
        <button
          onClick={() => goToPage(totalPages)}
          disabled={currentPage === totalPages}
          className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${currentPage === totalPages
            ? "text-[var(--tx3)] cursor-not-allowed"
            : "text-[var(--tx2)] hover:bg-[var(--bg2)] hover:text-[var(--tx)] cursor-pointer"
            }`}
        >
          <ChevronsRight className="w-4 h-4" />
        </button>

        {/* Go To Page */}
        {showGoTo && totalPages > 1 && (
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-xs text-[var(--tx3)] whitespace-nowrap">Go to:</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGoToPage()}
              placeholder="Page"
              className="h-8 w-16 border border-[var(--bd)] rounded text-xs text-[var(--tx)] bg-[var(--bg2)] px-2 focus:outline-none focus:ring-1 focus:ring-[var(--blue)]"
            />
            <button
              type="button"
              onClick={handleGoToPage}
              disabled={pageInput === ""}
              className="h-8 px-3 rounded text-xs font-medium bg-[var(--blue)] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity cursor-pointer"
            >
              Go
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Pagination;
