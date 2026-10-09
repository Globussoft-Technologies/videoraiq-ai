export function paginateRows(rows, requestedPage, pageSize) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.max(1, Math.min(requestedPage, totalPages));
  const offset = (currentPage - 1) * pageSize;
  return {
    total,
    totalPages,
    currentPage,
    start: total ? offset + 1 : 0,
    end: Math.min(offset + pageSize, total),
    pageRows: rows.slice(offset, offset + pageSize),
  };
}
