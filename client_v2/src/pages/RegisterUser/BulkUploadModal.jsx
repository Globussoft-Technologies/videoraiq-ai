/** Modal for bulk-registering employees from an Excel sheet. */
const BulkUploadModal = ({ open, onClose, selectedFileName, bulkLoading, uploadErrors, onUpload }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
      <div className="bg-[var(--bg1solid)] border border-[var(--bd)] rounded-xl w-[90%] max-w-md p-6 relative shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--tx3)] hover:text-[var(--tx)] cursor-pointer text-lg"
        >
          ✕
        </button>
        <h2 className="text-lg font-semibold text-center mb-4 text-[var(--tx)]">
          Register Bulk Employees
        </h2>
        {selectedFileName && (
          <p className="text-sm text-[var(--tx2)] mb-3 text-center">
            Selected File : <span className="font-medium ml-1">{selectedFileName}</span>
          </p>
        )}
        <label className="w-full flex flex-col items-center justify-center border-2 border-dashed border-[var(--bd2)] rounded-lg py-8 cursor-pointer hover:border-[var(--blue)] transition">
          <span className="text-sm text-[var(--tx2)] mb-1">Click to upload Excel file</span>
          <input type="file" accept=".xlsx, .xls" className="hidden" onChange={onUpload} />
        </label>
        {bulkLoading && <p className="text-sm text-[var(--tx3)] mt-3 text-center">Uploading...</p>}
        <a
          href="/Sample_Bulk_Employees.xlsx"
          download
          className="block text-center text-sm text-[var(--blue)] mt-3 font-medium hover:underline"
        >
          Download Sample Excel Sheet
        </a>
        {uploadErrors.length > 0 && (
          <div className="mt-4 border border-[var(--bd)] rounded-lg overflow-hidden">
            <p className="text-[var(--crit)] text-sm font-semibold p-2 bg-[var(--crit)]/10 border-b border-[var(--bd)]">
              {uploadErrors.length} Errors Found
            </p>
            <div className="max-h-56 overflow-y-auto vq-scroll">
              <table className="w-full text-sm border-collapse text-[var(--tx)]">
                <thead className="bg-[var(--bg2)] sticky top-0">
                  <tr>
                    <th className="border border-[var(--bd)] p-2 text-left">SL No</th>
                    <th className="border border-[var(--bd)] p-2 text-left">Row No</th>
                    <th className="border border-[var(--bd)] p-2 text-left">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadErrors.map((item, index) => (
                    <tr key={index}>
                      <td className="border border-[var(--bd)] p-2">{item.slNo}</td>
                      <td className="border border-[var(--bd)] p-2">{item.rowNo}</td>
                      <td className="border border-[var(--bd)] p-2 text-[var(--crit)] break-words">
                        {item.error}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkUploadModal;
