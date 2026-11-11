import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export default function usePagedLogImagePreview({ rows, currentPage, limit, totalCount, loading, error, setPage, imageOf }) {
  const [previewImage, setPreviewImage] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(-1);
  const [previewImageLoading, setPreviewImageLoading] = useState(false);
  const [recentlyViewedId, setRecentlyViewedId] = useState(null);
  const [recentlyViewedIndex, setRecentlyViewedIndex] = useState(null);
  const [recentlyViewedPulse, setRecentlyViewedPulse] = useState(0);
  const pending = useRef(null);
  const previewRows = useMemo(() => rows.filter((row) => imageOf(row)), [rows, imageOf]);
  const pageCount = Math.max(1, Math.ceil(totalCount / limit));

  const showAt = useCallback((index) => {
    const row = previewRows[index];
    if (!row) return;
    setPreviewIndex(index);
    setPreviewImage(imageOf(row));
    setPreviewImageLoading(true);
    setRecentlyViewedId(row.id ?? row._id);
    setRecentlyViewedIndex((currentPage - 1) * limit + rows.findIndex((item) => (item.id ?? item._id) === (row.id ?? row._id)));
  }, [previewRows, imageOf, currentPage, limit, rows]);

  const openPreview = useCallback((url, rowId) => {
    if (!url) return;
    const index = previewRows.findIndex((row) => rowId != null ? (row.id ?? row._id) === rowId : imageOf(row) === url);
    if (index >= 0) showAt(index);
  }, [previewRows, imageOf, showAt]);

  const movePreview = useCallback((direction) => {
    if (pending.current) return;
    const index = previewIndex + direction;
    if (index >= 0 && index < previewRows.length) return showAt(index);
    const page = currentPage + direction;
    if (page < 1 || page > pageCount) return;
    pending.current = { page, direction, oldRows: rows };
    setPreviewImageLoading(true);
    setPage(page);
  }, [previewIndex, previewRows.length, showAt, currentPage, pageCount, rows, setPage]);

  useEffect(() => {
    const next = pending.current;
    if (!next || loading || currentPage !== next.page) return;
    if (error) {
      pending.current = null;
      setPreviewImageLoading(false);
      return;
    }
    if (rows === next.oldRows) return;
    if (previewRows.length) {
      pending.current = null;
      showAt(next.direction > 0 ? 0 : previewRows.length - 1);
      return;
    }
    const page = currentPage + next.direction;
    if (page < 1 || page > pageCount) {
      pending.current = null;
      setPreviewImageLoading(false);
      return;
    }
    pending.current = { page, direction: next.direction, oldRows: rows };
    setPage(page);
  }, [currentPage, rows, loading, error, previewRows, pageCount, showAt, setPage]);

  const closePreview = useCallback(() => {
    pending.current = null;
    if (recentlyViewedId != null) setRecentlyViewedPulse((pulse) => pulse + 1);
    setPreviewImage(null);
    setPreviewIndex(-1);
    setPreviewImageLoading(false);
  }, [recentlyViewedId]);

  return { previewImage, previewIndex, previewImageLoading, setPreviewImageLoading, previewRows, openPreview, showAt,
    movePreview, closePreview, recentlyViewedId, recentlyViewedIndex, recentlyViewedPulse, pageCount };
}
