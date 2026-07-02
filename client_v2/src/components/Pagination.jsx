import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const Pagination = ({ currentPage, totalPages, onPageChange, className = "mt-6 flex justify-center" }) => {
  return (
    <div className={className}>
      <div className="flex items-center gap-2 ">
        {/* Previous Button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
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
                onClick={() => onPageChange(page)}
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
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${currentPage === totalPages
            ? "text-[var(--tx3)] cursor-not-allowed"
            : "text-[var(--tx2)] hover:bg-[var(--bg2)] hover:text-[var(--tx)] cursor-pointer"
            }`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
