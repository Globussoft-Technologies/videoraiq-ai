import { useFormikContext } from 'formik';
import { Upload, Camera, X } from 'lucide-react';
import { toast } from 'sonner';

const orgId = import.meta.env.VITE_ORGANISATION_ID;
const uploadDomain = `${import.meta.env.VITE_BACKEND}/api/v1/uploads`;

const RegisterFormStep2 = ({
  uploadedImagePaths,
  uploadedImageUrls,
  onRemoveImage,
  onUploadFile,
  onOpenCamera,
}) => {
  const { values } = useFormikContext();
  const angles = orgId === 'dubai' ? ['Front'] : ['Front', 'Right', 'Left'];
  const requiredCount = orgId === 'dubai' ? 1 : 3;

  const uploadedCount = uploadedImagePaths.filter((img) =>
    typeof img === 'string' ? img.trim() !== '' : !!img
  ).length;

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--tx2)] font-medium">
        Uploaded {uploadedCount} / {requiredCount} image{requiredCount > 1 ? 's' : ''}*
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {angles.map((angle, index) => (
          <div key={angle} className="flex flex-col items-center gap-3">
            <div className="w-full aspect-[4/5] max-h-[260px] bg-[var(--bg3)] rounded-2xl border border-[var(--bd)] flex items-center justify-center p-3 relative">
              {uploadedImagePaths[index] ? (
                <>
                  <img
                    src={uploadedImageUrls[index] || `${uploadDomain}${uploadedImagePaths[index]}`}
                    alt={angle}
                    className="w-full h-full object-contain rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveImage(index)}
                    className="absolute top-2 right-2 bg-[var(--crit)] text-white p-1.5 rounded-full cursor-pointer shadow-sm hover:opacity-90"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 w-full">
                  <label className="w-full cursor-pointer">
                    <input
                      type="file"
                      accept="image/jpeg, image/png"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (!['image/jpeg', 'image/png'].includes(file.type)) {
                          toast.error('Please upload only JPG or PNG images.');
                          e.target.value = '';
                          return;
                        }
                        onUploadFile(file, values.firstName?.trim() || 'employee', index);
                      }}
                    />
                    <div className="flex items-center justify-center gap-2 w-full py-3 px-3 bg-[var(--blue)]/10 text-[var(--blue)] rounded-lg text-sm font-medium hover:bg-[var(--blue)]/20 transition-colors">
                      <Upload className="w-4 h-4" />
                      Upload from files
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => onOpenCamera(angle)}
                    className="flex items-center justify-center gap-2 w-full py-3 bg-[var(--bg2)] text-[var(--tx2)] rounded-lg text-sm font-medium hover:bg-[var(--bd2)] transition-colors cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    Take photo
                  </button>
                </div>
              )}
            </div>
            <span className="font-medium text-[var(--tx)] text-sm">{angle}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RegisterFormStep2;
